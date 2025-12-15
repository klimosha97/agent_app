# Руководство по использованию БД

## ✅ Что уже готово

### База данных:
- ✅ 6 таблиц созданы и заполнены справочниками
- ✅ 23 позиции загружены (ATT/MID/DEF)
- ✅ 52 метрики загружены из mfl.xlsx
- ✅ Индексы для быстрых запросов
- ✅ Views и функции для удобства

### Данные МФЛ (тест):
- ✅ **896 игроков** загружено
- ✅ **46,592 записи статистики** (52 метрики × 896 игроков)
- ✅ Топ-бомбардир: **Александр Помалюк** — 21 гол (xG: 14.27)

---

## 🚀 Как загружать данные

### Вариант 1: Через Python (рекомендуется)

```python
from app.database import SessionLocal
from app.services.data_loader import DataLoader
from pathlib import Path

# Создаём подключение
db = SessionLocal()
loader = DataLoader(db)

# Загружаем файл
result = loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),
    tournament_id=0,  # МФЛ
    slice_type='TOTAL',      # или 'PER90'
    period_type='SEASON',    # или 'ROUND'
    period_value='1-15'      # или '16'
)

print(f"Загружено: {result['players_loaded']} игроков")
print(f"Статистик: {result['stats_loaded']}")

db.close()
```

### Вариант 2: Через Docker

```bash
# Загрузить файл МФЛ
docker compose exec -T backend python -c "
from app.database import SessionLocal
from app.services.data_loader import DataLoader
from pathlib import Path

db = SessionLocal()
loader = DataLoader(db)

result = loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='1-15'
)

print(f'✅ Loaded: {result}')
db.close()
"
```

### Примеры загрузки разных файлов:

```python
# 1. TOTAL за сезон (1-15 туров)
loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='1-15'
)

# 2. PER90 за сезон (1-15 туров)
loader.load_file(
    file_path=Path('/uploads/mfl_average_90min.xlsx'),
    tournament_id=0,
    slice_type='PER90',
    period_type='SEASON',
    period_value='1-15'
)

# 3. TOTAL за 16 тур
loader.load_file(
    file_path=Path('/uploads/mfl_30tur.xlsx'),
    tournament_id=0,
    slice_type='TOTAL',
    period_type='ROUND',
    period_value='30'
)

# 4. PER90 за 16 тур
loader.load_file(
    file_path=Path('/uploads/mfl_30tur_average90min.xlsx'),
    tournament_id=0,
    slice_type='PER90',
    period_type='ROUND',
    period_value='30'
)
```

---

## 📊 Примеры SQL запросов

### 1. Все игроки турнира с голами (TOTAL/SEASON)

```sql
SELECT 
    p.full_name,
    p.team_name,
    pos.code as position,
    MAX(CASE WHEN ps.metric_code = 'goals' THEN ps.metric_value END) as goals,
    MAX(CASE WHEN ps.metric_code = 'xg' THEN ps.metric_value END) as xg,
    MAX(CASE WHEN ps.metric_code = 'shots' THEN ps.metric_value END) as shots
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
WHERE 
    p.tournament_id = 0  -- МФЛ
    AND ss.slice_type = 'TOTAL'
    AND ss.period_type = 'SEASON'
    AND ps.metric_code IN ('goals', 'xg', 'shots')
GROUP BY p.player_id, p.full_name, p.team_name, pos.code
ORDER BY goals DESC;
```

### 2. Топ-10 по xG (PER90/SEASON)

```sql
SELECT 
    p.full_name,
    p.team_name,
    pos.code,
    ps.metric_value as xg_per90
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
WHERE 
    p.tournament_id = 0
    AND ss.slice_type = 'PER90'
    AND ss.period_type = 'SEASON'
    AND ps.metric_code = 'xg'
    AND ps.metric_value > 0
ORDER BY ps.metric_value DESC
LIMIT 10;
```

### 3. Фильтр: форварды с shots > 50

```sql
SELECT 
    p.full_name,
    p.team_name,
    ps.metric_value as shots
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
WHERE 
    p.tournament_id = 0
    AND pos.group_code = 'ATT'  -- Форварды
    AND ss.slice_type = 'TOTAL'
    AND ss.period_type = 'SEASON'
    AND ps.metric_code = 'shots'
    AND ps.metric_value > 50
ORDER BY ps.metric_value DESC;
```

