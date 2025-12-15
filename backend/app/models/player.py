"""
Модели для хранения статистики футболистов.
ЗАГЛУШКА - таблицы будут созданы позже.
"""

from sqlalchemy import Column, String, Integer
from sqlalchemy.dialects.postgresql import ENUM

from .base import BaseModel


# Создаём ENUM для статусов отслеживания
tracking_status_enum = ENUM(
    'non interesting',
    'interesting', 
    'to watch',
    'my player',
    name='tracking_status_enum',
    create_type=False
)

# ЗАГЛУШКИ - модели будут созданы позже
# class PlayerSeasonStats(BaseModel):
#     pass
# 
# class PlayerRoundStats(BaseModel):
#     pass
