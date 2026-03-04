"""
API роутер для загрузки и обработки Excel файлов.
Содержит endpoint'ы для импорта статистики игроков.
"""

import logging
import os
import shutil
from datetime import datetime
from pathlib import Path as FilePath
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.services.data_loader import DataLoader
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_file_patterns(db: Session) -> dict:
    """Загрузить {tournament_id: file_pattern} из БД."""
    rows = db.execute(text("SELECT id, file_pattern FROM tournaments WHERE file_pattern IS NOT NULL")).fetchall()
    return {r[0]: r[1] for r in rows}


def _get_tournament_name_from_db(db: Session, tournament_id: int) -> str:
    row = db.execute(text("SELECT name FROM tournaments WHERE id = :tid"), {"tid": tournament_id}).fetchone()
    return row[0] if row else f"Турнир {tournament_id}"


def _detect_tournament_from_filename(db: Session, filename: str) -> Optional[int]:
    """Определить tournament_id по имени файла на основе file_pattern из БД."""
    fname_lower = filename.lower()
    patterns = _get_file_patterns(db)
    for tid, pattern in patterns.items():
        if pattern and pattern.lower() in fname_lower:
            return tid
    return None


def _validate_file_matches_tournament(db: Session, filename: str, tournament_id: int):
    """Проверить, что файл соответствует турниру. Бросает HTTPException при несоответствии."""
    detected_tid = _detect_tournament_from_filename(db, filename)
    if detected_tid is not None and detected_tid != tournament_id:
        expected_name = _get_tournament_name_from_db(db, tournament_id)
        file_name = _get_tournament_name_from_db(db, detected_tid)
        patterns = _get_file_patterns(db)
        expected_pattern = patterns.get(tournament_id, "?")
        raise HTTPException(
            status_code=400,
            detail=f"Несоответствие файла турниру! Выбран турнир '{expected_name}' "
                   f"(ожидается '{expected_pattern}' в имени файла), "
                   f"но файл '{filename}' предназначен для '{file_name}'."
        )


def _snapshot_minutes(db: Session, tournament_id: int, season: str) -> dict:
    """Snapshot current minutes per player before upload."""
    rows = db.execute(text("""
        SELECT ps.player_id, ps.metric_value
        FROM player_statistics ps
        JOIN stat_slices ss ON ps.slice_id = ss.slice_id
        WHERE ss.tournament_id = :tid
          AND ss.slice_type = 'TOTAL'
          AND ss.period_type = 'SEASON'
          AND ss.period_value = :season
          AND ps.metric_code = 'minutes'
          AND ps.metric_value IS NOT NULL
    """), {"tid": tournament_id, "season": season}).fetchall()
    return {r[0]: r[1] for r in rows}


def _record_round_appearances(
    db: Session,
    tournament_id: int,
    season: str,
    round_number: int,
    minutes_before: dict,
) -> dict:
    """Compare minutes after upload with snapshot to find who played."""
    rows = db.execute(text("""
        SELECT ps.player_id, ps.metric_value
        FROM player_statistics ps
        JOIN stat_slices ss ON ps.slice_id = ss.slice_id
        WHERE ss.tournament_id = :tid
          AND ss.slice_type = 'TOTAL'
          AND ss.period_type = 'SEASON'
          AND ss.period_value = :season
          AND ps.metric_code = 'minutes'
          AND ps.metric_value IS NOT NULL
    """), {"tid": tournament_id, "season": season}).fetchall()

    minutes_after = {r[0]: r[1] for r in rows}
    played = []

    for pid, mins_after in minutes_after.items():
        mins_before = minutes_before.get(pid, 0)
        if mins_after > mins_before:
            is_debut = pid not in minutes_before
            played.append((pid, mins_before, mins_after, is_debut))

    if not played:
        return {"recorded": 0}

    db.execute(text("""
        DELETE FROM round_appearances
        WHERE tournament_id = :tid AND season = :season AND round_number = :rn
    """), {"tid": tournament_id, "season": season, "rn": round_number})

    for pid, mb, ma, debut in played:
        db.execute(text("""
            INSERT INTO round_appearances (player_id, tournament_id, season, round_number, minutes_before, minutes_after, is_debut)
            VALUES (:pid, :tid, :season, :rn, :mb, :ma, :debut)
            ON CONFLICT (player_id, tournament_id, season, round_number) DO UPDATE
            SET minutes_before = :mb, minutes_after = :ma, is_debut = :debut, recorded_at = NOW()
        """), {"pid": pid, "tid": tournament_id, "season": season, "rn": round_number, "mb": mb, "ma": ma, "debut": debut})

    db.flush()
    return {"recorded": len(played), "debuts": sum(1 for _, _, _, d in played if d)}


