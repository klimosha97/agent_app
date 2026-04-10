"""
Главный файл FastAPI приложения для анализа статистики футболистов.
Настраивает приложение, подключает роутеры, middleware и обработчики.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import time
import uvicorn

# Импорты приложения
from app.config import settings
from app.database import check_database_connection, wait_for_database

# Настраиваем логирование
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Контекстный менеджер для управления жизненным циклом приложения.
    Выполняет инициализацию при запуске и очистку при остановке.
    """
    # === Инициализация при запуске ===
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Debug mode: {settings.debug}")
    
    # Проверяем подключение к базе данных
    if not wait_for_database(max_retries=10, delay=2):
        logger.error("Failed to connect to database, exiting...")
        raise RuntimeError("Database connection failed")
    
    # Синхронизируем конфигурацию метрик по позициям из POSITION_INFO.txt
    try:
        from app.database import create_db_session
        from app.services.position_metrics import sync_position_metrics
        from sqlalchemy import text
        session = create_db_session()
        try:
            result = sync_position_metrics(session)
            logger.info(f"Position metrics synced: {result}")
            # Ensure watched_players table exists
            session.execute(text("""
                CREATE TABLE IF NOT EXISTS watched_players (
                    id SERIAL PRIMARY KEY,
                    player_id INTEGER NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
                    list_type VARCHAR(20) NOT NULL CHECK (list_type IN ('MY', 'TRACKED')),
                    notes TEXT,
                    added_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(player_id, list_type)
                )
            """))
            session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_watched_list_type ON watched_players(list_type)
            """))
            session.execute(text("""
                CREATE TABLE IF NOT EXISTS round_appearances (
                    id SERIAL PRIMARY KEY,
                    player_id INTEGER NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
                    tournament_id INTEGER NOT NULL,
                    season VARCHAR(10) NOT NULL,
                    round_number INTEGER NOT NULL,
                    minutes_before DOUBLE PRECISION DEFAULT 0,
                    minutes_after DOUBLE PRECISION DEFAULT 0,
                    is_debut BOOLEAN DEFAULT FALSE,
                    recorded_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(player_id, tournament_id, season, round_number)
                )
            """))
            session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_ra_tournament_round
                ON round_appearances(tournament_id, season, round_number)
            """))
            session.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_reviews (
                    id SERIAL PRIMARY KEY,
                    tournament_id INT NOT NULL,
                    round_number INT,
                    review_type VARCHAR(50) NOT NULL,
                    player_ids INT[],
                    content JSONB NOT NULL,
                    data_hash VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_ai_reviews_lookup
                ON ai_reviews(tournament_id, round_number, review_type, data_hash)
            """))
            session.commit()
            logger.info("watched_players + round_appearances + ai_reviews tables ensured")
        finally:
            session.close()
    except Exception as e:
        logger.warning(f"Could not sync position metrics on startup: {e}")
    
    logger.info("Application startup completed")
    
    # Приложение работает...
    yield
    
    # === Очистка при остановке ===
    logger.info("Application shutdown initiated")
    logger.info("Cleanup completed")


# Создаём экземпляр FastAPI приложения
app = FastAPI(
    title=settings.app_name,
    description=settings.description,
    version=settings.app_version,
    lifespan=lifespan,
    # Настройки документации
    docs_url="/docs" if settings.debug else None,  # Отключаем в продакшене
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)


# === Настройка CORS ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# === Middleware для логирования запросов ===
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Middleware для логирования всех HTTP запросов.
    Записывает URL, метод, время выполнения и статус ответа.
    """
    start_time = time.time()
    
    # Выполняем запрос
    response = await call_next(request)
    
    # Вычисляем время выполнения
    process_time = time.time() - start_time
    
    # Логируем информацию о запросе
    logger.info(
        f"Request: {request.method} {request.url} | "
        f"Status: {response.status_code} | "
        f"Time: {process_time:.3f}s"
    )
    
    # Добавляем заголовок с временем выполнения
    response.headers["X-Process-Time"] = str(process_time)
    
    return response


# === Глобальные обработчики ошибок ===
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Обработчик HTTP ошибок с логированием"""
    logger.warning(f"HTTP {exc.status_code}: {exc.detail} | URL: {request.url}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.detail,
            "status_code": exc.status_code,
            "path": str(request.url)
        }
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """Обработчик внутренних ошибок сервера"""
    logger.error(f"Internal error: {exc} | URL: {request.url}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "message": "Internal server error",
            "status_code": 500,
            "path": str(request.url)
        }
    )


# === Базовые маршруты ===
@app.get("/", tags=["Root"])
async def root():
    """
    Корневой маршрут - информация о приложении.
    """
    return {
        "message": f"Welcome to {settings.app_name}!",
        "version": settings.app_version,
        "environment": settings.environment,
        "docs_url": "/docs" if settings.debug else "disabled",
        "status": "running"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Проверка состояния приложения и подключения к БД.
    Используется для мониторинга и load balancer'ов.
    """
    # Проверяем подключение к базе данных
    db_healthy = check_database_connection()
    
    status = "healthy" if db_healthy else "unhealthy"
    status_code = 200 if db_healthy else 503
    
    return JSONResponse(
        status_code=status_code,
        content={
            "status": status,
            "database": "connected" if db_healthy else "disconnected",
            "timestamp": time.time(),
            "version": settings.app_version
        }
    )


@app.get("/info", tags=["Info"])
async def app_info():
    """
    Информация о конфигурации приложения.
    Доступно только в режиме отладки.
    """
    if not settings.debug:
        raise HTTPException(status_code=404, detail="Not found")
    
    return {
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "debug": settings.debug,
        "database_url": settings.database_url.replace(settings.db_password, "***"),
        "upload_path": settings.upload_path,
        "tournaments": settings.tournaments,
        "tracking_statuses": settings.tracking_statuses,
    }


# === Подключение API роутеров ===
from app.api import players, tournaments, upload, analysis, ai_agent

app.include_router(players.router, prefix=settings.api_prefix, tags=["Players"])
app.include_router(tournaments.router, prefix=settings.api_prefix, tags=["Tournaments"])  
app.include_router(upload.router, prefix=settings.api_prefix, tags=["Upload"])
app.include_router(analysis.router, prefix=settings.api_prefix, tags=["Analysis"])
app.include_router(ai_agent.router, prefix=settings.api_prefix, tags=["AI Agent"])


# === Статические файлы (для загруженных Excel файлов) ===
try:
    app.mount("/uploads", StaticFiles(directory=settings.upload_path), name="uploads")
    logger.info(f"Static files mounted at /uploads -> {settings.upload_path}")
except Exception as e:
    logger.warning(f"Could not mount static files: {e}")


# === Запуск приложения ===
if __name__ == "__main__":
    # Запуск для разработки
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
        access_log=True
    )
