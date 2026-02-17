"""Add talent scouting tables: position_metric_config, team_tiers, benchmark_slices, round_percentiles, round_scores

Revision ID: c0001_talent
Revises: b1234567890a
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa

revision = 'c0001_talent'
down_revision = 'b1234567890a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =============================================
    # Phase 1: Position metric config
    # =============================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS position_metric_config (
            position_code VARCHAR(10) NOT NULL,
            metric_code VARCHAR(100) NOT NULL,
            bucket VARCHAR(10) NOT NULL CHECK (bucket IN ('core', 'support', 'risk')),
            PRIMARY KEY (position_code, metric_code)
        );
        CREATE INDEX IF NOT EXISTS idx_pmc_position ON position_metric_config(position_code);
        CREATE INDEX IF NOT EXISTS idx_pmc_bucket ON position_metric_config(position_code, bucket);
        COMMENT ON TABLE position_metric_config IS 'Конфигурация метрик по позициям: core/support/risk';
    """)

    # =============================================
    # Phase 2: Team tiers
    # =============================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS team_tiers (
            tournament_id INTEGER NOT NULL,
            season VARCHAR(10) NOT NULL,
            team_name VARCHAR(255) NOT NULL,
            tier VARCHAR(10) CHECK (tier IN ('TOP', 'BOTTOM')),
            PRIMARY KEY (tournament_id, season, team_name)
        );
        CREATE INDEX IF NOT EXISTS idx_tt_tournament_season ON team_tiers(tournament_id, season);
        COMMENT ON TABLE team_tiers IS 'Корзины команд (верх/низ таблицы) для Tier-сравнения';
    """)

    # =============================================
    # Phase 3: Benchmark slices
    # =============================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS benchmark_slices (
            id SERIAL PRIMARY KEY,
            tournament_id INTEGER NOT NULL UNIQUE,
            slice_id INTEGER NOT NULL REFERENCES stat_slices(slice_id) ON DELETE CASCADE,
            label VARCHAR(100),
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bs_tournament ON benchmark_slices(tournament_id);
        COMMENT ON TABLE benchmark_slices IS 'Эталонные сезоны для сравнения (один на турнир)';
    """)

    # =============================================
    # Phase 4: Analytics result tables
    # =============================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS round_percentiles (
            round_slice_id INTEGER NOT NULL,
            baseline_kind VARCHAR(20) NOT NULL CHECK (baseline_kind IN ('LEAGUE', 'TIER', 'BENCHMARK', 'SEASON', 'SEASON_BENCHMARK')),
            player_id INTEGER NOT NULL,
            position_code VARCHAR(10) NOT NULL,
            metric_code VARCHAR(100) NOT NULL,
            bucket VARCHAR(10) NOT NULL,
            value FLOAT,
            percentile FLOAT,
            computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (round_slice_id, baseline_kind, player_id, metric_code)
        );
        CREATE INDEX IF NOT EXISTS idx_rp_round_baseline ON round_percentiles(round_slice_id, baseline_kind);
        CREATE INDEX IF NOT EXISTS idx_rp_player ON round_percentiles(player_id);
        COMMENT ON TABLE round_percentiles IS 'Перцентили метрик игроков тура относительно baseline';
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS round_scores (
            round_slice_id INTEGER NOT NULL,
            baseline_kind VARCHAR(20) NOT NULL CHECK (baseline_kind IN ('LEAGUE', 'TIER', 'BENCHMARK', 'SEASON', 'SEASON_BENCHMARK')),
            player_id INTEGER NOT NULL,
            position_code VARCHAR(10) NOT NULL,
            core_score FLOAT,
            support_score FLOAT,
            total_score FLOAT,
            core_score_adj FLOAT,
            support_score_adj FLOAT,
            core_coverage FLOAT,
            support_coverage FLOAT,
            good_share_core FLOAT,
            risk_flags JSONB DEFAULT '{}',
            insufficient_data BOOLEAN DEFAULT false,
            insufficient_minutes BOOLEAN DEFAULT false,
            computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (round_slice_id, baseline_kind, player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_rs_round_baseline_score ON round_scores(round_slice_id, baseline_kind, total_score DESC);
        CREATE INDEX IF NOT EXISTS idx_rs_round_baseline_position ON round_scores(round_slice_id, baseline_kind, position_code, total_score DESC);
        CREATE INDEX IF NOT EXISTS idx_rs_player ON round_scores(player_id);
        COMMENT ON TABLE round_scores IS 'Агрегированные скоры игроков тура (core/support/total)';
    """)

    # Add BENCHMARK to stat_slices period_type check if not already there
    # We need to allow 'BENCHMARK' as period_type
    op.execute("""
        ALTER TABLE stat_slices DROP CONSTRAINT IF EXISTS stat_slices_period_type_check;
        ALTER TABLE stat_slices ADD CONSTRAINT stat_slices_period_type_check 
            CHECK (period_type IN ('SEASON', 'ROUND', 'BENCHMARK'));
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS round_scores CASCADE")
    op.execute("DROP TABLE IF EXISTS round_percentiles CASCADE")
    op.execute("DROP TABLE IF EXISTS benchmark_slices CASCADE")
    op.execute("DROP TABLE IF EXISTS team_tiers CASCADE")
    op.execute("DROP TABLE IF EXISTS position_metric_config CASCADE")
    
    # Restore original constraint
    op.execute("""
        ALTER TABLE stat_slices DROP CONSTRAINT IF EXISTS stat_slices_period_type_check;
        ALTER TABLE stat_slices ADD CONSTRAINT stat_slices_period_type_check 
            CHECK (period_type IN ('SEASON', 'ROUND'));
    """)
