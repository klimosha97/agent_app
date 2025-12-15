-- Инициализация базы данных для приложения статистики футболистов
-- Этот скрипт выполняется автоматически при первом запуске PostgreSQL контейнера

-- Создание расширений для работы с UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Создание пользовательских типов данных

-- Enum для статусов отслеживания игроков
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tracking_status_enum') THEN
        CREATE TYPE tracking_status_enum AS ENUM (
            'non interesting',  -- обычный игрок (по умолчанию)
            'interesting',      -- интересный игрок  
            'to watch',         -- игрок для наблюдения
            'my player'         -- мой игрок
        );
    END IF;
END$$;

-- Enum для типа статистики
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stat_type_enum') THEN
        CREATE TYPE stat_type_enum AS ENUM (
            'total',      -- Всего за сезон/тур
            'avg_match',  -- В среднем за матч
            'avg_90min'   -- В среднем за 90 минут
        );
    END IF;
END$$;

-- Enum для турниров
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_enum') THEN
        CREATE TYPE tournament_enum AS ENUM (
            'mfl',    -- 0 = МФЛ
            'yfl1',   -- 1 = ЮФЛ-1
            'yfl2',   -- 2 = ЮФЛ-2
            'yfl3'    -- 3 = ЮФЛ-3
        );
    END IF;
END$$;

-- Функция для обновления updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Базовая таблица-справочник турниров
CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    short_code VARCHAR(10) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    current_round INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Триггер для обновления updated_at в tournaments
DROP TRIGGER IF EXISTS update_tournaments_updated_at ON tournaments;
CREATE TRIGGER update_tournaments_updated_at
    BEFORE UPDATE ON tournaments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Заполнение справочника турниров
INSERT INTO tournaments (id, name, full_name, short_code, current_round) VALUES
(0, 'МФЛ', 'Молодежная Футбольная Лига', 'MFL', 0),
(1, 'ЮФЛ-1', 'Юношеская Футбольная Лига - Первенство 1', 'YFL1', 0),
(2, 'ЮФЛ-2', 'Юношеская Футбольная Лига - Первенство 2', 'YFL2', 0),
(3, 'ЮФЛ-3', 'Юношеская Футбольная Лига - Первенство 3', 'YFL3', 0)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    full_name = EXCLUDED.full_name,
    short_code = EXCLUDED.short_code;

-- Комментарии
COMMENT ON DATABASE football_stats IS 'База данных для хранения и анализа статистики футболистов';
COMMENT ON SCHEMA public IS 'Основная схема для таблиц статистики игроков';
COMMENT ON TABLE tournaments IS 'Справочник турниров/лиг';

-- Создание роли только для чтения (для аналитики)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'football_readonly') THEN
        CREATE ROLE football_readonly;
        GRANT CONNECT ON DATABASE football_stats TO football_readonly;
        GRANT USAGE ON SCHEMA public TO football_readonly;
    END IF;
END$$;

-- Логирование успешной инициализации
DO $$
BEGIN
    RAISE NOTICE 'Football Stats Database initialized successfully!';
    RAISE NOTICE 'Database: football_stats';
    RAISE NOTICE 'User: klim';
    RAISE NOTICE 'Tournaments loaded: % rows', (SELECT COUNT(*) FROM tournaments);
END$$;
