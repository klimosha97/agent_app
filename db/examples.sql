-- ============================================
-- ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ БД
-- ============================================

-- ============================================
-- 1. СОЗДАНИЕ СЛАЙСА СТАТИСТИКИ
-- ============================================

-- Пример: Загружаем файл "TOTAL за 1-15 туров" для МФЛ
INSERT INTO stat_slices (tournament_id, slice_type, period_type, period_value, description)
VALUES (
    0,  -- МФЛ
    'TOTAL',
    'SEASON',
    '1-15',
    'Суммарная статистика за туры 1-15'
)
ON CONFLICT (tournament_id, slice_type, period_type, period_value) 
DO UPDATE SET 
    uploaded_at = CURRENT_TIMESTAMP,
    description = EXCLUDED.description
RETURNING slice_id;


-- ============================================
-- 2. UPSERT ИГРОКА
-- ============================================

-- Найти или создать игрока
WITH position_lookup AS (
    SELECT position_id FROM positions WHERE code = 'Ф Ц' LIMIT 1
),
player_upsert AS (
    INSERT INTO players (
        full_name, 
        birth_year, 
        team_name, 
        position_id, 
        tournament_id,
        height,
        weight,
        citizenship
    )
    VALUES (
        'Валерий Архипенко',
        2006,  -- Возраст 19 в 2025 году
        'СШ Ленинградец Мол.',
        (SELECT position_id FROM position_lookup),
        0,  -- МФЛ
        183,
        78,
        'Россия'
    )
    ON CONFLICT (full_name, birth_year, team_name, tournament_id)
    DO UPDATE SET
        position_id = EXCLUDED.position_id,
        height = EXCLUDED.height,
        weight = EXCLUDED.weight,
        citizenship = EXCLUDED.citizenship,
        updated_at = CURRENT_TIMESTAMP
    RETURNING player_id
)
SELECT player_id FROM player_upsert;


-- ============================================
-- 3. UPSERT СТАТИСТИКИ ИГРОКА
-- ============================================

-- Предположим, player_id = 1, slice_id = 1
-- Загружаем метрики игрока

INSERT INTO player_statistics (player_id, slice_id, metric_code, metric_value)
VALUES
    (1, 1, 'minutes', 450),
    (1, 1, 'goals', 3),
    (1, 1, 'assists', 0),
    (1, 1, 'xg', 2.2),
    (1, 1, 'shots', 9),
    (1, 1, 'shots_on_target', 7),
    (1, 1, 'passes', 127),
    (1, 1, 'passes_accurate_pct', 70.87),
    (1, 1, 'key_passes', 3),
    (1, 1, 'goal_chances', 8),
    (1, 1, 'goal_chances_success', 3),
    (1, 1, 'goal_chances_success_pct', 37.5),
    (1, 1, 'duels', 106),
    (1, 1, 'duels_success_pct', 45.28),
    (1, 1, 'dribbles', 15),
    (1, 1, 'dribbles_success_pct', 66.67),
    (1, 1, 'tackles', 5),
    (1, 1, 'tackles_success_pct', 40.0),
    (1, 1, 'interceptions', 15),
    (1, 1, 'recoveries', 19)
ON CONFLICT (player_id, slice_id, metric_code)
DO UPDATE SET
    metric_value = EXCLUDED.metric_value,
    updated_at = CURRENT_TIMESTAMP;


-- ============================================
-- 4. МАССОВЫЙ UPSERT (как будет работать импорт)
-- ============================================

-- Этот паттерн используется при загрузке файла:
-- Для каждой строки Excel делаем:

DO $$
DECLARE
    v_slice_id INTEGER;
    v_player_id INTEGER;
    v_position_id INTEGER;
BEGIN
    -- 1. Создаём/находим слайс
    INSERT INTO stat_slices (tournament_id, slice_type, period_type, period_value)
    VALUES (0, 'TOTAL', 'SEASON', '1-15')
    ON CONFLICT (tournament_id, slice_type, period_type, period_value)
    DO UPDATE SET uploaded_at = CURRENT_TIMESTAMP
    RETURNING slice_id INTO v_slice_id;
    
    -- 2. Находим позицию
    SELECT position_id INTO v_position_id 
    FROM positions WHERE code = 'Ф Ц' LIMIT 1;
    
    -- 3. Создаём/обновляем игрока
    INSERT INTO players (full_name, birth_year, team_name, position_id, tournament_id)
    VALUES ('Валерий Архипенко', 2006, 'СШ Ленинградец Мол.', v_position_id, 0)
    ON CONFLICT (full_name, birth_year, team_name, tournament_id)
    DO UPDATE SET 
        position_id = EXCLUDED.position_id,
        updated_at = CURRENT_TIMESTAMP
    RETURNING player_id INTO v_player_id;
    
    -- 4. Вставляем статистику
    INSERT INTO player_statistics (player_id, slice_id, metric_code, metric_value)
    VALUES
        (v_player_id, v_slice_id, 'goals', 3),
        (v_player_id, v_slice_id, 'xg', 2.2),
        (v_player_id, v_slice_id, 'shots', 9)
    ON CONFLICT (player_id, slice_id, metric_code)
    DO UPDATE SET 
        metric_value = EXCLUDED.metric_value,
        updated_at = CURRENT_TIMESTAMP;
        
    RAISE NOTICE 'Player % loaded with slice %', v_player_id, v_slice_id;
