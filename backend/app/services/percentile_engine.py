"""
Движок расчёта перцентилей и скоров для Talent Scouting.

Два режима:
1. Round analysis — показатели игрока за тур vs PER90 SEASON baseline (яркость в одном туре)
2. Season analysis — PER90 SEASON данные каждого игрока vs все игроки той же позиции (стабильность за весь сезон)

Порог: в baseline включаются только игроки с > MIN_MINUTES_THRESHOLD минут за сезон.
"""

import logging
import math
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Минимальное количество минут за сезон для включения в baseline перцентилей
MIN_MINUTES_THRESHOLD = 200


def _resolve_tier_season(db: Session, tournament_id: int) -> Optional[str]:
    """Find the actual season value stored in team_tiers for this tournament."""
    row = db.execute(text("""
        SELECT DISTINCT season FROM team_tiers
        WHERE tournament_id = :tid
        ORDER BY season DESC LIMIT 1
    """), {"tid": tournament_id}).fetchone()
    return row[0] if row else None


def compute_round_analysis(
    db: Session,
    round_slice_id: int,
    tournament_id: int,
    season: str,
) -> Dict:
    """
    Главная точка входа: вычислить перцентили и скоры для тура.
    
    1. Определить доступные baselines (LEAGUE, TIER, BENCHMARK)
    2. Для каждого baseline — batch-SQL перцентили
    3. Агрегировать в round_scores
    
    Returns:
        {"computed_baselines": [...], "players_processed": N, "warnings": [...]}
    """
    warnings = []
    computed_baselines = []
    total_players = 0

    # Resolve actual tier season (may differ from the passed season)
    tier_season = _resolve_tier_season(db, tournament_id) or season

    # --- 1. Resolve LEAGUE baseline (PER90 SEASON slice for this tournament) ---
    league_slice_id = _find_league_baseline(db, tournament_id, season)
    if league_slice_id:
        n = _compute_for_baseline(db, round_slice_id, league_slice_id, "LEAGUE", tournament_id)
        computed_baselines.append("LEAGUE")
        total_players = max(total_players, n)
        logger.info(f"LEAGUE baseline: {n} players processed")
    else:
        warnings.append("Нет сезонных PER90 данных для LEAGUE baseline")

    # --- 2. Resolve TIER baselines ---
    tier_result = _compute_tier_baseline(db, round_slice_id, tournament_id, tier_season)
    if tier_result:
        computed_baselines.append("TIER")
        total_players = max(total_players, tier_result)
        logger.info(f"TIER baseline: {tier_result} players processed")
    else:
        warnings.append("Тиры команд не настроены или нет данных для TIER baseline")

    # --- 3. Resolve BENCHMARK baseline ---
    benchmark_slice_id = _find_benchmark_baseline(db, tournament_id)
    if benchmark_slice_id:
        n = _compute_for_baseline(db, round_slice_id, benchmark_slice_id, "BENCHMARK", tournament_id)
        computed_baselines.append("BENCHMARK")
        total_players = max(total_players, n)
        logger.info(f"BENCHMARK baseline: {n} players processed")
    else:
        warnings.append("Эталонный сезон не загружен для BENCHMARK baseline")

    return {
        "computed_baselines": computed_baselines,
        "players_processed": total_players,
        "warnings": warnings,
    }


