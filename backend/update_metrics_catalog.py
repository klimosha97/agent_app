"""
Скрипт для обновления каталога метрик в базе данных.
Добавляет все новые метрики из расширенного METRICS_MAPPING.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.database import get_db
from app.services.data_loader import METRICS_MAPPING
from sqlalchemy import text

# Определяем типы данных для каждой метрики
METRIC_TYPES = {
    # Базовая статистика
    'index': 'integer',
    'minutes': 'integer',
    
    # Голы и голевые моменты - integer
    'goal_errors': 'integer',
    'gross_errors': 'integer',
    'goals': 'integer',
    'assists': 'integer',
    'goal_chances': 'integer',
    'goal_chances_success': 'integer',
    'goal_chances_success_pct': 'percentage',
    'goal_chances_created': 'integer',
    'goal_attacks': 'integer',
    
    # Удары - integer
    'shots': 'integer',
    'shots_on_target': 'integer',
    'shots_accurate_pct': 'percentage',
    'shots_off_target': 'integer',
    'shots_blocked': 'integer',
    'shots_head': 'integer',
    'shots_woodwork': 'integer',
    
    # Дисциплина - integer
    'yellow_cards': 'integer',
    'red_cards': 'integer',
    'fouls': 'integer',
    'fouls_on_player': 'integer',
    
    # Передачи - integer и percentage
    'passes': 'integer',
    'passes_accurate': 'integer',
    'passes_accurate_pct': 'percentage',
    'key_passes': 'integer',
    'key_passes_accurate': 'integer',
    'key_passes_accurate_pct': 'percentage',
    'crosses': 'integer',
    'crosses_accurate': 'integer',
    'crosses_accurate_pct': 'percentage',
    'progressive_passes': 'integer',
    'progressive_passes_accurate': 'integer',
    'progressive_passes_accurate_pct': 'percentage',
    'progressive_passes_clean': 'integer',
    'long_passes': 'integer',
    'long_passes_accurate': 'integer',
    'long_passes_accurate_pct': 'percentage',
    'super_long_passes': 'integer',
    'super_long_passes_accurate': 'integer',
    'super_long_passes_accurate_pct': 'percentage',
    'passes_to_final_third': 'integer',
    'passes_to_final_third_accurate': 'integer',
    'passes_to_final_third_accurate_pct': 'percentage',
    'passes_to_penalty_area': 'integer',
    'passes_to_penalty_area_accurate': 'integer',
    'passes_to_penalty_area_accurate_pct': 'percentage',
    'passes_for_shot': 'integer',
    
    # Единоборства - integer и percentage
    'duels': 'integer',
    'duels_success': 'integer',
    'duels_success_pct': 'percentage',
    'duels_unsuccessful': 'integer',
    'defensive_duels': 'integer',
    'defensive_duels_success': 'integer',
    'defensive_duels_success_pct': 'percentage',
    'offensive_duels': 'integer',
    'offensive_duels_success': 'integer',
    'offensive_duels_success_pct': 'percentage',
    'aerial_duels': 'integer',
    'aerial_duels_success': 'integer',
    'aerial_duels_success_pct': 'percentage',
    
    # Обводки - integer и percentage
    'dribbles': 'integer',
    'dribbles_success': 'integer',
    'dribbles_success_pct': 'percentage',
    'dribbles_unsuccessful': 'integer',
    'dribbles_final_third': 'integer',
    'dribbles_final_third_success': 'integer',
    'dribbles_final_third_success_pct': 'percentage',
    
    # Отборы и защита - integer и percentage
    'tackles': 'integer',
    'tackles_success': 'integer',
    'tackles_success_pct': 'percentage',
    'interceptions': 'integer',
    'recoveries': 'integer',
    
    # Матчи и появления - integer
    'matches_played': 'integer',
    'starting_lineup': 'integer',
    'substituted_off': 'integer',
    'substituted_on': 'integer',
    
    # ТТД - integer и percentage
    'ttd_total': 'integer',
    'ttd_success': 'integer',
    'ttd_success_pct': 'percentage',
    'ttd_unsuccessful': 'integer',
    'ttd_in_opponent_box': 'integer',
    'ttd_in_opponent_box_success': 'integer',
    'ttd_in_opponent_box_success_pct': 'percentage',
    
    # Входы в финальную треть - integer и percentage
    'final_third_entries': 'integer',
    'final_third_entries_pass': 'integer',
    'final_third_entries_pass_pct': 'percentage',
    'final_third_entries_dribble': 'integer',
    'final_third_entries_dribble_pct': 'percentage',
    
    # Потери мяча - integer
    'losses': 'integer',
    'losses_own_half': 'integer',
    'losses_passes': 'integer',
    'losses_individual': 'integer',
    'bad_touches': 'integer',
    
    # Офсайды - integer
    'offsides': 'integer',
    
    # Овладевания и ведение - integer
    'ball_recoveries': 'integer',
    'ball_recoveries_opponent_half': 'integer',
    'carries': 'integer',
    
    # xG и xA - float (специальная обработка)
    'xg': 'float',
    'xa': 'float',
}

# Русские названия для метрик
METRIC_DISPLAY_NAMES = {
    'index': 'Индекс',
    'minutes': 'Минуты',
    'goal_errors': 'Голевые ошибки',
    'gross_errors': 'Грубые ошибки',
    'goals': 'Голы',
    'assists': 'Передачи голевые',
    'goal_chances': 'Голевые моменты',
    'goal_chances_success': 'Голевые моменты удачные',
    'goal_chances_success_pct': 'Голевые моменты удачные, %',
    'goal_chances_created': 'Голевые моменты создал',
    'goal_attacks': 'Участие в голевых атаках',
    'shots': 'Удары',
    'shots_on_target': 'Удары в створ',
    'shots_accurate_pct': 'Удары точные, %',
    'shots_off_target': 'Удары мимо',
    'shots_blocked': 'Удары перехваченные',
    'shots_head': 'Удары головой',
    'shots_woodwork': 'Удары в каркас',
    'yellow_cards': 'Желтые карточки',
    'red_cards': 'Красные карточки',
    'fouls': 'Фолы',
    'fouls_on_player': 'Фолы на игроке',
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
    'passes_to_final_third': 'Передачи в финальную треть',
    'passes_to_final_third_accurate': 'Передачи в финальную треть точные',
    'passes_to_final_third_accurate_pct': 'Передачи в финальную треть точные, %',
    'passes_to_penalty_area': 'Передачи в штрафную',
    'passes_to_penalty_area_accurate': 'Передачи в штрафную точные',
    'passes_to_penalty_area_accurate_pct': 'Передачи в штрафную точные, %',
    'passes_for_shot': 'Передачи под удар',
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
    'dribbles': 'Обводки',
    'dribbles_success': 'Обводки удачные',
    'dribbles_success_pct': 'Обводки удачные, %',
    'dribbles_unsuccessful': 'Обводки неудачные',
    'dribbles_final_third': 'Обводки в финальной трети',
    'dribbles_final_third_success': 'Обводки в финальной трети удачные',
    'dribbles_final_third_success_pct': 'Обводки в финальной трети удачные, %',
    'tackles': 'Отборы',
    'tackles_success': 'Отборы удачные',
    'tackles_success_pct': 'Отборы удачные, %',
    'interceptions': 'Перехваты',
    'recoveries': 'Подборы',
    'matches_played': 'Матчей сыграно',
    'starting_lineup': 'В старте',
    'substituted_off': 'Был заменен',
    'substituted_on': 'Вышел на замену',
    'ttd_total': 'ТТД',
    'ttd_success': 'ТТД удачные',
    'ttd_success_pct': 'ТТД удачные, %',
    'ttd_unsuccessful': 'ТТД неудачные',
    'ttd_in_opponent_box': 'ТТД в штрафной',
    'ttd_in_opponent_box_success': 'ТТД в штрафной удачные',
    'ttd_in_opponent_box_success_pct': 'ТТД в штрафной удачные, %',
    'final_third_entries': 'Входы в фин. треть',
    'final_third_entries_pass': 'Входы через пас',
    'final_third_entries_pass_pct': 'Входы через пас, %',
    'final_third_entries_dribble': 'Входы через продвижение',
    'final_third_entries_dribble_pct': 'Входы через продвижение, %',
    'losses': 'Потери',
    'losses_own_half': 'Потери на своей половине',
    'losses_passes': 'Потери при передачах',
    'losses_individual': 'Потери индивидуальные',
    'bad_touches': 'Обработки неудачные',
    'offsides': 'Офсайды',
    'ball_recoveries': 'Овладевания мячом',
    'ball_recoveries_opponent_half': 'Овладевания на чужой половине',
    'carries': 'Ведения мяча',
    'xg': 'xG',
    'xa': 'xA',
}


def update_metrics_catalog():
    """Обновить каталог метрик в базе данных."""
    db = next(get_db())
    
    try:
        print("="*80)
        print("🔄 ОБНОВЛЕНИЕ КАТАЛОГА МЕТРИК")
        print("="*80)
        
        added = 0
        updated = 0
        
        for metric_code, excel_column in METRICS_MAPPING.items():
            # Получаем тип данных и отображаемое имя
            data_type = METRIC_TYPES.get(metric_code, 'float')
            display_name = METRIC_DISPLAY_NAMES.get(metric_code, excel_column)
            
            # Проверяем, является ли метрика ключевой
            is_key_metric = metric_code in [
                'goals', 'assists', 'xg', 'xa', 'shots', 'shots_on_target',
                'passes_accurate_pct', 'duels_success_pct', 'minutes', 'index'
            ]
            
            # UPSERT метрики (data_type в UPPERCASE)
            result = db.execute(text("""
                INSERT INTO metrics_catalog (
                    metric_code, display_name_ru, data_type, is_key_metric
                )
                VALUES (:metric_code, :display_name, :data_type, :is_key_metric)
                ON CONFLICT (metric_code)
                DO UPDATE SET
                    display_name_ru = EXCLUDED.display_name_ru,
                    data_type = EXCLUDED.data_type,
                    is_key_metric = EXCLUDED.is_key_metric
                RETURNING (xmax = 0) AS inserted
            """), {
                'metric_code': metric_code,
                'display_name': display_name,
                'data_type': data_type.upper(),  # UPPERCASE
                'is_key_metric': is_key_metric
            })
            
            row = result.fetchone()
            if row and row[0]:  # inserted = True
                added += 1
                print(f"  ✅ Добавлена: {metric_code} → {display_name}")
            else:
                updated += 1
                print(f"  🔄 Обновлена: {metric_code} → {display_name}")
        
        db.commit()
        
        print("\n" + "="*80)
        print(f"✅ ЗАВЕРШЕНО")
        print(f"   Добавлено новых метрик: {added}")
        print(f"   Обновлено существующих: {updated}")
        print(f"   Всего метрик в каталоге: {len(METRICS_MAPPING)}")
        print("="*80)
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        raise
    
    finally:
        db.close()


if __name__ == '__main__':
    update_metrics_catalog()

