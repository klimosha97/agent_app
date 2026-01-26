# 🔄 Новая логика работы с сезонами

## 📌 Философия

**Слайс = СЕЗОН**, а не количество туров!

- Обновление туров в сезоне (1-30 → 1-31) → **UPDATE** того же слайса
- Новый сезон (2025 → 2026) → **НОВЫЙ** слайс

---

## 🎯 Как это работает

### ✅ Сценарий 1: Обновление статистики текущего сезона

**Ситуация:** Прошёл новый тур, загружаешь обновлённую статистику

```python
# 1️⃣ Загрузил mfl.xlsx (туры 1-30)
loader.load_file(
    file_path='mfl.xlsx',
    tournament_id=0,           # МФЛ
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='2025',  # Текущий сезон
    force_new_season=False     # ⬅️ Обновить существующий
)
# Результат: slice_id=1, is_new_slice=True (первая загрузка)
```

```python
# 2️⃣ Прошёл 31-й тур, загружаешь обновлённый mfl.xlsx
loader.load_file(
    file_path='mfl.xlsx',
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='2025',  # ТОТ ЖЕ СЕЗОН!
    force_new_season=False
)
# Результат: slice_id=1, is_new_slice=False ⬅️ ОБНОВИЛ существующий!
```

**Что произошло:**

```sql
-- Система нашла существующий slice:
-- (tournament_id=0, slice_type='TOTAL', period_type='SEASON', period_value='2025')

-- 1️⃣ Обновила метаданные:
UPDATE stat_slices 
SET uploaded_at = NOW(), description = '...'
WHERE slice_id = 1;

-- 2️⃣ УДАЛИЛА старую статистику:
DELETE FROM player_statistics WHERE slice_id = 1;

-- 3️⃣ Загрузила НОВУЮ статистику:
INSERT INTO player_statistics (player_id, slice_id, metric_code, metric_value)
VALUES (1, 1, 'goals', 23), ...  -- Было 21 голов → стало 23
```

**Итого:**
- **НЕ создался новый slice**
- Старая статистика **полностью заменена**
- `slice_id` остался тот же

---

### ✅ Сценарий 2: Начало нового сезона

**Ситуация:** Начался новый сезон 2026

```python
# 1️⃣ ВАЖНО! Система автоматически обнаружит новый сезон:
loader.load_file(
    file_path='mfl.xlsx',
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='2026',  # 🔥 НОВЫЙ СЕЗОН!
    force_new_season=False     # Но не указали force_new
)

# ⚠️ ВНИМАНИЕ! Система выведет предупреждение:
# "⚠️ Обнаружен новый сезон: 2026"
# "Используйте force_new_season=True для создания нового слайса"
# "Или текущий слайс будет обновлён"

# Результат: slice_id=1 (ОБНОВИЛ старый сезон! ❌ НЕ ТО ЧТО НУЖНО!)
```

```python
# 2️⃣ ПРАВИЛЬНО! Создаём новый сезон:
loader.load_file(
    file_path='mfl.xlsx',
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='2026',
    force_new_season=True      # ⬅️ СОЗДАТЬ НОВЫЙ!
)

# Результат: slice_id=4, is_new_slice=True ✅ СОЗДАЛСЯ НОВЫЙ!
```

**Что произошло:**

```sql
-- Создался НОВЫЙ slice:
INSERT INTO stat_slices (tournament_id, slice_type, period_type, period_value)
VALUES (0, 'TOTAL', 'SEASON', '2026')
RETURNING slice_id;  -- = 4

-- Загрузились НОВЫЕ игроки и статистика:
INSERT INTO player_statistics (player_id, slice_id, ...)
VALUES (..., 4, ...);  -- slice_id = 4 (новый!)
```

**Итого:**
- Создался **НОВЫЙ slice** (slice_id=4)
- Старый сезон (slice_id=1) **сохранился**
- Теперь в БД **2 сезона**:
  - `slice_id=1` → 2025 (21 гол Помалюка)
  - `slice_id=4` → 2026 (5 голов Помалюка в новом сезоне)