### 4. Средние показатели по позициям

```sql
SELECT 
    pos.group_code,
    ps.metric_code,
    COUNT(*) as players,
    ROUND(AVG(ps.metric_value)::numeric, 2) as avg_value,
    ROUND(STDDEV(ps.metric_value)::numeric, 2) as stddev
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
WHERE 
    p.tournament_id = 0
    AND ss.slice_type = 'PER90'
    AND ss.period_type = 'SEASON'
    AND ps.metric_code IN ('goals', 'xg', 'shots', 'passes_accurate_pct')
GROUP BY pos.group_code, ps.metric_code
ORDER BY pos.group_code, ps.metric_code;
```

### 5. Сравнение игрока: сезон vs последний тур

```sql
-- Для игрока с player_id = 1
WITH season AS (
    SELECT metric_code, metric_value
    FROM player_statistics ps
    JOIN stat_slices ss USING (slice_id)
    WHERE ps.player_id = 1
      AND ss.slice_type = 'PER90'
      AND ss.period_type = 'SEASON'
),
last_round AS (
    SELECT metric_code, metric_value
    FROM player_statistics ps
    JOIN stat_slices ss USING (slice_id)
    WHERE ps.player_id = 1
      AND ss.slice_type = 'PER90'
      AND ss.period_type = 'ROUND'
    ORDER BY ss.uploaded_at DESC
    LIMIT 50  -- Все метрики последнего тура
)
SELECT 
    mc.display_name_ru,
    lr.metric_value as last_round,
    s.metric_value as season,
    (lr.metric_value - s.metric_value) as diff,
    CASE 
        WHEN s.metric_value > 0 
        THEN ROUND(((lr.metric_value - s.metric_value) / s.metric_value * 100)::numeric, 1)
        ELSE NULL 
    END as diff_pct
FROM last_round lr
LEFT JOIN season s USING (metric_code)
JOIN metrics_catalog mc ON lr.metric_code = mc.metric_code
WHERE mc.is_key_metric = true
ORDER BY ABS(lr.metric_value - COALESCE(s.metric_value, 0)) DESC;
```

---

## 🔑 Справочники

### Позиции (positions)

```sql
SELECT code, group_code, display_name 
FROM positions 
ORDER BY group_code, code;
```

| code  | group_code | display_name                        |
|-------|------------|-------------------------------------|
| Ф Ц   | ATT        | Форвард центральный                 |
| АП Л  | ATT        | Атакующий полузащитник левый        |
| П Ц   | MID        | Полузащитник центральный            |
| ЗП Ц  | DEF        | Защитный полузащитник центральный   |
| З Ц   | DEF        | Защитник центральный                |

### Метрики (metrics_catalog)

```sql
SELECT metric_code, display_name_ru, data_type, category 
FROM metrics_catalog 
WHERE is_key_metric = true
ORDER BY category, metric_code;
```

**Ключевые метрики (is_key_metric = true):**
- `goals`, `assists`, `xg`, `goal_chances`, `goal_chances_created`
- `shots`, `shots_on_target`
- `passes`, `passes_accurate_pct`, `key_passes`
- `duels`, `duels_success_pct`, `offensive_duels_success_pct`
- `dribbles`, `dribbles_success_pct`, `dribbles_final_third`
- `tackles`, `tackles_success_pct`, `interceptions`, `recoveries`

---

## 🧹 Управление данными

### Очистка статистики

```sql
-- Удалить статистику конкретного слайса
DELETE FROM player_statistics 
WHERE slice_id = 1;

-- Удалить слайс (каскадом удалит статистику)
DELETE FROM stat_slices 
WHERE slice_id = 1;

-- Очистить все данные МФЛ
DELETE FROM players WHERE tournament_id = 0;

-- Полная очистка (кроме справочников)
TRUNCATE TABLE player_statistics CASCADE;
TRUNCATE TABLE players CASCADE;
TRUNCATE TABLE stat_slices CASCADE;
```

### Проверка данных

