"""
API роутер для работы с игроками.
Содержит все endpoint'ы для получения, фильтрации и управления данными игроков.
"""

import logging
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Path
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from app.database import get_db
from app.models.player import PlayerStatsRaw, LastRoundStats
from app.api.schemas import (
    PlayerListResponse, PlayerDetailResponse, PlayerStatusUpdate,
    PlayerStatusResponse, PlayerFilters, SortOptions, PaginationParams,
    PlayerResponse, TrackingStatus, PlayerSearchResponse, PlayerSearchResult
)
from app.config import settings

logger = logging.getLogger(__name__)

# Создаём роутер
router = APIRouter()


@router.get("/players", response_model=PlayerListResponse, summary="Получить список игроков")
async def get_players(
    tournament_id: Optional[int] = Query(None, ge=0, le=3, description="ID турнира"),
    team_name: Optional[str] = Query(None, description="Название команды"),
    position: Optional[str] = Query(None, description="Позиция"),
    tracking_status: Optional[TrackingStatus] = Query(None, description="Статус отслеживания"),
    min_goals: Optional[int] = Query(None, ge=0, description="Минимум голов"),
    min_assists: Optional[int] = Query(None, ge=0, description="Минимум ассистов"),
    min_minutes: Optional[int] = Query(None, ge=0, description="Минимум минут"),
    search_query: Optional[str] = Query(None, description="Поиск по имени игрока"),
    sort_field: str = Query("player_name", description="Поле для сортировки"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="Порядок сортировки"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(50, ge=1, le=500, description="Количество на странице"),
    db: Session = Depends(get_db)
):
    """
    Получение списка игроков с фильтрацией, сортировкой и пагинацией.
    
    - **tournament_id**: Фильтр по турниру (0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3)
    - **team_name**: Фильтр по команде
    - **position**: Фильтр по позиции
    - **tracking_status**: Фильтр по статусу отслеживания
    - **min_goals/min_assists/min_minutes**: Минимальные значения статистики
    - **search_query**: Поиск по имени игрока (нечёткий поиск)
    - **sort_field**: Поле сортировки (player_name, goals, assists, и т.д.)
    - **sort_order**: Порядок сортировки (asc/desc)
    """
    try:
        # Начинаем запрос
        query = db.query(PlayerStatsRaw)
        
        # Применяем фильтры
        if tournament_id is not None:
            query = query.filter(PlayerStatsRaw.tournament_id == tournament_id)
        
        if team_name:
            query = query.filter(PlayerStatsRaw.team_name.ilike(f"%{team_name}%"))
        
        if position:
            query = query.filter(PlayerStatsRaw.position.ilike(f"%{position}%"))
        
        if tracking_status:
            query = query.filter(PlayerStatsRaw.tracking_status == tracking_status.value)
        
        if min_goals is not None:
            query = query.filter(PlayerStatsRaw.goals >= min_goals)
        
        if min_assists is not None:
            query = query.filter(PlayerStatsRaw.assists >= min_assists)
        
        if min_minutes is not None:
            query = query.filter(PlayerStatsRaw.minutes_played >= min_minutes)
        
        if search_query:
            search_filter = PlayerStatsRaw.player_name.ilike(f"%{search_query}%")
            query = query.filter(search_filter)
        
        # Подсчитываем общее количество
        total_count = query.count()
        
        # Применяем сортировку
        sort_column = getattr(PlayerStatsRaw, sort_field, PlayerStatsRaw.player_name)
        if sort_order == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())
        
        # Применяем пагинацию
        offset = (page - 1) * per_page
        players = query.offset(offset).limit(per_page).all()
        
        # Конвертируем в схемы ответа
        players_data = [PlayerResponse.from_orm(player) for player in players]
        
        logger.info(f"Retrieved {len(players)} players (total: {total_count})")
        
        return PlayerListResponse(
            data=players_data,
            total=total_count,
            page=page,
            per_page=per_page,
            message=f"Found {total_count} players"
        )
        
    except Exception as e:
        logger.error(f"Error retrieving players: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve players: {str(e)}")


