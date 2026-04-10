"""
API router for the AI Scout-assistant.
6 endpoints: round-review, season-review, player-analysis, compare, chat, watched-review.
"""

import logging
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.services.ai_agent import (
    RoundDataCollector,
    SeasonDataCollector,
    PlayerDataCollector,
    ComparisonDataCollector,
    WatchedPlayersDataCollector,
    WeeklyDigestCollector,
    PromptBuilder,
    ChartDataBuilder,
    SYSTEM_PROMPT,
    compute_data_hash,
    get_cached_review,
    save_review_cache,
)
from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI Agent"])


# ======================================================================
# Request / response schemas
# ======================================================================

class RoundReviewRequest(BaseModel):
    tournament_id: int
    round_number: int

class SeasonReviewRequest(BaseModel):
    tournament_id: int

class PlayerAnalysisRequest(BaseModel):
    player_id: int

class CompareRequest(BaseModel):
    player_ids: List[int] = Field(..., min_length=2, max_length=4)

class ChatRequest(BaseModel):
    tournament_id: int
    question: str = Field(..., min_length=2, max_length=1000)
    round_number: Optional[int] = None

class WatchedReviewRequest(BaseModel):
    tournament_id: int
    list_type: Literal["MY", "TRACKED"]


def _ai_response(text: str, charts: list, highlighted: list):
    return {
        "success": True,
        "text": text,
        "charts": charts,
        "highlighted_players": highlighted,
    }


def _ai_error(text: str, charts: list = None, highlighted: list = None):
    return {
        "success": False,
        "text": text,
        "charts": charts or [],
        "highlighted_players": highlighted or [],
    }


def _extract_highlighted(top_players: list, limit: int = 5) -> list:
    result = []
    for p in top_players[:limit]:
        result.append({
            "player_id": p["player_id"],
            "full_name": p["full_name"],
            "team_name": p.get("team_name", ""),
            "position_name": p.get("position_name", ""),
            "reason": f"total_score {p['total_score']}",
        })
    return result


def _check_ai():
    if not settings.ai_enabled:
        raise HTTPException(status_code=503, detail="ИИ-агент отключён")
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="API ключ не настроен. Укажите OPENAI_API_KEY в .env")


# ======================================================================
# Endpoints
# ======================================================================

@router.post("/round-review", summary="Обзор тура от ИИ")
async def ai_round_review(body: RoundReviewRequest, db: Session = Depends(get_db)):
    _check_ai()

    collector = RoundDataCollector()
    data = collector.collect(db, body.tournament_id, body.round_number)

    if "error" in data:
        return _ai_error(data["error"])

    data_hash = compute_data_hash(data)
    cached = get_cached_review(db, body.tournament_id, body.round_number, "round_review", data_hash)
    if cached:
        logger.info("Returning cached round review")
        return cached

    charts = []
    bar = ChartDataBuilder.top_bar_chart(data.get("top_players", []))
    if bar:
        charts.append(bar)
    top_player = data.get("top_players", [None])[0]
    if top_player:
        metrics = data.get("player_metrics", {}).get(top_player["player_id"], [])
        radar = ChartDataBuilder.player_radar(metrics, top_player["full_name"])
        if radar:
            charts.append(radar)

    highlighted = _extract_highlighted(data.get("top_players", []))

    prompt_text = PromptBuilder.round_review(data)
    llm = get_llm_client()
    try:
        ai_text = await llm.generate(SYSTEM_PROMPT, prompt_text)
    except Exception as e:
        logger.error("LLM error in round-review: %s", e)
        return _ai_error(f"Ошибка ИИ: {e}", charts, highlighted)

    result = _ai_response(ai_text, charts, highlighted)

    try:
        save_review_cache(db, body.tournament_id, body.round_number, "round_review", data_hash, result)
    except Exception as e:
        logger.warning("Failed to cache review: %s", e)

    return result


@router.post("/season-review", summary="Обзор сезона от ИИ")
async def ai_season_review(body: SeasonReviewRequest, db: Session = Depends(get_db)):
    _check_ai()

    collector = SeasonDataCollector()
    data = collector.collect(db, body.tournament_id)

    if "error" in data:
        return _ai_error(data["error"])

    data_hash = compute_data_hash(data)
    cached = get_cached_review(db, body.tournament_id, None, "season_review", data_hash)
    if cached:
        return cached

    charts = []
    bar = ChartDataBuilder.top_bar_chart(data.get("top_players", []))
    if bar:
        charts.append(bar)
    top_player = data.get("top_players", [None])[0]
    if top_player:
        metrics = data.get("player_metrics", {}).get(top_player["player_id"], [])
        radar = ChartDataBuilder.player_radar(metrics, top_player["full_name"])
        if radar:
            charts.append(radar)

    highlighted = _extract_highlighted(data.get("top_players", []))

    prompt_text = PromptBuilder.season_review(data)
    llm = get_llm_client()
    try:
        ai_text = await llm.generate(SYSTEM_PROMPT, prompt_text)
    except Exception as e:
        logger.error("LLM error in season-review: %s", e)
        return _ai_error(f"Ошибка ИИ: {e}", charts, highlighted)

    result = _ai_response(ai_text, charts, highlighted)

    try:
        save_review_cache(db, body.tournament_id, None, "season_review", data_hash, result)
    except Exception as e:
        logger.warning("Failed to cache review: %s", e)

    return result


