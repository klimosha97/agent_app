# Архитектура базы данных для анализа футбольной статистики

## Философия дизайна

### Ключевые принципы:
1. **Игрок = (Турнир, Команда, Сезон)** — один и тот же человек в разных контекстах это РАЗНЫЕ сущности
2. **Нет склейки игроков между сезонами** — каждый сезон начинается с чистого листа
3. **Нет трансферной логики** — сменил команду = новый игрок
4. **Гибкость анализа** — вся статистика хранится в универсальном формате (EAV)

---

## Структура таблиц

### 1. `positions` — Справочник позиций
```
position_id | code   | group_code | display_name
------------|--------|------------|----------------------------------
1           | Ф Ц    | ATT        | Форвард центральный
2           | АП Л   | ATT        | Атакующий полузащитник левый
...
```

**Группы позиций:**
- `ATT` — Атакующие (Форварды, Атакующие полузащитники)
- `MID` — Полузащитники
- `DEF` — Защитники и Защитные полузащитники

---

### 2. `tournaments` — Турниры
```
id | name   | season    | current_round
---|--------|-----------|---------------
0  | МФЛ    | 2025 | 15
1  | ЮФЛ-1  | 2025 | 12
```

**Важно:**
- `season` может быть "2025" или "2026"
- `current_round` — последний завершённый тур

---

### 3. `players` — Игроки (контекстно-зависимые)
```
player_id | full_name         | birth_year | team_name    | position_id | tournament_id
----------|-------------------|------------|--------------|-------------|---------------
1         | Иван Иванов       | 2006       | Спартак Мол. | 5           | 0
2         | Иван Иванов       | 2006       | Зенит Мол.   | 5           | 0  ← ДРУГОЙ игрок!
3         | Иван Иванов       | 2006       | Спартак Мол. | 5           | 1  ← ДРУГОЙ игрок!
```

**UNIQUE constraint:**
```sql
UNIQUE (full_name, birth_year, team_name, tournament_id)
```

**Логика:**
- Один игрок в одной команде одного турнира — **одна запись**
- Перешёл в другую команду — **новая запись**
- Новый сезон — **новая запись**

---

### 4. `stat_slices` — Слайсы статистики (КРИТИЧНО!)

Слайс описывает **ЧТО** и **ЗА КАКОЙ ПЕРИОД** мы смотрим.

```
slice_id | tournament_id | slice_type | period_type | period_value | uploaded_at
---------|---------------|------------|-------------|--------------|----------------------
1        | 0             | TOTAL      | SEASON      | 1-15         | 2024-12-15 10:00:00
2        | 0             | PER90      | SEASON      | 1-15         | 2024-12-15 10:05:00
3        | 0             | TOTAL      | ROUND       | 16           | 2024-12-15 11:00:00
4        | 0             | PER90      | ROUND       | 16           | 2024-12-15 11:05:00
```

**Типы слайсов:**
- `TOTAL / SEASON` — суммарная статистика за несколько туров (например, 1-15)
- `PER90 / SEASON` — статистика за 90 минут за несколько туров
- `TOTAL / ROUND` — суммарная статистика за один тур
- `PER90 / ROUND` — статистика за 90 минут за один тур

**UNIQUE constraint:**
```sql
UNIQUE (tournament_id, slice_type, period_type, period_value)
```

---

### 5. `player_statistics` — Вся статистика (EAV формат)

ВСЯ статистика игроков хранится в одной таблице.

```
player_id | slice_id | metric_code       | metric_value
----------|----------|-------------------|-------------
1         | 1        | goals             | 5
1         | 1        | xg                | 4.3
1         | 1        | shots             | 23
1         | 1        | passes            | 456
1         | 2        | goals             | 0.45    ← PER90
1         | 2        | xg                | 0.39    ← PER90
```

**PRIMARY KEY:**
```sql
PRIMARY KEY (player_id, slice_id, metric_code)
```

