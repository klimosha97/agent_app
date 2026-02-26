"""
API роутер для Talent Scouting: перцентили, скоры, сравнение игроков.
Фазы 1-5 плана.
"""

import logging
import os
import shutil
from datetime import datetime
from pathlib import Path as FilePath
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Path
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.config import settings
from app.services.position_metrics import get_position_metrics, sync_position_metrics
from app.services.data_loader import DataLoader

logger = logging.getLogger(__name__)

router = APIRouter()


# ======================================================================
# Phase 1: Position metric config
# ======================================================================

@router.get("/positions/metrics", summary="Конфигурация метрик по позициям")
async def get_all_position_metrics(
    position_code: Optional[str] = Query(None, description="Код позиции (если не указан — все)"),
    db: Session = Depends(get_db),
):
    """Получить core/support/risk метрики для позиций."""
    data = get_position_metrics(db, position_code)
    return {"success": True, "data": data}


@router.post("/positions/metrics/sync", summary="Принудительная синхронизация конфигурации позиций")
async def force_sync_position_metrics(db: Session = Depends(get_db)):
    """Перечитать POSITION_INFO.txt и обновить БД."""
    result = sync_position_metrics(db)
    return {"success": True, "data": result, "message": "Конфигурация позиций обновлена"}


# ======================================================================
# Phase 2: Team tiers
# ======================================================================