@router.post("/player-analysis", summary="Анализ игрока от ИИ")
async def ai_player_analysis(body: PlayerAnalysisRequest, db: Session = Depends(get_db)):
    _check_ai()

    collector = PlayerDataCollector()
    data = collector.collect(db, body.player_id)

    if "error" in data:
        return _ai_error(data["error"])

    charts = []
    radar = ChartDataBuilder.player_radar(
        data.get("season_metrics", []),
        data["player"]["full_name"],
    )
    if radar:
        charts.append(radar)
    line = ChartDataBuilder.history_line(data.get("history", []), data["player"]["full_name"])
    if line:
        charts.append(line)

    player = data["player"]
    highlighted = [{
        "player_id": player["player_id"],
        "full_name": player["full_name"],
        "team_name": player.get("team_name", ""),
        "position_name": player.get("position_name", ""),
        "reason": "Анализируемый игрок",
    }]

    prompt_text = PromptBuilder.player_analysis(data)
    llm = get_llm_client()
    try:
        ai_text = await llm.generate(SYSTEM_PROMPT, prompt_text)
    except Exception as e:
        logger.error("LLM error in player-analysis: %s", e)
        return _ai_error(f"Ошибка ИИ: {e}", charts, highlighted)

    return _ai_response(ai_text, charts, highlighted)


@router.post("/compare", summary="Сравнение игроков от ИИ")
async def ai_compare(body: CompareRequest, db: Session = Depends(get_db)):
    _check_ai()

    collector = ComparisonDataCollector()
    data = collector.collect(db, body.player_ids)

    if not data.get("players"):
        return _ai_error("Игроки не найдены")

    charts = []
    comp_bar = ChartDataBuilder.comparison_bar(data["players"])
    if comp_bar:
        charts.append(comp_bar)
    for pd in data["players"]:
        radar = ChartDataBuilder.player_radar(
            pd.get("season_metrics", []),
            pd["player"]["full_name"],
        )
        if radar:
            charts.append(radar)

    highlighted = [
        {
            "player_id": pd["player"]["player_id"],
            "full_name": pd["player"]["full_name"],
            "team_name": pd["player"].get("team_name", ""),
            "position_name": pd["player"].get("position_name", ""),
            "reason": "Сравниваемый игрок",
        }
        for pd in data["players"]
    ]

    prompt_text = PromptBuilder.compare_players(data)
    llm = get_llm_client()
    try:
        ai_text = await llm.generate(SYSTEM_PROMPT, prompt_text)
    except Exception as e:
        logger.error("LLM error in compare: %s", e)
        return _ai_error(f"Ошибка ИИ: {e}", charts, highlighted)

    return _ai_response(ai_text, charts, highlighted)


@router.post("/chat", summary="Свободный вопрос скаута")
async def ai_chat(body: ChatRequest, db: Session = Depends(get_db)):
    _check_ai()

    context: dict = {}
    tournament = RoundDataCollector._tournament_info(db, body.tournament_id)
    if not tournament:
        return _ai_error(f"Турнир {body.tournament_id} не найден")
    context["tournament"] = tournament

    rn = body.round_number or tournament.get("current_round")
    if rn:
        round_slice_id = RoundDataCollector._find_round_slice(db, body.tournament_id, rn)
        if round_slice_id:
            context["round_number"] = rn
            context["round_top_players"] = RoundDataCollector._top_players(db, round_slice_id, limit=10)
            top_pids = [p["player_id"] for p in context["round_top_players"][:5]]
            context["round_player_metrics"] = RoundDataCollector._player_metrics(db, round_slice_id, top_pids)
            context["round_top_by_position"] = RoundDataCollector._top_by_position(db, round_slice_id)

    season_collector = SeasonDataCollector()
    season_data = season_collector.collect(db, body.tournament_id)
    if "error" not in season_data:
        context["season_top_players"] = season_data.get("top_players", [])
        context["season_top_by_position"] = season_data.get("top_by_position", {})
        context["season_player_metrics"] = season_data.get("player_metrics", {})

    charts = []
    highlighted = []
    season_top = context.get("season_top_players", [])
    round_top = context.get("round_top_players", [])
    if season_top:
        bar = ChartDataBuilder.top_bar_chart(season_top, limit=5)
        if bar:
            bar["title"] = "Топ сезона"
            charts.append(bar)
        highlighted = _extract_highlighted(season_top, limit=3)
    elif round_top:
        bar = ChartDataBuilder.top_bar_chart(round_top, limit=5)
        if bar:
            charts.append(bar)
        highlighted = _extract_highlighted(round_top, limit=3)

    prompt_text = PromptBuilder.chat(body.question, context)
    llm = get_llm_client()
    try:
        ai_text = await llm.generate(SYSTEM_PROMPT, prompt_text, max_tokens=4000)
    except Exception as e:
        logger.error("LLM error in chat: %s", e)
        return _ai_error(f"Ошибка ИИ: {e}", charts, highlighted)

    return _ai_response(ai_text, charts, highlighted)