END $$;


-- ============================================
-- 5. SELECT ЗАПРОСЫ ДЛЯ ФРОНТЕНДА
-- ============================================

-- Пример 1: Все игроки турнира МФЛ, PER90, SEASON, с shots > 5
SELECT 
    p.player_id,
    p.full_name,
    p.team_name,
    pos.code as position,
    pos.group_code,
    -- Достаём метрики
    MAX(CASE WHEN ps.metric_code = 'shots' THEN ps.metric_value END) as shots,
    MAX(CASE WHEN ps.metric_code = 'xg' THEN ps.metric_value END) as xg,
    MAX(CASE WHEN ps.metric_code = 'goals' THEN ps.metric_value END) as goals,
    MAX(CASE WHEN ps.metric_code = 'assists' THEN ps.metric_value END) as assists,
    MAX(CASE WHEN ps.metric_code = 'passes_accurate_pct' THEN ps.metric_value END) as pass_accuracy
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
WHERE 
    p.tournament_id = 0  -- МФЛ
    AND ss.slice_type = 'PER90'
    AND ss.period_type = 'SEASON'
GROUP BY p.player_id, p.full_name, p.team_name, pos.code, pos.group_code
HAVING MAX(CASE WHEN ps.metric_code = 'shots' THEN ps.metric_value END) > 5
ORDER BY shots DESC;


-- Пример 2: Топ форвардов по xG (TOTAL, SEASON)
SELECT 
    p.full_name,
    p.team_name,
    pos.code as position,
    ps.metric_value as xg
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
WHERE 
    p.tournament_id = 0
    AND pos.group_code = 'ATT'
    AND ss.slice_type = 'TOTAL'
    AND ss.period_type = 'SEASON'
    AND ps.metric_code = 'xg'
    AND ps.metric_value IS NOT NULL
ORDER BY ps.metric_value DESC
LIMIT 10;


-- Пример 3: Сравнение игрока: последний тур vs сезон
WITH season_stats AS (
    SELECT ps.metric_code, ps.metric_value
    FROM player_statistics ps
    JOIN stat_slices ss ON ps.slice_id = ss.slice_id
    WHERE ps.player_id = 1
      AND ss.slice_type = 'PER90'
      AND ss.period_type = 'SEASON'
),
round_stats AS (
    SELECT ps.metric_code, ps.metric_value
    FROM player_statistics ps
    JOIN stat_slices ss ON ps.slice_id = ss.slice_id
    WHERE ps.player_id = 1
      AND ss.slice_type = 'PER90'
      AND ss.period_type = 'ROUND'
    ORDER BY ss.uploaded_at DESC
    LIMIT 50  -- Все метрики последнего тура
)
SELECT 
    mc.display_name_ru,
    rs.metric_value as round_value,
    ss.metric_value as season_value,
    (rs.metric_value - ss.metric_value) as diff,
    CASE 
        WHEN ss.metric_value > 0 
        THEN ROUND(((rs.metric_value - ss.metric_value) / ss.metric_value * 100)::numeric, 1)
        ELSE NULL 
    END as diff_percent
FROM round_stats rs
LEFT JOIN season_stats ss ON rs.metric_code = ss.metric_code
JOIN metrics_catalog mc ON rs.metric_code = mc.metric_code
WHERE mc.is_key_metric = true
ORDER BY mc.category, mc.metric_code;


-- Пример 4: Средние значения по позициям (для анализа)
SELECT 
    pos.code as position,
    ps.metric_code,
    mc.display_name_ru,
    COUNT(*) as players_count,
    ROUND(AVG(ps.metric_value)::numeric, 2) as avg_value,
    ROUND(STDDEV(ps.metric_value)::numeric, 2) as stddev,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ps.metric_value)::numeric, 2) as median
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
JOIN metrics_catalog mc ON ps.metric_code = mc.metric_code
WHERE 
    p.tournament_id = 0
    AND ss.slice_type = 'PER90'
    AND ss.period_type = 'SEASON'
    AND mc.is_key_metric = true
    AND ps.metric_value IS NOT NULL
