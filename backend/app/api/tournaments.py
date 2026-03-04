"""
API роутер для работы с турнирами.
"""

import logging
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


TRANSLIT_MAP = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ж': 'ZH',
    'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
    'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F',
    'Х': 'KH', 'Ц': 'TS', 'Ч': 'CH', 'Ш': 'SH', 'Щ': 'SHCH', 'Ъ': '', 'Ы': 'Y',
    'Ь': '', 'Э': 'E', 'Ю': 'YU', 'Я': 'YA',
}


def transliterate_to_code(name: str) -> str:
    """Транслитерация кириллицы → латиница, убирает пробелы, оставляет дефисы и цифры."""
    result = []
    for ch in name.upper():
        if ch in TRANSLIT_MAP:
            result.append(TRANSLIT_MAP[ch])
        elif ch.isascii() and (ch.isalnum() or ch == '-'):
            result.append(ch)
    return ''.join(result)


def generate_file_pattern(short_code: str) -> str:
    """short_code → file_pattern (lowercase, без дефисов)."""
    return re.sub(r'[^a-z0-9]', '', short_code.lower())


def validate_tournament_exists(db: Session, tournament_id: int) -> dict:
    """Проверить, что турнир существует в БД. Возвращает данные турнира или бросает 404."""
    row = db.execute(
        text("SELECT id, name, full_name, short_code, file_pattern FROM tournaments WHERE id = :tid"),
        {"tid": tournament_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Турнир с id={tournament_id} не найден")
    return {"id": row[0], "name": row[1], "full_name": row[2], "short_code": row[3], "file_pattern": row[4]}


@router.get("/tournaments", summary="Получить список турниров")
async def get_tournaments(db: Session = Depends(get_db)):
    """Получение списка всех турниров с количеством игроков."""
    try:
        result = db.execute(text("""
            SELECT 
                t.id,
                t.name,
                t.full_name,
                t.short_code as code,
                COALESCE(t.current_round, 0) as current_round,
                t.updated_at as last_update,
                (
                    SELECT COUNT(DISTINCT ps.player_id)
                    FROM player_statistics ps
                    JOIN stat_slices ss ON ps.slice_id = ss.slice_id
                    WHERE ss.tournament_id = t.id
                      AND ss.slice_type = 'TOTAL'
                      AND ss.period_type = 'SEASON'
                      AND ss.slice_id = (
                          SELECT s2.slice_id FROM stat_slices s2
                          WHERE s2.tournament_id = t.id
                            AND s2.slice_type = 'TOTAL'
                            AND s2.period_type = 'SEASON'
                          ORDER BY s2.uploaded_at DESC LIMIT 1
                      )
                ) as players_count,
                (
                    SELECT MAX(CAST(ss.period_value AS INTEGER))
                    FROM stat_slices ss
                    WHERE ss.tournament_id = t.id
                      AND ss.period_type = 'ROUND'
                      AND ss.period_value ~ '^\d+$'
                ) as last_loaded_round
            FROM tournaments t
            GROUP BY t.id, t.name, t.full_name, t.short_code, t.current_round, t.updated_at
            ORDER BY t.id
        """))
        
        tournaments = []
        for row in result:
            # last_loaded_round из stat_slices (реальные данные) — приоритет
            # Если нет загруженных туров — берём current_round только если есть игроки
            last_loaded = row[7]  # может быть None
            db_current = row[4] or 0
            players_count = row[6] or 0
            actual_round = last_loaded if last_loaded else (db_current if players_count > 0 else 0)
            tournaments.append({
                "id": row[0],
                "name": row[1],
                "full_name": row[2],
                "code": row[3],
                "current_round": actual_round,
                "last_update": row[5].isoformat() if row[5] else None,
                "players_count": row[6] or 0,
                "round_players_count": 0
            })
        
        return {
            "success": True,
            "data": tournaments,
            "total": len(tournaments),
            "message": "Турниры загружены"
        }
        
    except Exception as e:
        logger.error(f"Error getting tournaments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tournaments/{tournament_id}", summary="Информация о турнире")
async def get_tournament(tournament_id: int, db: Session = Depends(get_db)):
    """Получение информации о конкретном турнире с количеством игроков."""
    try:
        result = db.execute(text("""
            SELECT 
                t.id,
                t.name,
                t.full_name,
                t.short_code as code,
                COALESCE(t.current_round, 0) as current_round,
                t.updated_at as last_update,
                (
                    SELECT COUNT(DISTINCT ps.player_id)
                    FROM player_statistics ps
                    JOIN stat_slices ss ON ps.slice_id = ss.slice_id
                    WHERE ss.tournament_id = t.id
                      AND ss.slice_type = 'TOTAL'
                      AND ss.period_type = 'SEASON'
                      AND ss.slice_id = (
                          SELECT s2.slice_id FROM stat_slices s2
                          WHERE s2.tournament_id = t.id
                            AND s2.slice_type = 'TOTAL'
                            AND s2.period_type = 'SEASON'
                          ORDER BY s2.uploaded_at DESC LIMIT 1
                      )
                ) as players_count
            FROM tournaments t
            WHERE t.id = :tid
            GROUP BY t.id, t.name, t.full_name, t.short_code, t.current_round, t.updated_at
        """), {"tid": tournament_id})
        
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Турнир не найден")
        
        return {
            "success": True,
            "data": {
                "id": row[0],
                "name": row[1],
                "full_name": row[2],
                "code": row[3],
                "current_round": row[4] or 0,
                "last_update": row[5].isoformat() if row[5] else None,
                "players_count": row[6] or 0,
                "round_players_count": 0  # TODO: подсчёт игроков последнего тура
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tournament {tournament_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tournaments", summary="Создать турнир")
async def create_tournament(
    body: dict = Body(...),
    db: Session = Depends(get_db),
):
    """
    Создать новый турнир.
    body: { "full_name": "...", "name": "ЮФЛ-4" }
    short_code и file_pattern генерируются автоматически из name.
    """
    full_name = (body.get("full_name") or "").strip()
    name = (body.get("name") or "").strip()

    if not full_name or not name:
        raise HTTPException(status_code=400, detail="Поля full_name и name обязательны")

    short_code = transliterate_to_code(name)
    file_pattern = generate_file_pattern(short_code)

    if not short_code or not file_pattern:
        raise HTTPException(status_code=400, detail="Не удалось сгенерировать код из краткого названия")

    existing = db.execute(
        text("SELECT id FROM tournaments WHERE name = :n OR short_code = :sc OR file_pattern = :fp"),
        {"n": name, "sc": short_code, "fp": file_pattern}
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail=f"Турнир с таким названием или кодом уже существует (id={existing[0]})")

    try:
        row = db.execute(text("""
            INSERT INTO tournaments (name, full_name, short_code, file_pattern, current_round, is_active)
            VALUES (:name, :full_name, :sc, :fp, 0, true)
            RETURNING id, name, full_name, short_code, file_pattern
        """), {"name": name, "full_name": full_name, "sc": short_code, "fp": file_pattern}).fetchone()
        db.commit()

        logger.info(f"Tournament created: id={row[0]}, name={row[1]}, file_pattern={row[4]}")

        return {
            "success": True,
            "data": {
                "id": row[0],
                "name": row[1],
                "full_name": row[2],
                "short_code": row[3],
                "file_pattern": row[4],
            },
            "message": f"Турнир «{row[1]}» создан"
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating tournament: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/tournaments/{tournament_id}", summary="Редактировать турнир")
async def update_tournament(
    tournament_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
):
    """
    Обновить название и код турнира.
    body: { "full_name": "...", "name": "..." }
    """
    validate_tournament_exists(db, tournament_id)

    full_name = (body.get("full_name") or "").strip()
    name = (body.get("name") or "").strip()

    if not full_name or not name:
        raise HTTPException(status_code=400, detail="Поля full_name и name обязательны")

    short_code = transliterate_to_code(name)
    file_pattern = generate_file_pattern(short_code)

    conflict = db.execute(
        text("SELECT id FROM tournaments WHERE (name = :n OR short_code = :sc OR file_pattern = :fp) AND id != :tid"),
        {"n": name, "sc": short_code, "fp": file_pattern, "tid": tournament_id}
    ).fetchone()
    if conflict:
        raise HTTPException(status_code=409, detail=f"Конфликт: турнир с таким названием/кодом уже существует (id={conflict[0]})")

    try:
        row = db.execute(text("""
            UPDATE tournaments
            SET name = :name, full_name = :full_name, short_code = :sc, file_pattern = :fp,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :tid
            RETURNING id, name, full_name, short_code, file_pattern
        """), {"name": name, "full_name": full_name, "sc": short_code, "fp": file_pattern, "tid": tournament_id}).fetchone()
        db.commit()

        logger.info(f"Tournament updated: id={row[0]}, name={row[1]}")

        return {
            "success": True,
            "data": {
                "id": row[0],
                "name": row[1],
                "full_name": row[2],
                "short_code": row[3],
                "file_pattern": row[4],
            },
            "message": f"Турнир «{row[1]}» обновлён"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating tournament {tournament_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tournaments/{tournament_id}", summary="Удалить турнир")
async def delete_tournament(
    tournament_id: int,
    confirm: bool = False,
    db: Session = Depends(get_db),
):
    """
    Удалить турнир и ВСЕ связанные данные (CASCADE).
    Требует confirm=true.
    """
    if not confirm:
        raise HTTPException(status_code=400, detail="Требуется подтверждение: confirm=true")

    t = validate_tournament_exists(db, tournament_id)

    try:
        slice_ids = [r[0] for r in db.execute(
            text("SELECT slice_id FROM stat_slices WHERE tournament_id = :tid"), {"tid": tournament_id}
        ).fetchall()]

        if slice_ids:
            for tbl in ['round_scores', 'round_percentiles']:
                exists = db.execute(text(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
                ), {"t": tbl}).scalar()
                if exists:
                    db.execute(text(f"DELETE FROM {tbl} WHERE round_slice_id = ANY(:sids)"), {"sids": slice_ids})

        for tbl in ['benchmark_slices', 'team_tiers', 'round_appearances']:
            exists = db.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
            ), {"t": tbl}).scalar()
            if exists:
                db.execute(text(f"DELETE FROM {tbl} WHERE tournament_id = :tid"), {"tid": tournament_id})

        watched_exists = db.execute(
            text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'watched_players')")
        ).scalar()
        if watched_exists:
            db.execute(text("""
                DELETE FROM watched_players WHERE player_id IN (
                    SELECT player_id FROM players WHERE tournament_id = :tid
                )
            """), {"tid": tournament_id})

        db.execute(text("DELETE FROM tournaments WHERE id = :tid"), {"tid": tournament_id})
        db.commit()

        logger.info(f"Tournament deleted: id={tournament_id}, name={t['name']}")

        return {
            "success": True,
            "message": f"Турнир «{t['name']}» и все данные удалены"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting tournament {tournament_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
