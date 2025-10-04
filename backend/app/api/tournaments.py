"""
API роутер для работы с турнирами.
Содержит endpoint'ы для получения информации о турнирах и их статистики.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, Path
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.database import get_db
from app.models.player import PlayerStatsRaw, LastRoundStats
from app.api.schemas import TournamentListResponse, TournamentInfo, TopPerformersResponse, PlayerPerformance
from app.config import settings

logger = logging.getLogger(__name__)

# Создаём роутер
router = APIRouter()


@router.get("/tournaments", response_model=TournamentListResponse, summary="Получить список турниров")
async def get_tournaments(
    db: Session = Depends(get_db)
):
    """
    Получение списка всех турниров с информацией о количестве игроков и последних обновлениях.
    
    Возвращает информацию о турнирах:
    - ID и названия турниров
    - Количество игроков в каждом турнире
    - Время последнего обновления данных
    """
    try:
        tournaments_data = []
        
        # Получаем информацию о каждом турнире из конфигурации
        for tournament_id, tournament_info in settings.tournaments.items():
            
            # Подсчитываем количество игроков в турнире
            players_count = db.query(func.count(PlayerStatsRaw.id)).filter(
                PlayerStatsRaw.tournament_id == tournament_id
            ).scalar() or 0
            
            # Получаем время последнего обновления (по последнему created_at)
            last_update = db.query(func.max(PlayerStatsRaw.updated_at)).filter(
                PlayerStatsRaw.tournament_id == tournament_id
            ).scalar()
            
            tournament_data = TournamentInfo(
                id=tournament_id,
                name=tournament_info["name"],
                full_name=tournament_info["full_name"],
                code=tournament_info["code"],
                players_count=players_count,
                last_update=last_update
            )
            
            tournaments_data.append(tournament_data)
        
        # Сортируем по ID турнира
        tournaments_data.sort(key=lambda x: x.id)
        
        logger.info(f"Retrieved information for {len(tournaments_data)} tournaments")
        
        return TournamentListResponse(
            data=tournaments_data,
            message="Tournaments retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error retrieving tournaments: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve tournaments: {str(e)}")


@router.get("/tournaments/{tournament_id}", response_model=TournamentInfo, summary="Информация о турнире")
async def get_tournament_info(
    tournament_id: int = Path(..., ge=0, le=3, description="ID турнира"),
    db: Session = Depends(get_db)
):
    """
    Получение подробной информации о конкретном турнире.
    """
    try:
        # Проверяем существование турнира
        if tournament_id not in settings.tournaments:
            raise HTTPException(status_code=404, detail="Tournament not found")
        
        tournament_config = settings.tournaments[tournament_id]
        
        # Статистика по турниру
        players_count = db.query(func.count(PlayerStatsRaw.id)).filter(
            PlayerStatsRaw.tournament_id == tournament_id
        ).scalar() or 0
        
        last_update = db.query(func.max(PlayerStatsRaw.updated_at)).filter(
            PlayerStatsRaw.tournament_id == tournament_id
        ).scalar()
        
        tournament_info = TournamentInfo(
            id=tournament_id,
            name=tournament_config["name"],
            full_name=tournament_config["full_name"],
            code=tournament_config["code"],
            players_count=players_count,
            last_update=last_update
        )
        
        logger.info(f"Retrieved info for tournament {tournament_id}: {players_count} players")
        
        return tournament_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving tournament {tournament_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve tournament: {str(e)}")


@router.get("/tournaments/{tournament_id}/stats", summary="Статистика турнира")
async def get_tournament_stats(
    tournament_id: int = Path(..., ge=0, le=3, description="ID турнира"),
    db: Session = Depends(get_db)
):
    """
    Получение общей статистики по турниру:
    - Общее количество игроков
    - Количество команд
    - Средние показатели
    - Топ игроки
    """
    try:
        # Проверяем существование турнира
        if tournament_id not in settings.tournaments:
            raise HTTPException(status_code=404, detail="Tournament not found")
        
        tournament_name = settings.get_tournament_name(tournament_id)
        
        # Основная статистика
        base_query = db.query(PlayerStatsRaw).filter(PlayerStatsRaw.tournament_id == tournament_id)
        
        total_players = base_query.count()
        
        if total_players == 0:
            return {
                "tournament_id": tournament_id,
                "tournament_name": tournament_name,
                "total_players": 0,
                "message": "No players found in this tournament"
            }
        
        # Количество команд
        teams_count = db.query(func.count(func.distinct(PlayerStatsRaw.team_name))).filter(
            PlayerStatsRaw.tournament_id == tournament_id
        ).scalar() or 0
        
        # Количество позиций
        positions_count = db.query(func.count(func.distinct(PlayerStatsRaw.position))).filter(
            PlayerStatsRaw.tournament_id == tournament_id,
            PlayerStatsRaw.position.isnot(None),
            PlayerStatsRaw.position != ''
        ).scalar() or 0
        
        # Средние показатели
        avg_stats = db.query(
            func.avg(PlayerStatsRaw.goals).label('avg_goals'),
            func.avg(PlayerStatsRaw.assists).label('avg_assists'),
            func.avg(PlayerStatsRaw.minutes_played).label('avg_minutes'),
            func.sum(PlayerStatsRaw.goals).label('total_goals'),
            func.sum(PlayerStatsRaw.assists).label('total_assists')
        ).filter(PlayerStatsRaw.tournament_id == tournament_id).first()
        
        # Топ бомбардиры
        top_scorers = base_query.filter(PlayerStatsRaw.goals > 0).order_by(
            PlayerStatsRaw.goals.desc()
        ).limit(5).all()
        
        # Топ ассистенты
        top_assisters = base_query.filter(PlayerStatsRaw.assists > 0).order_by(
            PlayerStatsRaw.assists.desc()
        ).limit(5).all()
        
        # Отслеживаемые игроки
        tracked_players = base_query.filter(
            PlayerStatsRaw.tracking_status != 'non interesting'
        ).count()
        
        # Формируем ответ
        stats = {
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "total_players": total_players,
            "teams_count": teams_count,
            "positions_count": positions_count,
            "tracked_players": tracked_players,
            "averages": {
                "goals": round(float(avg_stats.avg_goals or 0), 2),
                "assists": round(float(avg_stats.avg_assists or 0), 2),
                "minutes_played": round(float(avg_stats.avg_minutes or 0), 1)
            },
            "totals": {
                "goals": int(avg_stats.total_goals or 0),
                "assists": int(avg_stats.total_assists or 0)
            },
            "top_scorers": [
                {
                    "player_name": player.player_name,
                    "team_name": player.team_name,
                    "goals": player.goals,
                    "minutes_played": player.minutes_played
                }
                for player in top_scorers
            ],
            "top_assisters": [
                {
                    "player_name": player.player_name,
                    "team_name": player.team_name,
                    "assists": player.assists,
                    "minutes_played": player.minutes_played
                }
                for player in top_assisters
            ]
        }
        
        logger.info(f"Generated stats for tournament {tournament_id}: {total_players} players")
        
        return stats
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating tournament {tournament_id} stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate tournament stats: {str(e)}")


@router.get("/tournaments/{tournament_id}/teams", summary="Команды турнира")
async def get_tournament_teams(
    tournament_id: int = Path(..., ge=0, le=3, description="ID турнира"),
    db: Session = Depends(get_db)
):
    """
    Получение списка команд в турнире с количеством игроков в каждой команде.
    """
    try:
        # Проверяем существование турнира
        if tournament_id not in settings.tournaments:
            raise HTTPException(status_code=404, detail="Tournament not found")
        
        # Группировка по командам
        teams_query = db.query(
            PlayerStatsRaw.team_name,
            func.count(PlayerStatsRaw.id).label('players_count'),
            func.sum(PlayerStatsRaw.goals).label('total_goals'),
            func.sum(PlayerStatsRaw.assists).label('total_assists'),
            func.avg(PlayerStatsRaw.minutes_played).label('avg_minutes')
        ).filter(
            PlayerStatsRaw.tournament_id == tournament_id
        ).group_by(
            PlayerStatsRaw.team_name
        ).order_by(
            PlayerStatsRaw.team_name.asc()
        ).all()
        
        # Формируем список команд
        teams = []
        for team in teams_query:
            teams.append({
                "team_name": team.team_name,
                "players_count": team.players_count,
                "total_goals": int(team.total_goals or 0),
                "total_assists": int(team.total_assists or 0),
                "avg_minutes_played": round(float(team.avg_minutes or 0), 1)
            })
        
        tournament_name = settings.get_tournament_name(tournament_id)
        
        logger.info(f"Retrieved {len(teams)} teams for tournament {tournament_id}")
        
        return {
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "teams_count": len(teams),
            "teams": teams
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving teams for tournament {tournament_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve teams: {str(e)}")


@router.get("/top-performers", response_model=TopPerformersResponse, summary="Топ выступления за неделю")
async def get_top_performers(
    period: str = Query("all_time", regex="^(all_time|last_round)$", description="Период"),
    limit: int = Query(10, ge=1, le=50, description="Количество игроков в каждой категории"),
    tournament_id: int = Query(None, ge=0, le=3, description="Фильтр по турниру"),
    db: Session = Depends(get_db)
):
    """
    Получение топ игроков по различным метрикам:
    - Лучшие бомбардиры
    - Лучшие ассистенты  
    - Игроки с наибольшим количеством ударов
    - Игроки с наибольшим количеством передач
    
    **period**: all_time (вся статистика) или last_round (только последний тур)
    """
    try:
        # Выбираем источник данных в зависимости от периода
        if period == "last_round":
            base_query = db.query(LastRoundStats)
            if tournament_id is not None:
                base_query = base_query.filter(LastRoundStats.tournament_id == tournament_id)
            player_model = LastRoundStats
        else:
            base_query = db.query(PlayerStatsRaw)
            if tournament_id is not None:
                base_query = base_query.filter(PlayerStatsRaw.tournament_id == tournament_id)
            player_model = PlayerStatsRaw
        
        # Топ бомбардиры
        top_goals = base_query.filter(
            player_model.goals > 0
        ).order_by(
            player_model.goals.desc()
        ).limit(limit).all()
        
        goals_performers = []
        for player in top_goals:
            per_90 = None
            if player.minutes_played and player.minutes_played > 0:
                per_90 = round((player.goals / player.minutes_played) * 90, 2)
                
            goals_performers.append(PlayerPerformance(
                id=player.id,
                player_name=player.player_name,
                team_name=player.team_name,
                position=player.position,
                tournament_id=player.tournament_id,
                metric_value=float(player.goals or 0),
                minutes_played=player.minutes_played,
                per_90_value=per_90
            ))
        
        # Топ ассистенты
        top_assists = base_query.filter(
            player_model.assists > 0
        ).order_by(
            player_model.assists.desc()
        ).limit(limit).all()
        
        assists_performers = []
        for player in top_assists:
            per_90 = None
            if player.minutes_played and player.minutes_played > 0:
                per_90 = round((player.assists / player.minutes_played) * 90, 2)
                
            assists_performers.append(PlayerPerformance(
                id=player.id,
                player_name=player.player_name,
                team_name=player.team_name,
                position=player.position,
                tournament_id=player.tournament_id,
                metric_value=float(player.assists or 0),
                minutes_played=player.minutes_played,
                per_90_value=per_90
            ))
        
        # Топ по ударам (если есть данные)
        shots_performers = []
        if hasattr(player_model, 'shots'):
            top_shots = base_query.filter(
                player_model.shots > 0
            ).order_by(
                player_model.shots.desc()
            ).limit(limit).all()
            
            for player in top_shots:
                per_90 = None
                if player.minutes_played and player.minutes_played > 0:
                    per_90 = round((player.shots / player.minutes_played) * 90, 2)
                    
                shots_performers.append(PlayerPerformance(
                    id=player.id,
                    player_name=player.player_name,
                    team_name=player.team_name,
                    position=player.position,
                    tournament_id=player.tournament_id,
                    metric_value=float(player.shots or 0),
                    minutes_played=player.minutes_played,
                    per_90_value=per_90
                ))
        
        # Топ по передачам (если есть данные)
        passes_performers = []
        if hasattr(player_model, 'passes_total'):
            top_passes = base_query.filter(
                player_model.passes_total > 0
            ).order_by(
                player_model.passes_total.desc()
            ).limit(limit).all()
            
            for player in top_passes:
                per_90 = None
                if player.minutes_played and player.minutes_played > 0:
                    per_90 = round((player.passes_total / player.minutes_played) * 90, 2)
                    
                passes_performers.append(PlayerPerformance(
                    id=player.id,
                    player_name=player.player_name,
                    team_name=player.team_name,
                    position=player.position,
                    tournament_id=player.tournament_id,
                    metric_value=float(player.passes_total or 0),
                    minutes_played=player.minutes_played,
                    per_90_value=per_90
                ))
        
        logger.info(f"Retrieved top performers for period '{period}': "
                   f"{len(goals_performers)} goals, {len(assists_performers)} assists")
        
        return TopPerformersResponse(
            goals=goals_performers,
            assists=assists_performers,
            shots=shots_performers,
            passes=passes_performers,
            period=period,
            message=f"Top performers for {period} retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error retrieving top performers: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve top performers: {str(e)}")


@router.delete("/tournaments/{tournament_id}/players", summary="Удалить всех игроков турнира")
async def delete_tournament_players(
    tournament_id: int = Path(..., ge=0, le=3, description="ID турнира"),
    confirm: bool = Query(False, description="Подтверждение удаления (должно быть true)"),
    db: Session = Depends(get_db)
):
    """
    **ОПАСНАЯ ОПЕРАЦИЯ**: Удаление всех игроков из турнира.
    
    Требует явного подтверждения через параметр confirm=true.
    
    **Параметры:**
    - tournament_id: ID турнира (0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3)
    - confirm: Должно быть true для подтверждения удаления
    
    **Использование:**
    ```
    DELETE /api/tournaments/2/players?confirm=true
    ```
    
    После удаления вы можете загрузить правильный файл для турнира.
    """
    try:
        # Проверяем существование турнира
        if tournament_id not in settings.tournaments:
            raise HTTPException(status_code=404, detail="Tournament not found")
        
        # Требуем подтверждения
        if not confirm:
            raise HTTPException(
                status_code=400, 
                detail="Confirmation required. Add ?confirm=true to delete all players from tournament"
            )
        
        tournament_name = settings.get_tournament_name(tournament_id)
        
        # Подсчитываем количество игроков перед удалением
        players_count = db.query(func.count(PlayerStatsRaw.id)).filter(
            PlayerStatsRaw.tournament_id == tournament_id
        ).scalar() or 0
        
        if players_count == 0:
            return {
                "tournament_id": tournament_id,
                "tournament_name": tournament_name,
                "deleted_count": 0,
                "message": "No players found in this tournament"
            }
        
        # Также удаляем из last_round_stats если есть
        last_round_count = db.query(func.count(LastRoundStats.id)).filter(
            LastRoundStats.tournament_id == tournament_id
        ).scalar() or 0
        
        # Удаляем игроков из основной таблицы
        deleted_main = db.query(PlayerStatsRaw).filter(
            PlayerStatsRaw.tournament_id == tournament_id
        ).delete(synchronize_session=False)
        
        # Удаляем из last_round_stats
        deleted_last_round = db.query(LastRoundStats).filter(
            LastRoundStats.tournament_id == tournament_id
        ).delete(synchronize_session=False)
        
        # Фиксируем изменения
        db.commit()
        
        logger.warning(f"DELETED ALL PLAYERS from tournament {tournament_id} ({tournament_name}): "
                      f"{deleted_main} from main table, {deleted_last_round} from last_round")
        
        return {
            "success": True,
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "deleted_from_main_table": deleted_main,
            "deleted_from_last_round": deleted_last_round,
            "total_deleted": deleted_main + deleted_last_round,
            "message": f"Successfully deleted all {deleted_main} players from tournament '{tournament_name}'. "
                      f"You can now upload the correct file."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting players from tournament {tournament_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete players: {str(e)}")


