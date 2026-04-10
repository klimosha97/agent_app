"""
AI Scout-assistant service.
Collects data from DB, builds prompts, generates chart data, caches responses.
"""

import hashlib
import json
import logging
from typing import Dict, List, Optional, Any

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """Ты — профессиональный футбольный скаут-аналитик. 
Представь что ты работаешь на агента и тебе надо в этих данных найти сильных футболистов.
Анализируй статистику и давай краткий, полезный обзор на русском языке.

Правила:
- Пиши кратко, по делу (3-5 абзацев)
- Используй markdown для форматирования (жирный, списки)
- Называй конкретных игроков с командой и позицией
- Для score-ов используй проценты: 0.95 → 95%
- Обращай внимание на необычно высокие core/support метрики
- Подчёркивай игроков, на которых стоит обратить внимание
- НЕ выдумывай данные, опирайся строго на предоставленную статистику
- Если данных мало — честно скажи об этом
- Не надо думать перспективный или старый футболист только статистика и данные.

Контекст по умолчанию:
- Если пользователь говорит «сезон» без уточнения — имеется в виду ТЕКУЩИЙ (последний) сезон
- Если пользователь говорит «тур» без номера — имеется в виду ПОСЛЕДНИЙ загруженный тур
- Тебе всегда предоставляются данные и за последний тур, и за весь сезон — используй оба набора
- «Сборная сезона», «лучшие за сезон» и т.п. — опирайся на СЕЗОННЫЕ данные (PER90 SEASON), а не на один тур
- «Обзор тура» — опирайся на данные ТУРА
"""


# ======================================================================
# Data Collectors
# ======================================================================

class RoundDataCollector:
    """Collects top players and metrics for a specific round."""

    def collect(self, db: Session, tournament_id: int, round_number: int) -> Dict:
        tournament = self._tournament_info(db, tournament_id)
        if not tournament:
            return {"error": f"Турнир {tournament_id} не найден"}

        round_slice_id = self._find_round_slice(db, tournament_id, round_number)
        if not round_slice_id:
            return {"error": f"Данные тура {round_number} не найдены"}

        top_players = self._top_players(db, round_slice_id, limit=15)
        if not top_players:
            return {"error": "Нет оценённых игроков за этот тур"}

        top_by_position = self._top_by_position(db, round_slice_id)

        top_pids = [p["player_id"] for p in top_players[:10]]
        player_metrics = self._player_metrics(db, round_slice_id, top_pids)

        new_faces = self._new_faces(db, tournament_id, round_number)

        return {
            "tournament": tournament,
            "round_number": round_number,
            "top_players": top_players,
            "top_by_position": top_by_position,
            "player_metrics": player_metrics,
            "new_faces": new_faces,
        }

    @staticmethod
    def _tournament_info(db: Session, tid: int) -> Optional[Dict]:
        row = db.execute(text(
            "SELECT id, name, full_name, current_round FROM tournaments WHERE id = :tid"
        ), {"tid": tid}).fetchone()
        if not row:
            return None
        return {"id": row[0], "name": row[1], "full_name": row[2], "current_round": row[3]}

    @staticmethod
    def _find_round_slice(db: Session, tid: int, rn: int) -> Optional[int]:
        row = db.execute(text("""
            SELECT slice_id FROM stat_slices
            WHERE tournament_id = :tid AND slice_type = 'TOTAL'
              AND period_type = 'ROUND' AND period_value = :rn
            ORDER BY uploaded_at DESC LIMIT 1
        """), {"tid": tid, "rn": str(rn)}).fetchone()
        return row[0] if row else None

    @staticmethod
    def _top_players(db: Session, slice_id: int, limit: int = 15, baseline: str = "LEAGUE") -> List[Dict]:
        rows = db.execute(text("""
            SELECT rs.player_id, p.full_name, p.team_name,
                   rs.position_code, pos.display_name,
                   rs.core_score, rs.support_score, rs.total_score,
                   rs.good_share_core,
                   COALESCE(rs.insufficient_minutes, false),
                   rs.insufficient_data
            FROM round_scores rs
            JOIN players p ON rs.player_id = p.player_id
            JOIN positions pos ON pos.code = rs.position_code
            WHERE rs.round_slice_id = :sid AND rs.baseline_kind = :bl
              AND rs.insufficient_data = false
              AND COALESCE(rs.insufficient_minutes, false) = false
            ORDER BY rs.total_score DESC NULLS LAST
            LIMIT :lim
        """), {"sid": slice_id, "bl": baseline, "lim": limit}).fetchall()
        return [
            {
                "player_id": r[0], "full_name": r[1], "team_name": r[2],
                "position_code": r[3], "position_name": r[4],
                "core_score": r[5], "support_score": r[6], "total_score": r[7],
                "good_share_core": r[8],
            }
            for r in rows
        ]

    @staticmethod
    def _top_by_position(db: Session, slice_id: int, baseline: str = "LEAGUE") -> Dict[str, List[Dict]]:
        rows = db.execute(text("""
            SELECT pos.comparison_group, rs.player_id, p.full_name, p.team_name,
                   rs.position_code, pos.display_name,
                   rs.core_score, rs.support_score, rs.total_score
            FROM round_scores rs
            JOIN players p ON rs.player_id = p.player_id
            JOIN positions pos ON pos.code = rs.position_code
            WHERE rs.round_slice_id = :sid AND rs.baseline_kind = :bl
              AND rs.insufficient_data = false
              AND COALESCE(rs.insufficient_minutes, false) = false
            ORDER BY pos.comparison_group, rs.total_score DESC NULLS LAST
        """), {"sid": slice_id, "bl": baseline}).fetchall()

        groups: Dict[str, List[Dict]] = {}
        for r in rows:
            grp = r[0] or "?"
            if grp not in groups:
                groups[grp] = []
            if len(groups[grp]) < 3:
                groups[grp].append({
                    "player_id": r[1], "full_name": r[2], "team_name": r[3],
                    "position_code": r[4], "position_name": r[5],
                    "core_score": r[6], "support_score": r[7], "total_score": r[8],
                })
        return groups

    @staticmethod
    def _player_metrics(db: Session, slice_id: int, player_ids: List[int], baseline: str = "LEAGUE") -> Dict[int, List[Dict]]:
        if not player_ids:
            return {}
        rows = db.execute(text("""
            SELECT rp.player_id, rp.metric_code, rp.bucket, rp.value, rp.percentile,
                   COALESCE(mc.display_name_ru, rp.metric_code)
            FROM round_percentiles rp
            LEFT JOIN metrics_catalog mc ON mc.metric_code = rp.metric_code
            WHERE rp.round_slice_id = :sid AND rp.baseline_kind = :bl
              AND rp.player_id = ANY(:pids)
            ORDER BY rp.player_id, rp.bucket, rp.percentile DESC NULLS LAST
        """), {"sid": slice_id, "bl": baseline, "pids": player_ids}).fetchall()

        result: Dict[int, List[Dict]] = {}
        for r in rows:
            pid = r[0]
            if pid not in result:
                result[pid] = []
            result[pid].append({
                "metric_code": r[1], "bucket": r[2],
                "value": r[3], "percentile": r[4], "display_name": r[5],
            })
        return result

    @staticmethod
    def _new_faces(db: Session, tid: int, rn: int) -> List[Dict]:
        rows = db.execute(text("""
            SELECT ra.player_id, p.full_name, p.team_name,
                   pos.code, pos.display_name,
                   ra.minutes_before, ra.minutes_after, ra.is_debut
            FROM round_appearances ra
            JOIN players p ON ra.player_id = p.player_id
            LEFT JOIN positions pos ON p.position_id = pos.position_id
            WHERE ra.tournament_id = :tid AND ra.round_number = :rn AND ra.is_debut = true
            ORDER BY (ra.minutes_after - ra.minutes_before) DESC
            LIMIT 10
        """), {"tid": tid, "rn": rn}).fetchall()
        return [
            {
                "player_id": r[0], "full_name": r[1], "team_name": r[2],
                "position_code": r[3], "position_name": r[4],
                "minutes_gained": round((r[6] or 0) - (r[5] or 0), 1),
            }
            for r in rows
        ]


