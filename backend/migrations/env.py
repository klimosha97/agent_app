"""
Alembic environment configuration.
Этот файл настраивает окружение для выполнения миграций.
"""

import logging
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Добавляем путь к приложению для импорта моделей
sys.path.append(str(Path(__file__).resolve().parents[1]))

# Импортируем настройки и модели
from app.config import settings
from app.models.base import Base
from app.models.player import PlayerStatsRaw, PositionAverages, LastRoundStats

# Настройка Alembic Config object
config = context.config

# Переопределяем URL подключения из настроек приложения
config.set_main_option("sqlalchemy.url", settings.database_url)

# Настраиваем логирование если файл конфигурации существует
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Целевые метаданные для автогенерации
target_metadata = Base.metadata

# Дополнительные настройки
logger = logging.getLogger('alembic.env')


def include_object(object, name, type_, reflected, compare_to):
    """
    Функция для фильтрации объектов при автогенерации миграций.
    
    Args:
        object: Объект базы данных
        name: Имя объекта  
        type_: Тип объекта ('table', 'column', 'index', etc.)
        reflected: Булево значение - отражён ли объект из БД
        compare_to: Объект для сравнения
        
    Returns:
        bool: True если объект должен быть включён в миграцию
    """
    
    # Исключаем системные таблицы PostgreSQL
    if type_ == "table" and name.startswith("pg_"):
        return False
        
    # Исключаем таблицы информационной схемы
    if type_ == "table" and name.startswith("information_schema"):
        return False
    
    # Исключаем служебные таблицы Alembic
    if type_ == "table" and name == "alembic_version":
        return False
    
    # Логируем включённые объекты в debug режиме
    if settings.debug:
        logger.debug(f"Including {type_} '{name}' in migration")
    
    return True


def compare_type(context, inspected_column, metadata_column, inspected_type, metadata_type):
    """
    Функция для сравнения типов колонок при автогенерации.
    Помогает избежать ложных изменений типов.
    """
    
    # Особая обработка для ENUM типов
    if hasattr(metadata_type, 'enums'):
        return False
    
    # Игнорируем различия в размерах VARCHAR если они разумные
    if (hasattr(inspected_type, 'length') and hasattr(metadata_type, 'length') and
        inspected_type.length and metadata_type.length):
        if abs(inspected_type.length - metadata_type.length) < 50:
            return False
    
    # По умолчанию используем стандартное сравнение
    return None


def run_migrations_offline() -> None:
    """
    Выполнение миграций в 'offline' режиме.
    
    В этом режиме нам нужен только URL подключения, а не сам Engine,
    хотя Engine также подходит. Генерируем SQL скрипт для выполнения
    изменений структуры БД.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=compare_type,
        compare_server_default=True,
        render_as_batch=False,  # PostgreSQL не требует batch режима
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Выполнение миграций в 'online' режиме.
    
    В этом режиме создаём Engine и связываем соединение с контекстом.
    Выполняем миграции непосредственно в базе данных.
    """
    
    # Создаём конфигурацию для подключения
    configuration = config.get_section(config.config_ini_section)
    configuration['sqlalchemy.url'] = settings.database_url
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=compare_type,
            compare_server_default=True,
            render_as_batch=False,
        )

        with context.begin_transaction():
            context.run_migrations()


# Определяем режим выполнения и запускаем соответствующую функцию
if context.is_offline_mode():
    logger.info("Running migrations in OFFLINE mode")
    run_migrations_offline()
else:
    logger.info("Running migrations in ONLINE mode")
    run_migrations_online()