---

## 🔄 Сравнение: ДО и ПОСЛЕ

### ❌ Было (плохо):

```
Загрузка 1: mfl.xlsx (1-30 туров) → slice_id=1, period_value='1-30'
Загрузка 2: mfl.xlsx (1-31 туров) → slice_id=2, period_value='1-31'  ❌ ДУБЛЬ!
Загрузка 3: mfl.xlsx (1-32 туров) → slice_id=3, period_value='1-32'  ❌ ЕЩЁ ДУБЛЬ!

Итого: 30 слайсов за один сезон! 😱
```

### ✅ Стало (хорошо):

```
Загрузка 1: mfl.xlsx (1-30 туров) → slice_id=1, season='2025'
Загрузка 2: mfl.xlsx (1-31 туров) → slice_id=1 (обновлён)
Загрузка 3: mfl.xlsx (1-32 туров) → slice_id=1 (обновлён)
...
Загрузка N: mfl.xlsx (новый сезон) → slice_id=2, season='2026' ✅ НОВЫЙ!

Итого: 1 слайс на сезон! ✅
```

---

## 🖥️ Работа с API

### 1️⃣ Проверить: нужен ли новый сезон?

**Перед загрузкой файла фронтенд вызывает:**

```javascript
// Пользователь выбрал файл mfl.xlsx для турнира МФЛ
const response = await fetch(
  '/api/check-new-season/0?slice_type=TOTAL&new_season=2026'
);

const data = await response.json();
/*
{
  "needs_new_season": true,
  "current_season": "2025",
  "new_season": "2026",
  "message": "Обнаружен новый сезон (2026). Создать новый slice?"
}
*/
```

### 2️⃣ Если `needs_new_season=true` → показать диалог:

```javascript
if (data.needs_new_season) {
  const confirmed = confirm(
    `Обнаружен новый сезон: ${data.new_season}\n` +
    `Текущий сезон: ${data.current_season}\n\n` +
    `Создать новый сезон?\n` +
    `- ДА: Старые данные сохранятся, создастся новый slice\n` +
    `- НЕТ: Текущий сезон будет обновлён (старые данные удалятся)`
  );
  
  return { force_new_season: confirmed };
}
```

### 3️⃣ Загрузить файл:

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('tournament_id', 0);
formData.append('slice_type', 'TOTAL');
formData.append('season', '2026');
formData.append('force_new_season', confirmed); // true или false

const result = await fetch('/api/upload-season-stats', {
  method: 'POST',
  body: formData
});

/*
{
  "status": "success",
  "slice_id": 4,
  "is_new_slice": true,  ⬅️ Создался новый
  "players_loaded": 896,
  "stats_loaded": 46592,
  "message": "Данные успешно загружены"
}
*/
```

---

## 📊 Примеры запросов к БД

### Пример 1: Получить статистику за ТЕКУЩИЙ сезон

```sql
SELECT 
    p.full_name,
    ps.metric_value as goals
FROM player_statistics ps
JOIN players p ON ps.player_id = p.player_id
JOIN stat_slices ss ON ps.slice_id = ss.slice_id
WHERE 
    ss.tournament_id = 0           -- МФЛ
    AND ss.slice_type = 'TOTAL'
    AND ss.period_type = 'SEASON'
    AND ss.period_value = '2025'  -- Текущий сезон
    AND ps.metric_code = 'goals'
ORDER BY ps.metric_value DESC;
```

### Пример 2: Сравнить игрока между сезонами

```sql
WITH season_2024 AS (
    SELECT metric_code, metric_value
    FROM player_statistics ps
    JOIN stat_slices ss USING (slice_id)
    WHERE ps.player_id = 1
      AND ss.period_value = '2025'
),
season_2025 AS (
    SELECT metric_code, metric_value
    FROM player_statistics ps
    JOIN stat_slices ss USING (slice_id)
    WHERE ps.player_id = 1
      AND ss.period_value = '2026'
)
SELECT 
    s24.metric_code,
    s24.metric_value as season_2024,
    s25.metric_value as season_2025,
    (s25.metric_value - s24.metric_value) as diff
