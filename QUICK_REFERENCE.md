# ⚡ ШПАРГАЛКА: Работа с БД

## 📊 Структура БД (кратко)

```
tournaments → players → stat_slices → player_statistics
                ↓
           positions
```

---

## 🔑 Ключевые концепции

### Slice = "Папка" со статистикой

| Параметр | Значение | Пример |
|----------|----------|--------|
| `tournament_id` | ID турнира | 0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3 |
| `slice_type` | Тип данных | TOTAL, PER90 |
| `period_type` | Период | SEASON (сезон), ROUND (тур) |
| `period_value` | Значение | '2025', '31' |

### Уникальность slice

```
(tournament_id, slice_type, period_type, period_value) = уникальный slice
```

---

## 🚀 Команды загрузки

### Python:

```python
from app.database import SessionLocal
from app.services.data_loader import DataLoader
from pathlib import Path

db = SessionLocal()
loader = DataLoader(db)

# Загрузить сезон (обновит существующий)
result = loader.load_file(
    file_path=Path('/uploads/mfl.xlsx'),
    tournament_id=0,
    slice_type='TOTAL',
    period_type='SEASON',
    period_value='2025',
    force_new_season=False  # False = обновить, True = создать новый
)

db.close()
```

### API:

```bash
# Проверить: нужен ли новый сезон?
curl "http://localhost:8000/api/check-new-season/0?slice_type=TOTAL&new_season=2026"

# Загрузить файл
curl -X POST "http://localhost:8000/api/upload-season-stats" \
  -F "file=@mfl.xlsx" \
  -F "tournament_id=0" \
  -F "slice_type=TOTAL" \
  -F "season=2025" \
  -F "force_new_season=false"
```

---

## 📝 SQL Запросы (часто используемые)

### 1. Все игроки с голами

```sql
SELECT 
    p.full_name,
    p.team_name,
    ps.metric_value as goals
FROM player_statistics ps
JOIN players p ON ps.player_id = p.player_id
JOIN stat_slices ss ON ps.slice_id = ss.slice_id
WHERE 
    ss.tournament_id = 0           -- МФЛ
    AND ss.slice_type = 'TOTAL'
    AND ss.period_value = '2025'
    AND ps.metric_code = 'goals'
ORDER BY ps.metric_value DESC;
```

### 2. Топ-10 по метрике

```sql
SELECT 
    p.full_name,
    ps.metric_value
FROM player_statistics ps
JOIN players p ON ps.player_id = p.player_id
JOIN stat_slices ss ON ps.slice_id = ss.slice_id
WHERE 
    ss.tournament_id = 0
    AND ss.slice_type = 'PER90'
    AND ps.metric_code = 'xg'
ORDER BY ps.metric_value DESC
LIMIT 10;
```

### 3. Средние по позиции

```sql
SELECT 
    pos.group_code,
    AVG(ps.metric_value) as avg_value
FROM player_statistics ps
JOIN players p ON ps.player_id = p.player_id
JOIN positions pos ON p.position_id = pos.position_id
JOIN stat_slices ss ON ps.slice_id = ss.slice_id
WHERE 
    ss.tournament_id = 0
    AND ss.slice_type = 'PER90'
    AND ps.metric_code = 'goals'
GROUP BY pos.group_code;
```

### 4. Сравнить игрока с средним

```sql
WITH avg_stat AS (
    SELECT AVG(ps.metric_value) as avg_goals
    FROM player_statistics ps
    JOIN players p ON ps.player_id = p.player_id
    JOIN positions pos ON p.position_id = pos.position_id
    WHERE pos.group_code = 'ATT'
      AND ps.metric_code = 'goals'
)
SELECT 
    p.full_name,
    ps.metric_value as goals,
    a.avg_goals,
    (ps.metric_value - a.avg_goals) as diff
FROM player_statistics ps
JOIN players p ON ps.player_id = p.player_id
CROSS JOIN avg_stat a
WHERE ps.metric_code = 'goals'
  AND ps.metric_value > a.avg_goals
ORDER BY diff DESC;
```

---

## 🔄 Сценарии использования

### Обновление текущего сезона

```python
# Загрузка 1: туры 1-30
result = loader.load_file(period_value='2025', force_new_season=False)
# → slice_id=1, is_new_slice=True

# Загрузка 2: туры 1-31 (обновление)
result = loader.load_file(period_value='2025', force_new_season=False)
# → slice_id=1, is_new_slice=False ✅ ОБНОВЛЁН!
```

### Начало нового сезона

```python
# Загрузка нового сезона
result = loader.load_file(period_value='2026', force_new_season=True)
# → slice_id=2, is_new_slice=True ✅ НОВЫЙ!

# Теперь в БД 2 сезона:
# slice_id=1: 2025
# slice_id=2: 2026
```

---

## ⚠️ Важные правила

### ✅ ДЕЛАТЬ:

1. **Данные в БД = данные в Excel** (без изменений!)
2. **Один slice = один сезон** (не создавай дубли)
3. **Новый сезон = force_new_season=True**
4. **Проверяй перед загрузкой** (`check-new-season`)

### ❌ НЕ ДЕЛАТЬ:

1. **Не создавай новый slice для каждого тура** (только для ROUND!)
2. **Не меняй данные при хранении** (округление только при показе)
3. **Не забывай про force_new_season** (иначе удалишь старый сезон!)

---

## 🎯 Быстрая проверка

```bash
# Сколько слайсов в БД?
psql -U klim -d football_stats -c "SELECT COUNT(*) FROM stat_slices;"

# Сколько игроков в МФЛ?
psql -U klim -d football_stats -c "SELECT COUNT(*) FROM players WHERE tournament_id = 0;"

# Последний загруженный slice
psql -U klim -d football_stats -c "SELECT * FROM stat_slices ORDER BY uploaded_at DESC LIMIT 1;"
```

---

## 📚 Полная документация

- **FINAL_EXPLANATION.md** - полное объяснение для чайников
- **NEW_SEASON_LOGIC.md** - логика работы с сезонами
- **EXAMPLES_NEW_SEASON.md** - практические примеры
- **SUMMARY_NEW_SEASON_LOGIC.md** - резюме изменений
- **db/USAGE_GUIDE.md** - руководство по использованию БД

---

## 🆘 Частые вопросы

**Q: Как загрузить файл?**  
A: `loader.load_file(file_path, tournament_id, slice_type, period_type, period_value)`

**Q: Данные задублируются?**  
A: НЕТ! Система обновит существующий slice (если не force_new_season=True)

**Q: Как создать новый сезон?**  
A: Используй `force_new_season=True`

**Q: Как сравнить с средними?**  
A: `AVG(metric_value)` по `position.group_code`

**Q: Как удалить старый slice?**  
A: `DELETE FROM stat_slices WHERE slice_id = X` (каскадом удалит статистику)

---

**Готово! 🚀**