class SeasonDataCollector:
    """Collects top players for season-level PER90 analysis."""

    def collect(self, db: Session, tournament_id: int) -> Dict:
        tournament = RoundDataCollector._tournament_info(db, tournament_id)
        if not tournament:
            return {"error": f"Турнир {tournament_id} не найден"}

        slice_id = self._find_season_slice(db, tournament_id)
        if not slice_id:
            return {"error": "Нет PER90 SEASON данных для этого турнира"}

        top_players = RoundDataCollector._top_players(db, slice_id, limit=30, baseline="SEASON")
        if not top_players:
            return {"error": "Нет оценённых игроков за сезон"}

        top_by_position = RoundDataCollector._top_by_position(db, slice_id, baseline="SEASON")

        top_pids = [p["player_id"] for p in top_players[:15]]
        player_metrics = RoundDataCollector._player_metrics(db, slice_id, top_pids, baseline="SEASON")

        return {
            "tournament": tournament,
            "top_players": top_players,
            "top_by_position": top_by_position,
            "player_metrics": player_metrics,
        }

    @staticmethod
    def _find_season_slice(db: Session, tid: int) -> Optional[int]:
        row = db.execute(text("""
            SELECT slice_id FROM stat_slices
            WHERE tournament_id = :tid AND slice_type = 'PER90' AND period_type = 'SEASON'
            ORDER BY uploaded_at DESC LIMIT 1
        """), {"tid": tid}).fetchone()
        return row[0] if row else None


