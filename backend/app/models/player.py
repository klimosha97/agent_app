"""
Модели для хранения статистики футболистов.
Содержит таблицы для основной статистики, средних значений по позициям и данных последнего тура.
"""

from sqlalchemy import Column, String, Integer, Float, Text, Index, Boolean
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import relationship
from typing import Optional

from .base import BaseModel
from app.config import TRACKING_STATUSES


# Создаём ENUM для статусов отслеживания
tracking_status_enum = ENUM(
    'non interesting',
    'interesting', 
    'to watch',
    'my player',
    name='tracking_status_enum',
    create_type=False  # Тип уже создан в init.sql
)


class PlayerStatsRaw(BaseModel):
    """
    Основная таблица со всей статистикой игроков.
    Содержит все 60+ параметров из Excel файлов, плюс дополнительные поля для отслеживания.
    
    Поля соответствуют структуре данных из yfl1.xlsx:
    - Основная информация об игроке
    - Голевая статистика  
    - Передачи всех типов
    - Единоборства и обводки
    - Оборонительная статистика
    - Дополнительные метрики (xG)
    """
    
    __tablename__ = 'players_stats_raw'
    
    # === Дополнительные поля для отслеживания ===
    tracking_status = Column(
        tracking_status_enum,
        default='non interesting',
        nullable=False,
        comment="Статус отслеживания игрока"
    )
    
    tournament_id = Column(
        Integer,
        nullable=False,
        comment="ID турнира: 0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3"
    )
    
    # === Основная информация об игроке ===
    player_number = Column(
        Integer,
        comment="Номер игрока в команде"
    )
    
    player_name = Column(
        String(255),
        nullable=False,
        comment="Имя игрока"
    )
    
    team_name = Column(
        String(255),
        nullable=False,
        comment="Название команды"
    )
    
    age = Column(
        Integer,
        comment="Возраст игрока"
    )
    
    height = Column(
        String(10),
        comment="Рост игрока"
    )
    
    weight = Column(
        String(10),
        comment="Вес игрока"
    )
    
    citizenship = Column(
        String(100),
        comment="Гражданство игрока"
    )
    
    player_index = Column(
        String(50),
        comment="Индекс игрока"
    )
    
    minutes_played = Column(
        Integer,
        comment="Количество минут на поле"
    )
    
    position = Column(
        String(50),
        comment="Игровая позиция"
    )
    
    # === Ошибки и дисциплина ===
    goal_errors = Column(
        Integer,
        default=0,
        comment="Голевые ошибки"
    )
    
    rough_errors = Column(
        Integer,
        default=0,
        comment="Грубые ошибки"
    )
    
    yellow_cards = Column(
        Integer,
        default=0,
        comment="Жёлтые карточки"
    )
    
    red_cards = Column(
        Integer,
        default=0,
        comment="Красные карточки"
    )
    
    fouls_committed = Column(
        Integer,
        default=0,
        comment="Фолы совершённые"
    )
    
    fouls_suffered = Column(
        Integer,
        default=0,
        comment="Фолы на игроке"
    )
    
    # === Голевая статистика ===
    goals = Column(
        Integer,
        default=0,
        comment="Голы"
    )
    
    assists = Column(
        Integer,
        default=0,
        comment="Передачи голевые (ассисты)"
    )
    
    goal_attempts = Column(
        Integer,
        default=0,
        comment="Голевые моменты"
    )
    
    goal_attempts_successful = Column(
        Integer,
        default=0,
        comment="Голевые моменты удачные"
    )
    
    goal_attempts_success_rate = Column(
        Float,
        comment="Голевые моменты удачные, %"
    )
    
    goal_moments_created = Column(
        Integer,
        default=0,
        comment="Голевые моменты создал"
    )
    
    goal_attacks_participation = Column(
        Integer,
        default=0,
        comment="Участие в голевых атаках"
    )
    
    shots = Column(
        Integer,
        default=0,
        comment="Удары"
    )
    
    shots_on_target = Column(
        Integer,
        default=0,
        comment="Удары в створ"
    )
    
    xg = Column(
        Float,
        comment="xG (ожидаемые голы)"
    )
    
    # === Передачи ===
    passes_total = Column(
        Integer,
        default=0,
        comment="Передачи всего"
    )
    
    passes_accuracy = Column(
        Float,
        comment="Передачи точные, %"
    )
    
    passes_key = Column(
        Integer,
        default=0,
        comment="Передачи ключевые"
    )
    
    passes_key_accuracy = Column(
        Float,
        comment="Передачи ключевые точные, %"
    )
    
    crosses = Column(
        Integer,
        default=0,
        comment="Навесы"
    )
    
    crosses_accuracy = Column(
        Float,
        comment="Навесы точные, %"
    )
    
    passes_progressive = Column(
        Integer,
        default=0,
        comment="Передачи прогрессивные"
    )
    
    passes_progressive_accuracy = Column(
        Float,
        comment="Передачи прогрессивные точные, %"
    )
    
    passes_progressive_clean = Column(
        Integer,
        default=0,
        comment="Передачи прогрессивные чистые"
    )
    
    passes_long = Column(
        Integer,
        default=0,
        comment="Передачи длинные"
    )
    
    passes_long_accuracy = Column(
        Float,
        comment="Передачи длинные точные, %"
    )
    
    passes_super_long = Column(
        Integer,
        default=0,
        comment="Передачи сверхдлинные"
    )
    
    passes_super_long_accuracy = Column(
        Float,
        comment="Передачи сверхдлинные точные, %"
    )
    
    passes_final_third = Column(
        Integer,
        default=0,
        comment="Передачи вперёд в финальную треть"
    )
    
    passes_final_third_accuracy = Column(
        Float,
        comment="Передачи вперёд в финальную треть точные, %"
    )
    
    passes_penalty_area = Column(
        Integer,
        default=0,
        comment="Передачи в штрафную"
    )
    
    passes_penalty_area_accuracy = Column(
        Float,
        comment="Передачи в штрафную точные, %"
    )
    
    passes_for_shot = Column(
        Integer,
        default=0,
        comment="Передачи под удар"
    )
    
    # === Единоборства ===
    duels_total = Column(
        Integer,
        default=0,
        comment="Единоборства всего"
    )
    
    duels_success_rate = Column(
        Float,
        comment="Единоборства удачные, %"
    )
    
    duels_defensive = Column(
        Integer,
        default=0,
        comment="Единоборства в обороне"
    )
    
    duels_defensive_success_rate = Column(
        Float,
        comment="Единоборства в обороне удачные, %"
    )
    
    duels_offensive = Column(
        Integer,
        default=0,
        comment="Единоборства в атаке"
    )
    
    duels_offensive_success_rate = Column(
        Float,
        comment="Единоборства в атаке удачные, %"
    )
    
    duels_aerial = Column(
        Integer,
        default=0,
        comment="Единоборства вверху"
    )
    
    duels_aerial_success_rate = Column(
        Float,
        comment="Единоборства вверху удачные, %"
    )
    
    # === Обводки ===
    dribbles = Column(
        Integer,
        default=0,
        comment="Обводки"
    )
    
    dribbles_success_rate = Column(
        Float,
        comment="Обводки удачные, %"
    )
    
    dribbles_final_third = Column(
        Integer,
        default=0,
        comment="Обводки в финальной трети"
    )
    
    dribbles_final_third_success_rate = Column(
        Float,
        comment="Обводки в финальной трети удачные, %"
    )
    
    # === Оборонительная статистика ===
    tackles = Column(
        Integer,
        default=0,
        comment="Отборы"
    )
    
    tackles_success_rate = Column(
        Float,
        comment="Отборы удачные, %"
    )
    
    interceptions = Column(
        Integer,
        default=0,
        comment="Перехваты"
    )
    
    recoveries = Column(
        Integer,
        default=0,
        comment="Подборы"
    )
    
    # === Дополнительная информация ===
    notes = Column(
        Text,
        comment="Дополнительные заметки об игроке"
    )
    
    # === Индексы для оптимизации запросов ===
    __table_args__ = (
        Index('idx_player_name', 'player_name'),
        Index('idx_team_name', 'team_name'),
        Index('idx_tournament_id', 'tournament_id'),
        Index('idx_tracking_status', 'tracking_status'),
        Index('idx_position', 'position'),
        Index('idx_goals_assists', 'goals', 'assists'),
        Index('idx_minutes_played', 'minutes_played'),
    )
    
    def __repr__(self) -> str:
        return f"<PlayerStatsRaw(name='{self.player_name}', team='{self.team_name}', tournament={self.tournament_id})>"
    
    def get_per_90_stats(self) -> dict:
        """
        Вычисление статистики per 90 минут.
        
        Returns:
            dict: Статистика в пересчёте на 90 минут
        """
        if not self.minutes_played or self.minutes_played == 0:
            return {}
        
        multiplier = 90 / self.minutes_played
        
        return {
            'goals_per_90': round((self.goals or 0) * multiplier, 2),
            'assists_per_90': round((self.assists or 0) * multiplier, 2),
            'shots_per_90': round((self.shots or 0) * multiplier, 2),
            'passes_per_90': round((self.passes_total or 0) * multiplier, 2),
            'tackles_per_90': round((self.tackles or 0) * multiplier, 2),
            'interceptions_per_90': round((self.interceptions or 0) * multiplier, 2),
        }
    
    def is_tracked(self) -> bool:
        """Проверка, отслеживается ли игрок"""
        return self.tracking_status != 'non interesting'
    
    def get_main_stats(self) -> dict:
        """Получение основных статистических показателей"""
        return {
            'goals': self.goals or 0,
            'assists': self.assists or 0,
            'shots': self.shots or 0,
            'shots_on_target': self.shots_on_target or 0,
            'passes_total': self.passes_total or 0,
            'passes_accuracy': self.passes_accuracy,
            'minutes_played': self.minutes_played or 0,
        }


