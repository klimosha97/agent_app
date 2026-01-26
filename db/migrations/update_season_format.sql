-- Миграция: Изменение формата сезона с "2024/2025" на "2025"
-- Дата: 2024-12-15
-- Описание: Сезон теперь = год (круглогодично)

-- 1. Обновляем тип колонки season в tournaments
ALTER TABLE tournaments 
ALTER COLUMN season TYPE VARCHAR(10);

-- 2. Обновляем default значение
ALTER TABLE tournaments 
ALTER COLUMN season SET DEFAULT '2025';

-- 3. Обновляем существующие значения (если есть)
-- Преобразуем "2024/2025" → "2025" (берём второй год)
UPDATE tournaments 
SET season = CASE 
    WHEN season LIKE '%/%' THEN SPLIT_PART(season, '/', 2)
    ELSE season
END
WHERE season IS NOT NULL;

-- 4. Обновляем period_value в stat_slices для SEASON типов
UPDATE stat_slices 
SET period_value = CASE 
    WHEN period_value LIKE '%/%' THEN SPLIT_PART(period_value, '/', 2)
    ELSE period_value
END
WHERE period_type = 'SEASON' 
  AND period_value LIKE '%/%';

-- 5. Обновляем описания
UPDATE stat_slices 
SET description = REPLACE(description, '2024/2025', '2025')
WHERE description LIKE '%2024/2025%';

-- 6. Логирование
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Season format updated from "YYYY/YYYY" to "YYYY"';
END$$;



