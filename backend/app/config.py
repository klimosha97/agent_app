"""
Конфигурация приложения для анализа статистики футболистов.
Содержит все настройки подключения к БД, пути файлов и другие параметры.
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field, validator


class Settings(BaseSettings):
    """
    Класс настроек приложения.
    Использует pydantic для валидации и загрузки настроек из переменных окружения.
    """
    
    # === Основные настройки приложения ===
    app_name: str = "Football Players Statistics API"
    app_version: str = "1.0.0"
    description: str = "API для анализа статистики футболистов с импортом из Excel"
    environment: str = Field(default="development", description="Окружение запуска")
    debug: bool = Field(default=True, description="Режим отладки")
    
    # === Настройки сервера ===
    host: str = Field(default="0.0.0.0", description="IP адрес для привязки")
    port: int = Field(default=8000, description="Порт для запуска")
    
    # === Настройки базы данных ===
    # Используем заданные пользователем настройки
    db_user: str = Field(default="klim", description="Пользователь БД")
    db_password: str = Field(default="Orel1997", description="Пароль БД")
    db_host: str = Field(default="localhost", description="Хост БД")
    db_port: int = Field(default=5432, description="Порт БД")
    db_name: str = Field(default="football_stats", description="Имя БД")
    
    # URL подключения (может быть переопределён переменной окружения)
    database_url: Optional[str] = Field(default=None, description="Полный URL подключения к БД")
    
    @validator('database_url', pre=True, always=True)
    def build_database_url(cls, v, values):
        """Автоматическое построение URL подключения к БД из отдельных параметров"""
        if v is not None:
            return v
        return (
            f"postgresql://{values.get('db_user')}:{values.get('db_password')}"
            f"@{values.get('db_host')}:{values.get('db_port')}/{values.get('db_name')}"
        )
    
    # === Настройки файлов и загрузок ===
    upload_path: str = Field(default="/uploads", description="Путь для загруженных файлов")
    max_file_size: int = Field(default=10 * 1024 * 1024, description="Максимальный размер файла (10MB)")
    allowed_extensions: list = Field(
        default=[".xlsx", ".xls"], 
        description="Разрешённые расширения файлов"
    )
    
    # === Настройки турниров ===
    tournaments: dict = Field(
        default={
            0: {"name": "МФЛ", "full_name": "Молодёжная Футбольная Лига", "code": "mfl"},
            1: {"name": "ЮФЛ-1", "full_name": "Юношеская Футбольная Лига - 1", "code": "yfl1"},
            2: {"name": "ЮФЛ-2", "full_name": "Юношеская Футбольная Лига - 2", "code": "yfl2"},
            3: {"name": "ЮФЛ-3", "full_name": "Юношеская Футбольная Лига - 3", "code": "yfl3"},
        },
        description="Справочник турниров"
    )
    
    # === Статусы отслеживания игроков ===
    tracking_statuses: dict = Field(
        default={
            "non interesting": "Обычный игрок",
            "interesting": "Интересный игрок", 
            "to watch": "Игрок для наблюдения",
            "my player": "Мой игрок"
        },
        description="Возможные статусы отслеживания игроков"
    )
    
    # === Настройки логирования ===
    log_level: str = Field(default="INFO", description="Уровень логирования")
    log_file: str = Field(default="logs/app.log", description="Файл для логов")
    
    # === Настройки CORS ===
    cors_origins: list = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        description="Разрешённые origins для CORS"
    )
    
    # === Настройки импорта данных ===
    batch_size: int = Field(default=1000, description="Размер batch при импорте данных")
    
    # === Настройки API ===
    api_prefix: str = Field(default="/api", description="Префикс для API роутов")
    
    class Config:
        """Конфигурация pydantic модели"""
        env_file = ".env"  # Файл с переменными окружения
        env_prefix = ""     # Префикс для переменных окружения
        case_sensitive = False
        
    def get_tournament_name(self, tournament_id: int) -> str:
        """Получить название турнира по ID"""
        tournament = self.tournaments.get(tournament_id)
        return tournament["name"] if tournament else f"Unknown Tournament {tournament_id}"
    
    def get_tournament_code(self, tournament_id: int) -> str:
        """Получить код турнира по ID"""
        tournament = self.tournaments.get(tournament_id)
        return tournament["code"] if tournament else f"unknown_{tournament_id}"
    
    def is_valid_tracking_status(self, status: str) -> bool:
        """Проверить валидность статуса отслеживания"""
        return status in self.tracking_statuses
    
    def ensure_upload_directory(self) -> None:
        """Создать директорию для загрузок если её нет"""
        os.makedirs(self.upload_path, exist_ok=True)


# Создаём единственный экземпляр настроек
settings = Settings()

# Создаём директорию для загрузок при импорте модуля
try:
    settings.ensure_upload_directory()
except Exception as e:
    print(f"Warning: Could not create upload directory: {e}")

# Экспортируемые константы для удобства
TOURNAMENTS = settings.tournaments
TRACKING_STATUSES = settings.tracking_statuses
DATABASE_URL = settings.database_url
UPLOAD_PATH = settings.upload_path


