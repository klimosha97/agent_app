"""
Сервис для импорта данных из Excel файлов.
Обрабатывает загрузку файлов статистики футболистов и их сохранение в БД.
"""

import logging
import pandas as pd
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.player import PlayerStatsRaw, LastRoundStats
from app.config import settings
from app.database import DatabaseTransaction

logger = logging.getLogger(__name__)


class ExcelImportService:
    """
    Сервис для импорта данных из Excel файлов.
    Обрабатывает файлы статистики футболистов и сохраняет в базу данных.
    """
    
    def __init__(self):
        self.supported_extensions = ['.xlsx', '.xls']
        self.required_columns = ['Игрок', 'Команда', 'Позиция']  # Минимально необходимые колонки
        
    def validate_file(self, file_path: Path) -> bool:
        """
        Проверка корректности Excel файла.
        
        Args:
            file_path: Путь к файлу
            
        Returns:
            bool: True если файл корректен
            
        Raises:
            ValueError: Если файл некорректен
        """
        # Проверяем существование файла
        if not file_path.exists():
            raise ValueError(f"File not found: {file_path}")
        
        # Проверяем расширение
        if file_path.suffix.lower() not in self.supported_extensions:
            raise ValueError(f"Unsupported file extension: {file_path.suffix}")
        
        try:
            # Пробуем открыть файл
            df = pd.read_excel(file_path)
            
            # Проверяем наличие обязательных колонок
            missing_columns = [col for col in self.required_columns if col not in df.columns]
            if missing_columns:
                raise ValueError(f"Missing required columns: {missing_columns}")
            
            # Проверяем что файл не пустой
            if len(df) == 0:
                raise ValueError("File is empty")
                
            logger.info(f"File validation passed: {file_path.name} ({len(df)} rows)")
            return True
            
        except Exception as e:
            logger.error(f"File validation failed for {file_path}: {e}")
            raise ValueError(f"Invalid Excel file: {e}")
    
    def normalize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Нормализация названий колонок для соответствия модели БД.
        
        Args:
            df: DataFrame с исходными данными
            
        Returns:
            pd.DataFrame: DataFrame с нормализованными колонками
        """
        # Маппинг колонок Excel файла к полям модели
        column_mapping = {
            '№': 'player_number',
            'Игрок': 'player_name',
            'Команда': 'team_name',
            'Возраст': 'age',
            'Рост': 'height',
            'Вес': 'weight',
            'Гражданство': 'citizenship',
            'Index': 'player_index',
            'Минут на поле': 'minutes_played',
            'Позиция': 'position',
            'Голевые ошибки': 'goal_errors',
            'Грубые ошибки': 'rough_errors',
            'Голы': 'goals',
            'Передачи голевые': 'assists',
            'Голевые моменты': 'goal_attempts',
            'Голевые моменты удачные': 'goal_attempts_successful',
            'Голевые моменты удачные, %': 'goal_attempts_success_rate',
            'Голевые моменты создал': 'goal_moments_created',
            'Участие в голевых атаках': 'goal_attacks_participation',
            'Удары': 'shots',
            'Удары в створ': 'shots_on_target',
            'Желтые карточки': 'yellow_cards',
            'Красные карточки': 'red_cards',
            'Фолы': 'fouls_committed',
            'Фолы на игроке': 'fouls_suffered',
            'Передачи': 'passes_total',
            'Передачи точные, %': 'passes_accuracy',
            'Передачи ключевые': 'passes_key',
            'Передачи ключевые точные, %': 'passes_key_accuracy',
            'Навесы': 'crosses',
            'Навесы точные, %': 'crosses_accuracy',
            'Передачи прогрессивные': 'passes_progressive',
            'Передачи прогрессивные точные, %': 'passes_progressive_accuracy',
            'Передачи прогрессивные чистые': 'passes_progressive_clean',
            'Передачи длинные': 'passes_long',
            'Передачи длинные точные, %': 'passes_long_accuracy',
            'Передачи сверхдлинные': 'passes_super_long',
            'Передачи сверхдлинные точные, %': 'passes_super_long_accuracy',
            'Передачи вперед в финальную треть': 'passes_final_third',
            'Передачи вперед в финальную треть точные, %': 'passes_final_third_accuracy',
            'Передачи в штрафную': 'passes_penalty_area',
            'Передачи в штрафную точные, %': 'passes_penalty_area_accuracy',
            'Передачи под удар': 'passes_for_shot',
            'Единоборства': 'duels_total',
            'Единоборства удачные, %': 'duels_success_rate',
            'Единоборства в обороне': 'duels_defensive',
            'Единоборства в обороне удачные, %': 'duels_defensive_success_rate',
            'Единоборства в атаке': 'duels_offensive',
            'Единоборства в атаке удачные, %': 'duels_offensive_success_rate',
            'Единоборства вверху': 'duels_aerial',
            'Единоборства вверху удачные, %': 'duels_aerial_success_rate',
            'Обводки': 'dribbles',
            'Обводки удачные, %': 'dribbles_success_rate',
            'Обводки в финальной трети': 'dribbles_final_third',
            'Обводки в финальной трети удачные, %': 'dribbles_final_third_success_rate',
            'Отборы': 'tackles',
            'Отборы удачные, %': 'tackles_success_rate',
            'Перехваты': 'interceptions',
            'Подборы': 'recoveries',
            'xG (ожидаемые голы)': 'xg',
        }
        
        # Переименовываем колонки
        df_normalized = df.rename(columns=column_mapping)
        
        logger.info(f"Normalized {len(column_mapping)} columns")
        return df_normalized
    
    def clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Очистка и преобразование данных.
        
        Args:
            df: DataFrame с данными
            
        Returns:
            pd.DataFrame: Очищенный DataFrame
        """
        # Создаём копию для безопасности
        df_clean = df.copy()
        
        # Заменяем пустые значения и дефисы на None/0
        df_clean = df_clean.replace(['-', '', 'nan', 'NaN'], None)
        
        # Преобразование числовых колонок
        numeric_columns = [
            'player_number', 'age', 'minutes_played', 'goal_errors', 'rough_errors',
            'goals', 'assists', 'goal_attempts', 'goal_attempts_successful',
            'goal_moments_created', 'goal_attacks_participation', 'shots',
            'shots_on_target', 'yellow_cards', 'red_cards', 'fouls_committed',
            'fouls_suffered', 'passes_total', 'passes_key', 'crosses',
            'passes_progressive', 'passes_progressive_clean', 'passes_long',
            'passes_super_long', 'passes_final_third', 'passes_penalty_area',
            'passes_for_shot', 'duels_total', 'duels_defensive', 'duels_offensive',
            'duels_aerial', 'dribbles', 'dribbles_final_third', 'tackles',
            'interceptions', 'recoveries'
        ]
        
        # Преобразование процентных колонок
        percentage_columns = [
            'goal_attempts_success_rate', 'passes_accuracy', 'passes_key_accuracy',
            'crosses_accuracy', 'passes_progressive_accuracy', 'passes_long_accuracy',
            'passes_super_long_accuracy', 'passes_final_third_accuracy',
            'passes_penalty_area_accuracy', 'duels_success_rate',
            'duels_defensive_success_rate', 'duels_offensive_success_rate',
            'duels_aerial_success_rate', 'dribbles_success_rate',
            'dribbles_final_third_success_rate', 'tackles_success_rate', 'xg'
        ]
        
        # Обрабатываем числовые колонки
        for col in numeric_columns:
            if col in df_clean.columns:
                df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce').fillna(0).astype(int)
        
        # Обрабатываем процентные колонки
        for col in percentage_columns:
            if col in df_clean.columns:
                df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce')
        
        # Обрабатываем текстовые колонки
        text_columns = ['player_name', 'team_name', 'position', 'citizenship', 'player_index', 'height', 'weight']
        for col in text_columns:
            if col in df_clean.columns:
                df_clean[col] = df_clean[col].astype(str).replace('nan', '')
        
        logger.info(f"Data cleaning completed. Rows: {len(df_clean)}")
        return df_clean
    
    def import_to_main_table(
        self, 
        df: pd.DataFrame, 
        tournament_id: int,
        session: Session
    ) -> Tuple[int, int]:
        """
        Импорт данных в основную таблицу players_stats_raw.
        
        Args:
            df: DataFrame с данными
            tournament_id: ID турнира
            session: Сессия БД
            
        Returns:
            Tuple[int, int]: Количество добавленных и обновлённых записей
        """
        added_count = 0
        updated_count = 0
        
        for _, row in df.iterrows():
            # Ищем существующего игрока по имени и команде в том же турнире
            existing_player = session.query(PlayerStatsRaw).filter(
                PlayerStatsRaw.player_name == row['player_name'],
                PlayerStatsRaw.team_name == row['team_name'],
                PlayerStatsRaw.tournament_id == tournament_id
            ).first()
            
            if existing_player:
                # Обновляем существующего игрока
                for column, value in row.items():
                    if hasattr(existing_player, column) and column not in ['id', 'created_at']:
                        setattr(existing_player, column, value)
                updated_count += 1
                logger.debug(f"Updated player: {row['player_name']}")
            else:
                # Создаём нового игрока
                player_data = row.to_dict()
                player_data['tournament_id'] = tournament_id
                player_data['tracking_status'] = 'non interesting'  # По умолчанию
                
                new_player = PlayerStatsRaw(**player_data)
                session.add(new_player)
                added_count += 1
                logger.debug(f"Added new player: {row['player_name']}")
        
        logger.info(f"Import to main table: {added_count} added, {updated_count} updated")
        return added_count, updated_count
    
    def import_to_last_round_table(
        self, 
        df: pd.DataFrame, 
        tournament_id: int,
        session: Session,
        round_number: Optional[int] = None
    ) -> int:
        """
        Импорт данных в таблицу последнего тура (last_round_stats).
        Очищает таблицу перед импортом.
        
        Args:
            df: DataFrame с данными
            tournament_id: ID турнира
            session: Сессия БД
            round_number: Номер тура (опционально)
            
        Returns:
            int: Количество импортированных записей
        """
        # Очищаем таблицу последнего тура для данного турнира
        session.query(LastRoundStats).filter(
            LastRoundStats.tournament_id == tournament_id
        ).delete()
        
        added_count = 0
        upload_timestamp = datetime.now().isoformat()
        
        for _, row in df.iterrows():
            # Ищем игрока в основной таблице для получения ID и статуса отслеживания
            main_player = session.query(PlayerStatsRaw).filter(
                PlayerStatsRaw.player_name == row['player_name'],
                PlayerStatsRaw.team_name == row['team_name'],
                PlayerStatsRaw.tournament_id == tournament_id
            ).first()
            
            # Подготавливаем данные для записи
            last_round_data = {
                'tournament_id': tournament_id,
                'round_number': round_number,
                'upload_timestamp': upload_timestamp,
                'original_player_id': str(main_player.id) if main_player else None,
                'tracking_status': main_player.tracking_status if main_player else 'non interesting',
            }
            
            # Добавляем основную статистику (упрощённая версия)
            basic_stats = [
                'player_name', 'team_name', 'position', 'age', 'height', 'weight',
                'citizenship', 'player_index', 'minutes_played', 'goals', 'assists',
                'shots', 'shots_on_target', 'passes_total', 'passes_accuracy',
                'yellow_cards', 'red_cards', 'xg'
            ]
            
            for stat in basic_stats:
                if stat in row and pd.notna(row[stat]):
                    last_round_data[stat] = row[stat]
            
            # Создаём запись
            last_round_player = LastRoundStats(**last_round_data)
            session.add(last_round_player)
            added_count += 1
        
        logger.info(f"Import to last round table: {added_count} records")
        return added_count
    
    def process_excel_file(
        self, 
        file_path: Path, 
        tournament_id: int,
        import_to_main: bool = True,
        import_to_last_round: bool = True,
        round_number: Optional[int] = None
    ) -> Dict:
        """
        Полная обработка Excel файла с импортом в БД.
        
        Args:
            file_path: Путь к Excel файлу
            tournament_id: ID турнира
            import_to_main: Импортировать в основную таблицу
            import_to_last_round: Импортировать в таблицу последнего тура
            round_number: Номер тура
            
        Returns:
            Dict: Результат импорта с метриками
        """
        start_time = datetime.now()
        
        try:
            # Валидация файла
            self.validate_file(file_path)
            
            # Чтение Excel файла
            logger.info(f"Reading Excel file: {file_path}")
            df = pd.read_excel(file_path)
            
            # Нормализация колонок
            df_normalized = self.normalize_column_names(df)
            
            # Очистка данных
            df_clean = self.clean_data(df_normalized)
            
            # Импорт в базу данных
            with DatabaseTransaction() as session:
                result = {
                    'file_name': file_path.name,
                    'tournament_id': tournament_id,
                    'total_rows': len(df_clean),
                    'start_time': start_time.isoformat(),
                    'status': 'success'
                }
                
                if import_to_main:
                    added, updated = self.import_to_main_table(df_clean, tournament_id, session)
                    result['main_table'] = {'added': added, 'updated': updated}
                
                if import_to_last_round:
                    last_round_added = self.import_to_last_round_table(
                        df_clean, tournament_id, session, round_number
                    )
                    result['last_round_table'] = {'added': last_round_added}
                
                # Фиксируем транзакцию
                session.commit()
                
                end_time = datetime.now()
                result['end_time'] = end_time.isoformat()
                result['duration_seconds'] = (end_time - start_time).total_seconds()
                
                logger.info(f"Excel import completed successfully: {result}")
                return result
                
        except Exception as e:
            logger.error(f"Excel import failed: {e}", exc_info=True)
            return {
                'file_name': file_path.name,
                'tournament_id': tournament_id,
                'status': 'error',
                'error': str(e),
                'start_time': start_time.isoformat(),
                'end_time': datetime.now().isoformat()
            }
    
    def get_tournament_from_filename(self, filename: str) -> Optional[int]:
        """
        Определение турнира по имени файла.
        
        Args:
            filename: Имя файла
            
        Returns:
            Optional[int]: ID турнира или None если не определён
        """
        filename_lower = filename.lower()
        
        if 'mfl' in filename_lower:
            return 0  # МФЛ
        elif 'yfl1' in filename_lower or 'yfl-1' in filename_lower:
            return 1  # ЮФЛ-1
        elif 'yfl2' in filename_lower or 'yfl-2' in filename_lower:
            return 2  # ЮФЛ-2
        elif 'yfl3' in filename_lower or 'yfl-3' in filename_lower:
            return 3  # ЮФЛ-3
        
        return None