GROUP BY pos.code, ps.metric_code, mc.display_name_ru
ORDER BY pos.code, ps.metric_code;


-- Пример 5: Поиск выдающихся игроков (метрики выше среднего)
WITH position_averages AS (
    SELECT 
        pos.code as position,
        ps.metric_code,
        AVG(ps.metric_value) as avg_value,
        STDDEV(ps.metric_value) as stddev
    FROM players p
    JOIN positions pos ON p.position_id = pos.position_id
    JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
    JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
    WHERE 
        p.tournament_id = 0
        AND ss.slice_type = 'PER90'
        AND ss.period_type = 'SEASON'
    GROUP BY pos.code, ps.metric_code
)
SELECT 
    p.full_name,
    p.team_name,
    pos.code as position,
    ps.metric_code,
    ps.metric_value as player_value,
    pa.avg_value as position_avg,
    ROUND(((ps.metric_value - pa.avg_value) / NULLIF(pa.stddev, 0))::numeric, 2) as z_score
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
JOIN position_averages pa ON pa.position = pos.code AND pa.metric_code = ps.metric_code
JOIN metrics_catalog mc ON ps.metric_code = mc.metric_code
WHERE 
    p.tournament_id = 0
    AND ss.slice_type = 'PER90'
    AND ss.period_type = 'SEASON'
    AND mc.is_key_metric = true
    AND ps.metric_value > pa.avg_value
    AND ABS((ps.metric_value - pa.avg_value) / NULLIF(pa.stddev, 0)) > 1  -- Более 1 стандартного отклонения
ORDER BY p.full_name, ps.metric_code;


-- ============================================
-- 6. ОЧИСТКА ДАННЫХ
-- ============================================

-- Удалить статистику для конкретного слайса
DELETE FROM player_statistics 
WHERE slice_id = 1;

-- Удалить слайс (каскадно удалит статистику)
DELETE FROM stat_slices 
WHERE slice_id = 1;

-- Удалить всех игроков турнира (каскадно удалит статистику)
DELETE FROM players 
WHERE tournament_id = 0;

-- Полная очистка статистики (оставить только справочники)
TRUNCATE TABLE player_statistics CASCADE;
TRUNCATE TABLE players CASCADE;
TRUNCATE TABLE stat_slices CASCADE;


-- ============================================
-- 7. СЛУЖЕБНЫЕ ЗАПРОСЫ
-- ============================================

-- Количество игроков по турнирам
SELECT 
    t.name,
    COUNT(DISTINCT p.player_id) as players_count
FROM tournaments t
LEFT JOIN players p ON p.tournament_id = t.id
GROUP BY t.id, t.name
ORDER BY t.id;

-- Количество слайсов по турнирам
SELECT 
    t.name,
    ss.slice_type,
    ss.period_type,
    COUNT(*) as slices_count
FROM tournaments t
LEFT JOIN stat_slices ss ON ss.tournament_id = t.id
GROUP BY t.id, t.name, ss.slice_type, ss.period_type
ORDER BY t.id, ss.slice_type, ss.period_type;

-- Объём данных по игрокам
SELECT 
    p.player_id,
    p.full_name,
    COUNT(DISTINCT ps.slice_id) as slices_count,
    COUNT(ps.metric_code) as metrics_count
FROM players p
LEFT JOIN player_statistics ps ON ps.player_id = p.player_id
GROUP BY p.player_id, p.full_name
ORDER BY metrics_count DESC
LIMIT 20;


-- ============================================
-- 8. ПРОВЕРКА ЦЕЛОСТНОСТИ
-- ============================================

-- Игроки без статистики
SELECT p.player_id, p.full_name, p.team_name
FROM players p
LEFT JOIN player_statistics ps ON ps.player_id = p.player_id
WHERE ps.player_id IS NULL;

-- Метрики не из справочника
SELECT DISTINCT ps.metric_code
FROM player_statistics ps
LEFT JOIN metrics_catalog mc ON ps.metric_code = mc.metric_code
WHERE mc.metric_code IS NULL;

-- Слайсы без данных
SELECT ss.slice_id, ss.slice_type, ss.period_type, ss.period_value
FROM stat_slices ss
LEFT JOIN player_statistics ps ON ps.slice_id = ss.slice_id
WHERE ps.slice_id IS NULL;