def compute_season_analysis(
    db: Session,
    tournament_id: int,
) -> Dict:
    """
    Вычислить перцентили и скоры для СЕЗОНА (стабильность на дистанции).
    
    Каждый игрок из PER90 SEASON данных сравнивается со ВСЕМИ игроками
    той же позиции в тех же PER90 SEASON данных.
    
    Это «рейтинг внутри позиции за весь сезон» — 
    кто стабильно лучше на своей позиции в среднем за 90 минут.
    
    Результаты сохраняются в round_percentiles/round_scores 
    с round_slice_id = PER90 SEASON slice_id, baseline_kind = 'SEASON'.
    """
    # Find PER90 SEASON slice
    per90_slice_id = _find_league_baseline(db, tournament_id, "")
    if not per90_slice_id:
        return {
            "computed": False,
            "players_processed": 0,
            "error": "Нет PER90 данных за сезон для этого турнира",
        }

    logger.info(f"Computing season analysis for tournament {tournament_id}, slice {per90_slice_id}")

    # Self-referential: source = baseline
    # Each player's PER90 values are compared against ALL players at the same position
    n = _compute_for_baseline(
        db=db,
        round_slice_id=per90_slice_id,       # source: PER90 SEASON
        baseline_slice_id=per90_slice_id,     # baseline: same PER90 SEASON
        baseline_kind="SEASON",               # new kind to distinguish from round LEAGUE
        tournament_id=tournament_id,
    )

    logger.info(f"Season analysis complete: {n} players processed")

    # --- BENCHMARK baseline for season ---
    computed_baselines = ["SEASON"]
    benchmark_slice_id = _find_benchmark_baseline(db, tournament_id)
    benchmark_players = 0
    if benchmark_slice_id:
        benchmark_players = _compute_for_baseline(
            db=db,
            round_slice_id=per90_slice_id,          # source: PER90 SEASON (current season players)
            baseline_slice_id=benchmark_slice_id,    # baseline: benchmark season data
            baseline_kind="SEASON_BENCHMARK",        # distinguish from round BENCHMARK
            tournament_id=tournament_id,
        )
        computed_baselines.append("SEASON_BENCHMARK")
        logger.info(f"Season BENCHMARK baseline: {benchmark_players} players processed")

    return {
        "computed": True,
        "players_processed": n,
        "slice_id": per90_slice_id,
        "computed_baselines": computed_baselines,
        "benchmark_players": benchmark_players,
    }


# ======================================================================
# Internal helpers
# ======================================================================

def _find_league_baseline(db: Session, tournament_id: int, season: str) -> Optional[int]:
    """Find the latest PER90 SEASON slice for this tournament.
    
    Note: period_value may be a round range like '1-15' or a year like '2025',
    depending on how the data was uploaded. We just get the latest PER90 SEASON slice.
    """
    row = db.execute(text("""
        SELECT slice_id FROM stat_slices
        WHERE tournament_id = :tid
          AND slice_type = 'PER90'
          AND period_type = 'SEASON'
        ORDER BY uploaded_at DESC
        LIMIT 1
    """), {"tid": tournament_id}).fetchone()
    return row[0] if row else None


def _find_benchmark_baseline(db: Session, tournament_id: int) -> Optional[int]:
    """Find the benchmark slice for this tournament."""
    row = db.execute(text("""
        SELECT slice_id FROM benchmark_slices
        WHERE tournament_id = :tid
        LIMIT 1
    """), {"tid": tournament_id}).fetchone()
    return row[0] if row else None


