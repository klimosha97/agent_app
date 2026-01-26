-- ============================================
-- СХЕМА БД ДЛЯ АНАЛИТИКИ ФУТБОЛЬНЫХ СТАТИСТИК
-- ============================================
-- Философия: игрок = (турнир, команда, сезон)
-- Без трансферов, без карьерной логики
-- ============================================

-- 1. ПОЗИЦИИ
-- ============================================
CREATE TABLE IF NOT EXISTS positions (
    position_id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,  -- 'Ф Ц', 'АП Л', 'З ПЦ' и т.д.
    group_code VARCHAR(10) NOT NULL,    -- 'ATT', 'MID', 'DEF'
    display_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Справочник позиций (из mfl.xlsx)
INSERT INTO positions (code, group_code, display_name) VALUES
    -- Форварды (ATT)
    ('Ф Ц', 'ATT', 'Форвард центральный'),
    ('Ф ЛЦ', 'ATT', 'Форвард левоцентральный'),
    ('Ф ПЦ', 'ATT', 'Форвард правоцентральный'),
    
    -- Атакующие полузащитники (ATT)
    ('АП Ц', 'ATT', 'Атакующий полузащитник центральный'),
    ('АП Л', 'ATT', 'Атакующий полузащитник левый'),
    ('АП П', 'ATT', 'Атакующий полузащитник правый'),
    ('АП ЛЦ', 'ATT', 'Атакующий полузащитник левоцентральный'),
    ('АП ПЦ', 'ATT', 'Атакующий полузащитник правоцентральный'),
    
    -- Полузащитники (MID)
    ('П Ц', 'MID', 'Полузащитник центральный'),
    ('П Л', 'MID', 'Полузащитник левый'),
    ('П П', 'MID', 'Полузащитник правый'),
    ('П ЛЦ', 'MID', 'Полузащитник левоцентральный'),
    ('П ПЦ', 'MID', 'Полузащитник правоцентральный'),
    
    -- Защитные полузащитники (DEF)
    ('ЗП Ц', 'DEF', 'Защитный полузащитник центральный'),
    ('ЗП Л', 'DEF', 'Защитный полузащитник левый'),
    ('ЗП П', 'DEF', 'Защитный полузащитник правый'),
    ('ЗП ЛЦ', 'DEF', 'Защитный полузащитник левоцентральный'),
    ('ЗП ПЦ', 'DEF', 'Защитный полузащитник правоцентральный'),
    
    -- Защитники (DEF)
    ('З Ц', 'DEF', 'Защитник центральный'),
    ('З Л', 'DEF', 'Защитник левый'),
    ('З П', 'DEF', 'Защитник правый'),
    ('З ЛЦ', 'DEF', 'Защитник левоцентральный'),
    ('З ПЦ', 'DEF', 'Защитник правоцентральный')
ON CONFLICT (code) DO NOTHING;


-- 2. ТУРНИРЫ (уже существует, но добавляем season)
-- ============================================
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS season VARCHAR(10) DEFAULT '2025';

COMMENT ON TABLE tournaments IS 'Турниры и их текущее состояние';
COMMENT ON COLUMN tournaments.season IS 'Сезон = год: "2025", "2026" и т.д.';
COMMENT ON COLUMN tournaments.current_round IS 'Последний завершенный тур';


-- 3. ИГРОКИ
-- ============================================
-- Игрок = уникальная сущность в контексте (турнир, команда, сезон)
CREATE TABLE IF NOT EXISTS players (
    player_id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    birth_year INTEGER,
    team_name VARCHAR(255) NOT NULL,
    position_id INTEGER REFERENCES positions(position_id),
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    
    -- Дополнительные поля из файла
    height INTEGER,
    weight INTEGER,
    citizenship VARCHAR(100),
    
    -- Служебные
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- УНИКАЛЬНОСТЬ: один игрок в турнире/команде
    CONSTRAINT unique_player_in_tournament 
        UNIQUE (full_name, birth_year, team_name, tournament_id)
);

CREATE INDEX idx_players_tournament ON players(tournament_id);
CREATE INDEX idx_players_team ON players(team_name);
CREATE INDEX idx_players_position ON players(position_id);
CREATE INDEX idx_players_name ON players(full_name);

COMMENT ON TABLE players IS 'Игроки в контексте турнира и команды (без склейки между сезонами)';
COMMENT ON CONSTRAINT unique_player_in_tournament ON players IS 'Запрещает дубли игрока в одной команде одного турнира';


-- 4. СЛАЙСЫ СТАТИСТИКИ
-- ============================================
-- Описание среза данных: TOTAL/PER90 + SEASON/ROUND
CREATE TABLE IF NOT EXISTS stat_slices (
    slice_id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    
    -- Тип статистики
    slice_type VARCHAR(10) NOT NULL CHECK (slice_type IN ('TOTAL', 'PER90')),
    
    -- Период
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('SEASON', 'ROUND')),
    
    -- Диапазон туров (например "1-15" или "16")
    period_value VARCHAR(50) NOT NULL,
    
    -- Метаданные
    description TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- УНИКАЛЬНОСТЬ: один слайс на комбинацию параметров
    CONSTRAINT unique_slice 
        UNIQUE (tournament_id, slice_type, period_type, period_value)
);