**Почему EAV (Entity-Attribute-Value)?**
- Гибкость: легко добавить новые метрики
- Универсальность: все данные в одном месте
- Эффективность: нет дублирования структуры
- NULL-friendly: если метрики нет — просто нет записи

---

### 6. `metrics_catalog` — Справочник метрик

Описание всех возможных метрик статистики.

```
metric_code           | display_name_ru               | data_type  | category | is_key_metric
----------------------|-------------------------------|------------|----------|---------------
goals                 | Голы                          | INTEGER    | scoring  | TRUE
xg                    | xG (ожидаемые голы)           | FLOAT      | scoring  | TRUE
passes_accurate_pct   | Передачи точные, %            | PERCENTAGE | passing  | TRUE
```

**52 метрики** из файла mfl.xlsx:
- Голы и результативность (xG, ассисты, голевые моменты)
- Удары (всего, в створ)
- Передачи (всего, точные %, ключевые, в штрафную и т.д.)
- Единоборства (всего, в атаке, в обороне, вверху)
- Дриблинг (обводки, обводки в финальной трети)
- Защитные действия (отборы, перехваты, подборы)
- Дисциплина (жёлтые/красные карточки, фолы)

---

## Логика загрузки данных

### Процесс импорта одного файла Excel:

```python
def load_excel_file(file_path, tournament_id, slice_type, period_type, period_value):
    """
    1. Создать/найти slice
    2. Для каждой строки Excel:
       a) Найти/создать игрока
       b) UPSERT статистику
    """
    
    # 1. UPSERT slice
    slice_id = upsert_slice(tournament_id, slice_type, period_type, period_value)
    
    # 2. Читаем Excel
    df = pd.read_excel(file_path)
    
    for _, row in df.iterrows():
        # 3. Определяем позицию
        position_id = get_position_id(row['Позиция'])
        
        # 4. UPSERT игрока
        player_id = upsert_player(
            full_name=row['Игрок'],
            birth_year=calculate_birth_year(row['Возраст']),
            team_name=row['Команда'],
            position_id=position_id,
            tournament_id=tournament_id
        )
        
        # 5. UPSERT всей статистики игрока
        for metric_code, column_name in METRICS_MAPPING.items():
            value = row.get(column_name)
            if pd.notna(value):
                upsert_statistic(player_id, slice_id, metric_code, value)
```

### Маппинг колонок Excel → metric_code:

```python
METRICS_MAPPING = {
    'minutes': 'Минут на поле',
    'goals': 'Голы',
    'assists': 'Передачи голевые',
    'xg': 'xG (ожидаемые голы)',
    'shots': 'Удары',
    'shots_on_target': 'Удары в створ',
    'passes': 'Передачи',
    'passes_accurate_pct': 'Передачи точные, %',
    'key_passes': 'Передачи ключевые',
    # ... и т.д. для всех 60 колонок
}
```

---

## Примеры запросов

### 1. Все игроки МФЛ с TOTAL/SEASON статистикой

```sql
SELECT 
    p.full_name,
    p.team_name,
    MAX(CASE WHEN ps.metric_code = 'goals' THEN ps.metric_value END) as goals,
    MAX(CASE WHEN ps.metric_code = 'xg' THEN ps.metric_value END) as xg,
    MAX(CASE WHEN ps.metric_code = 'shots' THEN ps.metric_value END) as shots
FROM players p
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
WHERE 
    p.tournament_id = 0
    AND ss.slice_type = 'TOTAL'
    AND ss.period_type = 'SEASON'
GROUP BY p.player_id, p.full_name, p.team_name
ORDER BY goals DESC;
```

### 2. Топ-10 форвардов по xG (PER90)

```sql
SELECT 
    p.full_name,
    p.team_name,
    ps.metric_value as xg_per90
FROM players p
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
WHERE 
    p.tournament_id = 0
    AND pos.group_code = 'ATT'
    AND ss.slice_type = 'PER90'
    AND ss.period_type = 'SEASON'
    AND ps.metric_code = 'xg'
ORDER BY ps.metric_value DESC
LIMIT 10;
```