def _compute_tier_baseline(
    db: Session,
    round_slice_id: int,
    tournament_id: int,
    season: str,
) -> Optional[int]:
    """
    Compute TIER baseline: for each player in the round, compare against
    the PER90 SEASON data filtered to their team's tier.
    """
    league_slice_id = _find_league_baseline(db, tournament_id, season)
    if not league_slice_id:
        return None

    # Check if any tiers are assigned
    tier_count = db.execute(text("""
        SELECT COUNT(*) FROM team_tiers
        WHERE tournament_id = :tid AND season = :season AND tier IS NOT NULL
    """), {"tid": tournament_id, "season": season}).scalar()

    if not tier_count or tier_count == 0:
        return None

    # For each round player, find their team's tier, then compute percentile
    # within that tier group
    # First, delete old TIER percentiles for this round
    db.execute(text("""
        DELETE FROM round_percentiles WHERE round_slice_id = :rsid AND baseline_kind = 'TIER'
    """), {"rsid": round_slice_id})
    db.execute(text("""
        DELETE FROM round_scores WHERE round_slice_id = :rsid AND baseline_kind = 'TIER'
    """), {"rsid": round_slice_id})

    # Find TOTAL SEASON slice for minutes check
    total_season_sid = db.execute(text("""
        SELECT slice_id FROM stat_slices
        WHERE tournament_id = :tid AND slice_type = 'TOTAL' AND period_type = 'SEASON'
        ORDER BY uploaded_at DESC LIMIT 1
    """), {"tid": tournament_id}).scalar()
    minutes_sid = total_season_sid or league_slice_id

    # Batch compute: for each round player,
    # the baseline is the subset of league players in the same tier AND comparison_group
    # with minutes > MIN_MINUTES_THRESHOLD
    db.execute(text("""
        INSERT INTO round_percentiles
            (round_slice_id, baseline_kind, player_id, position_code, metric_code, bucket, value, percentile)
        SELECT
            :rsid AS round_slice_id,
            'TIER' AS baseline_kind,
            rp.player_id,
            pos.code AS position_code,
            rps.metric_code,
            pmc.bucket,
            rps.metric_value AS value,
            CASE
                WHEN bc.cnt = 0 OR bc.cnt IS NULL THEN NULL
                ELSE (
                    SELECT COUNT(*)::float FROM player_statistics bps
                    JOIN players bp ON bp.player_id = bps.player_id
                    JOIN positions bpos ON bp.position_id = bpos.position_id
                    JOIN team_tiers btt ON bp.team_name = btt.team_name
                        AND btt.tournament_id = :tid AND btt.season = :season
                    WHERE bps.slice_id = :baseline_sid
                      AND bps.metric_code = rps.metric_code
                      AND bpos.comparison_group = pos.comparison_group
                      AND btt.tier = rtt.tier
                      AND bps.metric_value IS NOT NULL
                      AND bps.metric_value <= rps.metric_value
                      AND EXISTS (
                          SELECT 1 FROM player_statistics bpm
                          WHERE bpm.player_id = bp.player_id
                            AND bpm.slice_id = :minutes_sid
                            AND bpm.metric_code = 'minutes'
                            AND bpm.metric_value > :min_minutes
                      )
                ) / NULLIF(bc.cnt, 0)
            END AS percentile
        FROM player_statistics rps
        JOIN players rp ON rps.player_id = rp.player_id
        JOIN positions pos ON rp.position_id = pos.position_id
        JOIN position_metric_config pmc ON pmc.position_code = pos.code AND pmc.metric_code = rps.metric_code
        LEFT JOIN team_tiers rtt ON rp.team_name = rtt.team_name
            AND rtt.tournament_id = :tid AND rtt.season = :season
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::float AS cnt
            FROM player_statistics bps2
            JOIN players bp2 ON bp2.player_id = bps2.player_id
            JOIN positions bpos2 ON bp2.position_id = bpos2.position_id
            JOIN team_tiers btt2 ON bp2.team_name = btt2.team_name
                AND btt2.tournament_id = :tid AND btt2.season = :season
            WHERE bps2.slice_id = :baseline_sid
              AND bps2.metric_code = rps.metric_code
              AND bpos2.comparison_group = pos.comparison_group
              AND btt2.tier = rtt.tier
              AND bps2.metric_value IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM player_statistics bpm2
                  WHERE bpm2.player_id = bp2.player_id
                    AND bpm2.slice_id = :minutes_sid
                    AND bpm2.metric_code = 'minutes'
                    AND bpm2.metric_value > :min_minutes
              )
        ) bc ON true
        WHERE rps.slice_id = :rsid
          AND rps.metric_value IS NOT NULL
          AND rtt.tier IS NOT NULL
    """), {
        "rsid": round_slice_id,
        "tid": tournament_id,
        "season": season,
        "baseline_sid": league_slice_id,
        "minutes_sid": minutes_sid,
        "min_minutes": MIN_MINUTES_THRESHOLD,
    })

    # Now aggregate scores for TIER
    n = _aggregate_scores(db, round_slice_id, "TIER", tournament_id)
    db.commit()
    return n