class PositionAverages(BaseModel):
    """
    Таблица для хранения средних значений статистики по позициям.
    Используется для сравнения игроков с средними показателями их позиции.
    """
    
    __tablename__ = 'position_averages'
    
    position = Column(
        String(50),
        nullable=False,
        unique=True,
        comment="Игровая позиция"
    )
    
    tournament_id = Column(
        Integer,
        nullable=False,
        comment="ID турнира"
    )
    
    # Средние значения основных показателей per 90
    avg_goals_per_90 = Column(Float, comment="Средние голы per 90")
    avg_assists_per_90 = Column(Float, comment="Средние ассисты per 90") 
    avg_shots_per_90 = Column(Float, comment="Средние удары per 90")
    avg_passes_per_90 = Column(Float, comment="Средние передачи per 90")
    avg_passes_accuracy = Column(Float, comment="Средняя точность передач, %")
    avg_tackles_per_90 = Column(Float, comment="Средние отборы per 90")
    avg_interceptions_per_90 = Column(Float, comment="Средние перехваты per 90")
    avg_duels_success_rate = Column(Float, comment="Средний % выигранных единоборств")
    avg_xg_per_90 = Column(Float, comment="Среднее xG per 90")
    
    # Метаданные
    players_count = Column(Integer, comment="Количество игроков в выборке")
    last_calculated = Column(String(50), comment="Дата последнего расчёта")
    
    __table_args__ = (
        Index('idx_position_tournament', 'position', 'tournament_id'),
    )
    
    def __repr__(self) -> str:
        return f"<PositionAverages(position='{self.position}', tournament={self.tournament_id})>"