class PlayerDataCollector:
    """Collects detailed data for a single player."""

    def collect(self, db: Session, player_id: int) -> Dict:
        player = self._player_info(db, player_id)
        if not player:
            return {"error": f"Игрок {player_id} не найден"}

        tid = player["tournament_id"]
        season_slice = SeasonDataCollector._find_season_slice(db, tid)

        season_metrics = []
        season_scores = None
        if season_slice:
            metrics_map = RoundDataCollector._player_metrics(db, season_slice, [player_id], baseline="SEASON")
            season_metrics = metrics_map.get(player_id, [])
            season_scores = self._player_scores(db, season_slice, player_id, baseline="SEASON")

        history = self._player_history(db, tid, player_id)

        return {
            "player": player,
            "season_metrics": season_metrics,
            "season_scores": season_scores,
            "history": history,
        }

    @staticmethod
    def _player_info(db: Session, pid: int) -> Optional[Dict]:
        row = db.execute(text("""
            SELECT p.player_id, p.full_name, p.team_name, p.birth_year,
                   pos.code, pos.display_name, pos.comparison_group,
                   p.tournament_id, t.name as tournament_name
            FROM players p
            LEFT JOIN positions pos ON p.position_id = pos.position_id
            LEFT JOIN tournaments t ON p.tournament_id = t.id
            WHERE p.player_id = :pid
        """), {"pid": pid}).fetchone()
        if not row:
            return None
        return {
            "player_id": row[0], "full_name": row[1], "team_name": row[2],
            "birth_year": row[3], "position_code": row[4], "position_name": row[5],
            "comparison_group": row[6], "tournament_id": row[7], "tournament_name": row[8],
        }

    @staticmethod
    def _player_scores(db: Session, slice_id: int, pid: int, baseline: str = "SEASON") -> Optional[Dict]:
        row = db.execute(text("""
            SELECT core_score, support_score, total_score,
                   good_share_core, core_coverage, support_coverage
            FROM round_scores
            WHERE round_slice_id = :sid AND baseline_kind = :bl AND player_id = :pid
        """), {"sid": slice_id, "bl": baseline, "pid": pid}).fetchone()
        if not row:
            return None
        return {
            "core_score": row[0], "support_score": row[1], "total_score": row[2],
            "good_share_core": row[3], "core_coverage": row[4], "support_coverage": row[5],
        }

    @staticmethod
    def _player_history(db: Session, tid: int, pid: int) -> List[Dict]:
        rows = db.execute(text("""
            SELECT CAST(ss.period_value AS INTEGER), rs.core_score, rs.support_score, rs.total_score
            FROM round_scores rs
            JOIN stat_slices ss ON rs.round_slice_id = ss.slice_id
            WHERE ss.tournament_id = :tid AND rs.baseline_kind = 'LEAGUE'
              AND rs.player_id = :pid AND ss.period_type = 'ROUND'
            ORDER BY CAST(ss.period_value AS INTEGER)
        """), {"tid": tid, "pid": pid}).fetchall()
        return [
            {"round": r[0], "core_score": r[1], "support_score": r[2], "total_score": r[3]}
            for r in rows
        ]


class ComparisonDataCollector:
    """Collects data for comparing multiple players."""

    def collect(self, db: Session, player_ids: List[int]) -> Dict:
        players_data = []
        for pid in player_ids:
            collector = PlayerDataCollector()
            pdata = collector.collect(db, pid)
            if "error" not in pdata:
                players_data.append(pdata)
        return {"players": players_data}


