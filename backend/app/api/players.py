"""
API роутер для работы с игроками.
"""

import logging
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import Depends

from app.database import get_db
from app.services.data_loader import DataLoader

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/players/database")
async def get_all_players_database(
    tournament_id: Optional[int] = Query(None, description="ID турнира"),
    slice_type: str = Query("TOTAL", description="Тип статистики: TOTAL или PER90"),
    period_type: str = Query("SEASON", description="Тип периода: SEASON или ROUND"),
    round_number: Optional[int] = Query(None, ge=1, le=50, description="Номер тура (для period_type=ROUND)"),
    current_season_only: bool = Query(True, description="Только текущий сезон (последний загруженный)"),
    season: Optional[str] = Query(None, description="Конкретный сезон (period_value). Если указан, current_season_only игнорируется"),
    search: Optional[str] = Query(None, description="Поиск по имени игрока или команде"),
    position_group: Optional[str] = Query(None, description="Группа позиций: ATT, MID, DEF"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    limit: int = Query(100, ge=1, le=500, description="Записей на странице"),
    sort_field: Optional[str] = Query(None, description="Поле для сортировки"),
    sort_order: str = Query("desc", description="Порядок: asc или desc"),
    db: Session = Depends(get_db)
):
    """
    Получить всех игроков из БД с полной статистикой (все 100+ метрик).
    
    Поддерживает:
    - Фильтрацию по турниру
    - Переключение TOTAL/PER90
    - Переключение SEASON/ROUND (период)
    - Указание номера тура для period_type=ROUND
    - Поиск
    - Фильтр по позиции
    - Сортировку по любому полю
    - Пагинацию
    """
    try:
        # Получаем список всех метрик из каталога
        metrics_query = db.execute(text("SELECT metric_code FROM metrics_catalog"))
        all_metrics = [row[0] for row in metrics_query.fetchall()]
        
        # Создаем PIVOT для всех метрик динамически
        pivot_cases = []
        for metric in all_metrics:
            pivot_cases.append(
                f"MAX(CASE WHEN ps.metric_code = '{metric}' THEN ps.metric_value END) as {metric}"
            )
        
        pivot_sql = ",\n                    ".join(pivot_cases)
        
        # Определяем поле сортировки (по умолчанию goals)
        safe_sort_field = sort_field if sort_field else 'goals'
        
        # Строковые поля сортируются по тексту, остальные по числам
        string_fields = {'full_name', 'team_name', 'position_code', 'position_group', 'position_name', 'citizenship', 'season', 'tournament_id'}
        
        # Формируем ORDER BY динамически
        if safe_sort_field in string_fields:
            if sort_order == 'asc':
                order_sql = f"ORDER BY {safe_sort_field} ASC NULLS LAST"
            else:
                order_sql = f"ORDER BY {safe_sort_field} DESC NULLS LAST"
        else:
            # Для числовых полей
            if sort_order == 'asc':
                order_sql = f"ORDER BY {safe_sort_field} ASC NULLS LAST"
            else:
                order_sql = f"ORDER BY {safe_sort_field} DESC NULLS LAST"
        
        # Определяем period_value для фильтра
        period_value_filter = ""
        if period_type == 'ROUND' and round_number:
            period_value_filter = "AND ss.period_value = :period_value"
        
        # Фильтр по сезону: конкретный или последний загруженный
        latest_slice_filter = ""
        if season and period_type == 'SEASON':
            latest_slice_filter = "AND ss.period_value = :season_pv"
        elif current_season_only and period_type == 'SEASON':
            latest_slice_filter = """AND ss.slice_id = (
                SELECT s2.slice_id FROM stat_slices s2
                WHERE s2.tournament_id = p.tournament_id
                  AND s2.slice_type = :slice_type
                  AND s2.period_type = 'SEASON'
                ORDER BY s2.uploaded_at DESC LIMIT 1
            )"""
        elif current_season_only and period_type == 'ROUND':
            latest_slice_filter = """AND ss.slice_id = (
                SELECT s2.slice_id FROM stat_slices s2
                WHERE s2.tournament_id = p.tournament_id
                  AND s2.slice_type = :slice_type
                  AND s2.period_type = 'ROUND'
                  AND s2.period_value = ss.period_value
                ORDER BY s2.uploaded_at DESC LIMIT 1
            )"""
        
        # Базовый запрос с динамическим PIVOT всех метрик
        query_sql = f"""
            WITH player_metrics AS (
                SELECT 
                    p.player_id,
                    p.full_name,
                    p.team_name,
                    p.birth_year,
                    p.height,
                    p.weight,
                    p.citizenship,
                    pos.code as position_code,
                    pos.group_code as position_group,
                    pos.display_name as position_name,
                    p.tournament_id,
                    ss.period_value as season,
                    {pivot_sql}
                FROM players p
                JOIN positions pos ON p.position_id = pos.position_id
                JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
                JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
                WHERE ss.slice_type = :slice_type
                  AND ss.period_type = :period_type
                  {period_value_filter}
                  {latest_slice_filter}
                  AND (:tournament_id IS NULL OR p.tournament_id = :tournament_id)
                  AND (:position_group IS NULL OR pos.group_code = :position_group)
                  AND (:search IS NULL OR 
                       LOWER(p.full_name) LIKE LOWER(:search_pattern) OR 
                       LOWER(p.team_name) LIKE LOWER(:search_pattern))
                GROUP BY p.player_id, p.full_name, p.team_name, p.birth_year, p.height, p.weight, p.citizenship,
                         pos.code, pos.group_code, pos.display_name, p.tournament_id, ss.period_value
            )
            SELECT *,
                COUNT(*) OVER() as total_count
            FROM player_metrics
            {order_sql}
            LIMIT :limit OFFSET :offset
        """
        
        query = text(query_sql)
        
        search_pattern = f"%{search}%" if search else None
        offset = (page - 1) * limit
        
        params = {
            'slice_type': slice_type,
            'period_type': period_type,
            'tournament_id': tournament_id,
            'position_group': position_group,
            'search': search,
            'search_pattern': search_pattern,
            'limit': limit,
            'offset': offset
        }
        
        if season and period_type == 'SEASON':
            params['season_pv'] = season
        
        # Добавляем period_value только для ROUND
        if period_type == 'ROUND' and round_number:
            params['period_value'] = str(round_number)
        
        result = db.execute(query, params)
        
        rows = result.fetchall()
        
        if not rows:
            return {
                'success': True,
                'data': [],
                'total': 0,
                'page': page,
                'per_page': limit,
                'pages': 0,
                'slice_type': slice_type,
                'message': 'Нет данных'
            }
        
        # Формируем ответ с динамической обработкой всех колонок
        total_count = rows[0][-1] if rows else 0
        column_names = list(result.keys())
        
        # Получаем типы данных метрик для правильной обработки процентов
        metrics_types_query = db.execute(text("""
            SELECT metric_code, data_type FROM metrics_catalog
        """))
        metrics_types = {row[0]: row[1] for row in metrics_types_query.fetchall()}
        
        players_data = []
        for row in rows:
            player_dict = {}
            for idx, col_name in enumerate(column_names):
                if col_name == 'total_count':
                    continue  # Пропускаем служебную колонку
                
                value = row[idx]
                
                int_fields = {'player_id', 'tournament_id', 'birth_year'}
                if col_name in metrics_types and metrics_types[col_name] == 'PERCENTAGE' and value is not None:
                    value = float(value) * 100
                elif col_name in int_fields and value is not None:
                    value = int(value)
                elif value is not None and isinstance(value, (int, float)):
                    value = float(value)
                
                player_dict[col_name] = value
            
            players_data.append(player_dict)
        
        total_pages = (total_count + limit - 1) // limit
        
        period_info = f"за тур {round_number}" if period_type == 'ROUND' and round_number else "за сезон"
        
        return {
            'success': True,
            'data': players_data,
            'total': total_count,
            'page': page,
            'per_page': limit,
            'pages': total_pages,
            'slice_type': slice_type,
            'period_type': period_type,
            'round_number': round_number if period_type == 'ROUND' else None,
            'message': f'Найдено {total_count} игроков ({slice_type}, {period_info})'
        }
        
    except Exception as e:
        logger.error(f"Error getting players: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/search", summary="Быстрый поиск игроков (autocomplete)")
async def search_players(
    q: str = Query(..., min_length=2, description="Строка поиска (имя игрока)"),
    tournament_id: Optional[int] = Query(None, description="Фильтр по турниру"),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    tid_filter = "AND p.tournament_id = :tid" if tournament_id is not None else ""
    rows = db.execute(text(f"""
        SELECT p.player_id, p.full_name, p.team_name, p.tournament_id, t.name as tournament_name,
               pos.code as position_code, pos.display_name as position_name,
               array_agg(DISTINCT ss.period_value ORDER BY ss.period_value) FILTER (WHERE ss.period_value IS NOT NULL) as seasons
        FROM players p
        JOIN tournaments t ON p.tournament_id = t.id
        LEFT JOIN positions pos ON p.position_id = pos.position_id
        LEFT JOIN player_statistics ps ON ps.player_id = p.player_id
        LEFT JOIN stat_slices ss ON ps.slice_id = ss.slice_id AND ss.period_type = 'SEASON'
        WHERE LOWER(p.full_name) LIKE LOWER(:pattern)
          {tid_filter}
        GROUP BY p.player_id, p.full_name, p.team_name, p.tournament_id, t.name, pos.code, pos.display_name
        ORDER BY p.full_name
        LIMIT :limit
    """), {"pattern": f"%{q}%", "tid": tournament_id, "limit": limit}).fetchall()

    return [
        {
            "player_id": r[0],
            "full_name": r[1],
            "team_name": r[2],
            "tournament_id": r[3],
            "tournament_name": r[4],
            "position_code": r[5],
            "position_name": r[6],
            "seasons": r[7] or [],
        }
        for r in rows
    ]


@router.get("/tournaments/{tournament_id}/rounds")
async def get_tournament_rounds(
    tournament_id: int,
    db: Session = Depends(get_db)
):
    """
    Получить список загруженных туров для турнира.
    Возвращает номера туров, для которых есть данные (period_type='ROUND').
    """
    try:
        result = db.execute(text("""
            SELECT DISTINCT CAST(period_value AS INTEGER) as round_number
            FROM stat_slices
            WHERE tournament_id = :tournament_id
              AND period_type = 'ROUND'
              AND CAST(period_value AS INTEGER) <= (
                  SELECT COALESCE(current_round, 0) FROM tournaments WHERE id = :tournament_id
              )
            ORDER BY round_number DESC
        """), {'tournament_id': tournament_id})
        
        rounds = [row[0] for row in result.fetchall()]
        
        return {
            'success': True,
            'tournament_id': tournament_id,
            'rounds': rounds,
            'total': len(rounds),
            'message': f'Найдено {len(rounds)} загруженных туров'
        }
        
    except Exception as e:
        logger.error(f"Error getting tournament rounds: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/database/clear")
async def clear_database(
    confirm: bool = Query(False, description="Подтверждение очистки (confirm=true)"),
    tournament_ids: Optional[str] = Query(None, description="ID турниров через запятую (если не указан — все)"),
    db: Session = Depends(get_db),
):
    """
    Очистить данные (игроков и статистику) для выбранных турниров.
    Сами турниры и справочники остаются.
    tournament_ids — через запятую, например '0,2'. Если не указан — очищает все.
    Требует confirm=true.
    """
    if not confirm:
        raise HTTPException(status_code=400, detail="Требуется подтверждение: confirm=true")

    tid_list: Optional[list] = None
    if tournament_ids:
        try:
            tid_list = [int(x.strip()) for x in tournament_ids.split(',') if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="tournament_ids должен содержать числа через запятую")

    try:
        if tid_list is not None:
            slice_ids = [r[0] for r in db.execute(
                text("SELECT slice_id FROM stat_slices WHERE tournament_id = ANY(:tids)"), {"tids": tid_list}
            ).fetchall()]
        else:
            slice_ids = None

        for tbl in ['round_scores', 'round_percentiles']:
            exists = db.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
            ), {"t": tbl}).scalar()
            if exists:
                if slice_ids is not None and len(slice_ids) > 0:
                    db.execute(text(f"DELETE FROM {tbl} WHERE round_slice_id = ANY(:sids)"), {"sids": slice_ids})
                elif slice_ids is None:
                    db.execute(text(f"TRUNCATE TABLE {tbl} CASCADE"))

        for tbl in ['benchmark_slices', 'team_tiers', 'round_appearances']:
            exists = db.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
            ), {"t": tbl}).scalar()
            if exists:
                if tid_list is not None:
                    db.execute(text(f"DELETE FROM {tbl} WHERE tournament_id = ANY(:tids)"), {"tids": tid_list})
                else:
                    db.execute(text(f"TRUNCATE TABLE {tbl} CASCADE"))

        watched_exists = db.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'watched_players')"
        )).scalar()
        if watched_exists:
            if tid_list is not None:
                db.execute(text("""
                    DELETE FROM watched_players WHERE player_id IN (
                        SELECT player_id FROM players WHERE tournament_id = ANY(:tids)
                    )
                """), {"tids": tid_list})
            else:
                db.execute(text("TRUNCATE TABLE watched_players CASCADE"))

        if tid_list is not None:
            db.execute(text("""
                DELETE FROM player_statistics WHERE player_id IN (
                    SELECT player_id FROM players WHERE tournament_id = ANY(:tids)
                )
            """), {"tids": tid_list})
            db.execute(text("DELETE FROM stat_slices WHERE tournament_id = ANY(:tids)"), {"tids": tid_list})
            db.execute(text("DELETE FROM players WHERE tournament_id = ANY(:tids)"), {"tids": tid_list})
            db.execute(text("UPDATE tournaments SET current_round = 0 WHERE id = ANY(:tids)"), {"tids": tid_list})
        else:
            db.execute(text("TRUNCATE TABLE player_statistics CASCADE"))
            db.execute(text("TRUNCATE TABLE stat_slices CASCADE"))
            db.execute(text("TRUNCATE TABLE players CASCADE"))
            db.execute(text("UPDATE tournaments SET current_round = 0"))

        db.commit()

        names_row = db.execute(text("SELECT name FROM tournaments WHERE id = ANY(:tids)"), {"tids": tid_list or []}).fetchall() if tid_list else []
        cleared_names = ', '.join(r[0] for r in names_row) if names_row else 'все'

        logger.info(f"Database cleared for tournaments: {cleared_names}")

        return {
            "success": True,
            "message": f"Данные очищены: {cleared_names}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing database: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# ЭНДПОИНТЫ ДЛЯ СТРАНИЦЫ ИГРОКА
# ============================================

@router.get("/players/{player_id}")
async def get_player_info(
    player_id: int,
    db: Session = Depends(get_db)
):
    """
    Получить базовую информацию об игроке.
    """
    try:
        result = db.execute(text("""
            SELECT 
                p.player_id,
                p.full_name,
                p.birth_year,
                p.team_name,
                p.height,
                p.weight,
                p.citizenship,
                p.tournament_id,
                pos.code as position_code,
                pos.group_code as position_group,
                pos.display_name as position_name,
                t.name as tournament_name,
                t.full_name as tournament_full_name,
                t.current_round
            FROM players p
            JOIN positions pos ON p.position_id = pos.position_id
            JOIN tournaments t ON p.tournament_id = t.id
            WHERE p.player_id = :player_id
        """), {'player_id': player_id})
        
        row = result.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Игрок не найден")
        
        return {
            'success': True,
            'data': {
                'player_id': row[0],
                'full_name': row[1],
                'birth_year': row[2],
                'team_name': row[3],
                'height': row[4],
                'weight': row[5],
                'citizenship': row[6],
                'tournament_id': row[7],
                'position_code': row[8],
                'position_group': row[9],
                'position_name': row[10],
                'tournament_name': row[11],
                'tournament_full_name': row[12],
                'current_round': row[13]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting player info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/{player_id}/stats")
async def get_player_stats(
    player_id: int,
    slice_type: str = Query("TOTAL", description="Тип статистики: TOTAL или PER90"),
    period_type: str = Query("SEASON", description="Тип периода: SEASON или ROUND"),
    round_number: Optional[int] = Query(None, ge=1, le=50, description="Номер тура (для period_type=ROUND)"),
    db: Session = Depends(get_db)
):
    """
    Получить статистику игрока для конкретного слайса.
    Возвращает все метрики в формате {metric_code: value, ...}
    """
    try:
        # Сначала получаем tournament_id игрока
        player_result = db.execute(text("""
            SELECT tournament_id FROM players WHERE player_id = :player_id
        """), {'player_id': player_id})
        player_row = player_result.fetchone()
        
        if not player_row:
            raise HTTPException(status_code=404, detail="Игрок не найден")
        
        tournament_id = player_row[0]
        
        # Формируем условие для period_value
        period_value_condition = ""
        params = {
            'player_id': player_id,
            'tournament_id': tournament_id,
            'slice_type': slice_type,
            'period_type': period_type
        }
        
        if period_type == 'ROUND' and round_number:
            period_value_condition = "AND ss.period_value = :period_value"
            params['period_value'] = str(round_number)
        
        # Получаем статистику игрока
        result = db.execute(text(f"""
            SELECT 
                ps.metric_code,
                ps.metric_value,
                mc.display_name_ru,
                mc.data_type,
                mc.category,
                mc.is_key_metric
            FROM player_statistics ps
            JOIN stat_slices ss ON ps.slice_id = ss.slice_id
            JOIN metrics_catalog mc ON ps.metric_code = mc.metric_code
            WHERE ps.player_id = :player_id
              AND ss.tournament_id = :tournament_id
              AND ss.slice_type = :slice_type
              AND ss.period_type = :period_type
              {period_value_condition}
            ORDER BY mc.category, mc.metric_code
        """), params)
        
        rows = result.fetchall()
        
        # Формируем ответ
        stats = {}
        stats_detailed = []
        
        for row in rows:
            metric_code = row[0]
            value = row[1]
            display_name = row[2]
            data_type = row[3]
            category = row[4]
            is_key = row[5]
            
            # Конвертируем проценты если нужно
            if data_type == 'PERCENTAGE' and value is not None:
                value = float(value) * 100
            elif value is not None:
                value = float(value)
            
            stats[metric_code] = value
            stats_detailed.append({
                'code': metric_code,
                'value': value,
                'display_name': display_name,
                'data_type': data_type,
                'category': category,
                'is_key_metric': is_key
            })
        
        period_info = f"Тур {round_number}" if period_type == 'ROUND' and round_number else "Сезон"
        
        return {
            'success': True,
            'player_id': player_id,
            'slice_type': slice_type,
            'period_type': period_type,
            'round_number': round_number if period_type == 'ROUND' else None,
            'stats': stats,
            'stats_detailed': stats_detailed,
            'total_metrics': len(stats),
            'message': f'Статистика игрока ({slice_type}, {period_info})'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting player stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/{player_id}/available-slices")
async def get_player_available_slices(
    player_id: int,
    db: Session = Depends(get_db)
):
    """
    Получить список доступных слайсов (сезонов/туров) для игрока.
    Полезно для UI, чтобы показать какие данные доступны.
    """
    try:
        # Получаем tournament_id игрока
        player_result = db.execute(text("""
            SELECT tournament_id FROM players WHERE player_id = :player_id
        """), {'player_id': player_id})
        player_row = player_result.fetchone()
        
        if not player_row:
            raise HTTPException(status_code=404, detail="Игрок не найден")
        
        tournament_id = player_row[0]
        
        # Получаем все слайсы где есть данные этого игрока
        result = db.execute(text("""
            SELECT DISTINCT
                ss.slice_type,
                ss.period_type,
                ss.period_value,
                ss.uploaded_at
            FROM player_statistics ps
            JOIN stat_slices ss ON ps.slice_id = ss.slice_id
            WHERE ps.player_id = :player_id
              AND ss.tournament_id = :tournament_id
            ORDER BY ss.period_type, ss.slice_type, ss.period_value
        """), {'player_id': player_id, 'tournament_id': tournament_id})
        
        rows = result.fetchall()
        
        slices = {
            'season': {'TOTAL': False, 'PER90': False},
            'rounds': []
        }
        
        rounds_set = set()
        
        for row in rows:
            slice_type = row[0]
            period_type = row[1]
            period_value = row[2]
            
            if period_type == 'SEASON':
                slices['season'][slice_type] = True
            elif period_type == 'ROUND':
                try:
                    round_num = int(period_value)
                    if round_num not in rounds_set:
                        rounds_set.add(round_num)
                except:
                    pass
        
        slices['rounds'] = sorted(list(rounds_set), reverse=True)
        
        return {
            'success': True,
            'player_id': player_id,
            'tournament_id': tournament_id,
            'slices': slices,
            'message': f'Доступно: сезон={slices["season"]}, туров={len(slices["rounds"])}'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting player available slices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================
# Watched Players (MY / TRACKED)
# =============================================

@router.get("/watched-players/{list_type}")
async def get_watched_players(
    list_type: str,
    db: Session = Depends(get_db),
):
    """Получить список отслеживаемых игроков (MY или TRACKED) с базовой информацией."""
    if list_type not in ("MY", "TRACKED"):
        raise HTTPException(status_code=400, detail="list_type must be MY or TRACKED")

    t_names = {r[0]: r[1] for r in db.execute(text("SELECT id, name FROM tournaments")).fetchall()}

    rows = db.execute(text("""
        SELECT
            wp.id, wp.player_id, wp.notes, wp.added_at,
            p.full_name, p.team_name, p.tournament_id,
            pos.code as position_code, pos.display_name as position_name,
            pos.group_code as position_group
        FROM watched_players wp
        JOIN players p ON wp.player_id = p.player_id
        JOIN positions pos ON p.position_id = pos.position_id
        WHERE wp.list_type = :lt
        ORDER BY wp.added_at DESC
    """), {"lt": list_type}).fetchall()

    players = []
    for r in rows:
        players.append({
            "watch_id": r[0],
            "player_id": r[1],
            "notes": r[2],
            "added_at": r[3].isoformat() if r[3] else None,
            "full_name": r[4],
            "team_name": r[5],
            "tournament_id": r[6],
            "tournament_name": t_names.get(r[6], f"T{r[6]}"),
            "position_code": r[7],
            "position_name": r[8],
            "position_group": r[9],
        })

    return {"success": True, "data": players, "total": len(players)}


@router.post("/watched-players")
async def add_watched_player(
    body: dict,
    db: Session = Depends(get_db),
):
    """Добавить игрока в список MY или TRACKED."""
    player_id = body.get("player_id")
    list_type = body.get("list_type")
    notes = body.get("notes", "")

    if not player_id or list_type not in ("MY", "TRACKED"):
        raise HTTPException(status_code=400, detail="player_id and list_type (MY/TRACKED) required")

    existing = db.execute(text("""
        SELECT id FROM watched_players WHERE player_id = :pid AND list_type = :lt
    """), {"pid": player_id, "lt": list_type}).fetchone()

    if existing:
        return {"success": True, "already_exists": True, "message": "Игрок уже в списке"}

    db.execute(text("""
        INSERT INTO watched_players (player_id, list_type, notes)
        VALUES (:pid, :lt, :notes)
    """), {"pid": player_id, "lt": list_type, "notes": notes})
    db.commit()

    return {"success": True, "message": "Игрок добавлен"}


@router.delete("/watched-players/{list_type}/{player_id}")
async def remove_watched_player(
    list_type: str,
    player_id: int,
    db: Session = Depends(get_db),
):
    """Удалить игрока из списка."""
    if list_type not in ("MY", "TRACKED"):
        raise HTTPException(status_code=400, detail="list_type must be MY or TRACKED")

    db.execute(text("""
        DELETE FROM watched_players WHERE player_id = :pid AND list_type = :lt
    """), {"pid": player_id, "lt": list_type})
    db.commit()
    return {"success": True, "message": "Игрок удалён из списка"}


@router.get("/watched-players/check/{player_id}")
async def check_watched_status(
    player_id: int,
    db: Session = Depends(get_db),
):
    """Проверить, в каких списках находится игрок."""
    rows = db.execute(text("""
        SELECT list_type FROM watched_players WHERE player_id = :pid
    """), {"pid": player_id}).fetchall()

    lists = [r[0] for r in rows]
    return {"success": True, "player_id": player_id, "in_my": "MY" in lists, "in_tracked": "TRACKED" in lists}