class LastRoundStats(BaseModel):
    """
    Таблица для хранения статистики последнего тура.
    При загрузке нового XLSX файла таблица очищается и заполняется заново.
    """
    
    __tablename__ = 'last_round_stats'
    
    # Ссылка на основную запись игрока (копируется из players_stats_raw)
    original_player_id = Column(
        String(36),  # UUID как строка
        comment="ID игрока из основной таблицы"
    )
    
    # Копируем tracking_status из основной таблицы
    tracking_status = Column(
        tracking_status_enum,
        default='non interesting',
        comment="Статус отслеживания (копия из основной таблицы)"
    )
    
    tournament_id = Column(
        Integer,
        nullable=False,
        comment="ID турнира"
    )
    
    # === Вся статистика дублируется из PlayerStatsRaw ===
    # (Для простоты импорта и независимости данных последнего тура)
    
    player_number = Column(Integer, comment="Номер игрока")
    player_name = Column(String(255), nullable=False, comment="Имя игрока")
    team_name = Column(String(255), nullable=False, comment="Команда")
    age = Column(Integer, comment="Возраст")
    height = Column(String(10), comment="Рост")
    weight = Column(String(10), comment="Вес")
    citizenship = Column(String(100), comment="Гражданство")
    player_index = Column(String(50), comment="Индекс игрока")
    minutes_played = Column(Integer, comment="Минуты на поле")
    position = Column(String(50), comment="Позиция")
    
    # Основная статистика
    goals = Column(Integer, default=0, comment="Голы")
    assists = Column(Integer, default=0, comment="Ассисты")
    shots = Column(Integer, default=0, comment="Удары")
    shots_on_target = Column(Integer, default=0, comment="Удары в створ")
    passes_total = Column(Integer, default=0, comment="Передачи")
    passes_accuracy = Column(Float, comment="Точность передач, %")
    yellow_cards = Column(Integer, default=0, comment="Жёлтые карточки")
    red_cards = Column(Integer, default=0, comment="Красные карточки")
    xg = Column(Float, comment="xG")
    
    # Метаданные загрузки
    round_number = Column(Integer, comment="Номер тура")
    upload_timestamp = Column(String(50), comment="Время загрузки файла")
    
    __table_args__ = (
        Index('idx_last_round_player_name', 'player_name'),
        Index('idx_last_round_tournament', 'tournament_id'),
        Index('idx_last_round_tracking', 'tracking_status'),
        Index('idx_last_round_original_id', 'original_player_id'),
    )
    
    def __repr__(self) -> str:
        return f"<LastRoundStats(name='{self.player_name}', tournament={self.tournament_id})>"


