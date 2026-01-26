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
    tournament_id: Optional[int] = Query(None, ge=0, le=3, description="ID турнира"),
    slice_type: str = Query("TOTAL", description="Тип статистики: TOTAL или PER90"),
    period_type: str = Query("SEASON", description="Тип периода: SEASON или ROUND"),
    round_number: Optional[int] = Query(None, ge=1, le=50, description="Номер тура (для period_type=ROUND)"),
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
        string_fields = {'full_name', 'team_name', 'position_code', 'position_group', 'position_name', 'citizenship'}
        
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
        # Для ROUND используем номер тура, для SEASON - не фильтруем по period_value
        period_value_filter = ""
        if period_type == 'ROUND' and round_number:
            period_value_filter = "AND ss.period_value = :period_value"
        
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
                    {pivot_sql}
                FROM players p
                JOIN positions pos ON p.position_id = pos.position_id
                JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
                JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
                WHERE ss.slice_type = :slice_type
                  AND ss.period_type = :period_type
                  {period_value_filter}
                  AND (:tournament_id IS NULL OR p.tournament_id = :tournament_id)
                  AND (:position_group IS NULL OR pos.group_code = :position_group)
                  AND (:search IS NULL OR 
                       LOWER(p.full_name) LIKE LOWER(:search_pattern) OR 
                       LOWER(p.team_name) LIKE LOWER(:search_pattern))
                GROUP BY p.player_id, p.full_name, p.team_name, p.birth_year, p.height, p.weight, p.citizenship,
                         pos.code, pos.group_code, pos.display_name
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
                
                # Конвертируем проценты (если это процент, умножаем на 100)
                if col_name in metrics_types and metrics_types[col_name] == 'PERCENTAGE' and value is not None:
                    value = float(value) * 100
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


@router.get("/tournaments/info")
async def get_tournaments_info(db: Session = Depends(get_db)):
    """Информация о турнирах."""
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
            GROUP BY t.id, t.name, t.full_name, t.short_code, t.current_round, t.updated_at
            ORDER BY t.id
        """))
        
        tournaments = []
        for row in result:
            tournaments.append({
                "id": row[0],
                "name": row[1],
                "full_name": row[2],
                "code": row[3],
                "current_round": row[4],
                "last_update": row[5].isoformat() if row[5] else None,
                "players_count": row[6] or 0
            })
        
        return {
            "success": True,
            "data": tournaments,
            "total": len(tournaments)
        }
        
    except Exception as e:
        logger.error(f"Error getting tournaments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/tournament")
async def upload_tournament_file(
    file: UploadFile = File(...),
    tournament_id: int = Form(...),
    slice_type: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Загрузить файл для турнира.
    
    При загрузке:
    - Существующие игроки обновляются (по имени, году рождения, команде, турниру)
    - Новые игроки добавляются
    """
    try:
        # Проверка типа файла
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы .xlsx и .xls")
        
        # Сохранение файла
        upload_dir = Path("/uploads")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = upload_dir / f"{timestamp}_{tournament_id}_{slice_type}_{file.filename}"
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"File saved: {file_path}")
        
        # Загрузка в БД
        loader = DataLoader(db)
        
        result = loader.load_file(
            file_path=file_path,
            tournament_id=tournament_id,
            slice_type=slice_type,
            period_type='SEASON',
            period_value='1-15'  # TODO: Получать из параметров
        )
        
        # Обновляем дату обновления турнира
        db.execute(text("""
            UPDATE tournaments 
            SET updated_at = CURRENT_TIMESTAMP 
            WHERE id = :tid
        """), {"tid": tournament_id})
        db.commit()
        
        logger.info(f"✅ Loaded {result['players_loaded']} players, {result['stats_loaded']} stats")
        
        return {
            "success": True,
            "message": f"Загружено {result['players_loaded']} игроков, {result['stats_loaded']} статистик",
            "players_loaded": result['players_loaded'],
            "stats_loaded": result['stats_loaded']
        }
        
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/database/clear")
async def clear_database(db: Session = Depends(get_db)):
    """
    Очистить базу данных (игроков и статистику).
    Турниры и справочники остаются.
    """
    try:
        # Очищаем таблицы
        db.execute(text("TRUNCATE TABLE player_statistics CASCADE"))
        db.execute(text("TRUNCATE TABLE stat_slices CASCADE"))
        db.execute(text("TRUNCATE TABLE players CASCADE"))
        db.commit()
        
        logger.info("✅ Database cleared successfully")
        
        return {
            "success": True,
            "message": "База данных очищена успешно"
        }
        
    except Exception as e:
        logger.error(f"Error clearing database: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
