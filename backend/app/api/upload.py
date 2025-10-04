"""
API роутер для загрузки и обработки Excel файлов.
Содержит endpoint'ы для импорта статистики игроков.
"""

import logging
import os
import shutil
from datetime import datetime
from pathlib import Path as FilePath
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Path
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.excel_import import ExcelImportService
from app.api.schemas import FileUploadResponse, ErrorResponse
from app.config import settings

logger = logging.getLogger(__name__)

# Создаём роутер
router = APIRouter()

# Инициализируем сервис импорта
excel_service = ExcelImportService()


@router.post("/upload-excel", response_model=FileUploadResponse, summary="Загрузить Excel файл")
async def upload_excel_file(
    file: UploadFile = File(..., description="Excel файл с статистикой игроков"),
    tournament_id: Optional[int] = Form(None, ge=0, le=3, description="ID турнира (автоопределение если None)"),
    import_to_main: bool = Form(True, description="Импортировать в основную таблицу"),
    import_to_last_round: bool = Form(False, description="Импортировать в таблицу последнего тура"),
    round_number: Optional[int] = Form(None, ge=1, description="Номер тура"),
    db: Session = Depends(get_db)
):
    """
    Загрузка и обработка Excel файла со статистикой футболистов.
    
    **Параметры:**
    - **file**: Excel файл (.xlsx или .xls)
    - **tournament_id**: ID турнира (0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3). Если не указан, определяется по имени файла
    - **import_to_main**: Импортировать в основную таблицу (по умолчанию true)
    - **import_to_last_round**: Импортировать в таблицу последнего тура (по умолчанию false)  
    - **round_number**: Номер тура (опционально)
    
    **Процесс обработки:**
    1. Валидация файла
    2. Определение турнира (автоматически или вручную)
    3. Парсинг Excel данных
    4. Очистка и нормализация данных
    5. Импорт ТОЛЬКО в основную таблицу players_stats_raw (если не указано иное)
    6. Возврат результатов
    """
    start_time = datetime.now()
    
    try:
        # Проверяем тип файла
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(
                status_code=400, 
                detail="Invalid file type. Only .xlsx and .xls files are supported"
            )
        
        # Проверяем размер файла
        if file.size and file.size > settings.max_file_size:
            size_mb = file.size / (1024 * 1024)
            max_mb = settings.max_file_size / (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {size_mb:.1f}MB. Maximum allowed: {max_mb:.1f}MB"
            )
        
        # Создаём безопасное имя файла
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{file.filename}"
        file_path = FilePath(settings.upload_path) / safe_filename
        
        # Создаём директорию если не существует
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Сохраняем файл
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            logger.info(f"File saved: {file_path}")
        except Exception as e:
            logger.error(f"Failed to save file {file.filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
        
        # Определяем турнир из имени файла
        file_tournament_id = excel_service.get_tournament_from_filename(file.filename)
        
        # Если tournament_id не указан явно, используем определённый из имени файла
        if tournament_id is None:
            if file_tournament_id is None:
                # Удаляем файл если турнир не определён
                try:
                    os.unlink(file_path)
                except:
                    pass
                raise HTTPException(
                    status_code=400,
                    detail="Could not determine tournament from filename. Please specify tournament_id manually. "
                           "Expected patterns: mfl, yfl1, yfl2, yfl3 in filename"
                )
            tournament_id = file_tournament_id
        else:
            # Если tournament_id указан, проверяем соответствие с именем файла
            if file_tournament_id is not None and file_tournament_id != tournament_id:
                # Удаляем файл при несоответствии
                try:
                    os.unlink(file_path)
                except:
                    pass
                
                expected_patterns = {
                    0: "mfl",
                    1: "yfl1",
                    2: "yfl2",
                    3: "yfl3"
                }
                
                tournament_name = settings.get_tournament_name(tournament_id)
                file_tournament_name = settings.get_tournament_name(file_tournament_id)
                expected_pattern = expected_patterns.get(tournament_id, "unknown")
                
                raise HTTPException(
                    status_code=400,
                    detail=f"Несоответствие файла турниру! Вы выбрали турнир '{tournament_name}' (ожидается '{expected_pattern}' в имени файла), "
                           f"но файл '{file.filename}' предназначен для турнира '{file_tournament_name}'. "
                           f"Пожалуйста, загрузите правильный файл."
                )
        
        logger.info(f"Processing file {file.filename} for tournament {tournament_id}")
        
        # Обрабатываем файл
        result = excel_service.process_excel_file(
            file_path=file_path,
            tournament_id=tournament_id,
            import_to_main=import_to_main,
            import_to_last_round=import_to_last_round,
            round_number=round_number
        )
        
        # Проверяем результат обработки
        if result.get("status") == "error":
            # Удаляем файл при ошибке
            try:
                os.unlink(file_path)
            except:
                pass
            
            raise HTTPException(
                status_code=422,
                detail=f"Excel processing failed: {result.get('error', 'Unknown error')}"
            )
        
        # Формируем успешный ответ
        response = FileUploadResponse(
            file_name=file.filename,
            tournament_id=tournament_id,
            total_rows=result["total_rows"],
            main_table=result.get("main_table"),
            last_round_table=result.get("last_round_table"),
            duration_seconds=result["duration_seconds"],
            upload_time=start_time,
            message="File uploaded and processed successfully"
        )
        
        tournament_name = settings.get_tournament_name(tournament_id)
        logger.info(f"Successfully processed {file.filename} for {tournament_name}: "
                   f"{result['total_rows']} rows in {result['duration_seconds']:.2f}s")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing file {file.filename}: {e}")
        
        # Пытаемся удалить файл при неожиданной ошибке
        try:
            if 'file_path' in locals():
                os.unlink(file_path)
        except:
            pass
        
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error during file processing: {str(e)}"
        )


