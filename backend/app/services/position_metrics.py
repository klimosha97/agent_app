"""
Сервис для парсинга POSITION_INFO.txt и синхронизации с БД.
Определяет core/support/risk метрики для каждой позиции.
Определяет группы сравнения (comparison_group) для расчёта перцентилей.
"""

import logging
import re
from pathlib import Path
from typing import Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

# =====================================================================
# Группы сравнения позиций
# Перцентиль считается внутри группы, а не точной позиции.
# =====================================================================
COMPARISON_GROUPS: Dict[str, str] = {
    # НАП — Нападающие (центральные форварды)
    "Ф Ц":  "НАП",
    "Ф ЛЦ": "НАП",
    "Ф ПЦ": "НАП",
    # АП Ц — Атакующие полузащитники центральные
    "АП Ц":  "АП Ц",
    "АП ЛЦ": "АП Ц",
    "АП ПЦ": "АП Ц",
    # ФЛ — Фланговые (АП + П фланговые)
    "АП Л": "ФЛ",
    "АП П": "ФЛ",
    "П Л":  "ФЛ",
    "П П":  "ФЛ",
    # ПЗ Ц — Полузащитники центральные
    "П Ц":  "ПЗ Ц",
    "П ЛЦ": "ПЗ Ц",
    "П ПЦ": "ПЗ Ц",
    # ОП — Опорные полузащитники (все)
    "ЗП Ц":  "ОП",
    "ЗП Л":  "ОП",
    "ЗП П":  "ОП",
    "ЗП ЛЦ": "ОП",
    "ЗП ПЦ": "ОП",
    # ЦЗ — Центральные защитники
    "З Ц":  "ЦЗ",
    "З ЛЦ": "ЦЗ",
    "З ПЦ": "ЦЗ",
    # КЗ — Крайние защитники
    "З Л": "КЗ",
    "З П": "КЗ",
}

# Путь к файлу конфигурации позиций
# В Docker: монтируется в /data/POSITION_INFO.txt
# При локальной разработке: корень проекта
_DOCKER_PATH = Path("/data/POSITION_INFO.txt")
_LOCAL_PATH = Path(__file__).resolve().parents[3] / "POSITION_INFO.txt"

def _resolve_position_info_path() -> Path:
    """Find POSITION_INFO.txt in known locations."""
    if _DOCKER_PATH.exists():
        return _DOCKER_PATH
    if _LOCAL_PATH.exists():
        return _LOCAL_PATH
    # Walk up from the file to find it
    p = Path(__file__).resolve().parent
    for _ in range(6):
        candidate = p / "POSITION_INFO.txt"
        if candidate.exists():
            return candidate
        if p == p.parent:
            break
        p = p.parent
    return _DOCKER_PATH  # fallback; will report error in parse

POSITION_INFO_PATH = _resolve_position_info_path()


def parse_position_info(file_path: Path = None) -> Dict[str, Dict[str, List[str]]]:
    """
    Парсит POSITION_INFO.txt и возвращает структуру:
    {
        "Ф Ц": {"core": [...], "support": [...], "risk": [...]},
        "АП Л": {"core": [...], "support": [...], "risk": [...]},
        ...
    }
    """
    if file_path is None:
        file_path = POSITION_INFO_PATH

    if not file_path.exists():
        logger.error(f"Position info file not found: {file_path}")
        return {}

    content = file_path.read_text(encoding="utf-8")
    result = {}

    current_position = None

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue

        # Detect position header lines like "Ф Ц (Форвард центральный)"
        # or "АП ЛЦ (Атакующий полузащитник левоцентральный)"
        # Position codes are short (max ~6 chars): "Ф Ц", "АП ЛЦ", "ЗП ПЦ", etc.
        pos_match = re.match(r'^([А-ЯЁа-яё]+(?:\s+[А-ЯЁа-яё]+)*)\s*\(', line)
        if pos_match:
            candidate = pos_match.group(1).strip()
            # Real position codes are short; skip file headers
            if len(candidate) <= 6:
                current_position = candidate
                result[current_position] = {"core": [], "support": [], "risk": []}
            continue

        # Parse bucket lines: "- core: metric1, metric2, ..."
        bucket_match = re.match(r'^-\s*(core|support|risk):\s*(.+)$', line)
        if bucket_match and current_position:
            bucket = bucket_match.group(1)
            metrics_str = bucket_match.group(2)
            metrics = [m.strip() for m in metrics_str.split(",") if m.strip()]
            result[current_position][bucket] = metrics

    logger.info(f"Parsed {len(result)} positions from {file_path.name}")
    return result


def sync_position_metrics(db: Session) -> Dict[str, int]:
    """
    Синхронизирует position_metric_config из POSITION_INFO.txt.
    Выполняет полную перезапись (DELETE + INSERT) для консистентности.
    
    Returns:
        {"positions": N, "metrics": M}
    """
    parsed = parse_position_info()
    if not parsed:
        logger.warning("No position metrics parsed, skipping sync")
        return {"positions": 0, "metrics": 0}

    try:
        # Clear old config
        db.execute(text("DELETE FROM position_metric_config"))

        total_metrics = 0
        for position_code, buckets in parsed.items():
            for bucket, metrics in buckets.items():
                for metric_code in metrics:
                    db.execute(text("""
                        INSERT INTO position_metric_config (position_code, metric_code, bucket)
                        VALUES (:position_code, :metric_code, :bucket)
                        ON CONFLICT (position_code, metric_code) DO UPDATE SET bucket = EXCLUDED.bucket
                    """), {
                        "position_code": position_code,
                        "metric_code": metric_code,
                        "bucket": bucket,
                    })
                    total_metrics += 1

        # Sync comparison_group into positions table
        for pos_code, cg in COMPARISON_GROUPS.items():
            db.execute(text("""
                UPDATE positions SET comparison_group = :cg WHERE code = :code
            """), {"cg": cg, "code": pos_code})

        db.commit()
        logger.info(f"Synced position_metric_config: {len(parsed)} positions, {total_metrics} metric entries, {len(COMPARISON_GROUPS)} comparison groups")
        return {"positions": len(parsed), "metrics": total_metrics}

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to sync position metrics: {e}")
        raise


def get_position_metrics(db: Session, position_code: str = None) -> Dict:
    """
    Получить конфигурацию метрик по позициям.
    
    Args:
        position_code: Код позиции (если None - все позиции)
    
    Returns:
        Если position_code:
            {"core": [...], "support": [...], "risk": [...]}
        Иначе:
            {"Ф Ц": {"core": [...], ...}, ...}
    """
    if position_code:
        result = db.execute(text("""
            SELECT metric_code, bucket 
            FROM position_metric_config 
            WHERE position_code = :code
            ORDER BY bucket, metric_code
        """), {"code": position_code})

        data = {"core": [], "support": [], "risk": []}
        for row in result:
            data[row[1]].append(row[0])
        return data
    else:
        result = db.execute(text("""
            SELECT position_code, metric_code, bucket 
            FROM position_metric_config 
            ORDER BY position_code, bucket, metric_code
        """))

        data = {}
        for row in result:
            pos = row[0]
            if pos not in data:
                data[pos] = {"core": [], "support": [], "risk": []}
            data[pos][row[2]].append(row[1])
        return data
