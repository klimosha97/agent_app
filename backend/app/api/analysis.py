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


@router.post("/tiers/{tournament_id}/populate", summary="Заполнить список команд из БД")
async def populate_team_tiers(
    tournament_id: int = Path(..., ge=0, le=3),
    db: Session = Depends(get_db),
):
    """
    Заполнить team_tiers уникальными командами из таблицы players для турнира.
    Не перезаписывает уже назначенные корзины.
    """
    season = _get_season(db, tournament_id)
    
    # If no teams exist yet, try to detect season from PER90 SEASON slice
    existing = db.execute(text("""
        SELECT COUNT(*) FROM team_tiers WHERE tournament_id = :tid
    """), {"tid": tournament_id}).scalar()
    
    if not existing or existing == 0:
        # Determine season from the latest PER90 SEASON slice
        pv_row = db.execute(text("""
            SELECT period_value FROM stat_slices
            WHERE tournament_id = :tid AND slice_type = 'PER90' AND period_type = 'SEASON'
            ORDER BY uploaded_at DESC LIMIT 1
        """), {"tid": tournament_id}).fetchone()
        if pv_row and pv_row[0]:
            season = pv_row[0]
    
    result = db.execute(text("""
        INSERT INTO team_tiers (tournament_id, season, team_name, tier)
        SELECT DISTINCT :tid, :season, p.team_name, NULL
        FROM players p
        WHERE p.tournament_id = :tid
          AND p.team_name IS NOT NULL
          AND p.team_name != ''
        ON CONFLICT (tournament_id, season, team_name) DO NOTHING
    """), {"tid": tournament_id, "season": season})
    db.commit()
    
    total = db.execute(text("""
        SELECT COUNT(*) FROM team_tiers WHERE tournament_id = :tid AND season = :season
    """), {"tid": tournament_id, "season": season}).scalar()
    
    return {
        "success": True,
        "new_teams": result.rowcount,
        "total_teams": total,
        "season": season,
        "message": f"Добавлено {result.rowcount} новых команд, всего {total}",
    }


@router.put("/tiers/{tournament_id}", summary="Обновить корзины команд")
async def update_team_tiers(
    tournament_id: int = Path(..., ge=0, le=3),
    body: dict = None,
    db: Session = Depends(get_db),
):
    """
    Принять массив {teams: [{team_name, tier}, ...]} и UPSERT.
    tier может быть 'TOP', 'BOTTOM' или null.
    """
    if not body or "teams" not in body:
        raise HTTPException(status_code=400, detail="Body must contain 'teams' array")

    season = body.get("season") or _get_season(db, tournament_id)
    updated = 0

    for item in body["teams"]:
        team_name = item.get("team_name")
        tier = item.get("tier")
        if not team_name:
            continue

        if tier and tier not in ("TOP", "BOTTOM"):
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

@router.post("/season/{tournament_id}/recompute", summary="Пересчитать сезонный анализ")
async def recompute_season_analysis(
    tournament_id: int = Path(..., ge=0, le=3),
    db: Session = Depends(get_db),
):
    """
    Пересчитать рейтинг по позициям за весь сезон.
    PER90 данные каждого игрока сравниваются с остальными на той же позиции.
    """
    from app.services.percentile_engine import compute_season_analysis
    result = compute_season_analysis(db=db, tournament_id=tournament_id)
    if not result.get("computed"):
        raise HTTPException(status_code=404, detail=result.get("error", "Не удалось вычислить"))
    return {"success": True, "data": result, "message": "Сезонный анализ пересчитан"}