def _compute_for_baseline(
    db: Session,
    round_slice_id: int,
    baseline_slice_id: int,
    baseline_kind: str,
    tournament_id: int,
    team_filter: Optional[List[str]] = None,
) -> int:
    """
    Batch-compute percentiles for all round players against a baseline slice.
    Then aggregate into round_scores.
    
    Returns number of players processed.
    """
    # Delete old results
    db.execute(text("""
        DELETE FROM round_percentiles WHERE round_slice_id = :rsid AND baseline_kind = :bk
    """), {"rsid": round_slice_id, "bk": baseline_kind})
    db.execute(text("""
        DELETE FROM round_scores WHERE round_slice_id = :rsid AND baseline_kind = :bk
    """), {"rsid": round_slice_id, "bk": baseline_kind})

    # Batch insert percentiles using a single SQL statement
    # For each round player's metric, count how many baseline players
    # in the same COMPARISON GROUP have a value <= the round player's value
    # (comparison_group объединяет схожие позиции, например З Ц + З ЛЦ + З ПЦ = ЦЗ)
    #
    # ВАЖНО: в baseline включаются только игроки с minutes > MIN_MINUTES_THRESHOLD
    # Это отсекает игроков с малым игровым временем, чья PER90 статистика нерепрезентативна
    #
    # Для определения минут используем TOTAL SEASON слайс того же турнира
    # (в PER90 слайсе минуты тоже есть, но TOTAL надёжнее — это реальные минуты)
    
    # For BENCHMARK baselines: players in the benchmark file are from a different
    # season, so the minutes filter should use the benchmark's own data.
    # We set min_minutes to 0 to effectively skip the filter for benchmark populations,
    # since all players in an uploaded benchmark file are assumed to have sufficient data.
    is_benchmark_baseline = baseline_kind in ("BENCHMARK", "SEASON_BENCHMARK")
    
    # Find the TOTAL SEASON slice for minutes lookup (used for current season's players)
    total_season_sid = db.execute(text("""
        SELECT ss2.slice_id FROM stat_slices ss2
        JOIN stat_slices ss1 ON ss1.tournament_id = ss2.tournament_id
        WHERE ss1.slice_id = :baseline_sid
          AND ss2.slice_type = 'TOTAL' AND ss2.period_type = 'SEASON'
        ORDER BY ss2.uploaded_at DESC LIMIT 1
    """), {"baseline_sid": baseline_slice_id}).scalar()
    
    # If no TOTAL SEASON slice, use baseline itself for minutes
    minutes_sid = total_season_sid or baseline_slice_id
    
    # For benchmark: use the benchmark slice itself as minutes source
    # and set threshold to 0 so all benchmark players are included
    if is_benchmark_baseline:
        minutes_sid = baseline_slice_id
    baseline_min_minutes = 0 if is_benchmark_baseline else MIN_MINUTES_THRESHOLD
    
    db.execute(text("""
        INSERT INTO round_percentiles
            (round_slice_id, baseline_kind, player_id, position_code, metric_code, bucket, value, percentile)
        SELECT
            :rsid AS round_slice_id,
            :bk AS baseline_kind,
            rp.player_id,
            pos.code AS position_code,
            rps.metric_code,
            pmc.bucket,
            rps.metric_value AS value,
            CASE
                WHEN bc.cnt = 0 OR bc.cnt IS NULL THEN NULL
                ELSE (
                    SELECT COUNT(*)::float FROM player_statistics bps
                    JOIN players bp ON bp.player_id = bps.player_id
                    JOIN positions bpos ON bp.position_id = bpos.position_id
                    WHERE bps.slice_id = :baseline_sid
                      AND bps.metric_code = rps.metric_code
                      AND bpos.comparison_group = pos.comparison_group
                      AND bps.metric_value IS NOT NULL
                      AND bps.metric_value <= rps.metric_value
                      AND EXISTS (
                          SELECT 1 FROM player_statistics bpm
                          WHERE bpm.player_id = bp.player_id
                            AND bpm.slice_id = :minutes_sid
                            AND bpm.metric_code = 'minutes'
                            AND bpm.metric_value > :min_minutes
                      )
                ) / NULLIF(bc.cnt, 0)
            END AS percentile
        FROM player_statistics rps
        JOIN players rp ON rps.player_id = rp.player_id
        JOIN positions pos ON rp.position_id = pos.position_id
        JOIN position_metric_config pmc ON pmc.position_code = pos.code AND pmc.metric_code = rps.metric_code
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::float AS cnt
            FROM player_statistics bps2
            JOIN players bp2 ON bp2.player_id = bps2.player_id
            JOIN positions bpos2 ON bp2.position_id = bpos2.position_id
            WHERE bps2.slice_id = :baseline_sid
              AND bps2.metric_code = rps.metric_code
              AND bpos2.comparison_group = pos.comparison_group
              AND bps2.metric_value IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM player_statistics bpm2
                  WHERE bpm2.player_id = bp2.player_id
                    AND bpm2.slice_id = :minutes_sid
                    AND bpm2.metric_code = 'minutes'
                    AND bpm2.metric_value > :min_minutes
              )
        ) bc ON true
        WHERE rps.slice_id = :rsid
          AND rps.metric_value IS NOT NULL
    """), {
        "rsid": round_slice_id,
        "bk": baseline_kind,
        "baseline_sid": baseline_slice_id,
        "minutes_sid": minutes_sid,
        "min_minutes": baseline_min_minutes,
    })

    # Aggregate scores
    n = _aggregate_scores(db, round_slice_id, baseline_kind, tournament_id)
    db.commit()
    return n