@router.post("/upload/tournament", summary="Загрузить данные турнира (с выбором сезона и тура)")
async def upload_tournament_data(
    file: UploadFile = File(..., description="Excel файл с статистикой"),
    tournament_id: int = Form(..., description="ID турнира"),
    slice_type: str = Form(..., description="TOTAL или PER90"),
    season: Optional[str] = Form(None, description="Год сезона (например '2025')"),
    round_number: Optional[int] = Form(None, ge=1, le=50, alias="round", description="Номер тура (1-50)"),
    db: Session = Depends(get_db)
):
    """
    Загрузка статистики турнира с указанием сезона и тура.
    
    **Параметры:**
    - **file**: Excel файл (.xlsx)
    - **tournament_id**: 0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3
    - **slice_type**: "TOTAL" (суммарная) или "PER90" (за 90 минут)
    - **season**: Год сезона (например "2025")
    - **round**: Номер тура (1-50) - данные будут записаны как "туры 1-{round}"
    
    **Логика:**
    - Данные перезаписываются для указанного сезона
    - Тур используется для отображения информации о загрузке
    """
    start_time = datetime.now()
    file_path = None
    
    try:
        # 1. Валидация
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы .xlsx и .xls")
        
        if slice_type not in ['TOTAL', 'PER90']:
            raise HTTPException(status_code=400, detail="slice_type должен быть 'TOTAL' или 'PER90'")
        
        # 2. Проверяем соответствие файла турниру
        _validate_file_matches_tournament(db, file.filename, tournament_id)
        
        # 3. Определяем сезон
        if season is None:
            season = str(datetime.now().year)
        
        # 4. Сохраняем файл
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        round_str = f"_round{round_number}" if round_number else ""
        safe_filename = f"{timestamp}_{tournament_id}_{slice_type}_season{season}{round_str}_{file.filename}"
        file_path = FilePath(settings.upload_path) / safe_filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"File saved: {file_path}")
        
        # 5. Snapshot minutes before upload (for round tracking)
        minutes_snapshot = {}
        if slice_type == 'TOTAL' and round_number:
            try:
                minutes_snapshot = _snapshot_minutes(db, tournament_id, season)
            except Exception as snap_err:
                logger.warning(f"Minutes snapshot failed (non-critical): {snap_err}")

        # 6. Загружаем через DataLoader
        loader = DataLoader(db)
        
        result = loader.load_file(
            file_path=file_path,
            tournament_id=tournament_id,
            slice_type=slice_type,
            period_type='SEASON',
            period_value=season,
            force_new_season=False
        )
        
        # 7. Record round appearances (who played in this round)
        round_track_result = None
        if slice_type == 'TOTAL' and round_number:
            try:
                round_track_result = _record_round_appearances(db, tournament_id, season, round_number, minutes_snapshot)
                db.execute(text("UPDATE tournaments SET current_round = :rn WHERE id = :tid"), {"rn": round_number, "tid": tournament_id})
                db.flush()
                logger.info(f"Round appearances recorded for round {round_number}: {round_track_result}")
            except Exception as rt_err:
                logger.warning(f"Round tracking failed (non-critical): {rt_err}")
        
        # Синхронизация корзин команд при загрузке SEASON данных
        try:
            from app.api.analysis import _sync_team_tiers
            tier_sync = _sync_team_tiers(db, tournament_id, season)
            if tier_sync["added"] or tier_sync["removed"]:
                logger.info(f"Team tiers synced: +{tier_sync['added']}, -{tier_sync['removed']}")
        except Exception as ts_err:
            logger.warning(f"Team tiers sync failed (non-critical): {ts_err}")

        # Авто-расчёт сезонного анализа при загрузке PER90
        if slice_type == 'PER90':
            try:
                from app.services.percentile_engine import compute_season_analysis
                sa_result = compute_season_analysis(db=db, tournament_id=tournament_id, season=season)
                logger.info(f"Season analysis auto-computed for season={season}: {sa_result}")
            except Exception as sa_err:
                logger.warning(f"Season analysis failed: {sa_err}")
        
        duration = (datetime.now() - start_time).total_seconds()
        tournament_name = _get_tournament_name_from_db(db, tournament_id)
        
        return {
            "status": "success",
            "file_name": file.filename,
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "slice_type": slice_type,
            "season": season,
            "round": round_number,
            "slice_id": result['slice_id'],
            "players_loaded": result['players_loaded'],
            "stats_loaded": result['stats_loaded'],
            "round_tracking": round_track_result,
            "duration_seconds": round(duration, 2),
            "message": f"Данные сезона {season}, туры 1-{round_number or '?'} успешно загружены"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading tournament data: {e}")
        
        if file_path and file_path.exists():
            try:
                os.unlink(file_path)
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки: {str(e)}")


@router.post("/upload/round", summary="Загрузить данные за тур")
async def upload_round_data(
    file: UploadFile = File(..., description="Excel файл с статистикой за тур"),
    tournament_id: int = Form(..., description="ID турнира"),
    slice_type: str = Form(..., description="TOTAL или PER90"),
    season: Optional[str] = Form(None, description="Год сезона (например '2025')"),
    round_number: int = Form(..., ge=1, le=50, description="Номер тура (1-50)"),
    db: Session = Depends(get_db)
):
    """
    Загрузка статистики за конкретный тур.
    
    **Параметры:**
    - **file**: Excel файл (.xlsx)
    - **tournament_id**: 0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3
    - **slice_type**: "TOTAL" (суммарная за тур) или "PER90" (за 90 минут)
    - **season**: Год сезона (например "2025")
    - **round_number**: Номер тура (1-50)
    
    **Хранение данных:**
    - period_type = 'ROUND'
    - period_value = номер тура (например '16')
    - Данные хранятся отдельно от сезонных данных
    """
    start_time = datetime.now()
    file_path = None
    
    try:
        # 1. Валидация
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы .xlsx и .xls")
        
        if slice_type not in ['TOTAL', 'PER90']:
            raise HTTPException(status_code=400, detail="slice_type должен быть 'TOTAL' или 'PER90'")
        
        # 2. Проверяем соответствие файла турниру
        _validate_file_matches_tournament(db, file.filename, tournament_id)
        
        # 3. Определяем сезон
        if season is None:
            season = str(datetime.now().year)
        
        # 4. Сохраняем файл
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{tournament_id}_{slice_type}_round{round_number}_{file.filename}"
        file_path = FilePath(settings.upload_path) / safe_filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"📁 Round file saved: {file_path}")
        
        # 5. Загружаем через DataLoader с period_type='ROUND'
        loader = DataLoader(db)
        
        result = loader.load_file(
            file_path=file_path,
            tournament_id=tournament_id,
            slice_type=slice_type,
            period_type='ROUND',  # ← Ключевое отличие: данные за тур
            period_value=str(round_number),  # ← Номер тура как period_value
            force_new_season=False
        )
        
        # 6. Обновляем current_round турнира (только если загруженный тур больше текущего)
        db.execute(text("""
            UPDATE tournaments 
            SET current_round = GREATEST(COALESCE(current_round, 0), :round_number),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :tournament_id
        """), {
            'tournament_id': tournament_id,
            'round_number': round_number
        })
        db.commit()
        logger.info(f"📊 Updated tournament {tournament_id} current_round to {round_number}")
        
        # 7. Автоматический расчёт перцентилей и скоров (Talent Scouting)
        analysis_result = None
        try:
            from app.services.percentile_engine import compute_round_analysis
            analysis_result = compute_round_analysis(
                db=db,
                round_slice_id=result['slice_id'],
                tournament_id=tournament_id,
                season=season,
            )
            logger.info(f"📊 Analysis computed: {analysis_result}")
        except Exception as ae:
            logger.warning(f"⚠️ Analysis computation failed (non-critical): {ae}")
            analysis_result = {"error": str(ae)}
        
        duration = (datetime.now() - start_time).total_seconds()
        tournament_name = _get_tournament_name_from_db(db, tournament_id)
        
        return {
            "status": "success",
            "file_name": file.filename,
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "slice_type": slice_type,
            "period_type": "ROUND",
            "season": season,
            "round_number": round_number,
            "slice_id": result['slice_id'],
            "players_loaded": result['players_loaded'],
            "stats_loaded": result['stats_loaded'],
            "duration_seconds": round(duration, 2),
            "analysis": analysis_result,
            "message": f"Данные за тур {round_number} ({slice_type}) успешно загружены"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading round data: {e}")
        
        if file_path and file_path.exists():
            try:
                os.unlink(file_path)
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки: {str(e)}")