@router.get("/season/{tournament_id}/top-by-position", summary="Топ по позициям за сезон")
async def get_season_top_by_position(
    tournament_id: int = Path(..., ge=0, le=3),
    sort_by: str = Query("total_score"),
    funnel: str = Query("all"),
    baseline_kind: str = Query("SEASON"),
    limit_per_position: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """
    Получить топ игроков по каждой позиции за весь сезон.
    baseline_kind: SEASON (сравнение внутри сезона) или SEASON_BENCHMARK (сравнение с эталоном).
    """
    safe_baseline = baseline_kind if baseline_kind in ("SEASON", "SEASON_BENCHMARK") else "SEASON"

    # Find PER90 SEASON slice
    per90_slice_id = db.execute(text("""
        SELECT slice_id FROM stat_slices
        WHERE tournament_id = :tid AND slice_type = 'PER90' AND period_type = 'SEASON'
        ORDER BY uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id}).scalar()

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
        return {"success": True, "data": {}, "total_positions": 0, "needs_recompute": True,
                "message": "Сезонный анализ не рассчитан. Нажмите «Пересчитать»."}

    funnel_cond = ""
    if funnel == "p75":
        funnel_cond = "AND rs.total_score >= 0.75"
    elif funnel == "p85":
        funnel_cond = "AND rs.total_score >= 0.85"
    elif funnel == "p90":
        funnel_cond = "AND rs.total_score >= 0.90"

    safe_sort = sort_by if sort_by in ("core_score_adj", "total_score", "support_score", "core_score") else "total_score"

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
    position_code: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Общий рейтинг за сезон — все позиции в одном списке.
    baseline_kind: SEASON или SEASON_BENCHMARK."""
    safe_baseline = baseline_kind if baseline_kind in ("SEASON", "SEASON_BENCHMARK") else "SEASON"

    per90_slice_id = db.execute(text("""
        SELECT slice_id FROM stat_slices
        WHERE tournament_id = :tid AND slice_type = 'PER90' AND period_type = 'SEASON'
        ORDER BY uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id}).scalar()

    if not per90_slice_id:
        return {"success": True, "data": [], "message": "Нет PER90 данных за сезон"}

    funnel_cond = ""
    if funnel == "p75":
        funnel_cond = "AND rs.total_score >= 0.75"
    elif funnel == "p85":
        funnel_cond = "AND rs.total_score >= 0.85"
    elif funnel == "p90":
        funnel_cond = "AND rs.total_score >= 0.90"

    position_cond = "AND rs.position_code = :pos" if position_code else ""
    safe_sort = sort_by if sort_by in ("core_score_adj", "total_score", "support_score", "core_score", "good_share_core") else "total_score"

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

    # Funnel filter on total_score
    funnel_cond = ""
    if funnel == "p75":
        funnel_cond = "AND rs.total_score >= 0.75"
    elif funnel == "p85":
        funnel_cond = "AND rs.total_score >= 0.85"
    elif funnel == "p90":
        funnel_cond = "AND rs.total_score >= 0.90"

    position_cond = "AND rs.position_code = :pos" if position_code else ""

    safe_sort = sort_by if sort_by in ("core_score_adj", "total_score", "support_score", "core_score", "good_share_core") else "total_score"

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

    funnel_cond = ""
    if funnel == "p75":
        funnel_cond = "AND rs.total_score >= 0.75"
    elif funnel == "p85":
        funnel_cond = "AND rs.total_score >= 0.85"
    elif funnel == "p90":
        funnel_cond = "AND rs.total_score >= 0.90"

    safe_sort = sort_by if sort_by in ("core_score_adj", "total_score", "support_score", "core_score") else "total_score"

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
    per90_slice_id = db.execute(text("""
        SELECT slice_id FROM stat_slices
        WHERE tournament_id = :tid AND slice_type = 'PER90' AND period_type = 'SEASON'
        ORDER BY uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id}).scalar()

    if per90_slice_id:
        season_data = _get_player_baseline_data(db, per90_slice_id, "SEASON", player_id)
        if season_data:
            result["season"] = season_data

        # 3b. Сезонные перцентили vs Эталон (baseline_kind = 'SEASON_BENCHMARK')
        if benchmark_row:
            season_bench_data = _get_player_baseline_data(db, per90_slice_id, "SEASON_BENCHMARK", player_id)
            if season_bench_data:
                result["season_benchmark"] = season_bench_data

    # 4. Перцентили за тур (baseline_kind = 'LEAGUE')
    if round_number:
        round_slice_id = _find_round_slice(db, tournament_id, round_number)
        if round_slice_id:
            round_data = _get_player_baseline_data(db, round_slice_id, "LEAGUE", player_id)
            if round_data:
                round_data["round_number"] = round_number
                result["round"] = round_data

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