CREATE INDEX idx_slices_tournament ON stat_slices(tournament_id);
CREATE INDEX idx_slices_type ON stat_slices(slice_type, period_type);

COMMENT ON TABLE stat_slices IS 'Описание срезов статистики (TOTAL/PER90, SEASON/ROUND)';
COMMENT ON COLUMN stat_slices.slice_type IS 'TOTAL = суммарная, PER90 = за 90 минут';
COMMENT ON COLUMN stat_slices.period_type IS 'SEASON = за несколько туров, ROUND = один тур';
COMMENT ON COLUMN stat_slices.period_value IS 'Для SEASON: год ("2025"), для ROUND: номер тура ("16")';


-- 5. СТАТИСТИКА ИГРОКОВ (ГЛАВНАЯ ТАБЛИЦА)
-- ============================================
-- ВСЯ статистика хранится здесь в формате EAV (Entity-Attribute-Value)
CREATE TABLE IF NOT EXISTS player_statistics (
    player_id INTEGER NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    slice_id INTEGER NOT NULL REFERENCES stat_slices(slice_id) ON DELETE CASCADE,
    metric_code VARCHAR(100) NOT NULL,
    metric_value FLOAT,
    
    -- Служебные
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- УНИКАЛЬНОСТЬ: одно значение метрики для игрока в слайсе
    CONSTRAINT unique_player_metric 
        PRIMARY KEY (player_id, slice_id, metric_code)
);

CREATE INDEX idx_stats_player ON player_statistics(player_id);
CREATE INDEX idx_stats_slice ON player_statistics(slice_id);
CREATE INDEX idx_stats_metric ON player_statistics(metric_code);
CREATE INDEX idx_stats_value ON player_statistics(metric_value) WHERE metric_value IS NOT NULL;

COMMENT ON TABLE player_statistics IS 'Вся статистика игроков в формате метрика-значение';
COMMENT ON COLUMN player_statistics.metric_code IS 'Код метрики: shots, xg, passes, passes_accurate_pct и т.д.';
COMMENT ON COLUMN player_statistics.metric_value IS 'Значение метрики (NULL если нет данных)';


