"""
Сервис загрузки данных из Excel в аналитическую БД.
Реализует философию: игрок = (турнир, команда, сезон).
"""

import logging
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Optional, Tuple, Union
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)


# Маппинг колонок Excel → metric_code
# ПОЛНЫЙ список из 108 колонок файла mfl_season.xlsx
METRICS_MAPPING = {
    # Базовая информация игрока и статистика матчей
    # Примечание: возраст, рост, вес, гражданство хранятся в таблице players, не в статистике
    'index': 'Index',
    'minutes': 'Минут на поле',
    
    # Голы и голевые моменты
    'goal_errors': 'Голевые ошибки',
    'gross_errors': 'Грубые ошибки',
    'goals': 'Голы',
    'assists': 'Передачи голевые',
    'goal_chances': 'Голевые моменты',
    'goal_chances_success': 'Голевые моменты удачные',
    'goal_chances_success_pct': 'Голевые моменты удачные, %',
    'goal_chances_created': 'Голевые моменты создал',
    'goal_attacks': 'Участие в голевых атаках',
    
    # Удары
    'shots': 'Удары',
    'shots_on_target': 'Удары в створ',
    'shots_accurate_pct': 'Удары точные, %',
    'shots_off_target': 'Удары мимо',
    'shots_blocked': 'Удары перехваченные',
    'shots_head': 'Удары головой',
    'shots_woodwork': 'Удары в каркас ворот',
    
    # Дисциплина
    'yellow_cards': 'Желтые карточки',
    'red_cards': 'Красные карточки',
    'fouls': 'Фолы',
    'fouls_on_player': 'Фолы на игроке',
    
    # Передачи
    'passes': 'Передачи',
    'passes_accurate': 'Передачи точные',
    'passes_accurate_pct': 'Передачи точные, %',
    'key_passes': 'Передачи ключевые',
    'key_passes_accurate': 'Передачи ключевые точные',
    'key_passes_accurate_pct': 'Передачи ключевые точные, %',
    'crosses': 'Навесы',
    'crosses_accurate': 'Навесы точные',
    'crosses_accurate_pct': 'Навесы точные, %',
    'progressive_passes': 'Передачи прогрессивные',
    'progressive_passes_accurate': 'Передачи прогрессивные точные',
    'progressive_passes_accurate_pct': 'Передачи прогрессивные точные, %',
    'progressive_passes_clean': 'Передачи прогрессивные чистые',
    'long_passes': 'Передачи длинные',
    'long_passes_accurate': 'Передачи длинные точные',
    'long_passes_accurate_pct': 'Передачи длинные точные, %',
    'super_long_passes': 'Передачи сверхдлинные',
    'super_long_passes_accurate': 'Передачи сверхдлинные точные',
    'super_long_passes_accurate_pct': 'Передачи сверхдлинные точные, %',
    'passes_to_final_third': 'Передачи вперед в финальную треть',
    'passes_to_final_third_accurate': 'Передачи вперед в финальную треть точные',
    'passes_to_final_third_accurate_pct': 'Передачи вперед в финальную треть точные, %',
    'passes_to_penalty_area': 'Передачи в штрафную',
    'passes_to_penalty_area_accurate': 'Передачи в штрафную точные',
    'passes_to_penalty_area_accurate_pct': 'Передачи в штрафную точные, %',
    'passes_for_shot': 'Передачи под удар',
    
    # Единоборства
    'duels': 'Единоборства',
    'duels_success': 'Единоборства удачные',
    'duels_success_pct': 'Единоборства удачные, %',
    'duels_unsuccessful': 'Единоборства неудачные',
    'defensive_duels': 'Единоборства в обороне',
    'defensive_duels_success': 'Единоборства в обороне удачные',
    'defensive_duels_success_pct': 'Единоборства в обороне удачные, %',
    'offensive_duels': 'Единоборства в атаке',
    'offensive_duels_success': 'Единоборства в атаке удачные',
    'offensive_duels_success_pct': 'Единоборства в атаке удачные, %',
    'aerial_duels': 'Единоборства вверху',
    'aerial_duels_success': 'Единоборства вверху удачные',
    'aerial_duels_success_pct': 'Единоборства вверху удачные, %',
    
    # Обводки
    'dribbles': 'Обводки',
    'dribbles_success': 'Обводки удачные',
    'dribbles_success_pct': 'Обводки удачные, %',
    'dribbles_unsuccessful': 'Обводки неудачные',
    'dribbles_final_third': 'Обводки в финальной трети',
    'dribbles_final_third_success': 'Обводки в финальной трети удачные',
    'dribbles_final_third_success_pct': 'Обводки в финальной трети удачные, %',
    
    # Отборы и защита
    'tackles': 'Отборы',
    'tackles_success': 'Отборы удачные',
    'tackles_success_pct': 'Отборы удачные, %',
    'interceptions': 'Перехваты',
    'recoveries': 'Подборы',
    
    # Матчи и появления
    'matches_played': 'Матчей сыграно',
    'starting_lineup': 'Появление в стартовом составе',
    'substituted_off': 'Был заменен',
    'substituted_on': 'Вышел на замену',
    
    # ТТД (Технико-тактические действия)
    'ttd_total': 'ТТД',
    'ttd_success': 'ТТД удачные',
    'ttd_success_pct': 'ТТД удачные, %',
    'ttd_unsuccessful': 'ТТД неудачные',
    'ttd_in_opponent_box': 'ТТД в штрафной соперника',
    'ttd_in_opponent_box_success': 'ТТД в штрафной соперника удачные',
    'ttd_in_opponent_box_success_pct': 'ТТД в штрафной соперника удачные, %',
    
    # Входы в финальную треть
    'final_third_entries': 'Входы в финальную треть',
    'final_third_entries_pass': 'Входы в финальную треть через пас',
    'final_third_entries_pass_pct': 'Входы в финальную треть через пас, % от всего',
    'final_third_entries_dribble': 'Входы в финальную треть через продвижение',
    'final_third_entries_dribble_pct': 'Входы в финальную треть через продвижение, % от всего',
    
    # Потери мяча
    'losses': 'Потери',
    'losses_own_half': 'Потери мяча на своей половине',
    'losses_passes': 'Потери при передачах',
    'losses_individual': 'Потери индивидуальные',
    'bad_touches': 'Обработки мяча неудачные',
    
    # Офсайды
    'offsides': 'Офсайды',
    
    # Овладевания и ведение
    'ball_recoveries': 'Овладевания мячом',
    'ball_recoveries_opponent_half': 'Овладевания мячом на половине поля соперника',
    'carries': 'Ведения мяча',
    
    # xG и xA (ожидаемые показатели)
    'xg': 'xG (ожидаемые голы)',
    'xa': 'xA (ожидаемые передачи)',
}


