"""
Тестовый скрипт для проверки загрузки данных.
"""

import sys
from pathlib import Path
from app.database import SessionLocal
from app.services.data_loader import DataLoader

def test_load_mfl():
    """Тест загрузки файла МФЛ."""
    
    print("=" * 60)
    print("ТЕСТ ЗАГРУЗКИ ДАННЫХ МФЛ")
    print("=" * 60)
    
    db = SessionLocal()
    
    try:
        loader = DataLoader(db)
        
        # Загружаем файл МФЛ (TOTAL, SEASON, 1-15)
        file_path = Path('/uploads/mfl.xlsx')
        
        print(f"\n📂 Файл: {file_path}")
        print(f"🏆 Турнир: МФЛ (ID=0)")
        print(f"📊 Слайс: TOTAL / SEASON / 1-15")
        print(f"\n{'─' * 60}")
        
        result = loader.load_file(
            file_path=file_path,
            tournament_id=0,  # МФЛ
            slice_type='TOTAL',
            period_type='SEASON',
            period_value='1-15'
        )
        
        print(f"\n✅ РЕЗУЛЬТАТ:")
        print(f"   Игроков загружено: {result['players_loaded']}")
        print(f"   Статистик загружено: {result['stats_loaded']}")
        
        # Получаем сводку
        print(f"\n{'─' * 60}")
        print(f"📈 СВОДКА ПО ТУРНИРУ МФЛ:")
        
        summary = loader.get_stats_summary(tournament_id=0)
        print(f"   Всего игроков: {summary['players']}")
        print(f"   Всего слайсов: {summary['slices']}")
        print(f"   Всего записей статистики: {summary['statistics']}")
        
        # Показываем несколько игроков
        from sqlalchemy import text
        
        print(f"\n{'─' * 60}")
        print(f"👥 ПРИМЕРЫ ИГРОКОВ:")
        
        players = db.execute(text("""
            SELECT 
                p.full_name,
                p.team_name,
                pos.code as position,
                MAX(CASE WHEN ps.metric_code = 'goals' THEN ps.metric_value END) as goals,
                MAX(CASE WHEN ps.metric_code = 'xg' THEN ps.metric_value END) as xg,
                MAX(CASE WHEN ps.metric_code = 'shots' THEN ps.metric_value END) as shots
            FROM players p
            JOIN positions pos ON p.position_id = pos.position_id
            JOIN player_statistics ps ON ps.player_id = p.player_id
            WHERE p.tournament_id = 0
            GROUP BY p.player_id, p.full_name, p.team_name, pos.code
            ORDER BY goals DESC NULLS LAST
            LIMIT 5
        """))
        
        print(f"\n{'Игрок':<25} {'Команда':<20} {'Поз':<6} {'Голы':<6} {'xG':<8} {'Удары'}")
        print(f"{'─' * 80}")
        
        for row in players:
            print(f"{row[0]:<25} {row[1]:<20} {row[2]:<6} {row[3] or '-':<6.0f} {row[4] or '-':<8.2f} {row[5] or '-'}")
        
        print(f"\n{'=' * 60}")
        print(f"✅ ТЕСТ ЗАВЕРШЁН УСПЕШНО")
        print(f"{'=' * 60}\n")
        
        return True
        
    except Exception as e:
        print(f"\n❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        db.close()


def test_query_examples():
    """Тест примеров запросов."""
    
    print("\n" + "=" * 60)
    print("ТЕСТ ЗАПРОСОВ К БД")
    print("=" * 60)
    
    db = SessionLocal()
    
    try:
        from sqlalchemy import text
        
        # 1. Топ-10 бомбардиров
        print(f"\n🎯 ТОП-10 БОМБАРДИРОВ:")
        print(f"{'─' * 60}")
        
        result = db.execute(text("""
            SELECT 
                p.full_name,
                p.team_name,
                pos.code as position,
                ps.metric_value as goals
            FROM players p
            JOIN positions pos ON p.position_id = pos.position_id
            JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
            JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
            WHERE 
                p.tournament_id = 0
                AND ss.slice_type = 'TOTAL'
                AND ss.period_type = 'SEASON'
                AND ps.metric_code = 'goals'
                AND ps.metric_value > 0
            ORDER BY ps.metric_value DESC
            LIMIT 10
        """))
        
        print(f"{'Игрок':<25} {'Команда':<20} {'Позиция':<8} {'Голы'}")
        print(f"{'─' * 60}")
        
        for row in result:
            print(f"{row[0]:<25} {row[1]:<20} {row[2]:<8} {row[3]:.0f}")
        
        # 2. Средние показатели по позициям
        print(f"\n📊 СРЕДНИЕ ПОКАЗАТЕЛИ ПО ПОЗИЦИЯМ (Голы):")
        print(f"{'─' * 60}")
        
        result = db.execute(text("""
            SELECT 
                pos.group_code,
                COUNT(DISTINCT p.player_id) as players,
                ROUND(AVG(ps.metric_value)::numeric, 2) as avg_goals,
                MAX(ps.metric_value) as max_goals
            FROM players p
            JOIN positions pos ON p.position_id = pos.position_id
            JOIN stat_slices ss ON ss.tournament_id = p.tournament_id
            JOIN player_statistics ps ON ps.player_id = p.player_id AND ps.slice_id = ss.slice_id
            WHERE 
                p.tournament_id = 0
                AND ss.slice_type = 'TOTAL'
                AND ss.period_type = 'SEASON'
                AND ps.metric_code = 'goals'
            GROUP BY pos.group_code
            ORDER BY avg_goals DESC
        """))
        
        print(f"{'Группа':<10} {'Игроков':<10} {'Среднее':<10} {'Максимум'}")
        print(f"{'─' * 60}")
        
        for row in result:
            print(f"{row[0]:<10} {row[1]:<10} {row[2]:<10} {row[3]:.0f}")
        
        print(f"\n{'=' * 60}")
        print(f"✅ ТЕСТЫ ЗАПРОСОВ ЗАВЕРШЕНЫ")
        print(f"{'=' * 60}\n")
        
        return True
        
    except Exception as e:
        print(f"\n❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        db.close()


if __name__ == '__main__':
    print("\n🚀 ЗАПУСК ТЕСТОВ ЗАГРУЗКИ ДАННЫХ\n")
    
    # Тест 1: Загрузка данных
    success1 = test_load_mfl()
    
    if success1:
        # Тест 2: Запросы
        success2 = test_query_examples()
        
        if success2:
            print("\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ\n")
            sys.exit(0)
    
    print("\n❌ НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОШЛИ\n")
    sys.exit(1)



