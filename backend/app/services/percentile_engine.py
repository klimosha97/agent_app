"""
Движок расчёта перцентилей и скоров для Talent Scouting.

Два режима:
1. Round analysis — показатели игрока за тур vs PER90 SEASON baseline (яркость в одном туре)
2. Season analysis — PER90 SEASON данные каждого игрока vs все игроки той же позиции (стабильность за весь сезон)

Порог: в baseline включаются только игроки с > MIN_MINUTES_THRESHOLD минут за сезон.
"""

import logging
import math
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

MIN_MINUTES_THRESHOLD = 200


def _resolve_tier_season(db: Session, tournament_id: int) -> Optional[str]:
    """Find the actual season value stored in team_tiers for this tournament."""
    row = db.execute(text("""
        SELECT DISTINCT season FROM team_tiers
        WHERE tournament_id = :tid
        ORDER BY season DESC LIMIT 1
    """), {"tid": tournament_id}).fetchone()
    return row[0] if row else None


def compute_round_analysis(
    db: Session,
    round_slice_id: int,
    tournament_id: int,
    season: str,
) -> Dict:
    """
    Главная точка входа: вычислить перцентили и скоры для тура.
    """
    warnings = []
    computed_baselines = []
    total_players = 0

    tier_season = _resolve_tier_season(db, tournament_id) or season

    league_slice_id = _find_league_baseline(db, tournament_id, season=season)
    if league_slice_id:
        n = _compute_for_baseline(db, round_slice_id, league_slice_id, "LEAGUE", tournament_id)
        computed_baselines.append("LEAGUE")
        total_players = max(total_players, n)
        logger.info(f"LEAGUE baseline: {n} players processed")
    else:
        warnings.append("Нет сезонных PER90 данных для LEAGUE baseline")

    tier_result = _compute_tier_baseline(db, round_slice_id, tournament_id, tier_season)
    if tier_result:
        computed_baselines.append("TIER")
        total_players = max(total_players, tier_result)
        logger.info(f"TIER baseline: {tier_result} players processed")
    else:
        warnings.append("Тиры команд не настроены или нет данных для TIER baseline")

    benchmark_slice_id = _find_benchmark_baseline(db, tournament_id)
    if benchmark_slice_id:
        n = _compute_for_baseline(db, round_slice_id, benchmark_slice_id, "BENCHMARK", tournament_id)
        computed_baselines.append("BENCHMARK")
        total_players = max(total_players, n)
        logger.info(f"BENCHMARK baseline: {n} players processed")
    else:
        warnings.append("Эталонный сезон не загружен для BENCHMARK baseline")

    return {
        "computed_baselines": computed_baselines,
        "players_processed": total_players,
        "warnings": warnings,
    }


