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
from sqlalchemy import text

from app.database import get_db
from app.services.excel_import import ExcelImportService
from app.services.data_loader import DataLoader
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


@router.post("/upload-season-stats", summary="Загрузить статистику за сезон")
async def upload_season_stats(
    file: UploadFile = File(..., description="Excel файл с статистикой"),
    tournament_id: int = Form(..., ge=0, le=3, description="ID турнира"),
    slice_type: str = Form(..., description="TOTAL или PER90"),
    season: Optional[str] = Form(None, description="Год сезона (например '2025'), если None - текущий год"),
    force_new_season: bool = Form(False, description="Создать новый сезон"),
    db: Session = Depends(get_db)
):
    """
    Загрузка статистики за сезон в аналитическую БД.
    
    **Логика работы:**
    1. Если `force_new_season=False` (по умолчанию):
       - Обновляет существующий slice для текущего сезона
       - Полностью перезаписывает статистику
    
    2. Если `force_new_season=True`:
       - Создаёт новый slice для нового сезона
       - Старые данные сохраняются
    
    **Параметры:**
    - **file**: Excel файл (.xlsx)
    - **tournament_id**: 0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3
    - **slice_type**: "TOTAL" (суммарная) или "PER90" (за 90 минут)
    - **season**: Год сезона (например "2025"), если не указан - текущий год
    - **force_new_season**: True = создать новый сезон, False = обновить текущий
    """
    start_time = datetime.now()
    file_path = None
    
    try:
        # 1. Валидация
        if not file.filename.endswith('.xlsx'):
            raise HTTPException(status_code=400, detail="Only .xlsx files are supported")
        
        if slice_type not in ['TOTAL', 'PER90']:
            raise HTTPException(status_code=400, detail="slice_type must be 'TOTAL' or 'PER90'")
        
        # 2. Сохраняем файл
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{tournament_id}_{slice_type}_{file.filename}"
        file_path = FilePath(settings.upload_path) / safe_filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"File saved: {file_path}")
        
        # 3. Загружаем через DataLoader
        loader = DataLoader(db)
        
        result = loader.load_file(
            file_path=file_path,
            tournament_id=tournament_id,
            slice_type=slice_type,
            period_type='SEASON',
            period_value=season,  # Если None - будет взят из tournaments.season
            force_new_season=force_new_season
        )
        
        duration = (datetime.now() - start_time).total_seconds()
        
        tournament_name = settings.get_tournament_name(tournament_id)
        
        return {
            "status": "success",
            "file_name": file.filename,
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "slice_type": slice_type,
            "season": season or "current",
            "slice_id": result['slice_id'],
            "is_new_slice": result['is_new_slice'],
            "players_loaded": result['players_loaded'],
            "stats_loaded": result['stats_loaded'],
            "duration_seconds": round(duration, 2),
            "message": "Данные успешно загружены" if result['is_new_slice'] 
                      else "Данные успешно обновлены"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading season stats: {e}")
        
        # Удаляем файл при ошибке
        if file_path and file_path.exists():
            try:
                os.unlink(file_path)
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload/tournament", summary="Загрузить данные турнира (с выбором сезона и тура)")
async def upload_tournament_data(
    file: UploadFile = File(..., description="Excel файл с статистикой"),
    tournament_id: int = Form(..., ge=0, le=3, description="ID турнира"),
    slice_type: str = Form(..., description="TOTAL или PER90"),
    season: Optional[str] = Form(None, description="Год сезона (например '2025')"),
    round: Optional[int] = Form(None, ge=1, le=50, description="Номер тура (1-50)"),
    db: Session = Depends(get_db)
):
    """
    Загрузка статистики турнира с указанием сезона и тура.
    
    **Параметры:**
    - **file**: Excel файл (.xlsx)
    - **tournament_id**: 0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3
    - **slice_type**: "TOTAL" (суммарная) или "PER90" (за 90 минут)
    - **season**: Год сезона (например "2025")
    - **round**: Номер тура (1-50) - данные будут записаны как "туры 1-{round}"
    
    **Логика:**
    - Данные перезаписываются для указанного сезона
    - Тур используется для отображения информации о загрузке
    """
    start_time = datetime.now()
    file_path = None
    
    try:
        # 1. Валидация
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы .xlsx и .xls")
        
        if slice_type not in ['TOTAL', 'PER90']:
            raise HTTPException(status_code=400, detail="slice_type должен быть 'TOTAL' или 'PER90'")
        
        # 2. Проверяем соответствие файла турниру
        file_tournament_id = excel_service.get_tournament_from_filename(file.filename)
        if file_tournament_id is not None and file_tournament_id != tournament_id:
            expected_patterns = {0: "mfl", 1: "yfl1", 2: "yfl2", 3: "yfl3"}
            tournament_name = settings.get_tournament_name(tournament_id)
            file_tournament_name = settings.get_tournament_name(file_tournament_id)
            raise HTTPException(
                status_code=400,
                detail=f"Несоответствие файла турниру! Выбран турнир '{tournament_name}', "
                       f"но файл '{file.filename}' предназначен для '{file_tournament_name}'"
            )
        
        # 3. Определяем сезон
        if season is None:
            season = str(datetime.now().year)
        
        # 4. Сохраняем файл
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        round_str = f"_round{round}" if round else ""
        safe_filename = f"{timestamp}_{tournament_id}_{slice_type}_season{season}{round_str}_{file.filename}"
        file_path = FilePath(settings.upload_path) / safe_filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"📁 File saved: {file_path}")
        
        # 5. Загружаем через DataLoader
        loader = DataLoader(db)
        
        result = loader.load_file(
            file_path=file_path,
            tournament_id=tournament_id,
            slice_type=slice_type,
            period_type='SEASON',
            period_value=season,
            force_new_season=False  # Всегда обновляем существующий сезон
        )
        
        duration = (datetime.now() - start_time).total_seconds()
        tournament_name = settings.get_tournament_name(tournament_id)
        
        return {
            "status": "success",
            "file_name": file.filename,
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "slice_type": slice_type,
            "season": season,
            "round": round,
            "slice_id": result['slice_id'],
            "players_loaded": result['players_loaded'],
            "stats_loaded": result['stats_loaded'],
            "duration_seconds": round(duration, 2),
            "message": f"Данные сезона {season}, туры 1-{round or '?'} успешно загружены"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading tournament data: {e}")
        
        if file_path and file_path.exists():
            try:
                os.unlink(file_path)
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки: {str(e)}")


@router.post("/upload/round", summary="Загрузить данные за тур")
async def upload_round_data(
    file: UploadFile = File(..., description="Excel файл с статистикой за тур"),
    tournament_id: int = Form(..., ge=0, le=3, description="ID турнира"),
    slice_type: str = Form(..., description="TOTAL или PER90"),
    season: Optional[str] = Form(None, description="Год сезона (например '2025')"),
    round_number: int = Form(..., ge=1, le=50, description="Номер тура (1-50)"),
    db: Session = Depends(get_db)
):
    """
    Загрузка статистики за конкретный тур.
    
    **Параметры:**
    - **file**: Excel файл (.xlsx)
    - **tournament_id**: 0=МФЛ, 1=ЮФЛ-1, 2=ЮФЛ-2, 3=ЮФЛ-3
    - **slice_type**: "TOTAL" (суммарная за тур) или "PER90" (за 90 минут)
    - **season**: Год сезона (например "2025")
    - **round_number**: Номер тура (1-50)
    
    **Хранение данных:**
    - period_type = 'ROUND'
    - period_value = номер тура (например '16')
    - Данные хранятся отдельно от сезонных данных
    """
    start_time = datetime.now()
    file_path = None
    
    try:
        # 1. Валидация
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы .xlsx и .xls")
        
        if slice_type not in ['TOTAL', 'PER90']:
            raise HTTPException(status_code=400, detail="slice_type должен быть 'TOTAL' или 'PER90'")
        
        # 2. Проверяем соответствие файла турниру
        file_tournament_id = excel_service.get_tournament_from_filename(file.filename)
        if file_tournament_id is not None and file_tournament_id != tournament_id:
            expected_patterns = {0: "mfl", 1: "yfl1", 2: "yfl2", 3: "yfl3"}
            tournament_name = settings.get_tournament_name(tournament_id)
            file_tournament_name = settings.get_tournament_name(file_tournament_id)
            raise HTTPException(
                status_code=400,
                detail=f"Несоответствие файла турниру! Выбран турнир '{tournament_name}', "
                       f"но файл '{file.filename}' предназначен для '{file_tournament_name}'"
            )
        
        # 3. Определяем сезон
        if season is None:
            season = str(datetime.now().year)
        
        # 4. Сохраняем файл
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{tournament_id}_{slice_type}_round{round_number}_{file.filename}"
        file_path = FilePath(settings.upload_path) / safe_filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"📁 Round file saved: {file_path}")
        
        # 5. Загружаем через DataLoader с period_type='ROUND'
        loader = DataLoader(db)
        
        result = loader.load_file(
            file_path=file_path,
            tournament_id=tournament_id,
            slice_type=slice_type,
            period_type='ROUND',  # ← Ключевое отличие: данные за тур
            period_value=str(round_number),  # ← Номер тура как period_value
            force_new_season=False
        )
        
        # 6. Обновляем current_round турнира (только если загруженный тур больше текущего)
        db.execute(text("""
            UPDATE tournaments 
            SET current_round = GREATEST(COALESCE(current_round, 0), :round_number),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :tournament_id
        """), {
            'tournament_id': tournament_id,
            'round_number': round_number
        })
        db.commit()
        logger.info(f"📊 Updated tournament {tournament_id} current_round to {round_number}")
        
        duration = (datetime.now() - start_time).total_seconds()
        tournament_name = settings.get_tournament_name(tournament_id)
        
        return {
            "status": "success",
            "file_name": file.filename,
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "slice_type": slice_type,
            "period_type": "ROUND",
            "season": season,
            "round_number": round_number,
            "slice_id": result['slice_id'],
            "players_loaded": result['players_loaded'],
            "stats_loaded": result['stats_loaded'],
            "duration_seconds": round(duration, 2),
            "message": f"Данные за тур {round_number} ({slice_type}) успешно загружены"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading round data: {e}")
        
        if file_path and file_path.exists():
            try:
                os.unlink(file_path)
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки: {str(e)}")


@router.get("/check-new-season/{tournament_id}", summary="Проверить нужен ли новый сезон")
async def check_new_season(
    tournament_id: int = Path(..., ge=0, le=3),
    slice_type: str = Query('TOTAL', description="TOTAL или PER90"),
    new_season: str = Query(..., description="Год сезона который хотите загрузить (например '2025' или '2026')"),
    db: Session = Depends(get_db)
):
    """
    Проверить, нужно ли создавать новый slice для нового сезона.
    
    **Использование:**
    Перед загрузкой файла фронтенд вызывает этот endpoint:
    - Если `needs_new_season=true` → показать диалог "Начать новый сезон?"
    - Если `needs_new_season=false` → просто загрузить файл (обновится текущий slice)
    
    **Пример:**
    ```
    GET /api/check-new-season/0?slice_type=TOTAL&new_season=2026
    
    Ответ:
    {
      "needs_new_season": true,
      "current_season": "2025",
      "new_season": "2026",
      "message": "Обнаружен новый сезон. Создать новый slice?"
    }
    ```
    """
    try:
        from sqlalchemy import text
        
        # Получаем последний slice для турнира
        result = db.execute(text("""
            SELECT period_value, uploaded_at
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
        
        row = result.fetchone()
        
        if row:
            current_season = row[0]
            needs_new = (current_season != new_season)
            
            return {
                "needs_new_season": needs_new,
                "current_season": current_season,
                "new_season": new_season,
                "tournament_id": tournament_id,
                "slice_type": slice_type,
                "message": f"Обнаружен новый сезон ({new_season}). Создать новый slice?" if needs_new
                          else f"Обновление текущего сезона ({current_season})"
            }
        else:
            # Нет существующих слайсов - это первая загрузка
            return {
                "needs_new_season": True,
                "current_season": None,
                "new_season": new_season,
                "tournament_id": tournament_id,
                "slice_type": slice_type,
                "message": "Первая загрузка данных для этого турнира"
            }
        
    except Exception as e:
        logger.error(f"Error checking new season: {e}")
        raise HTTPException(status_code=500, detail=str(e))