class DataLoader:
    """Загрузчик данных из Excel в аналитическую БД."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def load_file(
        self,
        file_path: Path,
        tournament_id: int,
        slice_type: str,  # 'TOTAL' или 'PER90'
        period_type: str,  # 'SEASON' или 'ROUND'
        period_value: str = None,  # Для SEASON: "2025", для ROUND: "31"
        force_new_season: bool = False,  # Принудительно создать новый сезон
    ) -> Dict[str, int]:
        """
        Загрузить Excel файл в БД.
        
        Args:
            file_path: Путь к Excel файлу
            tournament_id: ID турнира
            slice_type: 'TOTAL' или 'PER90'
            period_type: 'SEASON' или 'ROUND'
            period_value: 
                - Для SEASON: "2025" или "2026" (год, если None - текущий год)
                - Для ROUND: "31" (номер тура)
            force_new_season: Создать новый сезон вместо обновления текущего
        
        Returns:
            Статистика загрузки: {players_loaded, stats_loaded}
        """
        logger.info(f"Loading file: {file_path}")
        logger.info(f"Tournament: {tournament_id}, Slice: {slice_type}/{period_type}/{period_value}")
        
        try:
            # 1. Читаем Excel
            df = pd.read_excel(file_path)
            logger.info(f"Read {len(df)} rows from Excel")
            
            # 2. Определяем season (если SEASON и period_value не указан)
            if period_type == 'SEASON' and period_value is None:
                period_value = self._get_tournament_season(tournament_id)
                logger.info(f"Using current season: {period_value}")
            
            # 3. Проверяем: нужен ли новый сезон?
            if period_type == 'SEASON' and not force_new_season:
                should_create_new = self._check_new_season_needed(
                    tournament_id=tournament_id,
                    slice_type=slice_type,
                    new_season=period_value
                )
                if should_create_new:
                    logger.warning(f"⚠️ Обнаружен новый сезон: {period_value}")
                    logger.warning("Используйте force_new_season=True для создания нового слайса")
                    logger.warning("Или текущий слайс будет обновлён")
            
            # 4. Создаём/обновляем слайс
            slice_id, is_new = self._upsert_slice(
                tournament_id=tournament_id,
                slice_type=slice_type,
                period_type=period_type,
                period_value=period_value,
                force_new=force_new_season
            )
            
            action = "Created new" if is_new else "Updating existing"
            logger.info(f"{action} slice_id: {slice_id}")
            
            # 5. Используем UPSERT - обновляем существующие, добавляем новые
            # НЕ удаляем старые данные! Это позволяет:
            # - Сохранять историю игрока в разных командах
            # - Помалюк в Спартаке и Помалюк в ЦСКА = разные записи
            # - Сравнивать статистику игрока за разные команды
            if period_type == 'SEASON' and not is_new:
                logger.info("♻️ UPSERT mode: updating existing + adding new players")
            
            # 6. Загружаем игроков и статистику (UPSERT)
            players_loaded = 0
            stats_loaded = 0
            
            for idx, row in df.iterrows():
                try:
                    # Загружаем одного игрока
                    player_stats = self._load_player_row(
                        row=row,
                        tournament_id=tournament_id,
                        slice_id=slice_id
                    )
                    
                    players_loaded += 1
                    stats_loaded += player_stats
                    
                    if (idx + 1) % 100 == 0:
                        logger.info(f"Processed {idx + 1}/{len(df)} players...")
                
                except Exception as e:
                    logger.error(f"Error loading row {idx}: {e}")
                    continue
            
            self.db.commit()
            
            logger.info(f"✅ Loaded {players_loaded} players, {stats_loaded} statistics")
            
            return {
                'players_loaded': players_loaded,
                'stats_loaded': stats_loaded,
                'slice_id': slice_id,
                'is_new_slice': is_new
            }
        
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error loading file: {e}")
            raise
    
    def _get_tournament_season(self, tournament_id: int) -> str:
        """
        Получить текущий сезон турнира.
        Сезон = год (например: '2025', '2026').
        """
        result = self.db.execute(text("""
            SELECT season FROM tournaments WHERE id = :tournament_id
        """), {'tournament_id': tournament_id})
        
        season = result.scalar()
        
        # Если сезон не указан в БД - используем текущий год
        if not season:
            return str(datetime.now().year)
        
        return season
    
    def _check_new_season_needed(
        self,
        tournament_id: int,
        slice_type: str,
        new_season: str
    ) -> bool:
        """
        Проверить, нужен ли новый сезон.
        Возвращает True если найден существующий slice с другим сезоном.
        """
        result = self.db.execute(text("""
            SELECT period_value 
            FROM stat_slices 
            WHERE tournament_id = :tournament_id
              AND slice_type = :slice_type
              AND period_type = 'SEASON'
            ORDER BY uploaded_at DESC
            LIMIT 1
        """), {
            'tournament_id': tournament_id,
            'slice_type': slice_type
        })
        
        existing_season = result.scalar()
        
        # Если есть существующий слайс с другим сезоном - нужен новый
        if existing_season and existing_season != new_season:
            return True
        
        return False
    
    def _upsert_slice(
        self,
        tournament_id: int,
        slice_type: str,
        period_type: str,
        period_value: str,
        force_new: bool = False
    ) -> Tuple[int, bool]:
        """
        Создать или обновить slice.
        
        Returns:
            (slice_id, is_new): ID слайса и флаг "новый ли это слайс"
        """
        # Пытаемся найти существующий слайс (для SEASON и ROUND)
        existing = self.db.execute(text("""
            SELECT slice_id 
            FROM stat_slices
            WHERE tournament_id = :tournament_id
              AND slice_type = :slice_type
              AND period_type = :period_type
              AND period_value = :period_value
        """), {
            'tournament_id': tournament_id,
            'slice_type': slice_type,
            'period_type': period_type,
            'period_value': period_value
        })
        
        existing_id = existing.scalar()
        
        if existing_id:
            # Для ROUND - удаляем старую статистику перед перезаписью
            if period_type == 'ROUND':
                deleted = self.db.execute(text("""
                    DELETE FROM player_statistics
                    WHERE slice_id = :slice_id
                """), {'slice_id': existing_id})
                logger.info(f"🗑️ Deleted {deleted.rowcount} old stats for ROUND slice: {existing_id}")
            
            # Обновляем существующий слайс
            self.db.execute(text("""
                UPDATE stat_slices
                SET uploaded_at = CURRENT_TIMESTAMP,
                    description = :description
                WHERE slice_id = :slice_id
            """), {
                'slice_id': existing_id,
                'description': f'{slice_type} {period_type} {period_value} (обновлено)'
            })
            logger.info(f"♻️ Updating existing {period_type} slice: {existing_id}")
            return (existing_id, False)
        
        # Создаём новый слайс если не найден существующий
        result = self.db.execute(text("""
            INSERT INTO stat_slices (tournament_id, slice_type, period_type, period_value, description)
            VALUES (:tournament_id, :slice_type, :period_type, :period_value, :description)
            RETURNING slice_id
        """), {
            'tournament_id': tournament_id,
            'slice_type': slice_type,
            'period_type': period_type,
            'period_value': period_value,
            'description': f'{slice_type} {period_type} {period_value}'
        })
        
        new_id = result.scalar()
        logger.info(f"✨ Created new slice: {new_id}")
        return (new_id, True)
    
    def _load_player_row(
        self,
        row: pd.Series,
        tournament_id: int,
        slice_id: int
    ) -> int:
        """Загрузить одного игрока и его статистику."""
        
        # Извлекаем базовые данные
        full_name = str(row['Игрок']).strip()
        team_name = str(row['Команда']).strip()
        age = row.get('Возраст')
        position_code = str(row['Позиция']).strip()
        
        # Вычисляем год рождения
        current_year = datetime.now().year
        birth_year = current_year - int(age) if pd.notna(age) and age > 0 else None
        
        # Дополнительные данные
        height = row.get('Рост')
        height = int(height) if pd.notna(height) and height != '-' else None
        
        weight = row.get('Вес')
        weight = int(weight) if pd.notna(weight) and weight != '-' else None
        
        citizenship = row.get('Гражданство')
        citizenship = str(citizenship).strip() if pd.notna(citizenship) else None
        
        # 1. Находим position_id
        position_result = self.db.execute(text("""
            SELECT position_id FROM positions WHERE code = :code LIMIT 1
        """), {'code': position_code})
        
        position_id = position_result.scalar()
        if not position_id:
            logger.warning(f"Position not found: {position_code}")
            return 0
        
        # 2. UPSERT игрока
        player_result = self.db.execute(text("""
            INSERT INTO players (
                full_name, birth_year, team_name, position_id, tournament_id,
                height, weight, citizenship
            )
            VALUES (
                :full_name, :birth_year, :team_name, :position_id, :tournament_id,
                :height, :weight, :citizenship
            )
            ON CONFLICT (full_name, birth_year, team_name, tournament_id)
            DO UPDATE SET
                position_id = EXCLUDED.position_id,
                height = COALESCE(EXCLUDED.height, players.height),
                weight = COALESCE(EXCLUDED.weight, players.weight),
                citizenship = COALESCE(EXCLUDED.citizenship, players.citizenship),
                updated_at = CURRENT_TIMESTAMP
            RETURNING player_id
        """), {
            'full_name': full_name,
            'birth_year': birth_year,
            'team_name': team_name,
            'position_id': position_id,
            'tournament_id': tournament_id,
            'height': height,
            'weight': weight,
            'citizenship': citizenship
        })
        
        player_id = player_result.scalar()
        
        # 3. Загружаем все метрики
        stats_count = 0
        
        for metric_code, excel_column in METRICS_MAPPING.items():
            if excel_column not in row:
                continue
            
            value = row[excel_column]
            
            # Пропускаем пустые значения
            if pd.isna(value) or value == '-':
                continue
            
            # Конвертируем в float
            try:
                value_float = float(value)
                
                # Обработка NaN/Inf
                if not np.isfinite(value_float):
                    continue
                
            except (ValueError, TypeError):
                logger.warning(f"Cannot convert value '{value}' for metric {metric_code}")
                continue
            
            # UPSERT статистики
            self.db.execute(text("""
                INSERT INTO player_statistics (player_id, slice_id, metric_code, metric_value)
                VALUES (:player_id, :slice_id, :metric_code, :metric_value)
                ON CONFLICT (player_id, slice_id, metric_code)
                DO UPDATE SET
                    metric_value = EXCLUDED.metric_value,
                    updated_at = CURRENT_TIMESTAMP
            """), {
                'player_id': player_id,
                'slice_id': slice_id,
                'metric_code': metric_code,
                'metric_value': value_float
            })
            
            stats_count += 1
        
        return stats_count
    
    def get_stats_summary(self, tournament_id: int) -> Dict:
        """Получить сводку по загруженным данным."""
        result = self.db.execute(text("""
            SELECT 
                COUNT(DISTINCT p.player_id) as players_count,
                COUNT(DISTINCT ss.slice_id) as slices_count,
                COUNT(ps.metric_code) as stats_count
            FROM players p
            LEFT JOIN player_statistics ps ON ps.player_id = p.player_id
            LEFT JOIN stat_slices ss ON ss.slice_id = ps.slice_id
            WHERE p.tournament_id = :tournament_id
        """), {'tournament_id': tournament_id})
        
        row = result.fetchone()
        
        return {
            'tournament_id': tournament_id,
            'players': row[0] if row else 0,
            'slices': row[1] if row else 0,
            'statistics': row[2] if row else 0
        }


# ============================================
# Вспомогательные функции
# ============================================

def calculate_birth_year(age: int) -> int:
    """Вычислить год рождения по возрасту."""
    return datetime.now().year - age


def parse_period_value(filename: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Определить period_type и period_value по имени файла.
    
    Примеры:
    - mfl.xlsx → ('SEASON', '1-30')
    - mfl_30tur.xlsx → ('ROUND', '30')
    """
    import re
    
    # Ищем паттерн "XXtur" в имени файла
    match = re.search(r'_?(\d+)tur', filename.lower())
    
    if match:
        round_number = match.group(1)
        return ('ROUND', round_number)
    else:
        # По умолчанию - сезон
        return ('SEASON', None)  # Нужно будет указать вручную


def determine_slice_type(filename: str) -> str:
    """
    Определить slice_type по имени файла.
    
    Примеры:
    - mfl.xlsx → 'TOTAL'
    - mfl_average_90min.xlsx → 'PER90'
    - mfl_30tur_average90min.xlsx → 'PER90'
    """
    filename_lower = filename.lower()
    
    if '90' in filename_lower or 'per90' in filename_lower:
        return 'PER90'
    else:
        return 'TOTAL'

