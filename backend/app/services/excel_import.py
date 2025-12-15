"""
Сервис для импорта данных из Excel файлов.
ЗАГЛУШКА - будет реализован после создания таблиц.
"""

import logging
import re
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class ExcelImportService:
    """
    ЗАГЛУШКА: Сервис для импорта данных из Excel файлов.
    Будет реализован после создания структуры таблиц.
    """
    
    # Минимальный набор обязательных колонок
    required_columns = [
        "Игрок", "Команда", "Позиция", "Возраст", "Матчи"
    ]
    
    # Паттерны для определения турнира по имени файла
    _tournament_patterns = {
        0: [r'mfl', r'мфл'],
        1: [r'yfl1', r'yfl-1', r'юфл1', r'юфл-1'],
        2: [r'yfl2', r'yfl-2', r'юфл2', r'юфл-2'],
        3: [r'yfl3', r'yfl-3', r'юфл3', r'юфл-3'],
    }
    
    def __init__(self):
        pass
    
    def get_tournament_from_filename(self, filename: str) -> Optional[int]:
        """Определение турнира по имени файла."""
        filename_lower = filename.lower()
        
        for tournament_id, patterns in self._tournament_patterns.items():
            for pattern in patterns:
                if re.search(pattern, filename_lower):
                    return tournament_id
        
        return None
    
    def process_excel_file(
        self, 
        file_path: Path,
        tournament_id: int,
        import_to_main: bool = True,
        import_to_last_round: bool = False,
        round_number: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        ЗАГЛУШКА: Обработка Excel файла.
        Возвращает ошибку, т.к. таблицы ещё не созданы.
        """
        logger.warning("ExcelImportService.process_excel_file: Функционал ещё не реализован")
        
        return {
            "status": "error",
            "error": "Таблицы базы данных ещё не созданы. Функционал импорта недоступен.",
            "total_rows": 0,
            "duration_seconds": 0.0
        }
    
    def import_season_stats(self, *args, **kwargs):
        """ЗАГЛУШКА"""
        logger.warning("ExcelImportService.import_season_stats: Функционал ещё не реализован")
        return (0, 0)
    
    def import_round_stats(self, *args, **kwargs):
        """ЗАГЛУШКА"""
        logger.warning("ExcelImportService.import_round_stats: Функционал ещё не реализован")
        return (0, 0)


excel_import_service = ExcelImportService()