@router.get("/tiers/{tournament_id}", summary="Получить корзины команд")
async def get_team_tiers(
    tournament_id: int = Path(..., ge=0, le=3),
    season: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Получить распределение команд по корзинам (TOP/BOTTOM)."""
    if season is None:
        season = _get_season(db, tournament_id)

    rows = db.execute(text("""
        SELECT team_name, tier
        FROM team_tiers
        WHERE tournament_id = :tid AND season = :season
        ORDER BY tier NULLS LAST, team_name
    """), {"tid": tournament_id, "season": season}).fetchall()

    teams = [{"team_name": r[0], "tier": r[1]} for r in rows]
    return {"success": True, "data": teams, "tournament_id": tournament_id, "season": season}


def _sync_team_tiers(db: Session, tournament_id: int, season: str) -> dict:
    """
    Smart sync of team_tiers:
    - Teams still in players → keep their existing tier
    - New teams (not in team_tiers) → add with tier='BOTTOM'
    - Teams gone from players → remove from team_tiers
    """
    current_rows = db.execute(text("""
        SELECT DISTINCT team_name FROM players
        WHERE tournament_id = :tid AND team_name IS NOT NULL AND team_name != ''
    """), {"tid": tournament_id}).fetchall()
    current_teams = {r[0] for r in current_rows}

    existing_rows = db.execute(text("""
        SELECT team_name, tier FROM team_tiers
        WHERE tournament_id = :tid AND season = :season
    """), {"tid": tournament_id, "season": season}).fetchall()
    existing_map = {r[0]: r[1] for r in existing_rows}

    gone_teams = set(existing_map.keys()) - current_teams
    new_teams = current_teams - set(existing_map.keys())

    for team in gone_teams:
        db.execute(text("""
            DELETE FROM team_tiers
            WHERE tournament_id = :tid AND season = :season AND team_name = :tn
        """), {"tid": tournament_id, "season": season, "tn": team})

    for team in new_teams:
        db.execute(text("""
            INSERT INTO team_tiers (tournament_id, season, team_name, tier)
            VALUES (:tid, :season, :tn, 'BOTTOM')
            ON CONFLICT (tournament_id, season, team_name) DO NOTHING
        """), {"tid": tournament_id, "season": season, "tn": team})

    # Fix any legacy NULL tiers → BOTTOM
    db.execute(text("""
        UPDATE team_tiers SET tier = 'BOTTOM'
        WHERE tournament_id = :tid AND season = :season AND tier IS NULL
    """), {"tid": tournament_id, "season": season})

    kept = len(current_teams & set(existing_map.keys()))
    return {"kept": kept, "added": len(new_teams), "removed": len(gone_teams),
            "added_teams": sorted(new_teams), "removed_teams": sorted(gone_teams)}


@router.post("/tiers/{tournament_id}/populate", summary="Синхронизировать список команд из БД")
async def populate_team_tiers(
    tournament_id: int = Path(..., ge=0, le=3),
    db: Session = Depends(get_db),
):
    """
    Синхронизировать team_tiers с актуальными командами из таблицы players.
    - Новые команды добавляются в нижнюю корзину (BOTTOM)
    - Команды, которых больше нет → удаляются
    - Существующие корзины сохраняются
    """
    season = _get_season(db, tournament_id)

    result = _sync_team_tiers(db, tournament_id, season)
    db.commit()

    total = db.execute(text("""
        SELECT COUNT(*) FROM team_tiers WHERE tournament_id = :tid AND season = :season
    """), {"tid": tournament_id, "season": season}).scalar()

    return {
        "success": True,
        "new_teams": result["added"],
        "removed_teams": result["removed"],
        "kept_teams": result["kept"],
        "total_teams": total,
        "season": season,
        "added_list": result["added_teams"],
        "removed_list": result["removed_teams"],
        "message": f"Синхронизировано: +{result['added']} новых, -{result['removed']} удалено, {result['kept']} без изменений",
    }


@router.put("/tiers/{tournament_id}", summary="Обновить корзины команд")
async def update_team_tiers(
    tournament_id: int = Path(..., ge=0, le=3),
    body: dict = None,
    db: Session = Depends(get_db),
):
    """
    Принять массив {teams: [{team_name, tier}, ...]} и UPSERT.
    tier должен быть 'TOP' или 'BOTTOM'.
    """
    if not body or "teams" not in body:
        raise HTTPException(status_code=400, detail="Body must contain 'teams' array")

    season = body.get("season") or _get_season(db, tournament_id)
    updated = 0

    for item in body["teams"]:
        team_name = item.get("team_name")
        tier = item.get("tier") or "BOTTOM"
        if not team_name:
            continue

        if tier not in ("TOP", "BOTTOM"):
            raise HTTPException(status_code=400, detail=f"Invalid tier '{tier}'. Must be TOP or BOTTOM")

        db.execute(text("""
            INSERT INTO team_tiers (tournament_id, season, team_name, tier)
            VALUES (:tid, :season, :team_name, :tier)
            ON CONFLICT (tournament_id, season, team_name)
            DO UPDATE SET tier = EXCLUDED.tier
        """), {"tid": tournament_id, "season": season, "team_name": team_name, "tier": tier})
        updated += 1

    db.commit()
    return {"success": True, "updated": updated, "message": f"Обновлено {updated} команд"}


# ======================================================================
# Phase 3: External benchmark
# ======================================================================

@router.get("/benchmarks/{tournament_id}", summary="Получить эталонный сезон")
async def get_benchmark(
    tournament_id: int = Path(..., ge=0, le=3),
    db: Session = Depends(get_db),
):
    """Получить информацию об эталонном сезоне для турнира."""
    row = db.execute(text("""
        SELECT bs.id, bs.tournament_id, bs.slice_id, bs.label, bs.uploaded_at
        FROM benchmark_slices bs
        WHERE bs.tournament_id = :tid
    """), {"tid": tournament_id}).fetchone()

    if not row:
        return {"success": True, "data": None, "message": "Эталонный сезон не загружен"}

    return {
        "success": True,
        "data": {
            "id": row[0],
            "tournament_id": row[1],
            "slice_id": row[2],
            "label": row[3],
            "uploaded_at": row[4].isoformat() if row[4] else None,
        },
    }


@router.post("/benchmarks/{tournament_id}", summary="Загрузить эталонный сезон")
async def upload_benchmark(
    tournament_id: int = Path(..., ge=0, le=3),
    file: UploadFile = File(..., description="Excel файл с PER90 статистикой эталонного сезона"),
    label: str = Form("", description="Название эталона (например 'МФЛ 2024')"),
    db: Session = Depends(get_db),
):
    """
    Загрузить файл эталонного сезона.
    Если уже есть эталон для этого турнира — старый удаляется (CASCADE).
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Поддерживаются только .xlsx файлы")

    file_path = None
    try:
        # Save file
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = f"{ts}_benchmark_{tournament_id}_{file.filename}"
        file_path = FilePath(settings.upload_path) / safe_name
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        # Delete old benchmark if exists
        old_row = db.execute(text("""
            SELECT slice_id FROM benchmark_slices WHERE tournament_id = :tid
        """), {"tid": tournament_id}).fetchone()

        if old_row:
            old_slice_id = old_row[0]
            db.execute(text("DELETE FROM benchmark_slices WHERE tournament_id = :tid"), {"tid": tournament_id})
            db.execute(text("DELETE FROM player_statistics WHERE slice_id = :sid"), {"sid": old_slice_id})
            db.execute(text("DELETE FROM stat_slices WHERE slice_id = :sid"), {"sid": old_slice_id})
            logger.info(f"Deleted old benchmark slice {old_slice_id} for tournament {tournament_id}")

        # Create a new BENCHMARK slice
        slice_result = db.execute(text("""
            INSERT INTO stat_slices (tournament_id, slice_type, period_type, period_value, description)
            VALUES (:tid, 'PER90', 'BENCHMARK', 'benchmark', :desc)
            RETURNING slice_id
        """), {"tid": tournament_id, "desc": f"Benchmark: {label or file.filename}"})
        new_slice_id = slice_result.scalar()

        # Load data using DataLoader (directly into the new slice)
        loader = DataLoader(db)
        df_result = loader.load_file(
            file_path=file_path,
            tournament_id=tournament_id,
            slice_type="PER90",
            period_type="BENCHMARK",
            period_value="benchmark",
        )

        # Register in benchmark_slices
        # The load_file above may have created its own slice via _upsert_slice,
        # so use the slice_id it returned
        actual_slice_id = df_result.get("slice_id", new_slice_id)

        db.execute(text("""
            INSERT INTO benchmark_slices (tournament_id, slice_id, label)
            VALUES (:tid, :sid, :label)
            ON CONFLICT (tournament_id) DO UPDATE SET
                slice_id = EXCLUDED.slice_id,
                label = EXCLUDED.label,
                uploaded_at = CURRENT_TIMESTAMP
        """), {"tid": tournament_id, "sid": actual_slice_id, "label": label or file.filename})

        db.commit()

        return {
            "success": True,
            "message": f"Эталонный сезон '{label or file.filename}' загружен",
            "slice_id": actual_slice_id,
            "players_loaded": df_result["players_loaded"],
            "stats_loaded": df_result["stats_loaded"],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error uploading benchmark: {e}")
        if file_path and file_path.exists():
            try:
                os.unlink(file_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки эталона: {str(e)}")


@router.delete("/benchmarks/{tournament_id}", summary="Удалить эталонный сезон")
async def delete_benchmark(
    tournament_id: int = Path(..., ge=0, le=3),
    db: Session = Depends(get_db),
):
    """Удалить эталонный сезон для турнира."""
    row = db.execute(text("""
        SELECT slice_id FROM benchmark_slices WHERE tournament_id = :tid
    """), {"tid": tournament_id}).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Эталонный сезон не найден")

    slice_id = row[0]
    db.execute(text("DELETE FROM benchmark_slices WHERE tournament_id = :tid"), {"tid": tournament_id})
    db.execute(text("DELETE FROM player_statistics WHERE slice_id = :sid"), {"sid": slice_id})
    db.execute(text("DELETE FROM stat_slices WHERE slice_id = :sid"), {"sid": slice_id})
    db.commit()

    return {"success": True, "message": "Эталонный сезон удалён"}


# ======================================================================
# Phase 4.5: Recompute analysis
# ======================================================================

@router.post("/rounds/{tournament_id}/{round_number}/recompute", summary="Пересчитать анализ тура")
async def recompute_round_analysis(
    tournament_id: int = Path(..., ge=0, le=3),
    round_number: int = Path(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Пересчитать перцентили и скоры для тура.
    Полезно если таблицы были созданы после загрузки данных.
    """
    from app.services.percentile_engine import compute_round_analysis

    round_slice_id = _find_round_slice(db, tournament_id, round_number)
    if not round_slice_id:
        raise HTTPException(status_code=404, detail=f"Данные за тур {round_number} не найдены")

    season = _get_season(db, tournament_id)
    result = compute_round_analysis(
        db=db,
        round_slice_id=round_slice_id,
        tournament_id=tournament_id,
        season=season,
    )

    return {"success": True, "data": result, "message": f"Анализ тура {round_number} пересчитан"}


# ======================================================================
# Phase 4.6: Season analysis (стабильность за весь сезон)
# ======================================================================

@router.get("/seasons/{tournament_id}", summary="Список доступных сезонов")
async def get_available_seasons(
    tournament_id: int = Path(..., ge=0, le=3),
    db: Session = Depends(get_db),
):
    """Получить список всех загруженных сезонов для турнира."""
    rows = db.execute(text("""
        SELECT
            ss.period_value,
            ss.uploaded_at,
            COUNT(DISTINCT ps.player_id) as players_count,
            MAX(CASE WHEN rs.player_id IS NOT NULL THEN 1 ELSE 0 END) as has_scores
        FROM stat_slices ss
        LEFT JOIN player_statistics ps ON ps.slice_id = ss.slice_id
        LEFT JOIN round_scores rs ON rs.round_slice_id = ss.slice_id AND rs.baseline_kind = 'SEASON'
        WHERE ss.tournament_id = :tid
          AND ss.slice_type = 'PER90'
          AND ss.period_type = 'SEASON'
        GROUP BY ss.period_value, ss.uploaded_at, ss.slice_id
        ORDER BY ss.uploaded_at DESC
    """), {"tid": tournament_id}).fetchall()

    seasons = []
    for r in rows:
        seasons.append({
            "period_value": r[0],
            "uploaded_at": r[1].isoformat() if r[1] else None,
            "players_count": r[2] or 0,
            "has_scores": bool(r[3]),
        })

    return {"success": True, "data": seasons, "current": seasons[0]["period_value"] if seasons else None}


@router.post("/season/{tournament_id}/recompute", summary="Пересчитать сезонный анализ")
async def recompute_season_analysis(
    tournament_id: int = Path(..., ge=0, le=3),
    season: Optional[str] = Query(None, description="period_value сезона (если не указан — последний)"),
    db: Session = Depends(get_db),
):
    """
    Пересчитать рейтинг по позициям за весь сезон.
    PER90 данные каждого игрока сравниваются с остальными на той же позиции.
    """
    from app.services.percentile_engine import compute_season_analysis
    result = compute_season_analysis(db=db, tournament_id=tournament_id, season=season)
    if not result.get("computed"):
        raise HTTPException(status_code=404, detail=result.get("error", "Не удалось вычислить"))
    return {"success": True, "data": result, "message": "Сезонный анализ пересчитан"}


@router.get("/season/{tournament_id}/top-by-position", summary="Топ по позициям за сезон")
async def get_season_top_by_position(
    tournament_id: int = Path(..., ge=0, le=3),
    sort_by: str = Query("total_score"),
    funnel: str = Query("all"),
    baseline_kind: str = Query("SEASON"),
    season: Optional[str] = Query(None, description="period_value сезона (если не указан — последний)"),
    limit_per_position: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """
    Получить топ игроков по каждой позиции за весь сезон.
    baseline_kind: SEASON, TIER, или SEASON_BENCHMARK.
    season: конкретный сезон (period_value), если не указан — последний загруженный.
    """
    safe_baseline = baseline_kind if baseline_kind in ("SEASON", "TIER", "SEASON_BENCHMARK") else "SEASON"

    # Find PER90 SEASON slice (optionally for specific season)
    season_filter = "AND ss.period_value = :pv" if season else ""
    per90_slice_id = db.execute(text(f"""
        SELECT slice_id FROM stat_slices ss
        WHERE ss.tournament_id = :tid AND ss.slice_type = 'PER90' AND ss.period_type = 'SEASON'
        {season_filter}
        ORDER BY ss.uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id, **({"pv": season} if season else {})}).scalar()

    if not per90_slice_id:
        return {"success": True, "data": {}, "message": "Нет PER90 данных за сезон"}

    # Check if season scores exist
    score_count = db.execute(text("""
        SELECT COUNT(*) FROM round_scores
        WHERE round_slice_id = :sid AND baseline_kind = :bk
    """), {"sid": per90_slice_id, "bk": safe_baseline}).scalar()

    if not score_count or score_count == 0:
        if safe_baseline == "SEASON_BENCHMARK":
            return {"success": True, "data": {}, "total_positions": 0, "needs_recompute": True,
                    "message": "Эталонный анализ не рассчитан. Загрузите эталон и нажмите «Пересчитать»."}
        if safe_baseline == "TIER":
            return {"success": True, "data": {}, "total_positions": 0, "needs_recompute": True,
                    "message": "Анализ по корзинам не рассчитан. Настройте корзины и нажмите «Пересчитать»."}
        return {"success": True, "data": {}, "total_positions": 0, "needs_recompute": True,
                "message": "Сезонный анализ не рассчитан. Нажмите «Пересчитать»."}

    ALLOWED_SORTS = ("core_score_adj", "total_score", "support_score_adj", "support_score", "core_score", "good_share_core")
    safe_sort = sort_by if sort_by in ALLOWED_SORTS else "total_score"

    funnel_col = safe_sort
    funnel_cond = ""
    if funnel == "p75":
        funnel_cond = f"AND rs.{funnel_col} >= 0.75"
    elif funnel == "p85":
        funnel_cond = f"AND rs.{funnel_col} >= 0.85"
    elif funnel == "p90":
        funnel_cond = f"AND rs.{funnel_col} >= 0.90"

    rows = db.execute(text(f"""
        WITH ranked AS (
            SELECT
                rs.player_id, p.full_name, p.team_name,
                rs.position_code, pos.display_name as position_name, pos.group_code,
                rs.core_score, rs.support_score, rs.total_score,
                rs.core_score_adj, rs.support_score_adj,
                rs.core_coverage, rs.support_coverage,
                rs.good_share_core, rs.risk_flags, rs.insufficient_data,
                ROW_NUMBER() OVER (PARTITION BY pos.comparison_group ORDER BY rs.{safe_sort} DESC NULLS LAST) as rn,
                pos.comparison_group,
                COALESCE(rs.insufficient_minutes, false) as insufficient_minutes
            FROM round_scores rs
            JOIN players p ON rs.player_id = p.player_id
            JOIN positions pos ON pos.code = rs.position_code
            WHERE rs.round_slice_id = :sid
              AND rs.baseline_kind = :bk
              AND rs.insufficient_data = false
              AND COALESCE(rs.insufficient_minutes, false) = false
              {funnel_cond}
        )
        SELECT * FROM ranked WHERE rn <= :lpp
        ORDER BY group_code, comparison_group, rn
    """), {
        "sid": per90_slice_id,
        "bk": safe_baseline,
        "lpp": limit_per_position,
    }).fetchall()

    # Group by comparison_group
    CG_NAMES = {
        'НАП': 'Нападающие', 'АП Ц': 'Атакующие ПЗ центральные',
        'ФЛ': 'Фланговые', 'ПЗ Ц': 'Полузащитники центральные',
        'ОП': 'Опорные полузащитники', 'ЦЗ': 'Центральные защитники',
        'КЗ': 'Крайние защитники',
    }
    positions = {}
    for r in rows:
        cg = r[17]  # comparison_group
        if cg not in positions:
            positions[cg] = {
                "position_code": cg,
                "position_name": CG_NAMES.get(cg, cg),
                "position_group": r[5],
                "players": [],
            }
        positions[cg]["players"].append({
            "rank": r[16],  # rn
            "player_id": r[0],
            "full_name": r[1],
            "team_name": r[2],
            "position_detail": r[3],  # exact position code
            "core_score": r[6],
            "support_score": r[7],
            "total_score": r[8],
            "core_score_adj": r[9],
            "support_score_adj": r[10],
            "core_coverage": r[11],
            "support_coverage": r[12],
            "good_share_core": r[13],
            "risk_flags": r[14] or {},
            "insufficient_data": r[15],
            "insufficient_minutes": r[18],
        })

    return {"success": True, "data": positions, "total_positions": len(positions)}


@router.get("/season/{tournament_id}/top", summary="Общий топ за сезон")
async def get_season_top(
    tournament_id: int = Path(..., ge=0, le=3),
    sort_by: str = Query("total_score"),
    funnel: str = Query("all"),
    baseline_kind: str = Query("SEASON"),
    season: Optional[str] = Query(None, description="period_value сезона (если не указан — последний)"),
    position_code: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Общий рейтинг за сезон — все позиции в одном списке.
    baseline_kind: SEASON, TIER, или SEASON_BENCHMARK.
    season: конкретный сезон (period_value), если не указан — последний."""
    safe_baseline = baseline_kind if baseline_kind in ("SEASON", "TIER", "SEASON_BENCHMARK") else "SEASON"

    season_filter = "AND ss.period_value = :pv" if season else ""
    per90_slice_id = db.execute(text(f"""
        SELECT slice_id FROM stat_slices ss
        WHERE ss.tournament_id = :tid AND ss.slice_type = 'PER90' AND ss.period_type = 'SEASON'
        {season_filter}
        ORDER BY ss.uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id, **({"pv": season} if season else {})}).scalar()

    if not per90_slice_id:
        return {"success": True, "data": [], "message": "Нет PER90 данных за сезон"}

    ALLOWED_SORTS = ("core_score_adj", "total_score", "support_score_adj", "support_score", "core_score", "good_share_core")
    safe_sort = sort_by if sort_by in ALLOWED_SORTS else "total_score"

    funnel_col = safe_sort
    funnel_cond = ""
    if funnel == "p75":
        funnel_cond = f"AND rs.{funnel_col} >= 0.75"
    elif funnel == "p85":
        funnel_cond = f"AND rs.{funnel_col} >= 0.85"
    elif funnel == "p90":
        funnel_cond = f"AND rs.{funnel_col} >= 0.90"

    position_cond = "AND rs.position_code = :pos" if position_code else ""

    rows = db.execute(text(f"""
        SELECT
            rs.player_id, p.full_name, p.team_name,
            rs.position_code, pos.display_name as position_name, pos.group_code,
            rs.core_score, rs.support_score, rs.total_score,
            rs.core_score_adj, rs.support_score_adj,
            rs.core_coverage, rs.support_coverage,
            rs.good_share_core, rs.risk_flags, rs.insufficient_data,
            COALESCE(rs.insufficient_minutes, false) as insufficient_minutes
        FROM round_scores rs
        JOIN players p ON rs.player_id = p.player_id
        JOIN positions pos ON pos.code = rs.position_code
        WHERE rs.round_slice_id = :sid
          AND rs.baseline_kind = :bk
          AND rs.insufficient_data = false
          AND COALESCE(rs.insufficient_minutes, false) = false
          {funnel_cond}
          {position_cond}
        ORDER BY rs.{safe_sort} DESC NULLS LAST
        LIMIT :lim
    """), {
        "sid": per90_slice_id,
        "bk": safe_baseline,
        "lim": limit,
        **({"pos": position_code} if position_code else {}),
    }).fetchall()

    data = []
    for i, r in enumerate(rows):
        data.append({
            "rank": i + 1,
            "player_id": r[0],
            "full_name": r[1],
            "team_name": r[2],
            "position_code": r[3],
            "position_name": r[4],
            "position_group": r[5],
            "core_score": r[6],
            "support_score": r[7],
            "total_score": r[8],
            "core_score_adj": r[9],
            "support_score_adj": r[10],
            "core_coverage": r[11],
            "support_coverage": r[12],
            "good_share_core": r[13],
            "risk_flags": r[14] or {},
            "insufficient_data": r[15],
            "insufficient_minutes": r[16],
        })

    return {"success": True, "data": data, "total": len(data)}


# ======================================================================
# Phase 5: Analysis result endpoints
# ======================================================================

@router.get("/rounds/{tournament_id}/{round_number}/top", summary="Топ выступления за тур")
async def get_round_top(
    tournament_id: int = Path(..., ge=0, le=3),
    round_number: int = Path(..., ge=1),
    baseline_kind: str = Query("LEAGUE"),
    sort_by: str = Query("total_score", description="core_score_adj / total_score / support_score"),
    funnel: str = Query("all", description="all / p75 / p85 / p90"),
    position_code: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Получить топ игроков тура по скору."""
    round_slice_id = _find_round_slice(db, tournament_id, round_number)
    if not round_slice_id:
        return {"success": True, "data": [], "message": "Данные тура не найдены"}

    ALLOWED_SORTS = ("core_score_adj", "total_score", "support_score_adj", "support_score", "core_score", "good_share_core")
    safe_sort = sort_by if sort_by in ALLOWED_SORTS else "total_score"

    funnel_col = safe_sort
    funnel_cond = ""
    if funnel == "p75":
        funnel_cond = f"AND rs.{funnel_col} >= 0.75"
    elif funnel == "p85":
        funnel_cond = f"AND rs.{funnel_col} >= 0.85"
    elif funnel == "p90":
        funnel_cond = f"AND rs.{funnel_col} >= 0.90"

    position_cond = "AND rs.position_code = :pos" if position_code else ""

    rows = db.execute(text(f"""
        SELECT
            rs.player_id, p.full_name, p.team_name,
            rs.position_code, pos.display_name as position_name, pos.group_code,
            rs.core_score, rs.support_score, rs.total_score,
            rs.core_score_adj, rs.support_score_adj,
            rs.core_coverage, rs.support_coverage,
            rs.good_share_core, rs.risk_flags, rs.insufficient_data,
            COALESCE(rs.insufficient_minutes, false) as insufficient_minutes
        FROM round_scores rs
        JOIN players p ON rs.player_id = p.player_id
        JOIN positions pos ON pos.code = rs.position_code
        WHERE rs.round_slice_id = :rsid
          AND rs.baseline_kind = :bk
          AND rs.insufficient_data = false
          AND COALESCE(rs.insufficient_minutes, false) = false
          {funnel_cond}
          {position_cond}
        ORDER BY rs.{safe_sort} DESC NULLS LAST
        LIMIT :lim
    """), {
        "rsid": round_slice_id,
        "bk": baseline_kind,
        "lim": limit,
        **({"pos": position_code} if position_code else {}),
    }).fetchall()

    data = []
    for i, r in enumerate(rows):
        data.append({
            "rank": i + 1,
            "player_id": r[0],
            "full_name": r[1],
            "team_name": r[2],
            "position_code": r[3],
            "position_name": r[4],
            "position_group": r[5],
            "core_score": r[6],
            "support_score": r[7],
            "total_score": r[8],
            "core_score_adj": r[9],
            "support_score_adj": r[10],
            "core_coverage": r[11],
            "support_coverage": r[12],
            "good_share_core": r[13],
            "risk_flags": r[14] or {},
            "insufficient_data": r[15],
            "insufficient_minutes": r[16],
        })

    return {"success": True, "data": data, "total": len(data)}


@router.get("/rounds/{tournament_id}/{round_number}/top-by-position", summary="Топ по позициям за тур")
async def get_round_top_by_position(
    tournament_id: int = Path(..., ge=0, le=3),
    round_number: int = Path(..., ge=1),
    baseline_kind: str = Query("LEAGUE"),
    sort_by: str = Query("total_score"),
    funnel: str = Query("all"),
    limit_per_position: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """Получить топ игроков по каждой позиции."""
    round_slice_id = _find_round_slice(db, tournament_id, round_number)
    if not round_slice_id:
        return {"success": True, "data": {}, "message": "Данные тура не найдены"}

    ALLOWED_SORTS = ("core_score_adj", "total_score", "support_score_adj", "support_score", "core_score", "good_share_core")
    safe_sort = sort_by if sort_by in ALLOWED_SORTS else "total_score"

    funnel_col = safe_sort
    funnel_cond = ""
    if funnel == "p75":
        funnel_cond = f"AND rs.{funnel_col} >= 0.75"
    elif funnel == "p85":
        funnel_cond = f"AND rs.{funnel_col} >= 0.85"
    elif funnel == "p90":
        funnel_cond = f"AND rs.{funnel_col} >= 0.90"

    rows = db.execute(text(f"""
        WITH ranked AS (
            SELECT
                rs.player_id, p.full_name, p.team_name,
                rs.position_code, pos.display_name as position_name, pos.group_code,
                rs.core_score, rs.support_score, rs.total_score,
                rs.core_score_adj, rs.support_score_adj,
                rs.core_coverage, rs.support_coverage,
                rs.good_share_core, rs.risk_flags, rs.insufficient_data,
                ROW_NUMBER() OVER (PARTITION BY pos.comparison_group ORDER BY rs.{safe_sort} DESC NULLS LAST) as rn,
                pos.comparison_group,
                COALESCE(rs.insufficient_minutes, false) as insufficient_minutes
            FROM round_scores rs
            JOIN players p ON rs.player_id = p.player_id
            JOIN positions pos ON pos.code = rs.position_code
            WHERE rs.round_slice_id = :rsid
              AND rs.baseline_kind = :bk
              AND rs.insufficient_data = false
              AND COALESCE(rs.insufficient_minutes, false) = false
              {funnel_cond}
        )
        SELECT * FROM ranked WHERE rn <= :lpp
        ORDER BY group_code, comparison_group, rn
    """), {
        "rsid": round_slice_id,
        "bk": baseline_kind,
        "lpp": limit_per_position,
    }).fetchall()

    # Group by comparison_group
    CG_NAMES = {
        'НАП': 'Нападающие', 'АП Ц': 'Атакующие ПЗ центральные',
        'ФЛ': 'Фланговые', 'ПЗ Ц': 'Полузащитники центральные',
        'ОП': 'Опорные полузащитники', 'ЦЗ': 'Центральные защитники',
        'КЗ': 'Крайние защитники',
    }
    positions = {}
    for r in rows:
        cg = r[17]  # comparison_group
        if cg not in positions:
            positions[cg] = {
                "position_code": cg,
                "position_name": CG_NAMES.get(cg, cg),
                "position_group": r[5],
                "players": [],
            }
        positions[cg]["players"].append({
            "rank": r[16],  # rn
            "player_id": r[0],
            "full_name": r[1],
            "team_name": r[2],
            "position_detail": r[3],  # exact position code
            "core_score": r[6],
            "support_score": r[7],
            "total_score": r[8],
            "core_score_adj": r[9],
            "core_coverage": r[11],
            "good_share_core": r[13],
            "risk_flags": r[14] or {},
            "insufficient_data": r[15],
            "insufficient_minutes": r[18],
        })

    return {"success": True, "data": positions, "total_positions": len(positions)}


@router.get(
    "/rounds/{tournament_id}/{round_number}/player/{player_id}/comparison",
    summary="Сравнение игрока по трём baselines",
)
async def get_player_comparison(
    tournament_id: int = Path(..., ge=0, le=3),
    round_number: int = Path(..., ge=1),
    player_id: int = Path(...),
    db: Session = Depends(get_db),
):
    """Получить полное сравнение игрока: LEAGUE, TIER, BENCHMARK."""
    round_slice_id = _find_round_slice(db, tournament_id, round_number)
    if not round_slice_id:
        raise HTTPException(status_code=404, detail="Данные тура не найдены")

    baselines = {}

    for bk in ("LEAGUE", "TIER", "BENCHMARK"):
        # Scores
        score_row = db.execute(text("""
            SELECT core_score, support_score, total_score,
                   core_score_adj, support_score_adj,
                   core_coverage, support_coverage, good_share_core,
                   risk_flags, insufficient_data, position_code,
                   COALESCE(insufficient_minutes, false) as insufficient_minutes
            FROM round_scores
            WHERE round_slice_id = :rsid AND baseline_kind = :bk AND player_id = :pid
        """), {"rsid": round_slice_id, "bk": bk, "pid": player_id}).fetchone()

        if not score_row:
            continue

        # Metrics (percentiles)
        metric_rows = db.execute(text("""
            SELECT rp.metric_code, rp.bucket, rp.value, rp.percentile,
                   mc.display_name_ru, mc.data_type
            FROM round_percentiles rp
            LEFT JOIN metrics_catalog mc ON rp.metric_code = mc.metric_code
            WHERE rp.round_slice_id = :rsid AND rp.baseline_kind = :bk AND rp.player_id = :pid
            ORDER BY rp.bucket, rp.percentile DESC NULLS LAST
        """), {"rsid": round_slice_id, "bk": bk, "pid": player_id}).fetchall()

        metrics = []
        for mr in metric_rows:
            metrics.append({
                "metric_code": mr[0],
                "bucket": mr[1],
                "value": mr[2],
                "percentile": mr[3],
                "display_name": mr[4],
                "data_type": mr[5],
            })

        baselines[bk] = {
            "baseline_kind": bk,
            "scores": {
                "core_score": score_row[0],
                "support_score": score_row[1],
                "total_score": score_row[2],
                "core_score_adj": score_row[3],
                "support_score_adj": score_row[4],
                "core_coverage": score_row[5],
                "support_coverage": score_row[6],
                "good_share_core": score_row[7],
                "risk_flags": score_row[8] or {},
                "insufficient_data": score_row[9],
                "insufficient_minutes": score_row[11],
            },
            "position_code": score_row[10],
            "metrics": metrics,
        }

    # Player info
    player = db.execute(text("""
        SELECT p.full_name, p.team_name, p.birth_year, pos.code, pos.display_name, pos.group_code
        FROM players p JOIN positions pos ON p.position_id = pos.position_id
        WHERE p.player_id = :pid
    """), {"pid": player_id}).fetchone()

    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден")

    return {
        "success": True,
        "player": {
            "player_id": player_id,
            "full_name": player[0],
            "team_name": player[1],
            "birth_year": player[2],
            "position_code": player[3],
            "position_name": player[4],
            "position_group": player[5],
        },
        "round_number": round_number,
        "baselines": baselines,
    }


@router.get("/rounds/{tournament_id}/history/{player_id}", summary="История скоров игрока по турам")
async def get_player_history(
    tournament_id: int = Path(..., ge=0, le=3),
    player_id: int = Path(...),
    baseline_kind: str = Query("LEAGUE"),
    db: Session = Depends(get_db),
):
    """Получить скоры игрока за все туры."""
    rows = db.execute(text("""
        SELECT
            ss.period_value as round_number,
            rs.core_score, rs.support_score, rs.total_score,
            rs.core_score_adj, rs.good_share_core,
            rs.insufficient_data, rs.computed_at,
            COALESCE(rs.insufficient_minutes, false) as insufficient_minutes
        FROM round_scores rs
        JOIN stat_slices ss ON rs.round_slice_id = ss.slice_id
        WHERE ss.tournament_id = :tid
          AND rs.baseline_kind = :bk
          AND rs.player_id = :pid
          AND ss.period_type = 'ROUND'
        ORDER BY CAST(ss.period_value AS INTEGER) ASC
    """), {"tid": tournament_id, "bk": baseline_kind, "pid": player_id}).fetchall()

    data = []
    for r in rows:
        data.append({
            "round_number": int(r[0]) if r[0] else None,
            "core_score": r[1],
            "support_score": r[2],
            "total_score": r[3],
            "core_score_adj": r[4],
            "good_share_core": r[5],
            "insufficient_data": r[6],
            "computed_at": r[7].isoformat() if r[7] else None,
            "insufficient_minutes": r[8],
        })

    return {"success": True, "data": data, "player_id": player_id, "baseline_kind": baseline_kind}


# ======================================================================
# Phase 6: Player profile — полные перцентили по позиции
# ======================================================================

@router.get("/player/{player_id}/percentiles", summary="Перцентили игрока по позиции")
async def get_player_percentiles(
    player_id: int = Path(...),
    round_number: Optional[int] = Query(None, description="Номер тура (если не указан — только сезон)"),
    db: Session = Depends(get_db),
):
    """
    Получить все перцентили метрик для игрока по его позиции.
    
    Возвращает:
    - season: перцентили из PER90 SEASON (стабильность на дистанции)
    - round: перцентили из данных конкретного тура (если round_number указан)
    - scores: агрегированные скоры (core, support, total, good%) для каждого
    - position_config: конфигурация метрик для позиции (core/support/risk)
    """
    # 1. Получить информацию об игроке
    player = db.execute(text("""
        SELECT p.full_name, p.team_name, p.birth_year, p.tournament_id,
               pos.code, pos.display_name, pos.group_code
        FROM players p
        JOIN positions pos ON p.position_id = pos.position_id
        WHERE p.player_id = :pid
    """), {"pid": player_id}).fetchone()

    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден")

    tournament_id = player[3]
    position_code = player[4]

    # 2. Получить конфигурацию метрик для этой позиции
    config_rows = db.execute(text("""
        SELECT pmc.metric_code, pmc.bucket, mc.display_name_ru, mc.data_type, mc.category
        FROM position_metric_config pmc
        LEFT JOIN metrics_catalog mc ON pmc.metric_code = mc.metric_code
        WHERE pmc.position_code = :pos
        ORDER BY
            CASE pmc.bucket WHEN 'core' THEN 1 WHEN 'support' THEN 2 WHEN 'risk' THEN 3 END,
            mc.display_name_ru
    """), {"pos": position_code}).fetchall()

    position_config = []
    for cr in config_rows:
        position_config.append({
            "metric_code": cr[0],
            "bucket": cr[1],
            "display_name": cr[2] or cr[0],
            "data_type": cr[3],
            "category": cr[4],
        })

    # Check if benchmark exists for this tournament
    benchmark_row = db.execute(text("""
        SELECT bs.slice_id, bs.label FROM benchmark_slices bs WHERE bs.tournament_id = :tid
    """), {"tid": tournament_id}).fetchone()

    result = {
        "success": True,
        "player": {
            "player_id": player_id,
            "full_name": player[0],
            "team_name": player[1],
            "birth_year": player[2],
            "tournament_id": tournament_id,
            "position_code": position_code,
            "position_name": player[5],
            "position_group": player[6],
        },
        "position_config": position_config,
        "season": None,
        "season_benchmark": None,
        "benchmark_label": benchmark_row[1] if benchmark_row else None,
        "round": None,
    }

    # 3. Сезонные перцентили (baseline_kind = 'SEASON')
    # Определяем сезон игрока — из какого PER90 SEASON слайса у него есть статистика
    per90_slice_id = db.execute(text("""
        SELECT ss.slice_id FROM stat_slices ss
        JOIN player_statistics ps ON ps.slice_id = ss.slice_id
        WHERE ss.tournament_id = :tid AND ss.slice_type = 'PER90' AND ss.period_type = 'SEASON'
          AND ps.player_id = :pid
        ORDER BY ss.uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id, "pid": player_id}).scalar()

    if per90_slice_id:
        season_data = _get_player_baseline_data(db, per90_slice_id, "SEASON", player_id)
        if season_data:
            result["season"] = season_data

        # 3b. TIER baseline
        season_tier_data = _get_player_baseline_data(db, per90_slice_id, "TIER", player_id)
        if season_tier_data:
            result["season_tier"] = season_tier_data

        # 3c. Сезонные перцентили vs Эталон (baseline_kind = 'SEASON_BENCHMARK')
        if benchmark_row:
            season_bench_data = _get_player_baseline_data(db, per90_slice_id, "SEASON_BENCHMARK", player_id)
            if season_bench_data:
                result["season_benchmark"] = season_bench_data

    # 4. Перцентили за тур
    if round_number:
        round_slice_id = _find_round_slice(db, tournament_id, round_number)
        if round_slice_id:
            # LEAGUE
            round_data = _get_player_baseline_data(db, round_slice_id, "LEAGUE", player_id)
            if round_data:
                round_data["round_number"] = round_number
                result["round"] = round_data
            # TIER
            round_tier = _get_player_baseline_data(db, round_slice_id, "TIER", player_id)
            if round_tier:
                round_tier["round_number"] = round_number
                result["round_tier"] = round_tier
            # BENCHMARK
            round_bench = _get_player_baseline_data(db, round_slice_id, "BENCHMARK", player_id)
            if round_bench:
                round_bench["round_number"] = round_number
                result["round_benchmark"] = round_bench

    # 5. Доступные туры с анализом
    available_rounds = db.execute(text("""
        SELECT DISTINCT CAST(ss.period_value AS INTEGER) as rn
        FROM round_scores rs
        JOIN stat_slices ss ON rs.round_slice_id = ss.slice_id
        WHERE ss.tournament_id = :tid
          AND ss.period_type = 'ROUND'
          AND rs.player_id = :pid
          AND rs.baseline_kind = 'LEAGUE'
        ORDER BY rn DESC
    """), {"tid": tournament_id, "pid": player_id}).fetchall()
    result["available_rounds"] = [r[0] for r in available_rounds]

    return result


def _get_player_baseline_data(
    db, slice_id: int, baseline_kind: str, player_id: int
) -> Optional[dict]:
    """Получить скоры и перцентили для одного baseline."""
    # Scores
    score_row = db.execute(text("""
        SELECT core_score, support_score, total_score,
               core_score_adj, support_score_adj,
               core_coverage, support_coverage, good_share_core,
               risk_flags, insufficient_data, position_code,
               COALESCE(insufficient_minutes, false) as insufficient_minutes
        FROM round_scores
        WHERE round_slice_id = :sid AND baseline_kind = :bk AND player_id = :pid
    """), {"sid": slice_id, "bk": baseline_kind, "pid": player_id}).fetchone()

    if not score_row:
        return None

    # Metric percentiles
    metric_rows = db.execute(text("""
        SELECT rp.metric_code, rp.bucket, rp.value, rp.percentile,
               mc.display_name_ru, mc.data_type
        FROM round_percentiles rp
        LEFT JOIN metrics_catalog mc ON rp.metric_code = mc.metric_code
        WHERE rp.round_slice_id = :sid AND rp.baseline_kind = :bk AND rp.player_id = :pid
        ORDER BY
            CASE rp.bucket WHEN 'core' THEN 1 WHEN 'support' THEN 2 WHEN 'risk' THEN 3 END,
            rp.percentile DESC NULLS LAST
    """), {"sid": slice_id, "bk": baseline_kind, "pid": player_id}).fetchall()

    metrics = []
    for mr in metric_rows:
        metrics.append({
            "metric_code": mr[0],
            "bucket": mr[1],
            "value": mr[2],
            "percentile": mr[3],
            "display_name": mr[4] or mr[0],
            "data_type": mr[5],
        })

    return {
        "scores": {
            "core_score": score_row[0],
            "support_score": score_row[1],
            "total_score": score_row[2],
            "core_score_adj": score_row[3],
            "support_score_adj": score_row[4],
            "core_coverage": score_row[5],
            "support_coverage": score_row[6],
            "good_share_core": score_row[7],
            "risk_flags": score_row[8] or {},
            "insufficient_data": score_row[9],
            "insufficient_minutes": score_row[11],
        },
        "position_code": score_row[10],
        "metrics": metrics,
    }


# ======================================================================
# Helpers
# ======================================================================

def _find_round_slice(db: Session, tournament_id: int, round_number: int) -> Optional[int]:
    """Find the TOTAL ROUND slice for the given tournament and round."""
    row = db.execute(text("""
        SELECT slice_id FROM stat_slices
        WHERE tournament_id = :tid
          AND period_type = 'ROUND'
          AND period_value = :rn
        ORDER BY uploaded_at DESC
        LIMIT 1
    """), {"tid": tournament_id, "rn": str(round_number)}).fetchone()
    return row[0] if row else None


def _get_season(db: Session, tournament_id: int) -> str:
    """Get current season for a tournament.
    
    Uses the period_value from the latest PER90 SEASON slice 
    since that's what team_tiers is keyed on.
    Falls back to tournaments.season and then current year.
    """
    # First try: get season from team_tiers (what's actually stored)
    row = db.execute(text("""
        SELECT DISTINCT season FROM team_tiers
        WHERE tournament_id = :tid
        ORDER BY season DESC LIMIT 1
    """), {"tid": tournament_id}).fetchone()
    if row and row[0]:
        return row[0]
    
    # Second try: get from the latest PER90 SEASON slice
    row = db.execute(text("""
        SELECT period_value FROM stat_slices
        WHERE tournament_id = :tid AND slice_type = 'PER90' AND period_type = 'SEASON'
        ORDER BY uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id}).fetchone()
    if row and row[0]:
        return row[0]
    
    # Fallback: tournament table
    row = db.execute(text("""
        SELECT season FROM tournaments WHERE id = :tid
    """), {"tid": tournament_id}).fetchone()
    return row[0] if row and row[0] else str(datetime.now().year)


# ======================================================================
# New Faces (Новые лица)
# ======================================================================

MIN_MINUTES_NEW_FACE = 200

@router.get("/new-faces/{tournament_id}")
def get_new_faces(
    tournament_id: int,
    season: Optional[str] = Query(None),
    round_number: Optional[int] = Query(None, alias="round"),
    db: Session = Depends(get_db),
):
    """
    Новые лица: игроки, которые сыграли в последнем туре
    и имеют < 200 минут в сезоне.
    """
    if not season:
        season = _get_season(db, tournament_id)

    # Determine latest round with tracking data
    if not round_number:
        row = db.execute(text("""
            SELECT MAX(round_number) FROM round_appearances
            WHERE tournament_id = :tid AND season = :season
        """), {"tid": tournament_id, "season": season}).scalar()
        round_number = row if row else None

    if not round_number:
        return {
            "success": True,
            "data": [],
            "round_number": None,
            "season": season,
            "message": "Нет данных о турах. Загрузите TOTAL данные с указанием номера тура."
        }

    rows = db.execute(text("""
        SELECT
            ra.player_id,
            p.full_name,
            p.team_name,
            p.birth_year,
            pos.code AS position_code,
            pos.display_name AS position_name,
            ra.minutes_before,
            ra.minutes_after,
            ra.is_debut,
            ra.round_number
        FROM round_appearances ra
        JOIN players p ON ra.player_id = p.player_id
        LEFT JOIN positions pos ON p.position_id = pos.position_id
        WHERE ra.tournament_id = :tid
          AND ra.season = :season
          AND ra.round_number = :rn
          AND ra.minutes_after < :threshold
        ORDER BY ra.is_debut DESC, ra.minutes_after ASC, p.full_name
    """), {
        "tid": tournament_id,
        "season": season,
        "rn": round_number,
        "threshold": MIN_MINUTES_NEW_FACE,
    }).fetchall()

    players = []
    for r in rows:
        minutes_in_round = (r[7] or 0) - (r[6] or 0)
        players.append({
            "player_id": r[0],
            "full_name": r[1],
            "team_name": r[2],
            "birth_year": r[3],
            "position_code": r[4],
            "position_name": r[5],
            "minutes_before": r[6],
            "minutes_after": r[7],
            "minutes_in_round": round(minutes_in_round, 1),
            "total_minutes": r[7],
            "is_debut": r[8],
        })

    return {
        "success": True,
        "data": players,
        "round_number": round_number,
        "season": season,
        "total_count": len(players),
        "debuts_count": sum(1 for p in players if p["is_debut"]),
    }
