# Football Stats — Talent Scouting Platform

Платформа аналитики статистики футболистов. Загрузка данных из XLSX, расчёт перцентилей по позициям, сравнение с лигой, корзинами команд и эталонным сезоном.

## Быстрый старт

```bash
docker compose up -d --build
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Adminer (DB)**: http://localhost:8080

## Архитектура

```
frontend/          React + TypeScript + TailwindCSS
backend/           FastAPI + SQLAlchemy + PostgreSQL
  app/
    api/
      analysis.py     Перцентили, скоры, top-списки, новые лица
      players.py      Профиль игрока, база данных, watched-списки, очистка БД
      tournaments.py  Список турниров, сезоны, туры
      upload.py       Загрузка XLSX файлов, трекинг туров
    services/
      percentile_engine.py  Ядро расчёта перцентилей (PostgreSQL window functions)
      data_loader.py        Импорт данных из XLSX в БД
      excel_import.py       Парсинг XLSX файлов
      position_metrics.py   Синхронизация конфигурации метрик по позициям
    main.py           Инициализация FastAPI, создание таблиц
    database.py       Подключение к PostgreSQL
    config.py         Настройки приложения
db/
  init.sql            Инициализация БД (таблицы, индексы)
  schema.sql          Полная схема
```

## Турниры

| ID | Название | Файл для загрузки |
|----|----------|-------------------|
| 0  | МФЛ      | `mfl.xlsx`        |
| 1  | ЮФЛ-1    | `yfl1.xlsx`       |
| 2  | ЮФЛ-2    | `yfl2.xlsx`       |
| 3  | ЮФЛ-3    | `yfl3.xlsx`       |

## Ключевые фичи

### 1. Загрузка данных
- Загрузка TOTAL и PER90 статистики из XLSX
- Валидация соответствия файла турниру
- Данные хранятся "как есть" (без округления при хранении)
- Автоматический пересчёт перцентилей при загрузке PER90
- Трекинг появления игроков в турах (`round_appearances`)

### 2. Перцентили по позиции (Talent Scouting)

Игроки группируются по **comparison_group** (7 групп: ЦЗ, КЗ, ОП, ПЗ Ц, АП Ц, ФЛ, НАП).
Для каждого игрока рассчитывается перцентиль (0–1) по каждой метрике его позиции.

**Три baseline для сравнения:**
- **Вся лига (SEASON)** — сравнение со всеми игроками позиции в сезоне
- **По корзине (TIER)** — сравнение только с игроками из своей корзины (TOP/BOTTOM)
- **Эталон (BENCHMARK/SEASON_BENCHMARK)** — сравнение с эталонным сезоном

**Скоры:**
- `core_score` — средний перцентиль по core-метрикам
- `support_score` — средний перцентиль по support-метрикам
- `total_score` — взвешенное среднее (60% core + 40% support)
- `good_share_core` — доля core-метрик с перцентилем ≥ 80%

**Порог минут:** 200 минут. Игроки с < 200 мин получают флаг `insufficient_minutes`.

### 3. Корзины команд (Tiers)
- Каждая команда в турнире относится к TOP или BOTTOM корзине
- Корзины настраиваются через UI (drag & drop)
- При загрузке нового сезона: существующие сохраняются, новые команды → BOTTOM, ушедшие → удаляются
- Корзины уникальны для каждого турнира

### 4. Новые лица в туре
- При загрузке TOTAL данных с номером тура: сравнение минут до/после загрузки
- Определяет кто играл в туре (минуты выросли) и является ли это дебютом
- Отображает только игроков, сыгравших в последнем туре И имеющих < 200 минут

### 5. Мои футболисты / Отслеживаемые
- Два списка для агента: "Мои футболисты" и "Отслеживаемые"
- Добавление/удаление из карточки игрока или профиля
- Отдельные вкладки с быстрым доступом к профилю игрока

### 6. База данных
- Все игроки из всех турниров и сезонов
- Фильтр по турниру, поиск, сортировка
- Колонки: турнир, сезон, вся статистика

## Правила отображения чисел

| Тип | Правило | Пример |
|-----|---------|--------|
| Общие числа | Округление до шага 0.5 | 1.2→1, 1.3→1.5, 2.8→3 |
| xG, xA | 2 цифры после запятой | 3.82→3.82 |
| Целые | Без дробной части | 5→5 |
| Проценты | Округление до шага 0.5 + % | 53.2→53%, 53.3→53.5% |
| NULL | Прочерк | — |

**Важно:** Округление только при отображении. В БД данные хранятся точно как в XLSX.

## API Endpoints

### Турниры и сезоны
- `GET /api/tournaments` — список турниров
- `GET /api/seasons/{tournament_id}` — доступные сезоны

### Загрузка данных
- `POST /api/upload/tournament` — загрузка TOTAL/PER90 с указанием сезона и тура
- `POST /api/upload/round` — загрузка данных за конкретный тур
- `POST /api/database/clear?confirm=true` — очистка БД (требует подтверждения)

### Анализ (перцентили, top-списки)
- `GET /api/season/{tid}/top` — топ за сезон (фильтр: baseline, sort_by, funnel)
- `GET /api/season/{tid}/top-by-position` — топ по позициям
- `POST /api/season/{tid}/recompute` — пересчитать анализ
- `GET /api/player/{pid}/percentiles` — перцентили игрока (все baselines)
- `GET /api/new-faces/{tid}` — новые лица в туре

### Корзины
- `GET /api/tiers/{tid}` — список корзин
- `PUT /api/tiers/{tid}` — обновить корзины
- `POST /api/tiers/{tid}/populate` — синхронизация команд

### Игроки
- `GET /api/players/{pid}` — информация об игроке
- `GET /api/players/{pid}/stats` — статистика игрока
- `GET /api/players/database` — все игроки (глобальная таблица)

### Списки наблюдения
- `GET /api/watched-players/{list_type}` — MY или TRACKED
- `POST /api/watched-players` — добавить
- `DELETE /api/watched-players/{list_type}/{pid}` — удалить
- `GET /api/watched-players/check/{pid}` — проверить статус

## Схема БД (ключевые таблицы)

| Таблица | Назначение |
|---------|------------|
| `players` | Игроки (имя, команда, позиция, турнир) |
| `positions` | Справочник позиций (code, comparison_group) |
| `stat_slices` | Срезы данных (TOTAL/PER90, SEASON/ROUND) |
| `player_statistics` | Статистика игроков (player_id, slice_id, metric_code, value) |
| `metrics_catalog` | Справочник метрик |
| `position_metric_config` | Какие метрики для какой позиции (core/support/risk) |
| `round_percentiles` | Перцентили по метрикам (player, metric, baseline, percentile) |
| `round_scores` | Агрегированные скоры (core, support, total, good%) |
| `team_tiers` | Корзины команд (TOP/BOTTOM) |
| `benchmark_slices` | Эталонные сезоны |
| `watched_players` | Списки наблюдения (MY/TRACKED) |
| `round_appearances` | Трекинг появления игроков в турах |

## Конфигурация метрик по позициям

Файл `POSITION_INFO.txt` определяет для каждой позиции (comparison_group):
- **core** метрики — ключевые показатели для позиции (вес 60%)
- **support** метрики — дополнительные показатели (вес 40%)
- **risk** метрики — факторы риска (фолы, потери)

Синхронизация при старте приложения автоматически.

## Переменные окружения

```env
DATABASE_URL=postgresql://klim:Orel1997@db:5432/football_stats
ENVIRONMENT=development
DEBUG=true
UPLOAD_PATH=/uploads
```

## Разработка

```bash
# Запуск в dev-режиме
docker compose up -d

# Только бэкенд
docker compose up -d backend

# Логи
docker logs football_stats_backend -f
docker logs football_stats_frontend -f

# Перезапуск с пересборкой
docker compose up -d --build
```
