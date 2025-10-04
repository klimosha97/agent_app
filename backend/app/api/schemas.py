"""
Pydantic схемы для API запросов и ответов.
Определяют структуру данных, валидацию и сериализацию.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, field_validator
from enum import Enum


class TrackingStatus(str, Enum):
    """Enum для статусов отслеживания игроков"""
    NON_INTERESTING = "non interesting"
    INTERESTING = "interesting" 
    TO_WATCH = "to watch"
    MY_PLAYER = "my player"


class TournamentEnum(int, Enum):
    """Enum для турниров"""
    MFL = 0
    YFL1 = 1
    YFL2 = 2
    YFL3 = 3


# === Базовые схемы ===

class BaseResponse(BaseModel):
    """Базовая схема для всех ответов API"""
    success: bool = True
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)


class ErrorResponse(BaseModel):
    """Схема для ошибок API"""
    success: bool = False
    error: str
    message: str
    status_code: int
    details: Optional[Dict[str, Any]] = None


# === Схемы для игроков ===

class PlayerBase(BaseModel):
    """Базовая информация об игроке"""
    player_name: str = Field(..., description="Имя игрока")
    team_name: str = Field(..., description="Команда")
    position: Optional[str] = Field(None, description="Позиция")
    age: Optional[int] = Field(None, ge=14, le=50, description="Возраст")
    minutes_played: Optional[int] = Field(None, ge=0, description="Минуты на поле")


class PlayerStats(BaseModel):
    """Основная статистика игрока"""
    goals: Optional[int] = Field(0, ge=0, description="Голы")
    assists: Optional[int] = Field(0, ge=0, description="Ассисты")
    shots: Optional[int] = Field(0, ge=0, description="Удары")
    shots_on_target: Optional[int] = Field(0, ge=0, description="Удары в створ")
    passes_total: Optional[int] = Field(0, ge=0, description="Передачи всего")
    passes_accuracy: Optional[float] = Field(None, ge=0, le=100, description="Точность передач, %")
    tackles: Optional[int] = Field(0, ge=0, description="Отборы")
    tackles_success_rate: Optional[float] = Field(None, ge=0, le=100, description="Отборы удачные, %")
    interceptions: Optional[int] = Field(0, ge=0, description="Перехваты")
    yellow_cards: Optional[int] = Field(0, ge=0, description="Жёлтые карточки")
    red_cards: Optional[int] = Field(0, ge=0, description="Красные карточки")
    xg: Optional[float] = Field(None, ge=0, description="xG (ожидаемые голы)")
    
    # Дополнительные голевые показатели
    goal_attempts: Optional[int] = Field(0, ge=0, description="Голевые моменты")
    goal_attempts_successful: Optional[int] = Field(0, ge=0, description="Голевые моменты удачные")
    goal_attempts_success_rate: Optional[float] = Field(None, ge=0, le=100, description="Голевые моменты удачные, %")
    goal_moments_created: Optional[int] = Field(0, ge=0, description="Голевые моменты создал")
    goal_attacks_participation: Optional[int] = Field(0, ge=0, description="Участие в голевых атаках")
    goal_errors: Optional[int] = Field(0, ge=0, description="Голевые ошибки")
    rough_errors: Optional[int] = Field(0, ge=0, description="Грубые ошибки")
    fouls_committed: Optional[int] = Field(0, ge=0, description="Фолы совершённые")
    fouls_suffered: Optional[int] = Field(0, ge=0, description="Фолы на игроке")
    
    # Передачи
    passes_key: Optional[int] = Field(0, ge=0, description="Передачи ключевые")
    passes_key_accuracy: Optional[float] = Field(None, ge=0, le=100, description="Передачи ключевые точные, %")
    crosses: Optional[int] = Field(0, ge=0, description="Навесы")
    crosses_accuracy: Optional[float] = Field(None, ge=0, le=100, description="Навесы точные, %")
    passes_progressive: Optional[int] = Field(0, ge=0, description="Передачи прогрессивные")
    passes_progressive_accuracy: Optional[float] = Field(None, ge=0, le=100, description="Передачи прогрессивные точные, %")
    passes_progressive_clean: Optional[int] = Field(0, ge=0, description="Передачи прогрессивные чистые")
    passes_long: Optional[int] = Field(0, ge=0, description="Передачи длинные")
    passes_long_accuracy: Optional[float] = Field(None, ge=0, le=100, description="Передачи длинные точные, %")
    passes_super_long: Optional[int] = Field(0, ge=0, description="Передачи сверхдлинные")
    passes_super_long_accuracy: Optional[float] = Field(None, ge=0, le=100, description="Передачи сверхдлинные точные, %")
    passes_final_third: Optional[int] = Field(0, ge=0, description="Передачи в финальную треть")
    passes_final_third_accuracy: Optional[float] = Field(None, ge=0, le=100, description="Передачи в финальную треть точные, %")
    passes_penalty_area: Optional[int] = Field(0, ge=0, description="Передачи в штрафную")
    passes_penalty_area_accuracy: Optional[float] = Field(None, ge=0, le=100, description="Передачи в штрафную точные, %")
    passes_for_shot: Optional[int] = Field(0, ge=0, description="Передачи под удар")
    
    # Единоборства
    duels_total: Optional[int] = Field(0, ge=0, description="Единоборства всего")
    duels_success_rate: Optional[float] = Field(None, ge=0, le=100, description="Единоборства удачные, %")
    duels_defensive: Optional[int] = Field(0, ge=0, description="Единоборства в обороне")
    duels_defensive_success_rate: Optional[float] = Field(None, ge=0, le=100, description="Единоборства в обороне удачные, %")
    duels_offensive: Optional[int] = Field(0, ge=0, description="Единоборства в атаке")
    duels_offensive_success_rate: Optional[float] = Field(None, ge=0, le=100, description="Единоборства в атаке удачные, %")
    duels_aerial: Optional[int] = Field(0, ge=0, description="Единоборства вверху")
    duels_aerial_success_rate: Optional[float] = Field(None, ge=0, le=100, description="Единоборства вверху удачные, %")
    
    # Обводки
    dribbles: Optional[int] = Field(0, ge=0, description="Обводки")
    dribbles_success_rate: Optional[float] = Field(None, ge=0, le=100, description="Обводки удачные, %")
    dribbles_final_third: Optional[int] = Field(0, ge=0, description="Обводки в финальной трети")
    dribbles_final_third_success_rate: Optional[float] = Field(None, ge=0, le=100, description="Обводки в финальной трети удачные, %")
    
    # Оборона
    recoveries: Optional[int] = Field(0, ge=0, description="Подборы")
    
    @field_validator(
        'passes_accuracy', 'xg', 'tackles_success_rate', 
        'goal_attempts_success_rate', 'passes_key_accuracy', 'crosses_accuracy',
        'passes_progressive_accuracy', 'passes_long_accuracy', 'passes_super_long_accuracy',
        'passes_final_third_accuracy', 'passes_penalty_area_accuracy',
        'duels_success_rate', 'duels_defensive_success_rate', 'duels_offensive_success_rate',
        'duels_aerial_success_rate', 'dribbles_success_rate', 'dribbles_final_third_success_rate',
        mode='before'
    )
    @classmethod
    def validate_float_values(cls, v):
        """Заменяет NaN и Infinity на None для корректной JSON сериализации"""
        if v is None:
            return None
        try:
            import math
            if math.isnan(v) or math.isinf(v):
                return None
            return v
        except (TypeError, ValueError):
            return None


class PlayerCreate(PlayerBase, PlayerStats):
    """Схема для создания нового игрока"""
    tournament_id: int = Field(..., ge=0, le=3, description="ID турнира")
    tracking_status: TrackingStatus = TrackingStatus.NON_INTERESTING


class PlayerUpdate(BaseModel):
    """Схема для обновления игрока"""
    player_name: Optional[str] = None
    team_name: Optional[str] = None
    position: Optional[str] = None
    tracking_status: Optional[TrackingStatus] = None
    notes: Optional[str] = None


class PlayerResponse(PlayerBase, PlayerStats):
    """Схема ответа с данными игрока"""
    id: UUID
    tournament_id: int
    tracking_status: TrackingStatus
    player_number: Optional[int] = None
    height: Optional[str] = None
    weight: Optional[str] = None
    citizenship: Optional[str] = None
    player_index: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PlayerListResponse(BaseResponse):
    """Ответ со списком игроков"""
    data: List[PlayerResponse]
    total: int
    page: int = 1
    per_page: int = 50


class PlayerDetailResponse(BaseResponse):
    """Ответ с подробной информацией об игроке"""
    data: PlayerResponse


# === Схемы для турниров ===

class TournamentInfo(BaseModel):
    """Информация о турнире"""
    id: int
    name: str
    full_name: str
    code: str
    players_count: int = 0
    last_update: Optional[datetime] = None


class TournamentListResponse(BaseResponse):
    """Ответ со списком турниров"""
    data: List[TournamentInfo]


# === Схемы для загрузки файлов ===

class FileUploadResponse(BaseResponse):
    """Ответ на загрузку Excel файла"""
    file_name: str
    tournament_id: int
    total_rows: int
    main_table: Optional[Dict[str, int]] = None  # {"added": 10, "updated": 5}
    last_round_table: Optional[Dict[str, int]] = None  # {"added": 15}
    duration_seconds: float
    upload_time: datetime


class ImportHistoryItem(BaseModel):
    """Элемент истории импорта"""
    id: UUID
    file_name: str
    tournament_id: int
    status: str  # success, error
    total_rows: Optional[int] = None
    error_message: Optional[str] = None
    created_at: datetime


class ImportHistoryResponse(BaseResponse):
    """История импорта файлов"""
    data: List[ImportHistoryItem]


# === Схемы для статистики и аналитики ===

class PlayerPerformance(BaseModel):
    """Топ выступление игрока"""
    id: UUID
    player_name: str
    team_name: str
    position: Optional[str]
    tournament_id: int
    metric_value: float  # Значение метрики (голы, ассисты и т.д.)
    minutes_played: Optional[int]
    per_90_value: Optional[float] = None  # Значение в пересчёте на 90 минут


class TopPerformersResponse(BaseResponse):
    """Топ игроки по различным метрикам"""
    goals: List[PlayerPerformance] = Field(default_factory=list)
    assists: List[PlayerPerformance] = Field(default_factory=list)
    shots: List[PlayerPerformance] = Field(default_factory=list)
    passes: List[PlayerPerformance] = Field(default_factory=list)
    period: str = "all_time"  # all_time, last_round, current_season


class PositionAverageResponse(BaseModel):
    """Средние показатели по позиции"""
    position: str
    tournament_id: int
    avg_goals_per_90: Optional[float] = None
    avg_assists_per_90: Optional[float] = None
    avg_shots_per_90: Optional[float] = None
    avg_passes_per_90: Optional[float] = None
    avg_passes_accuracy: Optional[float] = None
    players_count: int
    last_calculated: Optional[str] = None


# === Схемы для фильтрации и поиска ===

class PlayerFilters(BaseModel):
    """Фильтры для поиска игроков"""
    tournament_id: Optional[int] = Field(None, ge=0, le=3)
    team_name: Optional[str] = None
    position: Optional[str] = None
    tracking_status: Optional[TrackingStatus] = None
    min_goals: Optional[int] = Field(None, ge=0)
    min_assists: Optional[int] = Field(None, ge=0)
    min_minutes: Optional[int] = Field(None, ge=0)
    search_query: Optional[str] = None  # Поиск по имени игрока


class SortOptions(BaseModel):
    """Опции сортировки"""
    field: str = "player_name"
    order: str = Field("asc", pattern="^(asc|desc)$")
    
    @field_validator('field')
    def validate_field(cls, v):
        allowed_fields = [
            'player_name', 'team_name', 'position', 'goals', 'assists',
            'shots', 'passes_total', 'minutes_played', 'created_at'
        ]
        if v not in allowed_fields:
            raise ValueError(f'Field must be one of: {", ".join(allowed_fields)}')
        return v


class PaginationParams(BaseModel):
    """Параметры пагинации"""
    page: int = Field(1, ge=1, description="Номер страницы")
    per_page: int = Field(50, ge=1, le=500, description="Количество на странице")


# === Схемы для обновления статуса игрока ===

class PlayerStatusUpdate(BaseModel):
    """Обновление статуса отслеживания игрока"""
    tracking_status: TrackingStatus
    notes: Optional[str] = Field(None, max_length=1000, description="Заметки")


class PlayerStatusResponse(BaseResponse):
    """Ответ на обновление статуса"""
    player_id: UUID
    new_status: TrackingStatus
    previous_status: TrackingStatus


# === Схемы для поиска игроков ===

class PlayerSearchResult(BaseModel):
    """Результат поиска игрока"""
    id: UUID
    player_name: str
    team_name: str
    position: Optional[str]
    tournament_id: int
    current_status: TrackingStatus
    basic_stats: Dict[str, Any]  # Основная статистика для preview


class PlayerSearchResponse(BaseResponse):
    """Ответ на поиск игроков"""
    query: str
    results: List[PlayerSearchResult]
    total_found: int


# === Утилитарные схемы ===

class BulkOperationResponse(BaseResponse):
    """Ответ на массовые операции"""
    processed: int
    successful: int
    failed: int
    errors: List[str] = Field(default_factory=list)


class HealthCheckResponse(BaseModel):
    """Ответ проверки здоровья приложения"""
    status: str
    database: str
    timestamp: float
    version: str


# === Дополнительные валидаторы ===

def validate_tournament_id(v):
    """Валидатор для ID турнира"""
    if v not in [0, 1, 2, 3]:
        raise ValueError('Tournament ID must be 0 (МФЛ), 1 (ЮФЛ-1), 2 (ЮФЛ-2), or 3 (ЮФЛ-3)')
    return v


