"""
Модели базы данных для приложения статистики футболистов.
Содержит все SQLAlchemy модели для хранения данных игроков и статистики.
"""

from .base import Base
from .player import PlayerStatsRaw, PositionAverages, LastRoundStats

# Экспортируем все модели для удобства импорта
__all__ = [
    "Base",
    "PlayerStatsRaw", 
    "PositionAverages",
    "LastRoundStats"
]