-- 6. СПРАВОЧНИК МЕТРИК
-- ============================================
-- Описание всех возможных метрик из файлов
CREATE TABLE IF NOT EXISTS metrics_catalog (
    metric_code VARCHAR(100) PRIMARY KEY,
    display_name_ru VARCHAR(255) NOT NULL,
    display_name_en VARCHAR(255),
    data_type VARCHAR(20) NOT NULL CHECK (data_type IN ('INTEGER', 'FLOAT', 'PERCENTAGE')),
    category VARCHAR(50),
    is_key_metric BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Заполняем справочник метрик из mfl.xlsx
INSERT INTO metrics_catalog (metric_code, display_name_ru, display_name_en, data_type, category, is_key_metric) VALUES
    -- Базовая информация
    ('minutes', 'Минут на поле', 'Minutes played', 'INTEGER', 'basic', true),
    ('index', 'Индекс Рустат', 'Rustat Index', 'FLOAT', 'basic', true),
    
    -- Ошибки
    ('goal_errors', 'Голевые ошибки', 'Goal errors', 'INTEGER', 'errors', false),
    ('gross_errors', 'Грубые ошибки', 'Gross errors', 'INTEGER', 'errors', false),
    
    -- Голы и результативность
    ('goals', 'Голы', 'Goals', 'INTEGER', 'scoring', true),
    ('assists', 'Передачи голевые', 'Assists', 'INTEGER', 'scoring', true),
    ('goal_chances', 'Голевые моменты', 'Goal chances', 'INTEGER', 'scoring', true),
    ('goal_chances_success', 'Голевые моменты удачные', 'Successful goal chances', 'INTEGER', 'scoring', false),
    ('goal_chances_success_pct', 'Голевые моменты удачные, %', 'Goal chances success %', 'PERCENTAGE', 'scoring', false),
    ('goal_chances_created', 'Голевые моменты создал', 'Goal chances created', 'INTEGER', 'scoring', true),
    ('goal_attacks', 'Участие в голевых атаках', 'Goal attacks participation', 'INTEGER', 'scoring', false),
    ('xg', 'xG (ожидаемые голы)', 'Expected goals (xG)', 'FLOAT', 'scoring', true),
    
    -- Удары
    ('shots', 'Удары', 'Shots', 'INTEGER', 'shooting', true),
    ('shots_on_target', 'Удары в створ', 'Shots on target', 'INTEGER', 'shooting', true),
    
    -- Дисциплина
    ('yellow_cards', 'Желтые карточки', 'Yellow cards', 'INTEGER', 'discipline', false),
    ('red_cards', 'Красные карточки', 'Red cards', 'INTEGER', 'discipline', false),
    ('fouls', 'Фолы', 'Fouls committed', 'INTEGER', 'discipline', false),
    ('fouls_on_player', 'Фолы на игроке', 'Fouls suffered', 'INTEGER', 'discipline', false),
    
    -- Передачи
    ('passes', 'Передачи', 'Passes', 'INTEGER', 'passing', true),
    ('passes_accurate_pct', 'Передачи точные, %', 'Pass accuracy %', 'PERCENTAGE', 'passing', true),
    ('key_passes', 'Передачи ключевые', 'Key passes', 'INTEGER', 'passing', true),
    ('key_passes_accurate_pct', 'Передачи ключевые точные, %', 'Key passes accuracy %', 'PERCENTAGE', 'passing', false),
    ('crosses', 'Навесы', 'Crosses', 'INTEGER', 'passing', false),
    ('crosses_accurate_pct', 'Навесы точные, %', 'Crosses accuracy %', 'PERCENTAGE', 'passing', false),
    ('progressive_passes', 'Передачи прогрессивные', 'Progressive passes', 'INTEGER', 'passing', true),
    ('progressive_passes_accurate_pct', 'Передачи прогрессивные точные, %', 'Progressive passes accuracy %', 'PERCENTAGE', 'passing', false),
    ('progressive_passes_clean', 'Передачи прогрессивные чистые', 'Clean progressive passes', 'INTEGER', 'passing', false),
    ('long_passes', 'Передачи длинные', 'Long passes', 'INTEGER', 'passing', false),
    ('long_passes_accurate_pct', 'Передачи длинные точные, %', 'Long passes accuracy %', 'PERCENTAGE', 'passing', false),
    ('super_long_passes', 'Передачи сверхдлинные', 'Super long passes', 'INTEGER', 'passing', false),
    ('super_long_passes_accurate_pct', 'Передачи сверхдлинные точные, %', 'Super long passes accuracy %', 'PERCENTAGE', 'passing', false),
    ('passes_to_final_third', 'Передачи вперед в финальную треть', 'Passes to final third', 'INTEGER', 'passing', true),
    ('passes_to_final_third_accurate_pct', 'Передачи вперед в финальную треть точные, %', 'Passes to final third accuracy %', 'PERCENTAGE', 'passing', false),
    ('passes_to_penalty_area', 'Передачи в штрафную', 'Passes to penalty area', 'INTEGER', 'passing', true),
    ('passes_to_penalty_area_accurate_pct', 'Передачи в штрафную точные, %', 'Passes to penalty area accuracy %', 'PERCENTAGE', 'passing', false),
    ('passes_for_shot', 'Передачи под удар', 'Passes for shot', 'INTEGER', 'passing', true),
    
    -- Единоборства
    ('duels', 'Единоборства', 'Duels', 'INTEGER', 'duels', true),
    ('duels_success_pct', 'Единоборства удачные, %', 'Duels success %', 'PERCENTAGE', 'duels', true),
    ('defensive_duels', 'Единоборства в обороне', 'Defensive duels', 'INTEGER', 'duels', true),
    ('defensive_duels_success_pct', 'Единоборства в обороне удачные, %', 'Defensive duels success %', 'PERCENTAGE', 'duels', false),
    ('offensive_duels', 'Единоборства в атаке', 'Offensive duels', 'INTEGER', 'duels', false),
    ('offensive_duels_success_pct', 'Единоборства в атаке удачные, %', 'Offensive duels success %', 'PERCENTAGE', 'duels', true),
    ('aerial_duels', 'Единоборства вверху', 'Aerial duels', 'INTEGER', 'duels', true),
    ('aerial_duels_success_pct', 'Единоборства вверху удачные, %', 'Aerial duels success %', 'PERCENTAGE', 'duels', false),
    
    -- Дриблинг
    ('dribbles', 'Обводки', 'Dribbles', 'INTEGER', 'dribbling', true),
    ('dribbles_success_pct', 'Обводки удачные, %', 'Dribbles success %', 'PERCENTAGE', 'dribbling', true),
    ('dribbles_final_third', 'Обводки в финальной трети', 'Dribbles in final third', 'INTEGER', 'dribbling', true),
    ('dribbles_final_third_success_pct', 'Обводки в финальной трети удачные, %', 'Dribbles in final third success %', 'PERCENTAGE', 'dribbling', false),
    
    -- Защитные действия
    ('tackles', 'Отборы', 'Tackles', 'INTEGER', 'defense', true),
    ('tackles_success_pct', 'Отборы удачные, %', 'Tackles success %', 'PERCENTAGE', 'defense', true),
    ('interceptions', 'Перехваты', 'Interceptions', 'INTEGER', 'defense', true),
    ('recoveries', 'Подборы', 'Recoveries', 'INTEGER', 'defense', true)
ON CONFLICT (metric_code) DO NOTHING;

COMMENT ON TABLE metrics_catalog IS 'Справочник всех метрик статистики';
COMMENT ON COLUMN metrics_catalog.is_key_metric IS 'Ключевая метрика для анализа игроков';


-- 7. ПРЕДСТАВЛЕНИЯ (VIEWS)
-- ============================================

-- View: Игроки с позициями и турнирами
CREATE OR REPLACE VIEW v_players_full AS
SELECT 
    p.player_id,
    p.full_name,
    p.birth_year,
    p.team_name,
    p.height,
    p.weight,
    p.citizenship,
    pos.code as position_code,
    pos.group_code as position_group,
    pos.display_name as position_name,
    t.name as tournament_name,
    t.id as tournament_id,
    t.season,
    t.current_round
FROM players p
LEFT JOIN positions pos ON p.position_id = pos.position_id
LEFT JOIN tournaments t ON p.tournament_id = t.id;

COMMENT ON VIEW v_players_full IS 'Полная информация об игроках с позициями и турнирами';


-- View: Последние слайсы по турнирам
CREATE OR REPLACE VIEW v_latest_slices AS
SELECT DISTINCT ON (tournament_id, slice_type, period_type)
    slice_id,
    tournament_id,
    slice_type,
    period_type,
    period_value,
    uploaded_at
FROM stat_slices
ORDER BY tournament_id, slice_type, period_type, uploaded_at DESC;

COMMENT ON VIEW v_latest_slices IS 'Последние загруженные слайсы для каждого типа';


-- 8. ФУНКЦИИ
-- ============================================

-- Функция для получения статистики игрока в удобном формате
CREATE OR REPLACE FUNCTION get_player_stats(
    p_player_id INTEGER,
    p_slice_id INTEGER
) RETURNS TABLE (
    metric_code VARCHAR,
    metric_name VARCHAR,
    metric_value FLOAT,
    data_type VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ps.metric_code,
        mc.display_name_ru,
        ps.metric_value,
        mc.data_type
    FROM player_statistics ps
    JOIN metrics_catalog mc ON ps.metric_code = mc.metric_code
    WHERE ps.player_id = p_player_id 
      AND ps.slice_id = p_slice_id
    ORDER BY mc.category, mc.metric_code;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_player_stats IS 'Получить всю статистику игрока для конкретного слайса';


-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stats_updated_at
    BEFORE UPDATE ON player_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 9. ИНДЕКСЫ ДЛЯ АНАЛИТИКИ
-- ============================================

-- Составные индексы для частых запросов
CREATE INDEX idx_stats_player_slice ON player_statistics(player_id, slice_id);
CREATE INDEX idx_stats_slice_metric ON player_statistics(slice_id, metric_code);
CREATE INDEX idx_stats_metric_value ON player_statistics(metric_code, metric_value) 
    WHERE metric_value IS NOT NULL;

-- Индекс для фильтрации по турниру и команде
CREATE INDEX idx_players_tournament_team ON players(tournament_id, team_name);

-- Индекс для поиска слайсов
CREATE INDEX idx_slices_tournament_period ON stat_slices(tournament_id, period_type, period_value);

COMMENT ON INDEX idx_stats_metric_value IS 'Ускоряет фильтрацию по значениям метрик (WHERE shots > 5)';

