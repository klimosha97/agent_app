"""
Скрипт для загрузки файла mfl_season.xlsx в базу данных.
Использует обновленный DataLoader с полным маппингом всех 108 колонок.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.database import get_db
from app.services.data_loader import DataLoader


def main():
    """Загрузить mfl_season.xlsx."""
    db = next(get_db())
    
    try:
        print("="*80)
        print("📥 ЗАГРУЗКА ФАЙЛА mfl_season.xlsx")
        print("="*80)
        
        # Файл находится в /tmp/ (скопирован туда ранее)
        file_path = Path('/tmp/mfl_season.xlsx')
        
        if not file_path.exists():
            print(f"❌ Файл не найден: {file_path}")
            print("   Скопируйте файл в контейнер: docker cp mfl_season.xlsx football_stats_backend:/tmp/")
            sys.exit(1)
        
        # Создаем загрузчик
        loader = DataLoader(db)
        
        # Загружаем файл
        # tournament_id = 0  # МФЛ
        # slice_type = 'TOTAL'
        # period_type = 'SEASON'
        # period_value = '2025'
        
        print(f"\n📊 Параметры загрузки:")
        print(f"   Файл: {file_path}")
        print(f"   Турнир: МФЛ (ID=0)")
        print(f"   Тип: TOTAL (суммарная статистика)")
        print(f"   Период: SEASON 2025")
        print(f"\n⏳ Загрузка началась...\n")
        
        result = loader.load_file(
            file_path=file_path,
            tournament_id=0,  # МФЛ
            slice_type='TOTAL',
            period_type='SEASON',
            period_value='2025'
        )
        
        print("\n" + "="*80)
        print("✅ ЗАГРУЗКА ЗАВЕРШЕНА")
        print("="*80)
        print(f"   Загружено игроков: {result['players_loaded']}")
        print(f"   Загружено статистики: {result['stats_loaded']}")
        print(f"   Slice ID: {result['slice_id']}")
        print(f"   Новый slice: {'Да' if result['is_new_slice'] else 'Нет (обновлен существующий)'}")
        print("="*80)
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        db.close()


if __name__ == '__main__':
    main()