@router.post("/watched-review", summary="Обзор моих/отслеживаемых игроков")
async def ai_watched_review(body: WatchedReviewRequest, db: Session = Depends(get_db)):
    _check_ai()

    collector = WatchedPlayersDataCollector()
    data = collector.collect(db, body.tournament_id, body.list_type)

    if "error" in data:
        return _ai_error(data["error"])

    players = data.get("players", [])
    if not players:
        return _ai_error("Нет игроков с данными для анализа")

    charts = []
    bar = ChartDataBuilder.watched_bar(players)
    if bar:
        charts.append(bar)
    multi_line = ChartDataBuilder.watched_multi_line(players)
    if multi_line:
        charts.append(multi_line)
    for pd in players[:3]:
        radar = ChartDataBuilder.player_radar(
            pd.get("season_metrics", []),
            pd["player"]["full_name"],
        )
        if radar:
            charts.append(radar)

    highlighted = [
        {
            "player_id": pd["player"]["player_id"],
            "full_name": pd["player"]["full_name"],
            "team_name": pd["player"].get("team_name", ""),
            "position_name": pd["player"].get("position_name", ""),
            "reason": _trend_reason(pd.get("stability", {})),
        }
        for pd in players
    ]

    prompt_text = PromptBuilder.watched_players_review(data)
    llm = get_llm_client()
    try:
        ai_text = await llm.generate(SYSTEM_PROMPT, prompt_text, max_tokens=4000)
    except Exception as e:
        logger.error("LLM error in watched-review: %s", e)
        return _ai_error(f"Ошибка ИИ: {e}", charts, highlighted)

    return _ai_response(ai_text, charts, highlighted)


def _trend_reason(stability: dict) -> str:
    trend = stability.get("trend", "insufficient_data")
    labels = {
        "improving": "Тренд: рост",
        "declining": "Тренд: спад",
        "stable": "Стабильная форма",
        "insufficient_data": "Мало данных",
    }
    label = labels.get(trend, trend)
    avg = stability.get("avg_score")
    if avg is not None:
        label += f" (avg {round(avg * 100)}%)"
    return label


@router.post("/weekly-digest", summary="Еженедельный дайджест по всем турнирам")
async def ai_weekly_digest(db: Session = Depends(get_db)):
    _check_ai()

    collector = WeeklyDigestCollector()
    data = collector.collect(db)

    if "error" in data:
        return _ai_error(data["error"])

    reports = data.get("reports", [])
    if not reports:
        return _ai_error("Нет турниров для анализа")

    llm = get_llm_client()
    results = []

    for report in reports:
        t = report["tournament"]

        if report["status"] == "no_data":
            results.append({
                "tournament_id": t["id"],
                "tournament_name": t["name"],
                "tournament_full_name": t.get("full_name", t["name"]),
                "round_number": None,
                "status": "no_data",
                "text": report.get("message", f"Нового тура в «{t['name']}» не было"),
                "charts": [],
                "highlighted_players": [],
            })
            continue

        if report["status"] == "cached":
            cached = report["cached_result"]
            results.append({
                "tournament_id": t["id"],
                "tournament_name": t["name"],
                "tournament_full_name": t.get("full_name", t["name"]),
                "round_number": report["round_number"],
                "status": "cached",
                **cached,
            })
            continue

        rn = report["round_number"]
        top = report.get("top_players", [])

        charts = []
        bar = ChartDataBuilder.top_bar_chart(top, limit=5)
        if bar:
            bar["title"] = f"Топ тура {rn} — {t['name']}"
            charts.append(bar)
        if top:
            metrics = report.get("player_metrics", {}).get(top[0]["player_id"], [])
            radar = ChartDataBuilder.player_radar(metrics, top[0]["full_name"])
            if radar:
                charts.append(radar)

        highlighted = _extract_highlighted(top, limit=3)

        prompt_text = PromptBuilder.weekly_digest_tournament(report)
        try:
            ai_text = await llm.generate(SYSTEM_PROMPT, prompt_text, max_tokens=2000)
        except Exception as e:
            logger.error("LLM error for weekly digest %s: %s", t["name"], e)
            ai_text = f"Ошибка генерации обзора: {e}"

        result_item = {
            "tournament_id": t["id"],
            "tournament_name": t["name"],
            "tournament_full_name": t.get("full_name", t["name"]),
            "round_number": rn,
            "status": "new",
            "text": ai_text,
            "charts": charts,
            "highlighted_players": highlighted,
        }
        results.append(result_item)

        try:
            save_review_cache(
                db, t["id"], rn, "weekly_digest", "",
                {"text": ai_text, "charts": charts, "highlighted_players": highlighted},
            )
        except Exception as e:
            logger.warning("Failed to cache weekly digest for %s: %s", t["name"], e)

    return {"success": True, "reports": results}
