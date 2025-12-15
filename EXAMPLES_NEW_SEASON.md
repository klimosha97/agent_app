# 🎯 Практические примеры работы с новой системой сезонов

## 📖 Содержание

1. [Первая загрузка данных](#первая-загрузка-данных)
2. [Обновление статистики текущего сезона](#обновление-статистики-текущего-сезона)
3. [Начало нового сезона](#начало-нового-сезона)
4. [Загрузка PER90 статистики](#загрузка-per90-статистики)
5. [Загрузка статистики за отдельный тур](#загрузка-статистики-за-отдельный-тур)
6. [Работа через API](#работа-через-api)

---

## 1️⃣ Первая загрузка данных

### Ситуация
У вас пустая БД, вы первый раз загружаете файл `mfl.xlsx` с данными за сезон 2025.

### Python код

```python
from app.database import SessionLocal
from app.services.data_loader import DataLoader
from pathlib import Path

# Создаём подключение к БД
db = SessionLocal()
loader = DataLoader(db)

# Загружаем файл
result = loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),
    tournament_id=0,              # МФЛ
    slice_type='TOTAL',           # Суммарная статистика
    period_type='SEASON',         # За сезон
    period_value='2025',     # Сезон (или None - возьмёт из tournaments.season)
    force_new_season=False        # Не важно для первой загрузки
)

print(f"✅ Slice ID: {result['slice_id']}")          # 1
print(f"✅ Новый slice: {result['is_new_slice']}")  # True
print(f"✅ Игроков: {result['players_loaded']}")    # 896
print(f"✅ Статистик: {result['stats_loaded']}")    # 46,592

db.close()
```

### Результат в БД

```sql
-- Таблица stat_slices:
slice_id | tournament_id | slice_type | period_type | period_value | uploaded_at
---------|---------------|------------|-------------|--------------|------------------
1        | 0             | TOTAL      | SEASON      | 2025    | 2024-09-01 10:00

-- Таблица player_statistics:
player_id | slice_id | metric_code | metric_value
----------|----------|-------------|-------------
1         | 1        | goals       | 21.0
1         | 1        | xg          | 14.27
1         | 1        | shots       | 87.0
...       | ...      | ...         | ...
-- Всего: 46,592 записей (896 игроков × 52 метрики)
```

---

## 2️⃣ Обновление статистики текущего сезона

### Ситуация
Прошёл 31-й тур. У вас есть обновлённый файл `mfl.xlsx` с данными за туры 1-31 (было 1-30).

### Python код

```python
# Те же параметры, что и при первой загрузке!
result = loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='2025',     # ТОТ ЖЕ сезон!
    force_new_season=False        # НЕ создавать новый
)

print(f"✅ Slice ID: {result['slice_id']}")          # 1 (тот же!)
print(f"✅ Новый slice: {result['is_new_slice']}")  # False ⬅️ ОБНОВЛЁН!
print(f"✅ Игроков: {result['players_loaded']}")    # 896
print(f"✅ Статистик: {result['stats_loaded']}")    # 46,592
```

### Что произошло в БД

```sql
-- 1️⃣ Нашёлся существующий slice с period_value='2025'
SELECT slice_id FROM stat_slices
WHERE tournament_id = 0 
  AND slice_type = 'TOTAL' 
  AND period_type = 'SEASON'
  AND period_value = '2025';
-- Результат: slice_id = 1

-- 2️⃣ Обновились метаданные
UPDATE stat_slices
SET uploaded_at = CURRENT_TIMESTAMP
WHERE slice_id = 1;

-- 3️⃣ УДАЛИЛАСЬ старая статистика
DELETE FROM player_statistics WHERE slice_id = 1;
-- Удалено: 46,592 записей

-- 4️⃣ ЗАГРУЗИЛАСЬ новая статистика
INSERT INTO player_statistics (player_id, slice_id, metric_code, metric_value)
VALUES 
    (1, 1, 'goals', 23.0),  -- Было 21 → стало 23 ✅
    (1, 1, 'xg', 15.85),    -- Было 14.27 → стало 15.85 ✅
    ...
-- Вставлено: 46,592 записей (новые данные)
```

### Итого
- **Слайс остался тот же** (slice_id=1)
- **Старые данные полностью заменены**
- **Можно загружать хоть 100 раз в день** - всегда обновляется один slice

---

## 3️⃣ Начало нового сезона

### Ситуация
Начался новый сезон 2026. У вас есть файл `mfl.xlsx` с данными нового сезона.

### Шаг 1: Система предупреждает о новом сезоне

```python
# ⚠️ Первая попытка (без force_new_season)
result = loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='2026',     # 🔥 НОВЫЙ сезон!
    force_new_season=False        # Не указали создавать новый
)

# В логах:
# ⚠️ Обнаружен новый сезон: 2026
# Используйте force_new_season=True для создания нового слайса
# Или текущий слайс будет обновлён

# ❌ ВНИМАНИЕ! Система обновит СТАРЫЙ slice (slice_id=1)!
# Данные 2025 будут УДАЛЕНЫ!
```

### Шаг 2: ПРАВИЛЬНО - создаём новый сезон

```python
# ✅ Правильная загрузка
result = loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='2026',     # Новый сезон
    force_new_season=True         # ⬅️ СОЗДАТЬ НОВЫЙ!
)

print(f"✅ Slice ID: {result['slice_id']}")          # 2 ⬅️ НОВЫЙ!
print(f"✅ Новый slice: {result['is_new_slice']}")  # True
print(f"✅ Игроков: {result['players_loaded']}")    # 896
```

### Результат в БД

```sql
-- Таблица stat_slices: ТЕПЕРЬ 2 СЕЗОНА!
slice_id | tournament_id | slice_type | period_type | period_value | uploaded_at
---------|---------------|------------|-------------|--------------|------------------
1        | 0             | TOTAL      | SEASON      | 2025    | 2024-12-15 18:00  ⬅️ СТАРЫЙ
2        | 0             | TOTAL      | SEASON      | 2026    | 2025-09-01 10:00  ⬅️ НОВЫЙ

-- Таблица player_statistics: ДАННЫЕ ОБОИХ СЕЗОНОВ!
player_id | slice_id | metric_code | metric_value
----------|----------|-------------|-------------
-- Сезон 2025 (slice_id=1):
1         | 1        | goals       | 23.0         ⬅️ Итоги старого сезона
1         | 1        | xg          | 15.85
...

-- Сезон 2026 (slice_id=2):
1         | 2        | goals       | 5.0          ⬅️ Начало нового сезона
1         | 2        | xg          | 3.82
...
```

### Сравнение данных между сезонами

```sql
-- Помалюк: сравнить 2025 vs 2026
SELECT 
    'Сезон 2025' as period,
    ps.metric_value as goals
FROM player_statistics ps
WHERE ps.player_id = 1 AND ps.slice_id = 1 AND ps.metric_code = 'goals'

UNION ALL

SELECT 
    'Сезон 2026',
    ps.metric_value
FROM player_statistics ps
WHERE ps.player_id = 1 AND ps.slice_id = 2 AND ps.metric_code = 'goals';

-- Результат:
-- period            | goals
-- ------------------|------
-- Сезон 2025   | 23
-- Сезон 2026   | 5    (начало сезона)
```

---

## 4️⃣ Загрузка PER90 статистики

### Ситуация
У вас есть файл `mfl_average_90min.xlsx` с данными "в среднем за 90 минут".

### Python код

```python
# Загружаем PER90 для текущего сезона
result = loader.load_file(
    file_path=Path('/uploads/mfl_average_90min.xlsx'),
    tournament_id=0,
    slice_type='PER90',           # 🔥 В среднем за 90 минут
    period_type='SEASON',
    period_value='2025',
    force_new_season=False
)

print(f"✅ Slice ID: {result['slice_id']}")  # 3 (новый slice для PER90)
```

### Результат в БД

```sql
-- Таблица stat_slices: ТЕПЕРЬ 3 СЛАЙСА!
slice_id | tournament_id | slice_type | period_type | period_value
---------|---------------|------------|-------------|-------------
1        | 0             | TOTAL      | SEASON      | 2025    ⬅️ Суммарная
2        | 0             | TOTAL      | SEASON      | 2026    ⬅️ Суммарная (новый сезон)
3        | 0             | PER90      | SEASON      | 2025    ⬅️ За 90 минут

-- Статистика: разные значения!
player_id | slice_id | metric_code | metric_value
----------|----------|-------------|-------------
1         | 1        | goals       | 23.0         ⬅️ TOTAL: всего голов
1         | 3        | goals       | 0.85         ⬅️ PER90: голов за 90 минут
```

### Переключение между TOTAL и PER90 на фронтенде

```javascript
// Пользователь переключает режим просмотра
const [sliceType, setSliceType] = useState('TOTAL');

// Запрос данных
const players = await fetch(
  `/api/players?tournament_id=0&slice_type=${sliceType}`
);

// Результат:
// sliceType='TOTAL' → показывает slice_id=1 (23 гола)
// sliceType='PER90' → показывает slice_id=3 (0.85 голов/матч)
```

---

## 5️⃣ Загрузка статистики за отдельный тур

### Ситуация
Вы хотите сохранить статистику за конкретный тур (например, 31-й тур).

### Python код

```python
# Загружаем данные за 31-й тур
result = loader.load_file(
    file_path=Path('/uploads/mfl_31tur.xlsx'),
    tournament_id=0,
    slice_type='TOTAL',
    period_type='ROUND',          # 🔥 Один тур (не SEASON!)
    period_value='31',            # Номер тура
    force_new_season=False        # Не важно для ROUND
)

print(f"✅ Slice ID: {result['slice_id']}")  # 4
```

### Результат в БД

```sql
-- Таблица stat_slices: теперь 4 слайса!
slice_id | tournament_id | slice_type | period_type | period_value
---------|---------------|------------|-------------|-------------
1        | 0             | TOTAL      | SEASON      | 2025    ⬅️ Весь сезон
2        | 0             | TOTAL      | SEASON      | 2026
3        | 0             | PER90      | SEASON      | 2025
4        | 0             | TOTAL      | ROUND       | 31           ⬅️ 31-й тур

-- Статистика: только за 31-й тур
player_id | slice_id | metric_code | metric_value
----------|----------|-------------|-------------
1         | 4        | goals       | 2.0          ⬅️ Забил 2 гола в 31 туре
1         | 4        | xg          | 1.56
1         | 4        | shots       | 8.0
```

### Сравнение: сезон vs последний тур

```sql
-- Помалюк: весь сезон vs 31-й тур
SELECT 
    'Весь сезон' as period,
    MAX(CASE WHEN ps.metric_code = 'goals' THEN ps.metric_value END) as goals,
    MAX(CASE WHEN ps.metric_code = 'xg' THEN ps.metric_value END) as xg
FROM player_statistics ps
WHERE ps.player_id = 1 AND ps.slice_id = 1

UNION ALL

SELECT 
    '31-й тур',
    MAX(CASE WHEN ps.metric_code = 'goals' THEN ps.metric_value END),
    MAX(CASE WHEN ps.metric_code = 'xg' THEN ps.metric_value END)
FROM player_statistics ps
WHERE ps.player_id = 1 AND ps.slice_id = 4;

-- Результат:
-- period      | goals | xg
-- ------------|-------|-------
-- Весь сезон  | 23    | 15.85
-- 31-й тур    | 2     | 1.56
```

---

## 6️⃣ Работа через API

### 6.1. Проверить: нужен ли новый сезон?

```bash
# GET запрос
curl "http://localhost:8000/api/check-new-season/0?slice_type=TOTAL&new_season=2026"
```

**Ответ если нужен новый сезон:**

```json
{
  "needs_new_season": true,
  "current_season": "2025",
  "new_season": "2026",
  "tournament_id": 0,
  "slice_type": "TOTAL",
  "message": "Обнаружен новый сезон (2026). Создать новый slice?"
}
```

**Ответ если обновление текущего:**

```json
{
  "needs_new_season": false,
  "current_season": "2025",
  "new_season": "2025",
  "tournament_id": 0,
  "slice_type": "TOTAL",
  "message": "Обновление текущего сезона (2025)"
}
```

### 6.2. Загрузить файл через API

```bash
# POST запрос с файлом
curl -X POST "http://localhost:8000/api/upload-season-stats" \
  -F "file=@mfl.xlsx" \
  -F "tournament_id=0" \
  -F "slice_type=TOTAL" \
  -F "season=2026" \
  -F "force_new_season=true"
```

**Ответ:**

```json
{
  "status": "success",
  "file_name": "mfl.xlsx",
  "tournament_id": 0,
  "tournament_name": "МФЛ",
  "slice_type": "TOTAL",
  "season": "2026",
  "slice_id": 2,
  "is_new_slice": true,
  "players_loaded": 896,
  "stats_loaded": 46592,
  "duration_seconds": 5.23,
  "message": "Данные успешно загружены"
}
```

### 6.3. JavaScript пример с диалогом

```javascript
// Функция загрузки файла
async function uploadSeasonStats(file, tournamentId, sliceType) {
  // 1️⃣ Определяем сезон из имени файла или берём текущий год
  const season = '2026';
  
  // 2️⃣ Проверяем: нужен ли новый сезон?
  const checkResponse = await fetch(
    `/api/check-new-season/${tournamentId}?slice_type=${sliceType}&new_season=${season}`
  );
  const check = await checkResponse.json();
  
  // 3️⃣ Если нужен новый сезон - спрашиваем пользователя
  let forceNewSeason = false;
  
  if (check.needs_new_season) {
    const confirmed = window.confirm(
      `Обнаружен новый сезон: ${check.new_season}\n` +
      `Текущий сезон: ${check.current_season}\n\n` +
      `Создать новый сезон?\n\n` +
      `ДА: Старые данные сохранятся, создастся новый slice\n` +
      `НЕТ: Текущий сезон будет обновлён`
    );
    
    forceNewSeason = confirmed;
  }
  
  // 4️⃣ Загружаем файл
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tournament_id', tournamentId);
  formData.append('slice_type', sliceType);
  formData.append('season', season);
  formData.append('force_new_season', forceNewSeason);
  
  const uploadResponse = await fetch('/api/upload-season-stats', {
    method: 'POST',
    body: formData
  });
  
  const result = await uploadResponse.json();
  
  // 5️⃣ Показываем результат
  if (result.status === 'success') {
    alert(
      `✅ ${result.message}\n\n` +
      `Slice ID: ${result.slice_id}\n` +
      `Игроков: ${result.players_loaded}\n` +
      `Статистик: ${result.stats_loaded}`
    );
  }
  
  return result;
}

// Использование:
const fileInput = document.getElementById('file-input');
uploadSeasonStats(fileInput.files[0], 0, 'TOTAL');
```

---

## 🎓 Итоговая шпаргалка

### Когда создаётся НОВЫЙ slice:

1. ✅ Первая загрузка для турнира
2. ✅ Новый сезон (`period_value` изменился)
3. ✅ Новый `slice_type` (TOTAL → PER90)
4. ✅ Новый `period_type` (SEASON → ROUND)
5. ✅ Загрузка нового тура (ROUND с новым номером)

### Когда ОБНОВЛЯЕТСЯ существующий slice:

1. ✅ Та же комбинация (tournament, slice_type, period_type, period_value)
2. ✅ `force_new_season=False` (по умолчанию)
3. ✅ `period_type='SEASON'` (не ROUND!)

### Параметры load_file:

```python
loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),       # Путь к файлу
    tournament_id=0,                           # 0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3
    slice_type='TOTAL',                        # 'TOTAL' или 'PER90'
    period_type='SEASON',                      # 'SEASON' или 'ROUND'
    period_value='2025',                  # Для SEASON: '2025', для ROUND: '31'
    force_new_season=False                     # True = создать новый сезон
)
```

---

## ✨ Готово!

Теперь у вас есть полное понимание как работает новая система сезонов! 🎉

**Ключевое правило:** 
> Один slice = один сезон. Обновление статистики = обновление того же slice. Новый сезон = новый slice (только после подтверждения пользователя).