### 3. Сравнение игрока: последний тур vs сезон

```sql
WITH season AS (
    SELECT metric_code, metric_value
    FROM player_statistics
    WHERE player_id = 123 AND slice_id = (
        SELECT slice_id FROM stat_slices 
        WHERE tournament_id = 0 AND slice_type = 'PER90' AND period_type = 'SEASON'
    )
),
round AS (
    SELECT metric_code, metric_value
    FROM player_statistics
    WHERE player_id = 123 AND slice_id = (
        SELECT slice_id FROM stat_slices 
        WHERE tournament_id = 0 AND slice_type = 'PER90' AND period_type = 'ROUND'
        ORDER BY uploaded_at DESC LIMIT 1
    )
)
SELECT 
    r.metric_code,
    r.metric_value as round_value,
    s.metric_value as season_value,
    (r.metric_value - s.metric_value) as diff
FROM round r
LEFT JOIN season s USING (metric_code)
ORDER BY ABS(r.metric_value - COALESCE(s.metric_value, 0)) DESC;
```

---

## Индексы для производительности

```sql
-- Быстрые фильтры по игрокам
CREATE INDEX idx_players_tournament ON players(tournament_id);
CREATE INDEX idx_players_tournament_team ON players(tournament_id, team_name);

-- Быстрые фильтры по статистике
CREATE INDEX idx_stats_player ON player_statistics(player_id);
CREATE INDEX idx_stats_slice ON player_statistics(slice_id);
CREATE INDEX idx_stats_metric_value ON player_statistics(metric_code, metric_value);

-- Быстрые фильтры по слайсам
CREATE INDEX idx_slices_tournament ON stat_slices(tournament_id);
CREATE INDEX idx_slices_type ON stat_slices(slice_type, period_type);
```

---

## Будущие возможности

Эта структура легко позволяет:

1. **Анализ формы игрока** — сравнение нескольких ROUND слайсов
2. **Средние по позициям** — группировка по position_id + stat_slices
3. **Поиск талантов** — фильтрация по метрикам выше среднего
4. **Сравнение турниров** — JOIN нескольких tournament_id
5. **Исторические данные** — все слайсы хранятся с uploaded_at

---

## Правила работы

### ✅ ЧТО ДЕЛАТЬ:
- Загружать файлы с явным указанием slice_type и period
- Использовать UPSERT для обновления данных
- Фильтровать по slice_id для конкретного среза
- Хранить проценты как десятичные дроби (79% = 79.0, не 0.79)

### ❌ ЧТО НЕ ДЕЛАТЬ:
- Пытаться "склеивать" игроков между сезонами
- Создавать отдельные таблицы для TOTAL/PER90
- Менять структуру при добавлении новых метрик
- Удалять старые слайсы (они нужны для истории)

---

## Диаграмма связей

```
tournaments ──┐
              ├──> players ──┐
positions ────┘              ├──> player_statistics
                             │
tournaments ──> stat_slices ─┘
                             
metrics_catalog (справочник для player_statistics.metric_code)
```

---

## Размер данных (оценка)

Для турнира с 900 игроками:
- `players`: 900 записей (~100 KB)
- `stat_slices`: ~10-20 записей на турнир (~5 KB)
- `player_statistics`: 900 игроков × 52 метрики × 4 слайса = ~187,000 записей (~15 MB)

**Итого:** ~15-20 MB на турнир за сезон (очень эффективно!)

---

## Заключение

Эта архитектура обеспечивает:
- ✅ Гибкость анализа
- ✅ Простоту загрузки данных
- ✅ Масштабируемость
- ✅ Целостность данных
- ✅ Производительность запросов

Без необходимости в:
- ❌ Сложной склейке данных
- ❌ Дублировании структур
- ❌ Миграциях при добавлении метрик