class WatchedPlayersDataCollector:
    """Collects detailed data for watched (MY/TRACKED) players within a tournament."""

    def collect(self, db: Session, tournament_id: int, list_type: str) -> Dict:
        tournament = RoundDataCollector._tournament_info(db, tournament_id)
        if not tournament:
            return {"error": f"Турнир {tournament_id} не найден"}

        watched = self._get_watched(db, tournament_id, list_type)
        if not watched:
            label = "Мои футболисты" if list_type == "MY" else "Отслеживаемые"
            return {"error": f"Список «{label}» пуст для этого турнира"}

        season_slice = SeasonDataCollector._find_season_slice(db, tournament_id)
        current_round = tournament.get("current_round")
        round_slice = None
        if current_round:
            round_slice = RoundDataCollector._find_round_slice(db, tournament_id, current_round)

        players_data = []
        pids = [w["player_id"] for w in watched]

        season_metrics_map = {}
        round_metrics_map = {}
        if season_slice:
            season_metrics_map = RoundDataCollector._player_metrics(db, season_slice, pids, baseline="SEASON")
        if round_slice:
            round_metrics_map = RoundDataCollector._player_metrics(db, round_slice, pids, baseline="LEAGUE")

        for w in watched:
            pid = w["player_id"]
            player = PlayerDataCollector._player_info(db, pid)
            if not player:
                continue

            season_scores = None
            if season_slice:
                season_scores = PlayerDataCollector._player_scores(db, season_slice, pid, baseline="SEASON")

            round_scores = None
            if round_slice:
                round_scores = PlayerDataCollector._player_scores(db, round_slice, pid, baseline="LEAGUE")

            history = PlayerDataCollector._player_history(db, tournament_id, pid)

            stability = self._calc_stability(history)

            players_data.append({
                "player": player,
                "notes": w.get("notes", ""),
                "season_scores": season_scores,
                "round_scores": round_scores,
                "season_metrics": season_metrics_map.get(pid, []),
                "round_metrics": round_metrics_map.get(pid, []),
                "history": history,
                "stability": stability,
            })

        return {
            "tournament": tournament,
            "list_type": list_type,
            "current_round": current_round,
            "players": players_data,
        }

    @staticmethod
    def _get_watched(db: Session, tid: int, list_type: str) -> List[Dict]:
        rows = db.execute(text("""
            SELECT wp.player_id, wp.notes
            FROM watched_players wp
            JOIN players p ON wp.player_id = p.player_id
            WHERE p.tournament_id = :tid AND wp.list_type = :lt
            ORDER BY wp.added_at DESC
        """), {"tid": tid, "lt": list_type}).fetchall()
        return [{"player_id": r[0], "notes": r[1]} for r in rows]

    @staticmethod
    def _calc_stability(history: List[Dict]) -> Dict:
        """Analyze score trends over recent rounds."""
        if len(history) < 2:
            return {"trend": "insufficient_data", "rounds_count": len(history)}

        recent = history[-5:]
        scores = [h["total_score"] for h in recent if h["total_score"] is not None]
        if len(scores) < 2:
            return {"trend": "insufficient_data", "rounds_count": len(scores)}

        avg = sum(scores) / len(scores)
        variance = sum((s - avg) ** 2 for s in scores) / len(scores)
        std_dev = variance ** 0.5

        first_half = scores[:len(scores) // 2]
        second_half = scores[len(scores) // 2:]
        avg_first = sum(first_half) / len(first_half) if first_half else 0
        avg_second = sum(second_half) / len(second_half) if second_half else 0

        diff = avg_second - avg_first
        if diff > 0.05:
            trend = "improving"
        elif diff < -0.05:
            trend = "declining"
        else:
            trend = "stable"

        return {
            "trend": trend,
            "avg_score": round(avg, 4),
            "std_dev": round(std_dev, 4),
            "min_score": round(min(scores), 4),
            "max_score": round(max(scores), 4),
            "rounds_count": len(scores),
            "last_scores": scores,
        }


class WeeklyDigestCollector:
    """Collects latest round data from ALL tournaments for a weekly digest."""

    def collect(self, db: Session) -> Dict:
        tournaments = self._all_tournaments(db)
        if not tournaments:
            return {"error": "Нет турниров"}

        reports = []
        for t in tournaments:
            tid = t["id"]
            cr = t.get("current_round") or 0
            if cr <= 0:
                reports.append({
                    "tournament": t,
                    "status": "no_data",
                    "message": f"В турнире «{t['name']}» пока нет загруженных туров",
                })
                continue

            cached = self._check_already_reviewed(db, tid, cr)
            if cached:
                reports.append({
                    "tournament": t,
                    "status": "cached",
                    "round_number": cr,
                    "cached_result": cached,
                })
                continue

            round_slice = RoundDataCollector._find_round_slice(db, tid, cr)
            if not round_slice:
                reports.append({
                    "tournament": t,
                    "status": "no_data",
                    "message": f"Данные тура {cr} для «{t['name']}» не найдены",
                })
                continue

            top_players = RoundDataCollector._top_players(db, round_slice, limit=10)
            if not top_players:
                reports.append({
                    "tournament": t,
                    "status": "no_data",
                    "message": f"Нет оценённых игроков за тур {cr} в «{t['name']}»",
                })
                continue

            top_by_position = RoundDataCollector._top_by_position(db, round_slice)
            top_pids = [p["player_id"] for p in top_players[:7]]
            player_metrics = RoundDataCollector._player_metrics(db, round_slice, top_pids)

            reports.append({
                "tournament": t,
                "status": "new",
                "round_number": cr,
                "top_players": top_players,
                "top_by_position": top_by_position,
                "player_metrics": player_metrics,
            })

        return {"reports": reports}

    @staticmethod
    def _all_tournaments(db: Session) -> List[Dict]:
        rows = db.execute(text(
            "SELECT id, name, full_name, current_round FROM tournaments ORDER BY id"
        )).fetchall()
        return [{"id": r[0], "name": r[1], "full_name": r[2], "current_round": r[3]} for r in rows]

    @staticmethod
    def _check_already_reviewed(db: Session, tid: int, rn: int) -> Optional[Dict]:
        """Check if we already have a weekly digest for this tournament+round."""
        try:
            row = db.execute(text("""
                SELECT content FROM ai_reviews
                WHERE tournament_id = :tid AND round_number = :rn
                  AND review_type = 'weekly_digest'
                ORDER BY created_at DESC LIMIT 1
            """), {"tid": tid, "rn": rn}).fetchone()
            if row and row[0]:
                return row[0]
        except Exception as e:
            logger.warning("Weekly digest cache check error: %s", e)
        return None


# ======================================================================
# Prompt Builder
# ======================================================================

class PromptBuilder:

    @staticmethod
    def round_review(data: Dict) -> str:
        t = data["tournament"]
        lines = [f"Обзор тура {data['round_number']} турнира {t['full_name']}.\n"]
        lines.append("ТОП ИГРОКОВ ТУРА (по total_score):")
        for i, p in enumerate(data.get("top_players", []), 1):
            lines.append(
                f"{i}. {p['full_name']} | {p['team_name']} | {p['position_name']} "
                f"| total={p['total_score']} core={p['core_score']} support={p['support_score']}"
            )
            metrics = data.get("player_metrics", {}).get(p["player_id"], [])
            strong = [m for m in metrics if m["bucket"] == "core" and (m["percentile"] or 0) >= 0.80]
            if strong:
                names = ", ".join(f"{m['display_name']} p{int(m['percentile']*100)}" for m in strong[:6])
                lines.append(f"   Сильные core: {names}")

        if data.get("top_by_position"):
            lines.append("\nЛУЧШИЕ ПО ПОЗИЦИОННЫМ ГРУППАМ:")
            for grp, players in data["top_by_position"].items():
                top3 = ", ".join(f"{p['full_name']} ({p['team_name']}) {p['total_score']}" for p in players[:3])
                lines.append(f"  {grp}: {top3}")

        if data.get("new_faces"):
            lines.append("\nНОВЫЕ ЛИЦА:")
            for nf in data["new_faces"][:5]:
                lines.append(f"  {nf['full_name']} ({nf['team_name']}, {nf['position_name']})")

        return "\n".join(lines)

    @staticmethod
    def season_review(data: Dict) -> str:
        t = data["tournament"]
        lines = [f"Обзор сезона турнира {t['full_name']} (PER90, baseline=SEASON).\n"]
        lines.append("ТОП ИГРОКОВ СЕЗОНА:")
        for i, p in enumerate(data.get("top_players", []), 1):
            lines.append(
                f"{i}. {p['full_name']} | {p['team_name']} | {p['position_name']} "
                f"| total={p['total_score']} core={p['core_score']} support={p['support_score']}"
            )
            metrics = data.get("player_metrics", {}).get(p["player_id"], [])
            strong = [m for m in metrics if m["bucket"] == "core" and (m["percentile"] or 0) >= 0.80]
            if strong:
                names = ", ".join(f"{m['display_name']} p{int(m['percentile']*100)}" for m in strong[:6])
                lines.append(f"   Сильные core: {names}")
            weak = [m for m in metrics if m["bucket"] == "core" and (m["percentile"] or 0) < 0.40]
            if weak:
                names = ", ".join(f"{m['display_name']} p{int((m['percentile'] or 0)*100)}" for m in weak[:3])
                lines.append(f"   Слабые core: {names}")

        if data.get("top_by_position"):
            lines.append("\nЛУЧШИЕ ПО ПОЗИЦИОННЫМ ГРУППАМ:")
            for grp, players in data["top_by_position"].items():
                top3 = ", ".join(f"{p['full_name']} ({p['team_name']}) {p['total_score']}" for p in players[:3])
                lines.append(f"  {grp}: {top3}")

        return "\n".join(lines)

    @staticmethod
    def player_analysis(data: Dict) -> str:
        p = data["player"]
        lines = [
            f"Анализ игрока: {p['full_name']}",
            f"Команда: {p['team_name']}, Позиция: {p['position_name']}, Группа сравнения: {p.get('comparison_group', '?')}",
        ]
        sc = data.get("season_scores")
        if sc:
            lines.append(f"Season scores: total={sc['total_score']} core={sc['core_score']} support={sc['support_score']}")

        metrics = data.get("season_metrics", [])
        core_m = [m for m in metrics if m["bucket"] == "core"]
        support_m = [m for m in metrics if m["bucket"] == "support"]

        if core_m:
            lines.append("\nCore метрики (PER90 SEASON):")
            for m in sorted(core_m, key=lambda x: -(x["percentile"] or 0)):
                pct = int((m['percentile'] or 0) * 100)
                lines.append(f"  {m['display_name']}: value={m['value']}, percentile={pct}%")
        if support_m:
            lines.append("\nSupport метрики:")
            for m in sorted(support_m, key=lambda x: -(x["percentile"] or 0)):
                pct = int((m['percentile'] or 0) * 100)
                lines.append(f"  {m['display_name']}: value={m['value']}, percentile={pct}%")

        history = data.get("history", [])
        if history:
            lines.append(f"\nДинамика по турам ({len(history)} туров): " +
                         ", ".join(f"тур {h['round']}={h['total_score']}" for h in history[-5:]))

        return "\n".join(lines)

    @staticmethod
    def compare_players(data: Dict) -> str:
        lines = ["Сравнение игроков:\n"]
        for pd in data.get("players", []):
            p = pd["player"]
            sc = pd.get("season_scores") or {}
            lines.append(f"--- {p['full_name']} ({p['team_name']}, {p['position_name']})")
            if sc:
                lines.append(f"    total={sc.get('total_score','?')} core={sc.get('core_score','?')} support={sc.get('support_score','?')}")
            core_m = [m for m in pd.get("season_metrics", []) if m["bucket"] == "core"]
            top_m = sorted(core_m, key=lambda x: -(x["percentile"] or 0))[:5]
            if top_m:
                lines.append("    Top core: " + ", ".join(f"{m['display_name']} p{int((m['percentile'] or 0)*100)}" for m in top_m))

        lines.append("\nДай сравнительный анализ: кто сильнее, в чём различия, кого стоит предпочесть и почему.")
        return "\n".join(lines)

    @staticmethod
    def chat(question: str, context: Dict) -> str:
        t = context.get("tournament", {})
        lines = [f"Турнир: {t.get('full_name', '?')}, текущий тур: {t.get('current_round', '?')}"]

        season_top = context.get("season_top_players", [])
        if season_top:
            lines.append("\n=== ДАННЫЕ ЗА СЕЗОН (PER90) ===")
            lines.append("Топ игроков сезона:")
            season_metrics = context.get("season_player_metrics", {})
            for i, p in enumerate(season_top[:30], 1):
                lines.append(
                    f"  {i}. {p['full_name']} ({p['team_name']}, {p.get('position_name','?')}) "
                    f"total={p['total_score']} core={p.get('core_score','?')} support={p.get('support_score','?')}"
                )
                metrics = season_metrics.get(p["player_id"], [])
                strong = [m for m in metrics if m["bucket"] == "core" and (m["percentile"] or 0) >= 0.80]
                weak = [m for m in metrics if m["bucket"] == "core" and (m["percentile"] or 0) < 0.40]
                if strong:
                    names = ", ".join(f"{m['display_name']} p{int(m['percentile']*100)}" for m in strong[:5])
                    lines.append(f"     Сильные core: {names}")
                if weak:
                    names = ", ".join(f"{m['display_name']} p{int(m['percentile']*100)}" for m in weak[:3])
                    lines.append(f"     Слабые core: {names}")

            season_by_pos = context.get("season_top_by_position", {})
            if season_by_pos:
                lines.append("\nЛучшие по позициям (сезон):")
                for grp, players in season_by_pos.items():
                    top3 = ", ".join(
                        f"{p['full_name']} ({p['team_name']}) {p['total_score']}"
                        for p in players[:3]
                    )
                    lines.append(f"  {grp}: {top3}")

        rn = context.get("round_number")
        round_top = context.get("round_top_players", [])
        if round_top:
            lines.append(f"\n=== ДАННЫЕ ЗА ТУР {rn or '?'} ===")
            lines.append("Топ игроков тура:")
            round_metrics = context.get("round_player_metrics", {})
            for i, p in enumerate(round_top[:10], 1):
                lines.append(
                    f"  {i}. {p['full_name']} ({p['team_name']}, {p.get('position_name','?')}) "
                    f"total={p['total_score']} core={p.get('core_score','?')} support={p.get('support_score','?')}"
                )
                metrics = round_metrics.get(p["player_id"], [])
                strong = [m for m in metrics if m["bucket"] == "core" and (m["percentile"] or 0) >= 0.80]
                if strong:
                    names = ", ".join(f"{m['display_name']} p{int(m['percentile']*100)}" for m in strong[:5])
                    lines.append(f"     Сильные core: {names}")

            round_by_pos = context.get("round_top_by_position", {})
            if round_by_pos:
                lines.append(f"\nЛучшие по позициям (тур {rn or '?'}):")
                for grp, players in round_by_pos.items():
                    top2 = ", ".join(
                        f"{p['full_name']} ({p['team_name']}) {p['total_score']}"
                        for p in players[:2]
                    )
                    lines.append(f"  {grp}: {top2}")

        lines.append(f"\nВопрос скаута: {question}")
        return "\n".join(lines)

    @staticmethod
    def watched_players_review(data: Dict) -> str:
        t = data["tournament"]
        lt = data["list_type"]
        label = "Мои футболисты" if lt == "MY" else "Отслеживаемые футболисты"
        cr = data.get("current_round", "?")

        lines = [
            f"{label} — турнир {t['full_name']}, текущий тур {cr}.",
            f"Всего {len(data['players'])} игроков.\n",
        ]

        trend_labels = {
            "improving": "РОСТ",
            "declining": "СПАД",
            "stable": "СТАБИЛЬНЫЙ",
            "insufficient_data": "МАЛО ДАННЫХ",
        }

        for i, pd in enumerate(data["players"], 1):
            p = pd["player"]
            stab = pd.get("stability", {})
            lines.append(f"{'='*50}")
            lines.append(f"{i}. {p['full_name']} ({p['team_name']}, {p['position_name']})")
            if pd.get("notes"):
                lines.append(f"   Заметка: {pd['notes']}")

            sc = pd.get("season_scores")
            if sc:
                lines.append(f"   СЕЗОН: total={sc['total_score']} core={sc['core_score']} support={sc['support_score']}")
            else:
                lines.append("   СЕЗОН: нет данных")

            rs = pd.get("round_scores")
            if rs:
                lines.append(f"   ПОСЛЕДНИЙ ТУР ({cr}): total={rs['total_score']} core={rs['core_score']} support={rs['support_score']}")

            trend = stab.get("trend", "insufficient_data")
            lines.append(f"   ТРЕНД: {trend_labels.get(trend, trend)}")
            if stab.get("avg_score") is not None:
                lines.append(
                    f"   Среднее: {stab['avg_score']}, разброс: {stab['std_dev']}, "
                    f"мин: {stab['min_score']}, макс: {stab['max_score']} "
                    f"({stab['rounds_count']} туров)"
                )
            if stab.get("last_scores"):
                lines.append(f"   Последние туры: {' → '.join(str(s) for s in stab['last_scores'])}")

            core_m = [m for m in pd.get("season_metrics", []) if m["bucket"] == "core"]
            top_core = sorted(core_m, key=lambda x: -(x["percentile"] or 0))[:5]
            if top_core:
                lines.append("   Сильные core: " + ", ".join(
                    f"{m['display_name']} p{int((m['percentile'] or 0)*100)}" for m in top_core))

            weak_core = sorted(core_m, key=lambda x: (x["percentile"] or 0))[:3]
            weak_core = [m for m in weak_core if (m["percentile"] or 0) < 0.40]
            if weak_core:
                lines.append("   Слабые core: " + ", ".join(
                    f"{m['display_name']} p{int((m['percentile'] or 0)*100)}" for m in weak_core))

            round_core = [m for m in pd.get("round_metrics", []) if m["bucket"] == "core"]
            if round_core:
                notable = [m for m in round_core if (m["percentile"] or 0) >= 0.80]
                if notable:
                    lines.append("   В туре выделился: " + ", ".join(
                        f"{m['display_name']} p{int((m['percentile'] or 0)*100)}" for m in notable[:4]))

            lines.append("")

        lines.append("ЗАДАНИЕ:")
        lines.append("Дай подробный обзор каждого игрока:")
        lines.append("1. Текущая форма: как выступает в сезоне и в последнем туре")
        lines.append("2. Стабильность: насколько ровно выступает (анализ тренда и разброса)")
        lines.append("3. Сильные/слабые стороны по метрикам")
        lines.append("4. Итоговая рекомендация: стоит ли продолжать наблюдение, повысить внимание или снять")
        return "\n".join(lines)

    @staticmethod
    def weekly_digest_tournament(report: Dict) -> str:
        """Build prompt for a single tournament's round review in weekly digest context."""
        t = report["tournament"]
        rn = report["round_number"]
        lines = [
            f"Обзор тура {rn} турнира «{t['full_name']}».\n",
            "ТОП ИГРОКОВ ТУРА:",
        ]
        for i, p in enumerate(report.get("top_players", []), 1):
            lines.append(
                f"{i}. {p['full_name']} | {p['team_name']} | {p['position_name']} "
                f"| total={p['total_score']} core={p['core_score']} support={p['support_score']}"
            )
            metrics = report.get("player_metrics", {}).get(p["player_id"], [])
            strong = [m for m in metrics if m["bucket"] == "core" and (m["percentile"] or 0) >= 0.80]
            if strong:
                names = ", ".join(f"{m['display_name']} p{int(m['percentile']*100)}" for m in strong[:5])
                lines.append(f"   Сильные core: {names}")

        if report.get("top_by_position"):
            lines.append("\nЛУЧШИЕ ПО ГРУППАМ:")
            for grp, players in report["top_by_position"].items():
                top3 = ", ".join(f"{p['full_name']} ({p['team_name']}) {p['total_score']}" for p in players[:2])
                lines.append(f"  {grp}: {top3}")

        lines.append("\nДай краткий (2-3 абзаца) обзор тура: кто выделился, на кого обратить внимание. Формат — markdown.")
        return "\n".join(lines)


# ======================================================================
# Chart Data Builder
# ======================================================================

class ChartDataBuilder:

    @staticmethod
    def top_bar_chart(top_players: List[Dict], limit: int = 7) -> Optional[Dict]:
        if not top_players:
            return None
        data = []
        for p in top_players[:limit]:
            name_parts = p["full_name"].split()
            short = f"{name_parts[0]} {name_parts[1][0]}." if len(name_parts) >= 2 else p["full_name"]
            data.append({
                "name": short,
                "full_name": p["full_name"],
                "total_score": p.get("total_score"),
                "core_score": p.get("core_score"),
                "support_score": p.get("support_score"),
                "position": p.get("position_name", ""),
                "team": p.get("team_name", ""),
                "player_id": p.get("player_id"),
            })
        return {"type": "bar", "title": "Топ игроков по total_score", "data": data}

    @staticmethod
    def player_radar(metrics: List[Dict], player_name: str) -> Optional[Dict]:
        if not metrics:
            return None
        core_m = [m for m in metrics if m.get("bucket") == "core" and m.get("percentile") is not None]
        if not core_m:
            return None
        data = [
            {"metric": m["display_name"], "percentile": round(m["percentile"] * 100)}
            for m in sorted(core_m, key=lambda x: x["display_name"])[:12]
        ]
        return {"type": "radar", "title": f"Профиль: {player_name}", "data": data}

    @staticmethod
    def comparison_bar(players_data: List[Dict]) -> Optional[Dict]:
        if not players_data or len(players_data) < 2:
            return None
        data = []
        for pd in players_data:
            p = pd["player"]
            sc = pd.get("season_scores") or {}
            data.append({
                "name": p["full_name"],
                "core_score": sc.get("core_score"),
                "support_score": sc.get("support_score"),
                "total_score": sc.get("total_score"),
                "player_id": p["player_id"],
            })
        return {"type": "bar", "title": "Сравнение игроков", "data": data}

    @staticmethod
    def history_line(history: List[Dict], player_name: str) -> Optional[Dict]:
        if not history or len(history) < 2:
            return None
        data = [
            {"round": h["round"], "total_score": h["total_score"]}
            for h in history
        ]
        return {"type": "line", "title": f"Динамика: {player_name}", "data": data}

    @staticmethod
    def watched_bar(players_data: List[Dict]) -> Optional[Dict]:
        """Bar chart for watched players sorted by season total_score."""
        scored = []
        for pd in players_data:
            sc = pd.get("season_scores")
            if sc and sc.get("total_score") is not None:
                p = pd["player"]
                name_parts = p["full_name"].split()
                short = f"{name_parts[0]} {name_parts[1][0]}." if len(name_parts) >= 2 else p["full_name"]
                scored.append({
                    "name": short,
                    "full_name": p["full_name"],
                    "total_score": sc["total_score"],
                    "core_score": sc.get("core_score"),
                    "support_score": sc.get("support_score"),
                    "position": p.get("position_name", ""),
                    "team": p.get("team_name", ""),
                    "player_id": p["player_id"],
                })
        if not scored:
            return None
        scored.sort(key=lambda x: -(x["total_score"] or 0))
        return {"type": "bar", "title": "Скоры за сезон", "data": scored[:10]}

    @staticmethod
    def watched_multi_line(players_data: List[Dict]) -> Optional[Dict]:
        """Multi-player line chart showing total_score dynamics."""
        all_rounds = set()
        player_series = []
        for pd in players_data:
            history = pd.get("history", [])
            if len(history) < 2:
                continue
            p = pd["player"]
            name_parts = p["full_name"].split()
            short = f"{name_parts[0]} {name_parts[1][0]}." if len(name_parts) >= 2 else p["full_name"]
            player_series.append({"name": short, "history": history})
            for h in history:
                all_rounds.add(h["round"])

        if not player_series or len(all_rounds) < 2:
            return None

        data = []
        for rn in sorted(all_rounds):
            point = {"round": rn}
            for ps in player_series:
                val = next((h["total_score"] for h in ps["history"] if h["round"] == rn), None)
                point[ps["name"]] = val
            data.append(point)

        return {
            "type": "multi_line",
            "title": "Динамика по турам",
            "data": data,
            "players": [ps["name"] for ps in player_series],
        }


# ======================================================================
# Cache helpers
# ======================================================================

def compute_data_hash(data: Dict) -> str:
    serialized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


def get_cached_review(db: Session, tid: int, rn: Optional[int], review_type: str, data_hash: str) -> Optional[Dict]:
    try:
        if rn is not None:
            row = db.execute(text("""
                SELECT content FROM ai_reviews
                WHERE tournament_id = :tid AND round_number = :rn
                  AND review_type = :rt AND data_hash = :dh
                ORDER BY created_at DESC LIMIT 1
            """), {"tid": tid, "rn": rn, "rt": review_type, "dh": data_hash}).fetchone()
        else:
            row = db.execute(text("""
                SELECT content FROM ai_reviews
                WHERE tournament_id = :tid AND round_number IS NULL
                  AND review_type = :rt AND data_hash = :dh
                ORDER BY created_at DESC LIMIT 1
            """), {"tid": tid, "rt": review_type, "dh": data_hash}).fetchone()
        if row and row[0]:
            return row[0]
    except Exception as e:
        logger.warning("Cache read error: %s", e)
    return None


def save_review_cache(db: Session, tid: int, rn: Optional[int], review_type: str, data_hash: str, content: Dict):
    try:
        db.execute(text("""
            INSERT INTO ai_reviews (tournament_id, round_number, review_type, data_hash, content)
            VALUES (:tid, :rn, :rt, :dh, :content)
        """), {"tid": tid, "rn": rn, "rt": review_type, "dh": data_hash, "content": json.dumps(content, ensure_ascii=False)})
        db.commit()
    except Exception as e:
        logger.warning("Cache save error: %s", e)
        db.rollback()