FROM season_2024 s24
LEFT JOIN season_2025 s25 USING (metric_code)
WHERE s24.metric_code IN ('goals', 'xg', 'shots');

-- Результат:
-- metric_code | season_2024 | season_2025 | diff
-- goals       | 21          | 5           | -16  (начало сезона)
-- xg          | 14.27       | 3.82        | -10.45
-- shots       | 87          | 23          | -64
```

### Пример 3: Получить последний загруженный сезон

```sql
SELECT 
    ss.slice_id,
    ss.period_value as season,
    ss.uploaded_at,
    COUNT(DISTINCT ps.player_id) as players_count
FROM stat_slices ss
LEFT JOIN player_statistics ps ON ps.slice_id = ss.slice_id
WHERE 
    ss.tournament_id = 0
    AND ss.slice_type = 'TOTAL'
    AND ss.period_type = 'SEASON'
GROUP BY ss.slice_id, ss.period_value, ss.uploaded_at
ORDER BY ss.uploaded_at DESC
LIMIT 1;

-- Результат:
-- slice_id | season    | uploaded_at         | players_count
-- 4        | 2026 | 2025-08-15 14:30:00 | 896
```

---

## ⚙️ Миграция БД

Добавить поле `season` в таблицу `tournaments`:

```sql
-- Добавляем поле season
ALTER TABLE tournaments 
ADD COLUMN IF NOT EXISTS season VARCHAR(20) DEFAULT '2025';

-- Обновляем существующие записи
UPDATE tournaments 
SET season = '2025' 
WHERE season IS NULL;
```

---

## 🚀 Преимущества новой системы

### ✅ Плюсы:

1. **Нет дублей слайсов** - 1 слайс = 1 сезон
2. **Простота** - не нужно следить за period_value ('1-30', '1-31', ...)
3. **История сезонов** - можно сравнивать данные между сезонами
4. **Контроль пользователя** - система спрашивает "Начать новый сезон?"
5. **Защита от ошибок** - нельзя случайно перезаписать старый сезон

### ⚠️ Важно:

- При обновлении сезона старая статистика **УДАЛЯЕТСЯ**
- Перед началом нового сезона система **ПРЕДУПРЕДИТ** пользователя
- Можно безопасно загружать данные несколько раз в день (обновится тот же slice)

---

## 📝 Алгоритм работы системы

```
┌─────────────────────────┐
│ Пользователь загружает  │
│ mfl.xlsx для МФЛ        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Система определяет      │
│ slice_type (TOTAL/PER90)│
│ из имени файла          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Получить season из БД:  │
│ tournaments.season      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Есть существующий slice │
│ с таким season?         │
└───────┬─────────┬───────┘
        │         │
   ✅ ДА        ❌ НЕТ
        │         │
        ▼         ▼
┌──────────┐  ┌──────────┐
│ Обновить │  │ Создать  │
│ slice    │  │ новый    │
│ (UPDATE) │  │ slice    │
└──────────┘  └──────────┘
        │         │
        ▼         ▼
┌─────────────────────────┐
│ Удалить старую          │
│ статистику (если UPDATE)│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Загрузить новую         │
│ статистику из Excel     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ ✅ Готово!              │
│ players_loaded: 896     │
│ stats_loaded: 46592     │
└─────────────────────────┘
```

---

## 🎉 Итого

**Теперь система работает так:**

1. Загружаешь статистику → обновляется **ТОТ ЖЕ** slice текущего сезона
2. Начинается новый сезон → система **СПРАШИВАЕТ** "Создать новый?"
3. Если ДА → создаётся **НОВЫЙ** slice, старые данные **СОХРАНЯЮТСЯ**
4. Если НЕТ → обновляется текущий slice, старые данные **УДАЛЯЮТСЯ**

**Результат:** Чистая БД, без дублей, с историей сезонов! ✨