```sql
-- Количество игроков по турнирам
SELECT 
    t.name,
    COUNT(DISTINCT p.player_id) as players
FROM tournaments t
LEFT JOIN players p ON p.tournament_id = t.id
GROUP BY t.name;

-- Количество слайсов
SELECT 
    t.name,
    ss.slice_type,
    ss.period_type,
    ss.period_value,
    COUNT(DISTINCT ps.player_id) as players_with_stats
FROM tournaments t
JOIN stat_slices ss ON ss.tournament_id = t.id
LEFT JOIN player_statistics ps ON ps.slice_id = ss.slice_id
GROUP BY t.name, ss.slice_type, ss.period_type, ss.period_value;
```

---

## 📝 Маппинг колонок Excel → metric_code

| Excel колонка                           | metric_code                        |
|-----------------------------------------|------------------------------------|
| Голы                                    | goals                              |
| xG (ожидаемые голы)                     | xg                                 |
| Удары                                   | shots                              |
| Удары в створ                           | shots_on_target                    |
| Передачи                                | passes                             |
| Передачи точные, %                      | passes_accurate_pct                |
| Передачи ключевые                       | key_passes                         |
| Единоборства                            | duels                              |
| Единоборства удачные, %                 | duels_success_pct                  |
| Обводки                                 | dribbles                           |
| Отборы                                  | tackles                            |
| Перехваты                               | interceptions                      |

**Полный список:** смотрите `METRICS_MAPPING` в `data_loader.py` (52 метрики)

---

## 🎯 Кейсы использования для фронтенда

### 1. Показать всех игроков турнира (с переключателем TOTAL/PER90)

```python
# API endpoint
@app.get("/api/players")
def get_players(
    tournament_id: int,
    slice_type: str = 'TOTAL',  # или 'PER90'
    period_type: str = 'SEASON',
    page: int = 1,
    limit: int = 100
):
    # SQL запрос с PIVOT для всех метрик
    query = """
        SELECT 
            p.player_id,
            p.full_name,
            p.team_name,
            pos.code as position,
            MAX(CASE WHEN ps.metric_code = 'goals' THEN ps.metric_value END) as goals,
            MAX(CASE WHEN ps.metric_code = 'xg' THEN ps.metric_value END) as xg,
            -- ... все метрики
        FROM players p
        JOIN positions pos ON p.position_id = pos.position_id
        JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
        JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
        WHERE 
            p.tournament_id = :tournament_id
            AND ss.slice_type = :slice_type
            AND ss.period_type = :period_type
        GROUP BY p.player_id, p.full_name, p.team_name, pos.code
        LIMIT :limit OFFSET :offset
    """
```

### 2. Фильтр по метрикам

```sql
-- shots > 50 AND xg > 5
HAVING 
    MAX(CASE WHEN ps.metric_code = 'shots' THEN ps.metric_value END) > 50
    AND MAX(CASE WHEN ps.metric_code = 'xg' THEN ps.metric_value END) > 5
```

### 3. Поиск талантов (выше среднего по позиции)

```sql
-- См. пример 5 в examples.sql
-- Игроки с метриками выше среднего + стандартное отклонение
```

---

## ⚡ Производительность

**Текущие результаты (896 игроков, 46K записей):**
- Загрузка файла: ~5 секунд
- Запрос всех игроков с метриками: ~50ms
- Фильтрация по метрикам: ~20ms
- Средние по позициям: ~30ms

**Масштабируемость:**
- 10,000 игроков × 52 метрики × 4 слайса = ~2M записей ≈ 150MB
- Запросы с индексами остаются быстрыми (<100ms)

---

## 🚨 Важные правила

### ✅ ДЕЛАТЬ:
1. Указывать `slice_type`, `period_type`, `period_value` при загрузке
2. Использовать UPSERT (ON CONFLICT) для обновления
3. Хранить проценты как числа (79%, не 0.79)
4. Фильтровать по `slice_id` для конкретного среза

### ❌ НЕ ДЕЛАТЬ:
1. Склеивать игроков между сезонами
2. Менять `player_id` вручную
3. Удалять справочники (`positions`, `metrics_catalog`)
4. Создавать отдельные таблицы для новых метрик

---

## 📚 Дополнительные файлы

- `schema.sql` — DDL схемы БД
- `examples.sql` — Примеры запросов
- `README_ARCHITECTURE.md` — Подробная архитектура
- `data_loader.py` — Python сервис загрузки
- `test_data_loader.py` — Тестовый скрипт

---

**✅ База данных готова к работе!**