@router.get("/upload/supported-formats", summary="Поддерживаемые форматы файлов")
async def get_supported_formats():
    """
    Получение информации о поддерживаемых форматах файлов и требованиях.
    """
    return {
        "supported_extensions": [".xlsx", ".xls"],
        "max_file_size_mb": settings.max_file_size / (1024 * 1024),
        "required_columns": excel_service.required_columns,
        "tournaments": [
            {
                "id": tid,
                "name": info["name"],
                "code": info["code"],
                "filename_patterns": [info["code"].lower()]
            }
            for tid, info in settings.tournaments.items()
        ],
        "auto_detection": {
            "description": "Турнир может быть определён автоматически по имени файла",
            "patterns": {
                "МФЛ": ["mfl"],
                "ЮФЛ-1": ["yfl1", "yfl-1"],
                "ЮФЛ-2": ["yfl2", "yfl-2"],
                "ЮФЛ-3": ["yfl3", "yfl-3"]
            }
        },
        "processing_info": {
            "main_table_import": "Импорт в основную таблицу (players_stats_raw) с обновлением существующих игроков",
            "last_round_import": "Импорт в таблицу последнего тура (last_round_stats) - опционально, по умолчанию отключено",
            "data_normalization": "Автоматическая очистка и преобразование данных",
            "player_matching": "Поиск игроков по имени и команде для обновления статуса отслеживания",
            "default_behavior": "По умолчанию данные добавляются ТОЛЬКО в players_stats_raw"
        }
    }


@router.delete("/upload/{file_name}", summary="Удалить загруженный файл")
async def delete_uploaded_file(
    file_name: str,
    db: Session = Depends(get_db)
):
    """
    Удаление загруженного Excel файла из хранилища.
    
    **Внимание:** Это не влияет на уже импортированные в БД данные.
    """
    try:
        # Находим все файлы содержащие это имя (учитываем timestamp префикс)
        upload_dir = FilePath(settings.upload_path)
        matching_files = list(upload_dir.glob(f"*{file_name}"))
        
        if not matching_files:
            raise HTTPException(status_code=404, detail="File not found")
        
        deleted_files = []
        for file_path in matching_files:
            try:
                os.unlink(file_path)
                deleted_files.append(file_path.name)
                logger.info(f"Deleted file: {file_path}")
            except Exception as e:
                logger.warning(f"Could not delete {file_path}: {e}")
        
        if not deleted_files:
            raise HTTPException(status_code=500, detail="Could not delete any files")
        
        return {
            "message": f"Successfully deleted {len(deleted_files)} file(s)",
            "deleted_files": deleted_files
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting file {file_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")


@router.get("/upload/files", summary="Список загруженных файлов")
async def list_uploaded_files():
    """
    Получение списка всех загруженных Excel файлов в директории uploads.
    """
    try:
        upload_dir = FilePath(settings.upload_path)
        
        if not upload_dir.exists():
            return {
                "files": [],
                "total": 0,
                "message": "Upload directory does not exist"
            }
        
        # Получаем все Excel файлы
        excel_files = []
        for ext in ['.xlsx', '.xls']:
            excel_files.extend(upload_dir.glob(f"*{ext}"))
        
        files_info = []
        for file_path in sorted(excel_files, key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                stat = file_path.stat()
                
                # Пытаемся определить турнир по имени файла
                tournament_id = excel_service.get_tournament_from_filename(file_path.name)
                tournament_name = settings.get_tournament_name(tournament_id) if tournament_id is not None else "Unknown"
                
                files_info.append({
                    "filename": file_path.name,
                    "size_bytes": stat.st_size,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "tournament_id": tournament_id,
                    "tournament_name": tournament_name
                })
            except Exception as e:
                logger.warning(f"Could not get info for file {file_path}: {e}")
        
        return {
            "files": files_info,
            "total": len(files_info),
            "upload_directory": str(upload_dir),
            "message": f"Found {len(files_info)} Excel files"
        }
        
    except Exception as e:
        logger.error(f"Error listing uploaded files: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")


@router.post("/import-tournament-players/{tournament_id}", summary="Импорт игроков турнира (заглушка)")
async def import_tournament_players(
    tournament_id: int = Path(..., ge=0, le=3, description="ID турнира"),
    db: Session = Depends(get_db)
):
    """
    **ЗАГЛУШКА**: Импорт всех игроков турнира из внешнего источника.
    
    В будущем здесь будет реализована интеграция с API турниров
    для автоматического получения списков игроков.
    
    Пока возвращает информационное сообщение.
    """
    try:
        tournament_name = settings.get_tournament_name(tournament_id)
        
        # Заглушка - в будущем здесь будет реальная логика импорта
        return {
            "status": "not_implemented",
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "message": f"Tournament players import for {tournament_name} is not yet implemented",
            "planned_features": [
                "Integration with tournament APIs",
                "Automatic player roster updates",
                "Team composition import",
                "Player registration data sync"
            ],
            "current_workaround": "Use Excel file upload for now"
        }
        
    except Exception as e:
        logger.error(f"Error in tournament import stub: {e}")
        raise HTTPException(status_code=500, detail=str(e))