def compute_season_analysis(
    db: Session,
    tournament_id: int,
    season: Optional[str] = None,
) -> Dict:
    """
    Вычислить перцентили и скоры для СЕЗОНА (стабильность на дистанции).
    
    season: конкретный period_value сезона, если None — последний загруженный.
    """
    per90_slice_id = _find_league_baseline(db, tournament_id, season=season)
    if not per90_slice_id:
        return {
            "computed": False,
            "players_processed": 0,
            "error": "Нет PER90 данных за сезон для этого турнира",
        }

    logger.info(f"Computing season analysis for tournament {tournament_id}, slice {per90_slice_id}")

    n = _compute_for_baseline(
        db=db,
        round_slice_id=per90_slice_id,
        baseline_slice_id=per90_slice_id,
        baseline_kind="SEASON",
        tournament_id=tournament_id,
    )

    logger.info(f"Season analysis complete: {n} players processed")

    computed_baselines = ["SEASON"]

    # --- TIER baseline for season ---
    tier_season = _resolve_tier_season(db, tournament_id)
    if not tier_season and season:
        tier_season = season
    elif not tier_season:
        pv_row = db.execute(text("""
            SELECT period_value FROM stat_slices WHERE slice_id = :sid
        """), {"sid": per90_slice_id}).fetchone()
        tier_season = pv_row[0] if pv_row else str(__import__('datetime').datetime.now().year)

    tier_players = _compute_tier_baseline(db, per90_slice_id, tournament_id, tier_season)
    if tier_players:
        computed_baselines.append("TIER")
        logger.info(f"Season TIER baseline: {tier_players} players processed")

    # --- BENCHMARK baseline for season ---
    benchmark_slice_id = _find_benchmark_baseline(db, tournament_id)
    benchmark_players = 0
    if benchmark_slice_id:
        benchmark_players = _compute_for_baseline(
            db=db,
            round_slice_id=per90_slice_id,
            baseline_slice_id=benchmark_slice_id,
            baseline_kind="SEASON_BENCHMARK",
            tournament_id=tournament_id,
        )
        computed_baselines.append("SEASON_BENCHMARK")
        logger.info(f"Season BENCHMARK baseline: {benchmark_players} players processed")

    return {
        "computed": True,
        "players_processed": n,
        "slice_id": per90_slice_id,
        "computed_baselines": computed_baselines,
        "benchmark_players": benchmark_players,
        "tier_players": tier_players or 0,
    }


# ======================================================================
# Internal helpers
# ======================================================================

def _find_league_baseline(db: Session, tournament_id: int, *, season: Optional[str] = None) -> Optional[int]:
    """Find the PER90 SEASON slice for this tournament."""
    if season:
        row = db.execute(text("""
            SELECT slice_id FROM stat_slices
            WHERE tournament_id = :tid
              AND slice_type = 'PER90'
              AND period_type = 'SEASON'
              AND period_value = :pv
            ORDER BY uploaded_at DESC
            LIMIT 1
        """), {"tid": tournament_id, "pv": season}).fetchone()
    else:
        row = db.execute(text("""
            SELECT slice_id FROM stat_slices
            WHERE tournament_id = :tid
              AND slice_type = 'PER90'
              AND period_type = 'SEASON'
            ORDER BY uploaded_at DESC
            LIMIT 1
        """), {"tid": tournament_id}).fetchone()
    return row[0] if row else None


def _find_benchmark_baseline(db: Session, tournament_id: int) -> Optional[int]:
    """Find the benchmark slice for this tournament."""
    row = db.execute(text("""
        SELECT slice_id FROM benchmark_slices
        WHERE tournament_id = :tid
        LIMIT 1
    """), {"tid": tournament_id}).fetchone()
    return row[0] if row else None


