"""
Модуль для настройки подключения к базе данных.
Содержит конфигурацию SQLAlchemy, создание сессий и утилиты для работы с БД.
"""

import logging
from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from typing import Generator
import time

from app.config import settings

# Настраиваем логгер
logger = logging.getLogger(__name__)

# === Конфигурация движка базы данных ===

# Дополнительные параметры для PostgreSQL
DATABASE_CONFIG = {
    "pool_size": 10,           # Количество постоянных соединений в пуле
    "max_overflow": 20,        # Максимальное количество дополнительных соединений
    "pool_pre_ping": True,     # Проверка соединения перед использованием
    "pool_recycle": 3600,      # Время жизни соединения в секундах (1 час)
    "echo": settings.debug,    # Логирование SQL запросов в debug режиме
}

# Создание движка базы данных
engine = create_engine(
    settings.database_url,
    **DATABASE_CONFIG
)

# Фабрика сессий
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Базовый класс для всех моделей
Base = declarative_base()


# === Утилиты для работы с сессиями ===

def get_db() -> Generator[Session, None, None]:
    """
    Dependency для получения сессии базы данных в FastAPI endpoints.
    
    Yields:
        Session: Сессия базы данных
        
    Example:
        @app.get("/players/")
        def get_players(db: Session = Depends(get_db)):
            return db.query(Player).all()
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def create_db_session() -> Session:
    """
    Создать новую сессию базы данных для использования вне FastAPI.
    
    Returns:
        Session: Новая сессия базы данных
        
    Note:
        Не забудьте закрыть сессию после использования: session.close()
        
    Example:
        session = create_db_session()
        try:
            players = session.query(Player).all()
            # работаем с данными
        finally:
            session.close()
    """
    return SessionLocal()


# === События и хуки для логирования ===

@event.listens_for(engine, "connect")
def receive_connect(dbapi_connection, connection_record):
    """Событие при подключении к БД - логируем подключение"""
    logger.info("Connected to database")


@event.listens_for(engine, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy):
    """Событие при получении соединения из пула - логируем в debug режиме"""
    if settings.debug:
        logger.debug("Connection checked out from pool")


@event.listens_for(engine, "checkin")
def receive_checkin(dbapi_connection, connection_record):
    """Событие при возврате соединения в пул - логируем в debug режиме"""
    if settings.debug:
        logger.debug("Connection checked in to pool")


# === Утилиты для инициализации и проверки БД ===

def check_database_connection() -> bool:
    """
    Проверить подключение к базе данных.
    
    Returns:
        bool: True если подключение успешно, False в противном случае
        
    Example:
        if not check_database_connection():
            logger.error("Cannot connect to database!")
            exit(1)
    """
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        logger.info("Database connection is healthy")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False


def wait_for_database(max_retries: int = 30, delay: int = 1) -> bool:
    """
    Ждать готовности базы данных (полезно при запуске в Docker).
    
    Args:
        max_retries: Максимальное количество попыток
        delay: Задержка между попытками в секундах
        
    Returns:
        bool: True если БД готова, False если превышено количество попыток
        
    Example:
        if not wait_for_database():
            logger.error("Database is not ready after multiple attempts")
            exit(1)
    """
    for attempt in range(max_retries):
        if check_database_connection():
            return True
        
        logger.warning(f"Database not ready, attempt {attempt + 1}/{max_retries}")
        time.sleep(delay)
    
    logger.error(f"Database not ready after {max_retries} attempts")
    return False


def create_tables() -> bool:
    """
    Создать все таблицы в базе данных.
    
    Returns:
        bool: True если таблицы созданы успешно
        
    Note:
        Обычно используется только для тестирования.
        В продакшене используйте Alembic миграции.
        
    Example:
        if create_tables():
            logger.info("All tables created successfully")
    """
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")
        return False


# === Контекстный менеджер для транзакций ===

class DatabaseTransaction:
    """
    Контекстный менеджер для работы с транзакциями.
    
    Example:
        with DatabaseTransaction() as session:
            player = Player(name="Test Player")
            session.add(player)
            # Транзакция будет автоматически зафиксирована
        # При ошибке транзакция будет отменена
    """
    
    def __init__(self):
        self.session = None
    
    def __enter__(self) -> Session:
        self.session = SessionLocal()
        return self.session
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            # Произошла ошибка - откатываем транзакцию
            self.session.rollback()
            logger.error(f"Transaction rolled back due to error: {exc_val}")
        else:
            # Всё прошло успешно - фиксируем транзакцию
            try:
                self.session.commit()
            except Exception as e:
                self.session.rollback()
                logger.error(f"Failed to commit transaction: {e}")
                raise
        
        self.session.close()


# === Логирование конфигурации при импорте ===

if settings.debug:
    logger.info(f"Database configuration:")
    logger.info(f"  URL: {settings.database_url}")
    logger.info(f"  Pool size: {DATABASE_CONFIG['pool_size']}")
    logger.info(f"  Max overflow: {DATABASE_CONFIG['max_overflow']}")
    logger.info(f"  Echo SQL: {DATABASE_CONFIG['echo']}")

# Экспортируемые объекты
__all__ = [
    "Base",
    "engine", 
    "SessionLocal",
    "get_db",
    "create_db_session",
    "check_database_connection",
    "wait_for_database",
    "create_tables",
    "DatabaseTransaction"
]