@router.get("/players/raw-data", response_model=PlayerListResponse, summary="Все игроки из базы данных")
async def get_all_players_database(
    page: int = Query(1, ge=1, description="Номер страницы"),
    limit: int = Query(50, ge=1, le=1000, description="Количество записей на странице"),
    search: Optional[str] = Query(None, description="Поиск по имени игрока, команде или позиции"),
    tournament_id: Optional[int] = Query(None, ge=0, le=3, description="ID турнира"),
    position: Optional[str] = Query(None, description="Позиция игрока"),
    min_goals: Optional[int] = Query(None, ge=0, description="Минимальное количество голов"),
    max_goals: Optional[int] = Query(None, ge=0, description="Максимальное количество голов"),
    min_assists: Optional[int] = Query(None, ge=0, description="Минимальное количество ассистов"),
    max_assists: Optional[int] = Query(None, ge=0, description="Максимальное количество ассистов"),
    db: Session = Depends(get_db)
):
    """
    Получить все записи из таблицы players_stats_raw с возможностью фильтрации и поиска.
    
    Поддерживает:
    - Поиск по имени игрока, команде, позиции
    - Фильтрацию по турниру, позиции, голам, ассистам
    - Пагинацию
    """
    try:
        # Базовый запрос
        query = db.query(PlayerStatsRaw)
        
        # Применяем фильтры
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    func.lower(PlayerStatsRaw.player_name).like(search_term),
                    func.lower(PlayerStatsRaw.team_name).like(search_term),
                    func.lower(PlayerStatsRaw.position).like(search_term)
                )
            )
        
        if tournament_id is not None:
            query = query.filter(PlayerStatsRaw.tournament_id == tournament_id)
            
        if position:
            query = query.filter(func.lower(PlayerStatsRaw.position).like(f"%{position.lower()}%"))
            
        if min_goals is not None:
            query = query.filter(PlayerStatsRaw.goals >= min_goals)
            
        if max_goals is not None:
            query = query.filter(PlayerStatsRaw.goals <= max_goals)
            
        if min_assists is not None:
            query = query.filter(PlayerStatsRaw.assists >= min_assists)
            
        if max_assists is not None:
            query = query.filter(PlayerStatsRaw.assists <= max_assists)
        
        # Подсчитываем общее количество записей
        total_count = query.count()
        
        # Применяем пагинацию и сортировку
        players = query.order_by(
            PlayerStatsRaw.player_name.asc()
        ).offset((page - 1) * limit).limit(limit).all()
        
        # Преобразуем в формат ответа
        player_responses = []
        for player in players:
            player_responses.append(PlayerResponse(
                id=str(player.id) if player.id else f"raw_{hash(player.player_name)}",
                player_name=player.player_name or "Неизвестно",
                team_name=player.team_name or "Неизвестно",
                position=player.position or "N/A",
                goals=player.goals or 0,
                assists=player.assists or 0,
                shots=player.shots or 0,
                passes_total=player.passes_total or 0,
                minutes_played=player.minutes_played or 0,
                tracking_status=player.tracking_status,
                tournament_id=player.tournament_id,
                created_at=player.created_at,
                updated_at=player.updated_at,
                notes=None  # В raw таблице нет заметок
            ))
        
        return PlayerListResponse(
            data=player_responses,
            total=total_count,
            page=page,
            limit=limit,
            pages=((total_count - 1) // limit) + 1 if total_count > 0 else 0
        )
        
    except Exception as e:
        logger.error(f"Error retrieving database players: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve database players: {str(e)}")


@router.get("/players/tracked", response_model=PlayerListResponse, summary="Получить отслеживаемых игроков")
async def get_tracked_players(
    tournament_id: Optional[int] = Query(None, ge=0, le=3, description="ID турнира"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(50, ge=1, le=500, description="Количество на странице"),
    db: Session = Depends(get_db)
):
    """
    Получение списка всех отслеживаемых игроков (статус != 'non interesting').
    """
    try:
        # Запрос отслеживаемых игроков
        query = db.query(PlayerStatsRaw).filter(
            PlayerStatsRaw.tracking_status != 'non interesting'
        )
        
        if tournament_id is not None:
            query = query.filter(PlayerStatsRaw.tournament_id == tournament_id)
        
        # Сортируем по статусу и имени
        query = query.order_by(
            PlayerStatsRaw.tracking_status.desc(),
            PlayerStatsRaw.player_name.asc()
        )
        
        # Подсчёт и пагинация
        total_count = query.count()
        offset = (page - 1) * per_page
        players = query.offset(offset).limit(per_page).all()
        
        players_data = [PlayerResponse.from_orm(player) for player in players]
        
        logger.info(f"Retrieved {len(players)} tracked players (total: {total_count})")
        
        return PlayerListResponse(
            data=players_data,
            total=total_count,
            page=page,
            per_page=per_page,
            message=f"Found {total_count} tracked players"
        )
        
    except Exception as e:
        logger.error(f"Error retrieving tracked players: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve tracked players: {str(e)}")


@router.get("/players/{player_id}", response_model=PlayerDetailResponse, summary="Получить игрока по ID")
async def get_player(
    player_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Получение подробной информации об игроке по ID.
    """
    try:
        player = db.query(PlayerStatsRaw).filter(PlayerStatsRaw.id == player_id).first()
        
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        player_data = PlayerResponse.from_orm(player)
        
        return PlayerDetailResponse(
            data=player_data,
            message="Player retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving player {player_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve player: {str(e)}")


@router.put("/players/{player_id}/status", response_model=PlayerStatusResponse, summary="Обновить статус игрока")
async def update_player_status(
    player_id: UUID,
    status_update: PlayerStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Обновление статуса отслеживания игрока.
    
    Доступные статусы:
    - **non interesting**: Обычный игрок (по умолчанию)
    - **interesting**: Интересный игрок
    - **to watch**: Игрок для наблюдения  
    - **my player**: Мой игрок
    """
    try:
        player = db.query(PlayerStatsRaw).filter(PlayerStatsRaw.id == player_id).first()
        
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        previous_status = player.tracking_status
        player.tracking_status = status_update.tracking_status.value
        
        if status_update.notes:
            player.notes = status_update.notes
        
        db.commit()
        db.refresh(player)
        
        logger.info(f"Updated player {player_id} status: {previous_status} -> {status_update.tracking_status}")
        
        return PlayerStatusResponse(
            player_id=player_id,
            new_status=TrackingStatus(player.tracking_status),
            previous_status=TrackingStatus(previous_status),
            message="Player status updated successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating player {player_id} status: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update player status: {str(e)}")


@router.get("/players/search", response_model=PlayerSearchResponse, summary="Поиск игроков")
async def search_players(
    query: str = Query(..., min_length=2, description="Поисковый запрос"),
    tournament_id: Optional[int] = Query(None, ge=0, le=3, description="ID турнира"),
    limit: int = Query(20, ge=1, le=100, description="Максимум результатов"),
    db: Session = Depends(get_db)
):
    """
    Поиск игроков по имени с возможностью фильтрации по турниру.
    Возвращает краткую информацию для выбора игрока.
    """
    try:
        # Поиск по имени (нечёткий поиск)
        search_query = db.query(PlayerStatsRaw).filter(
            PlayerStatsRaw.player_name.ilike(f"%{query}%")
        )
        
        if tournament_id is not None:
            search_query = search_query.filter(PlayerStatsRaw.tournament_id == tournament_id)
        
        # Сортировка по релевантности (точные совпадения в начале)
        search_query = search_query.order_by(
            func.length(PlayerStatsRaw.player_name).asc(),
            PlayerStatsRaw.player_name.asc()
        ).limit(limit)
        
        players = search_query.all()
        
        # Формируем результаты поиска
        results = []
        for player in players:
            basic_stats = {
                "goals": player.goals or 0,
                "assists": player.assists or 0,
                "minutes_played": player.minutes_played or 0,
                "position": player.position or "Unknown"
            }
            
            result = PlayerSearchResult(
                id=player.id,
                player_name=player.player_name,
                team_name=player.team_name,
                position=player.position,
                tournament_id=player.tournament_id,
                current_status=TrackingStatus(player.tracking_status),
                basic_stats=basic_stats
            )
            results.append(result)
        
        logger.info(f"Search '{query}' found {len(results)} players")
        
        return PlayerSearchResponse(
            query=query,
            results=results,
            total_found=len(results),
            message=f"Found {len(results)} players matching '{query}'"
        )
        
    except Exception as e:
        logger.error(f"Error searching players: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/tournaments/{tournament_id}/players", response_model=PlayerListResponse, summary="Игроки турнира")
async def get_tournament_players(
    tournament_id: int = Path(..., ge=0, le=3, description="ID турнира"),
    sort_field: str = Query("player_name", description="Поле для сортировки"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$", description="Порядок сортировки"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(100, ge=1, le=500, description="Количество на странице"),
    db: Session = Depends(get_db)
):
    """
    Получение всех игроков конкретного турнира с сортировкой.
    Основной endpoint для страницы турнира.
    """
    try:
        # Проверяем корректность tournament_id
        if tournament_id not in [0, 1, 2, 3]:
            raise HTTPException(status_code=400, detail="Invalid tournament ID")
        
        # Запрос игроков турнира
        query = db.query(PlayerStatsRaw).filter(PlayerStatsRaw.tournament_id == tournament_id)
        
        # Подсчёт общего количества
        total_count = query.count()
        
        # Применяем сортировку
        allowed_sort_fields = [
            'player_name', 'team_name', 'position', 'goals', 'assists',
            'shots', 'passes_total', 'minutes_played', 'tackles', 'interceptions'
        ]
        
        if sort_field not in allowed_sort_fields:
            sort_field = 'player_name'
        
        sort_column = getattr(PlayerStatsRaw, sort_field)
        if sort_order == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())
        
        # Пагинация
        offset = (page - 1) * per_page
        players = query.offset(offset).limit(per_page).all()
        
        players_data = [PlayerResponse.from_orm(player) for player in players]
        
        tournament_name = settings.get_tournament_name(tournament_id)
        logger.info(f"Retrieved {len(players)} players from {tournament_name} (total: {total_count})")
        
        return PlayerListResponse(
            data=players_data,
            total=total_count,
            page=page,
            per_page=per_page,
            message=f"Tournament {tournament_name}: {total_count} players"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving tournament {tournament_id} players: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve tournament players: {str(e)}")


@router.get("/last-round/players", response_model=PlayerListResponse, summary="Игроки последнего тура")
async def get_last_round_players(
    tournament_id: Optional[int] = Query(None, ge=0, le=3, description="ID турнира"),
    tracking_status: Optional[TrackingStatus] = Query(None, description="Статус отслеживания"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(50, ge=1, le=500, description="Количество на странице"),
    db: Session = Depends(get_db)
):
    """
    Получение данных игроков из последнего загруженного тура.
    Показывает актуальную статистику после последней загрузки Excel.
    """
    try:
        # Запрос из таблицы последнего тура
        query = db.query(LastRoundStats)
        
        if tournament_id is not None:
            query = query.filter(LastRoundStats.tournament_id == tournament_id)
        
        if tracking_status:
            query = query.filter(LastRoundStats.tracking_status == tracking_status.value)
        
        # Сортировка по голам (самые результативные в начале)
        query = query.order_by(LastRoundStats.goals.desc(), LastRoundStats.assists.desc())
        
        total_count = query.count()
        offset = (page - 1) * per_page
        players = query.offset(offset).limit(per_page).all()
        
        # Преобразуем LastRoundStats в PlayerResponse format
        players_data = []
        for player in players:
            # Создаём объект похожий на PlayerResponse для совместимости
            player_response = {
                "id": player.id,
                "player_name": player.player_name,
                "team_name": player.team_name,
                "position": player.position,
                "age": player.age,
                "minutes_played": player.minutes_played,
                "tournament_id": player.tournament_id,
                "tracking_status": player.tracking_status,
                "goals": player.goals,
                "assists": player.assists,
                "shots": player.shots,
                "shots_on_target": player.shots_on_target,
                "passes_total": player.passes_total,
                "passes_accuracy": player.passes_accuracy,
                "yellow_cards": player.yellow_cards,
                "red_cards": player.red_cards,
                "xg": player.xg,
                "created_at": player.created_at,
                "updated_at": player.updated_at
            }
            players_data.append(player_response)
        
        logger.info(f"Retrieved {len(players)} last round players (total: {total_count})")
        
        return PlayerListResponse(
            data=players_data,
            total=total_count,
            page=page,
            per_page=per_page,
            message=f"Last round: {total_count} players"
        )
        
    except Exception as e:
        logger.error(f"Error retrieving last round players: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve last round players: {str(e)}")