def _compute_tier_baseline(
    db: Session,
    round_slice_id: int,
    tournament_id: int,
    season: str,
) -> Optional[int]:
    """
    Compute TIER baseline using window functions.
    Partitions by (tier, comparison_group, metric_code).
    """
    league_slice_id = _find_league_baseline(db, tournament_id, season=season)
    if not league_slice_id:
        return None

    # Auto-populate any missing teams into team_tiers (default tier='BOTTOM')
    db.execute(text("""
        INSERT INTO team_tiers (tournament_id, season, team_name, tier)
        SELECT DISTINCT :tid, :season, p.team_name, 'BOTTOM'
        FROM players p
        WHERE p.tournament_id = :tid AND p.team_name IS NOT NULL AND p.team_name != ''
        ON CONFLICT (tournament_id, season, team_name) DO NOTHING
    """), {"tid": tournament_id, "season": season})

    tier_count = db.execute(text("""
        SELECT COUNT(*) FROM team_tiers
        WHERE tournament_id = :tid AND season = :season AND tier IS NOT NULL
    """), {"tid": tournament_id, "season": season}).scalar()

    if not tier_count or tier_count == 0:
        return None

    db.execute(text("""
        DELETE FROM round_percentiles WHERE round_slice_id = :rsid AND baseline_kind = 'TIER'
    """), {"rsid": round_slice_id})
    db.execute(text("""
        DELETE FROM round_scores WHERE round_slice_id = :rsid AND baseline_kind = 'TIER'
    """), {"rsid": round_slice_id})

    total_season_sid = db.execute(text("""
        SELECT slice_id FROM stat_slices
        WHERE tournament_id = :tid AND slice_type = 'TOTAL' AND period_type = 'SEASON'
          AND period_value = :season
        ORDER BY uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id, "season": season}).scalar()
    minutes_sid = total_season_sid or league_slice_id
    if total_season_sid and total_season_sid != league_slice_id:
        overlap = db.execute(text("""
            SELECT COUNT(*) FROM player_statistics ps1
            JOIN player_statistics ps2 ON ps1.player_id = ps2.player_id
            WHERE ps1.slice_id = :total_sid AND ps1.metric_code = 'minutes'
              AND ps2.slice_id = :base_sid AND ps2.metric_code = 'minutes'
            LIMIT 1
        """), {"total_sid": total_season_sid, "base_sid": league_slice_id}).scalar()
        if not overlap or overlap == 0:
            minutes_sid = league_slice_id
            logger.info(f"TIER minutes fallback: using PER90 slice {league_slice_id}")

    db.execute(text("""
        WITH eligible_baseline AS (
            SELECT DISTINCT bpm.player_id
            FROM player_statistics bpm
            WHERE bpm.slice_id = :minutes_sid
              AND bpm.metric_code = 'minutes'
              AND bpm.metric_value > :min_minutes
        ),
        combined AS (
            SELECT
                bpos.comparison_group,
                bps.metric_code,
                bps.metric_value,
                btt.tier,
                NULL::bigint AS round_player_id,
                NULL::text AS round_position_code,
                NULL::text AS round_bucket,
                1 AS is_baseline
            FROM player_statistics bps
            JOIN players bp ON bp.player_id = bps.player_id
            JOIN positions bpos ON bp.position_id = bpos.position_id
            JOIN eligible_baseline eb ON bp.player_id = eb.player_id
            JOIN team_tiers btt ON bp.team_name = btt.team_name
                AND btt.tournament_id = :tid AND btt.season = :season
            WHERE bps.slice_id = :baseline_sid
              AND bps.metric_value IS NOT NULL
              AND btt.tier IS NOT NULL

            UNION ALL

            SELECT
                pos.comparison_group,
                rps.metric_code,
                rps.metric_value,
                rtt.tier,
                rp.player_id,
                pos.code,
                pmc.bucket,
                0 AS is_baseline
            FROM player_statistics rps
            JOIN players rp ON rps.player_id = rp.player_id
            JOIN positions pos ON rp.position_id = pos.position_id
            JOIN position_metric_config pmc
                ON pmc.position_code = pos.code AND pmc.metric_code = rps.metric_code
            JOIN team_tiers rtt ON rp.team_name = rtt.team_name
                AND rtt.tournament_id = :tid AND rtt.season = :season
            WHERE rps.slice_id = :rsid
              AND rps.metric_value IS NOT NULL
              AND rtt.tier IS NOT NULL
        ),
        ranked AS (
            SELECT *,
                SUM(is_baseline) OVER (
                    PARTITION BY tier, comparison_group, metric_code
                ) AS total_baseline,
                SUM(is_baseline) OVER (
                    PARTITION BY tier, comparison_group, metric_code
                    ORDER BY metric_value
                    RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS baseline_lte
            FROM combined
        )
        INSERT INTO round_percentiles
            (round_slice_id, baseline_kind, player_id, position_code, metric_code, bucket, value, percentile)
        SELECT
            :rsid, 'TIER',
            round_player_id, round_position_code, metric_code, round_bucket, metric_value,
            CASE
                WHEN total_baseline = 0 THEN NULL
                ELSE baseline_lte::float / total_baseline
            END
        FROM ranked
        WHERE is_baseline = 0 AND round_player_id IS NOT NULL
    """), {
        "rsid": round_slice_id,
        "tid": tournament_id,
        "season": season,
        "baseline_sid": league_slice_id,
        "minutes_sid": minutes_sid,
        "min_minutes": MIN_MINUTES_THRESHOLD,
    })

    n = _aggregate_scores(db, round_slice_id, "TIER", tournament_id)
    db.commit()
    return n


def _compute_for_baseline(
    db: Session,
    round_slice_id: int,
    baseline_slice_id: int,
    baseline_kind: str,
    tournament_id: int,
    team_filter: Optional[List[str]] = None,
) -> int:
    """
    Batch-compute percentiles using window functions (MUCH faster than correlated subqueries).
    
    Strategy:
    1. UNION ALL baseline values (is_baseline=1) and round player values (is_baseline=0)
    2. Use SUM(is_baseline) window function with ORDER BY metric_value to count
       baseline values <= each row's value in a single pass
    3. Percentile = baseline_lte / total_baseline
    """
    db.execute(text("""
        DELETE FROM round_percentiles WHERE round_slice_id = :rsid AND baseline_kind = :bk
    """), {"rsid": round_slice_id, "bk": baseline_kind})
    db.execute(text("""
        DELETE FROM round_scores WHERE round_slice_id = :rsid AND baseline_kind = :bk
    """), {"rsid": round_slice_id, "bk": baseline_kind})

    is_benchmark_baseline = baseline_kind in ("BENCHMARK", "SEASON_BENCHMARK")

    baseline_season = db.execute(text("""
        SELECT period_value FROM stat_slices
        WHERE slice_id = :sid AND period_type = 'SEASON'
    """), {"sid": baseline_slice_id}).scalar()

    total_season_sid = db.execute(text("""
        SELECT ss2.slice_id FROM stat_slices ss2
        WHERE ss2.tournament_id = :tid
          AND ss2.slice_type = 'TOTAL' AND ss2.period_type = 'SEASON'
          AND (:season IS NULL OR ss2.period_value = :season)
        ORDER BY ss2.uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id, "season": baseline_season}).scalar()

    minutes_sid = total_season_sid or baseline_slice_id
    if is_benchmark_baseline:
        minutes_sid = baseline_slice_id
    elif total_season_sid and total_season_sid != baseline_slice_id:
        overlap = db.execute(text("""
            SELECT COUNT(*) FROM player_statistics ps1
            JOIN player_statistics ps2 ON ps1.player_id = ps2.player_id
            WHERE ps1.slice_id = :total_sid AND ps1.metric_code = 'minutes'
              AND ps2.slice_id = :base_sid AND ps2.metric_code = 'minutes'
            LIMIT 1
        """), {"total_sid": total_season_sid, "base_sid": baseline_slice_id}).scalar()
        if not overlap or overlap == 0:
            minutes_sid = baseline_slice_id
            logger.info(f"Minutes fallback: TOTAL slice {total_season_sid} has no player overlap with baseline {baseline_slice_id}, using baseline for minutes")
    baseline_min_minutes = 0 if is_benchmark_baseline else MIN_MINUTES_THRESHOLD

    db.execute(text("""
        WITH eligible_baseline AS (
            SELECT DISTINCT bpm.player_id
            FROM player_statistics bpm
            WHERE bpm.slice_id = :minutes_sid
              AND bpm.metric_code = 'minutes'
              AND bpm.metric_value > :min_minutes
        ),
        combined AS (
            -- Baseline values
            SELECT
                bpos.comparison_group,
                bps.metric_code,
                bps.metric_value,
                NULL::bigint AS round_player_id,
                NULL::text AS round_position_code,
                NULL::text AS round_bucket,
                1 AS is_baseline
            FROM player_statistics bps
            JOIN players bp ON bp.player_id = bps.player_id
            JOIN positions bpos ON bp.position_id = bpos.position_id
            JOIN eligible_baseline eb ON bp.player_id = eb.player_id
            WHERE bps.slice_id = :baseline_sid
              AND bps.metric_value IS NOT NULL

            UNION ALL

            -- Round player values (only metrics in position config)
            SELECT
                pos.comparison_group,
                rps.metric_code,
                rps.metric_value,
                rp.player_id,
                pos.code,
                pmc.bucket,
                0 AS is_baseline
            FROM player_statistics rps
            JOIN players rp ON rps.player_id = rp.player_id
            JOIN positions pos ON rp.position_id = pos.position_id
            JOIN position_metric_config pmc
                ON pmc.position_code = pos.code AND pmc.metric_code = rps.metric_code
            WHERE rps.slice_id = :rsid
              AND rps.metric_value IS NOT NULL
        ),
        ranked AS (
            SELECT *,
                SUM(is_baseline) OVER (
                    PARTITION BY comparison_group, metric_code
                ) AS total_baseline,
                SUM(is_baseline) OVER (
                    PARTITION BY comparison_group, metric_code
                    ORDER BY metric_value
                    RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS baseline_lte
            FROM combined
        )
        INSERT INTO round_percentiles
            (round_slice_id, baseline_kind, player_id, position_code, metric_code, bucket, value, percentile)
        SELECT
            :rsid, :bk,
            round_player_id, round_position_code, metric_code, round_bucket, metric_value,
            CASE
                WHEN total_baseline = 0 THEN NULL
                ELSE baseline_lte::float / total_baseline
            END
        FROM ranked
        WHERE is_baseline = 0 AND round_player_id IS NOT NULL
    """), {
        "rsid": round_slice_id,
        "bk": baseline_kind,
        "baseline_sid": baseline_slice_id,
        "minutes_sid": minutes_sid,
        "min_minutes": baseline_min_minutes,
    })

    n = _aggregate_scores(db, round_slice_id, baseline_kind, tournament_id)
    db.commit()
    return n


def _aggregate_scores(db: Session, round_slice_id: int, baseline_kind: str, tournament_id: int = 0) -> int:
    """
    Aggregate round_percentiles into round_scores.
    """
    rows = db.execute(text("""
        SELECT rp.player_id, rp.position_code, rp.metric_code, rp.bucket, rp.percentile, rp.value
        FROM round_percentiles rp
        WHERE rp.round_slice_id = :rsid AND rp.baseline_kind = :bk
        ORDER BY rp.player_id, rp.bucket
    """), {"rsid": round_slice_id, "bk": baseline_kind}).fetchall()

    if not rows:
        return 0

    player_minutes: Dict[int, float] = {}
    scored_pids = {r[0] for r in rows}

    src_slice = db.execute(text("""
        SELECT tournament_id, period_type, period_value FROM stat_slices WHERE slice_id = :rsid
    """), {"rsid": round_slice_id}).fetchone()
    src_tid = src_slice[0] if src_slice else tournament_id
    src_season = None
    if src_slice and src_slice[1] == 'SEASON':
        src_season = src_slice[2]

    total_season_sid = db.execute(text("""
        SELECT ss2.slice_id FROM stat_slices ss2
        WHERE ss2.tournament_id = :tid
          AND ss2.slice_type = 'TOTAL' AND ss2.period_type = 'SEASON'
          AND (:season IS NULL OR ss2.period_value = :season)
        ORDER BY ss2.uploaded_at DESC LIMIT 1
    """), {"tid": src_tid, "season": src_season}).scalar()
    if total_season_sid:
        min_rows = db.execute(text("""
            SELECT player_id, metric_value FROM player_statistics
            WHERE slice_id = :sid AND metric_code = 'minutes' AND metric_value IS NOT NULL
        """), {"sid": total_season_sid}).fetchall()
        for mr in min_rows:
            player_minutes[mr[0]] = mr[1]

    matched = scored_pids & set(player_minutes.keys())
    if len(matched) < len(scored_pids) * 0.5:
        per90_sid = db.execute(text("""
            SELECT ss2.slice_id FROM stat_slices ss2
            WHERE ss2.tournament_id = :tid
              AND ss2.slice_type = 'PER90' AND ss2.period_type = 'SEASON'
              AND (:season IS NULL OR ss2.period_value = :season)
            ORDER BY ss2.uploaded_at DESC LIMIT 1
        """), {"tid": src_tid, "season": src_season}).scalar()
        if per90_sid:
            min_rows = db.execute(text("""
                SELECT player_id, metric_value FROM player_statistics
                WHERE slice_id = :sid AND metric_code = 'minutes' AND metric_value IS NOT NULL
            """), {"sid": per90_sid}).fetchall()
            for mr in min_rows:
                if mr[0] not in player_minutes:
                    player_minutes[mr[0]] = mr[1]

    matched = scored_pids & set(player_minutes.keys())
    if len(matched) < len(scored_pids) * 0.5:
        season_filter = src_season
        if not season_filter and total_season_sid:
            season_filter = db.execute(text(
                "SELECT period_value FROM stat_slices WHERE slice_id = :sid"
            ), {"sid": total_season_sid}).scalar()
        name_match_rows = db.execute(text("""
            SELECT p_src.player_id, season_min.metric_value
            FROM players p_src
            JOIN players p_season ON p_src.full_name = p_season.full_name
                AND p_src.team_name = p_season.team_name
                AND p_season.tournament_id = :tid
            JOIN player_statistics season_min ON season_min.player_id = p_season.player_id
                AND season_min.metric_code = 'minutes'
                AND season_min.metric_value IS NOT NULL
            JOIN stat_slices ss ON season_min.slice_id = ss.slice_id
                AND ss.tournament_id = :tid AND ss.period_type = 'SEASON'
                AND (:season IS NULL OR ss.period_value = :season)
            WHERE p_src.player_id = ANY(:pids)
            ORDER BY ss.uploaded_at DESC
        """), {"tid": src_tid, "pids": list(scored_pids - set(player_minutes.keys())), "season": season_filter}).fetchall()
        for mr in name_match_rows:
            if mr[0] not in player_minutes:
                player_minutes[mr[0]] = mr[1]
        logger.info(f"Minutes name-match fallback: matched {len(scored_pids & set(player_minutes.keys()))}/{len(scored_pids)}")

    pos_totals = {}
    config_rows = db.execute(text("""
        SELECT position_code, bucket, COUNT(*) as cnt
        FROM position_metric_config
        GROUP BY position_code, bucket
    """)).fetchall()
    for r in config_rows:
        pos = r[0]
        if pos not in pos_totals:
            pos_totals[pos] = {"core": 0, "support": 0, "risk": 0}
        pos_totals[pos][r[1]] = r[2]

    from collections import defaultdict
    players = defaultdict(lambda: {"position_code": None, "core": [], "support": [], "risk": []})

    for r in rows:
        player_id = r[0]
        position_code = r[1]
        bucket = r[3]
        percentile = r[4]
        value = r[5]

        players[player_id]["position_code"] = position_code
        if percentile is not None:
            players[player_id][bucket].append({"percentile": percentile, "metric": r[2], "value": value})

    count = 0
    for player_id, data in players.items():
        position_code = data["position_code"]
        totals = pos_totals.get(position_code, {"core": 0, "support": 0, "risk": 0})

        core_pcts = sorted([x["percentile"] for x in data["core"]], reverse=True)
        support_pcts = sorted([x["percentile"] for x in data["support"]], reverse=True)

        used_core = len(core_pcts)
        used_support = len(support_pcts)
        total_core = totals.get("core", 0)
        total_support = totals.get("support", 0)

        core_coverage = used_core / total_core if total_core > 0 else 0
        support_coverage = used_support / total_support if total_support > 0 else 0

        if used_core > 0:
            k_core = max(3, math.ceil(0.6 * used_core))
            top_k_core = core_pcts[:min(k_core, used_core)]
            core_score = sum(top_k_core) / len(top_k_core) if top_k_core else 0
        else:
            core_score = 0

        if used_support > 0:
            k_support = max(3, math.ceil(0.6 * used_support))
            top_k_support = support_pcts[:min(k_support, used_support)]
            support_score = sum(top_k_support) / len(top_k_support) if top_k_support else 0
        else:
            support_score = 0

        core_score_adj = core_score * (0.5 + 0.5 * core_coverage)
        support_score_adj = support_score * (0.5 + 0.5 * support_coverage)

        total_score = 0.7 * core_score_adj + 0.3 * support_score_adj

        good_share_core = 0
        if used_core > 0:
            good_count = sum(1 for p in core_pcts if p >= 0.80)
            good_share_core = good_count / used_core

        insufficient_data = (used_core < 4 or core_coverage < 0.6)

        player_min = player_minutes.get(player_id, 0)
        insufficient_minutes = (player_min <= MIN_MINUTES_THRESHOLD)

        risk_flags = {}
        for rm in data["risk"]:
            metric = rm["metric"]
            val = rm["value"]
            if val is not None and val > 0:
                if metric in ("red_cards",):
                    risk_flags[metric] = val
                elif metric in ("yellow_cards",) and val >= 1:
                    risk_flags[metric] = val
                elif metric in ("goal_errors", "gross_errors") and val >= 1:
                    risk_flags[metric] = val
                elif metric in ("fouls",) and val >= 2:
                    risk_flags[metric] = val
                elif metric in ("losses", "losses_own_half") and val >= 3:
                    risk_flags[metric] = val

        import json
        db.execute(text("""
            INSERT INTO round_scores (
                round_slice_id, baseline_kind, player_id, position_code,
                core_score, support_score, total_score,
                core_score_adj, support_score_adj,
                core_coverage, support_coverage, good_share_core,
                risk_flags, insufficient_data, insufficient_minutes
            ) VALUES (
                :rsid, :bk, :pid, :pos,
                :cs, :ss, :ts,
                :csa, :ssa,
                :cc, :sc, :gsc,
                CAST(:rf AS jsonb), :id, :im
            )
            ON CONFLICT (round_slice_id, baseline_kind, player_id) DO UPDATE SET
                position_code = EXCLUDED.position_code,
                core_score = EXCLUDED.core_score,
                support_score = EXCLUDED.support_score,
                total_score = EXCLUDED.total_score,
                core_score_adj = EXCLUDED.core_score_adj,
                support_score_adj = EXCLUDED.support_score_adj,
                core_coverage = EXCLUDED.core_coverage,
                support_coverage = EXCLUDED.support_coverage,
                good_share_core = EXCLUDED.good_share_core,
                risk_flags = EXCLUDED.risk_flags,
                insufficient_data = EXCLUDED.insufficient_data,
                insufficient_minutes = EXCLUDED.insufficient_minutes,
                computed_at = CURRENT_TIMESTAMP
        """), {
            "rsid": round_slice_id,
            "bk": baseline_kind,
            "pid": player_id,
            "pos": position_code,
            "cs": round(core_score, 4),
            "ss": round(support_score, 4),
            "ts": round(total_score, 4),
            "csa": round(core_score_adj, 4),
            "ssa": round(support_score_adj, 4),
            "cc": round(core_coverage, 4),
            "sc": round(support_coverage, 4),
            "gsc": round(good_share_core, 4),
            "rf": json.dumps(risk_flags),
            "id": insufficient_data,
            "im": insufficient_minutes,
        })
        count += 1

    return count
