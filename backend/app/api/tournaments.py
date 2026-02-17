"""
API роутер для работы с турнирами.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


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
                COUNT(DISTINCT p.player_id) as players_count,
                (
                    SELECT MAX(CAST(ss.period_value AS INTEGER))
                    FROM stat_slices ss
                    WHERE ss.tournament_id = t.id
                      AND ss.period_type = 'ROUND'
                      AND ss.period_value ~ '^\d+$'
                ) as last_loaded_round
            FROM tournaments t
            LEFT JOIN players p ON p.tournament_id = t.id
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
                COUNT(DISTINCT p.player_id) as players_count
            FROM tournaments t
            LEFT JOIN players p ON p.tournament_id = t.id
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


@router.get("/tournaments/{tournament_id}/top-performers", summary="ЗАГЛУШКА: Топ игроков")
async def get_top_performers(tournament_id: int):
    """ЗАГЛУШКА: Получение топ игроков турнира."""
    return {
        "success": True,
        "data": [],
        "message": "ЗАГЛУШКА: Функционал в разработке"
    }