def _aggregate_scores(db: Session, round_slice_id: int, baseline_kind: str, tournament_id: int = 0) -> int:
    """
    Aggregate round_percentiles into round_scores.
    Implements:
        - top-k averaging for core/support
        - coverage calculation
        - adjusted scores
        - total_score = 0.7 * core_adj + 0.3 * support_adj
        - good_share_core
        - insufficient_data flag
        - risk_flags
    
    Returns number of players with scores.
    """
    # Get all percentile rows for this round/baseline
    rows = db.execute(text("""
        SELECT rp.player_id, rp.position_code, rp.metric_code, rp.bucket, rp.percentile, rp.value
        FROM round_percentiles rp
        WHERE rp.round_slice_id = :rsid AND rp.baseline_kind = :bk
        ORDER BY rp.player_id, rp.bucket
    """), {"rsid": round_slice_id, "bk": baseline_kind}).fetchall()

    if not rows:
        return 0

    # Fetch season minutes for all players in this tournament
    # to determine insufficient_minutes flag
    player_minutes: Dict[int, float] = {}
    total_season_sid = db.execute(text("""
        SELECT ss2.slice_id FROM stat_slices ss2
        JOIN stat_slices ss1 ON ss1.tournament_id = ss2.tournament_id
        WHERE ss1.slice_id = :rsid
          AND ss2.slice_type = 'TOTAL' AND ss2.period_type = 'SEASON'
        ORDER BY ss2.uploaded_at DESC LIMIT 1
    """), {"rsid": round_slice_id}).scalar()
    if total_season_sid:
        min_rows = db.execute(text("""
            SELECT player_id, metric_value FROM player_statistics
            WHERE slice_id = :sid AND metric_code = 'minutes' AND metric_value IS NOT NULL
        """), {"sid": total_season_sid}).fetchall()
        for mr in min_rows:
            player_minutes[mr[0]] = mr[1]
    else:
        # Fallback: try PER90 SEASON slice (it may also have minutes)
        per90_sid = db.execute(text("""
            SELECT ss2.slice_id FROM stat_slices ss2
            JOIN stat_slices ss1 ON ss1.tournament_id = ss2.tournament_id
            WHERE ss1.slice_id = :rsid
              AND ss2.slice_type = 'PER90' AND ss2.period_type = 'SEASON'
            ORDER BY ss2.uploaded_at DESC LIMIT 1
        """), {"rsid": round_slice_id}).scalar()
        if per90_sid:
            min_rows = db.execute(text("""
                SELECT player_id, metric_value FROM player_statistics
                WHERE slice_id = :sid AND metric_code = 'minutes' AND metric_value IS NOT NULL
            """), {"sid": per90_sid}).fetchall()
            for mr in min_rows:
                player_minutes[mr[0]] = mr[1]

    # Get total metrics per position from config
    pos_totals = {}
    config_rows = db.execute(text("""
        SELECT position_code, bucket, COUNT(*) as cnt
        FROM position_metric_config
        GROUP BY position_code, bucket
    """)).fetchall()
    for r in config_rows:
        pos = r[0]
        if pos not in pos_totals:
            pos_totals[pos] = {"core": 0, "support": 0, "risk": 0}
        pos_totals[pos][r[1]] = r[2]

    # Group by player
    from collections import defaultdict
    players = defaultdict(lambda: {"position_code": None, "core": [], "support": [], "risk": []})

    for r in rows:
        player_id = r[0]
        position_code = r[1]
        bucket = r[3]
        percentile = r[4]
        value = r[5]

        players[player_id]["position_code"] = position_code
        if percentile is not None:
            players[player_id][bucket].append({"percentile": percentile, "metric": r[2], "value": value})

    # Compute scores for each player
    count = 0
    for player_id, data in players.items():
        position_code = data["position_code"]
        totals = pos_totals.get(position_code, {"core": 0, "support": 0, "risk": 0})

        core_pcts = sorted([x["percentile"] for x in data["core"]], reverse=True)
        support_pcts = sorted([x["percentile"] for x in data["support"]], reverse=True)

        used_core = len(core_pcts)
        used_support = len(support_pcts)
        total_core = totals.get("core", 0)
        total_support = totals.get("support", 0)

        core_coverage = used_core / total_core if total_core > 0 else 0
        support_coverage = used_support / total_support if total_support > 0 else 0

        # Core score: mean of top-k, where k = max(3, ceil(0.6 * used_core))
        if used_core > 0:
            k_core = max(3, math.ceil(0.6 * used_core))
            top_k_core = core_pcts[:min(k_core, used_core)]
            core_score = sum(top_k_core) / len(top_k_core) if top_k_core else 0
        else:
            core_score = 0

        # Support score: similar
        if used_support > 0:
            k_support = max(3, math.ceil(0.6 * used_support))
            top_k_support = support_pcts[:min(k_support, used_support)]
            support_score = sum(top_k_support) / len(top_k_support) if top_k_support else 0
        else:
            support_score = 0

        # Adjusted scores (soft penalty for low coverage)
        core_score_adj = core_score * (0.5 + 0.5 * core_coverage)
        support_score_adj = support_score * (0.5 + 0.5 * support_coverage)

        # Total score
        total_score = 0.7 * core_score_adj + 0.3 * support_score_adj

        # Good share core: % of core metrics with percentile >= 0.80
        good_share_core = 0
        if used_core > 0:
            good_count = sum(1 for p in core_pcts if p >= 0.80)
            good_share_core = good_count / used_core

        # Insufficient data flag
        insufficient_data = (used_core < 4 or core_coverage < 0.6)

        # Insufficient minutes flag: player has < MIN_MINUTES_THRESHOLD minutes in season
        player_min = player_minutes.get(player_id, 0)
        # "более 200 минут" = строго > 200, значит <= 200 = insufficient
        insufficient_minutes = (player_min <= MIN_MINUTES_THRESHOLD)

        # Risk flags from risk metrics
        risk_flags = {}
        for rm in data["risk"]:
            metric = rm["metric"]
            val = rm["value"]
            if val is not None and val > 0:
                if metric in ("red_cards",):
                    risk_flags[metric] = val
                elif metric in ("yellow_cards",) and val >= 1:
                    risk_flags[metric] = val
                elif metric in ("goal_errors", "gross_errors") and val >= 1:
                    risk_flags[metric] = val
                elif metric in ("fouls",) and val >= 2:
                    risk_flags[metric] = val
                elif metric in ("losses", "losses_own_half") and val >= 3:
                    risk_flags[metric] = val

        import json
        db.execute(text("""
            INSERT INTO round_scores (
                round_slice_id, baseline_kind, player_id, position_code,
                core_score, support_score, total_score,
                core_score_adj, support_score_adj,
                core_coverage, support_coverage, good_share_core,
                risk_flags, insufficient_data, insufficient_minutes
            ) VALUES (
                :rsid, :bk, :pid, :pos,
                :cs, :ss, :ts,
                :csa, :ssa,
                :cc, :sc, :gsc,
                CAST(:rf AS jsonb), :id, :im
            )
            ON CONFLICT (round_slice_id, baseline_kind, player_id) DO UPDATE SET
                position_code = EXCLUDED.position_code,
                core_score = EXCLUDED.core_score,
                support_score = EXCLUDED.support_score,
                total_score = EXCLUDED.total_score,
                core_score_adj = EXCLUDED.core_score_adj,
                support_score_adj = EXCLUDED.support_score_adj,
                core_coverage = EXCLUDED.core_coverage,
                support_coverage = EXCLUDED.support_coverage,
                good_share_core = EXCLUDED.good_share_core,
                risk_flags = EXCLUDED.risk_flags,
                insufficient_data = EXCLUDED.insufficient_data,
                insufficient_minutes = EXCLUDED.insufficient_minutes,
                computed_at = CURRENT_TIMESTAMP
        """), {
            "rsid": round_slice_id,
            "bk": baseline_kind,
            "pid": player_id,
            "pos": position_code,
            "cs": round(core_score, 4),
            "ss": round(support_score, 4),
            "ts": round(total_score, 4),
            "csa": round(core_score_adj, 4),
            "ssa": round(support_score_adj, 4),
            "cc": round(core_coverage, 4),
            "sc": round(support_coverage, 4),
            "gsc": round(good_share_core, 4),
            "rf": json.dumps(risk_flags),
            "id": insufficient_data,
            "im": insufficient_minutes,
        })
        count += 1

    return count
