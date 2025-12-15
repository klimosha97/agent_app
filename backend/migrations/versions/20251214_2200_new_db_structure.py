"""New database structure with stat types

Revision ID: b1234567890a
Revises: a3165bf24add
Create Date: 2025-12-14 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'b1234567890a'
down_revision = 'a3165bf24add'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Создаём ENUM для типа статистики
    stat_type_enum = postgresql.ENUM('total', 'avg_match', 'avg_90min', name='stat_type_enum', create_type=False)
    stat_type_enum.create(op.get_bind(), checkfirst=True)
    
    # Удаляем старые таблицы (используем execute для IF EXISTS)
    op.execute("DROP TABLE IF EXISTS last_round_stats CASCADE")
    op.execute("DROP TABLE IF EXISTS position_averages CASCADE")
    op.execute("DROP TABLE IF EXISTS players_stats_raw CASCADE")
    
    # Создаём таблицу tournaments если не существует
    op.execute("""
        CREATE TABLE IF NOT EXISTS tournaments (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL,
            short_code VARCHAR(10) NOT NULL UNIQUE,
            is_active BOOLEAN DEFAULT true,
            current_round INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Заполняем справочник турниров
    op.execute("""
        INSERT INTO tournaments (id, name, full_name, short_code, current_round) VALUES
        (0, 'МФЛ', 'Молодежная Футбольная Лига', 'MFL', 0),
        (1, 'ЮФЛ-1', 'Юношеская Футбольная Лига - Первенство 1', 'YFL1', 0),
        (2, 'ЮФЛ-2', 'Юношеская Футбольная Лига - Первенство 2', 'YFL2', 0),
        (3, 'ЮФЛ-3', 'Юношеская Футбольная Лига - Первенство 3', 'YFL3', 0)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            full_name = EXCLUDED.full_name,
            short_code = EXCLUDED.short_code
    """)
    
    # Создаём таблицу статистики за сезон
    op.create_table('player_season_stats',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        sa.Column('tournament_id', sa.Integer(), nullable=False),
        sa.Column('stat_type', sa.String(20), nullable=False, server_default='total'),
        sa.Column('tracking_status', postgresql.ENUM('non interesting', 'interesting', 'to watch', 'my player', name='tracking_status_enum', create_type=False), nullable=False, server_default='non interesting'),
        
        sa.Column('player_number', sa.Integer()),
        sa.Column('player_name', sa.String(255), nullable=False),
        sa.Column('team_name', sa.String(255), nullable=False),
        sa.Column('age', sa.Integer()),
        sa.Column('height', sa.String(10)),
        sa.Column('weight', sa.String(10)),
        sa.Column('citizenship', sa.String(100)),
        sa.Column('player_index', sa.String(50)),
        sa.Column('minutes_played', sa.Numeric(10, 2)),
        sa.Column('position', sa.String(50)),
        
        sa.Column('goal_errors', sa.Numeric(10, 2), server_default='0'),
        sa.Column('rough_errors', sa.Numeric(10, 2), server_default='0'),
        sa.Column('yellow_cards', sa.Numeric(10, 2), server_default='0'),
        sa.Column('red_cards', sa.Numeric(10, 2), server_default='0'),
        sa.Column('fouls_committed', sa.Numeric(10, 2), server_default='0'),
        sa.Column('fouls_suffered', sa.Numeric(10, 2), server_default='0'),
        
        sa.Column('goals', sa.Numeric(10, 2), server_default='0'),
        sa.Column('assists', sa.Numeric(10, 2), server_default='0'),
        sa.Column('goal_attempts', sa.Numeric(10, 2), server_default='0'),
        sa.Column('goal_attempts_successful', sa.Numeric(10, 2), server_default='0'),
        sa.Column('goal_attempts_success_rate', sa.Numeric(10, 2)),
        sa.Column('goal_moments_created', sa.Numeric(10, 2), server_default='0'),
        sa.Column('goal_attacks_participation', sa.Numeric(10, 2), server_default='0'),
        sa.Column('shots', sa.Numeric(10, 2), server_default='0'),
        sa.Column('shots_on_target', sa.Numeric(10, 2), server_default='0'),
        sa.Column('xg', sa.Numeric(10, 2)),
        
        sa.Column('passes_total', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_key', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_key_accuracy', sa.Numeric(10, 2)),
        sa.Column('crosses', sa.Numeric(10, 2), server_default='0'),
        sa.Column('crosses_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_progressive', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_progressive_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_progressive_clean', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_long', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_long_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_super_long', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_super_long_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_final_third', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_final_third_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_penalty_area', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_penalty_area_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_for_shot', sa.Numeric(10, 2), server_default='0'),
        
        sa.Column('duels_total', sa.Numeric(10, 2), server_default='0'),
        sa.Column('duels_success_rate', sa.Numeric(10, 2)),
        sa.Column('duels_defensive', sa.Numeric(10, 2), server_default='0'),
        sa.Column('duels_defensive_success_rate', sa.Numeric(10, 2)),
        sa.Column('duels_offensive', sa.Numeric(10, 2), server_default='0'),
        sa.Column('duels_offensive_success_rate', sa.Numeric(10, 2)),
        sa.Column('duels_aerial', sa.Numeric(10, 2), server_default='0'),
        sa.Column('duels_aerial_success_rate', sa.Numeric(10, 2)),
        
        sa.Column('dribbles', sa.Numeric(10, 2), server_default='0'),
        sa.Column('dribbles_success_rate', sa.Numeric(10, 2)),
        sa.Column('dribbles_final_third', sa.Numeric(10, 2), server_default='0'),
        sa.Column('dribbles_final_third_success_rate', sa.Numeric(10, 2)),
        
        sa.Column('tackles', sa.Numeric(10, 2), server_default='0'),
        sa.Column('tackles_success_rate', sa.Numeric(10, 2)),
        sa.Column('interceptions', sa.Numeric(10, 2), server_default='0'),
        sa.Column('recoveries', sa.Numeric(10, 2), server_default='0'),
        
        sa.Column('notes', sa.Text()),
    )
    
    # Индексы для player_season_stats
    op.create_index('idx_season_player_name', 'player_season_stats', ['player_name'])
    op.create_index('idx_season_team_name', 'player_season_stats', ['team_name'])
    op.create_index('idx_season_tournament_id', 'player_season_stats', ['tournament_id'])
    op.create_index('idx_season_stat_type', 'player_season_stats', ['stat_type'])
    op.create_index('idx_season_tracking_status', 'player_season_stats', ['tracking_status'])
    op.create_index('idx_season_position', 'player_season_stats', ['position'])
    op.create_index('idx_season_tournament_stat_type', 'player_season_stats', ['tournament_id', 'stat_type'])
    
    # Создаём таблицу туров
    op.create_table('tournament_rounds',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('tournament_id', sa.Integer(), nullable=False),
        sa.Column('round_number', sa.Integer(), nullable=False),
        sa.Column('is_current', sa.Boolean(), server_default='true'),
    )
    
    op.create_index('idx_round_tournament', 'tournament_rounds', ['tournament_id'])
    op.create_index('idx_round_current', 'tournament_rounds', ['is_current'])
    
    # Создаём таблицу статистики за тур
    op.create_table('player_round_stats',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        sa.Column('tournament_id', sa.Integer(), nullable=False),
        sa.Column('round_number', sa.Integer()),
        sa.Column('stat_type', sa.String(20), nullable=False, server_default='total'),
        sa.Column('tracking_status', postgresql.ENUM('non interesting', 'interesting', 'to watch', 'my player', name='tracking_status_enum', create_type=False), nullable=False, server_default='non interesting'),
        
        sa.Column('player_number', sa.Integer()),
        sa.Column('player_name', sa.String(255), nullable=False),
        sa.Column('team_name', sa.String(255), nullable=False),
        sa.Column('age', sa.Integer()),
        sa.Column('height', sa.String(10)),
        sa.Column('weight', sa.String(10)),
        sa.Column('citizenship', sa.String(100)),
        sa.Column('player_index', sa.String(50)),
        sa.Column('minutes_played', sa.Numeric(10, 2)),
        sa.Column('position', sa.String(50)),
        
        sa.Column('goal_errors', sa.Numeric(10, 2), server_default='0'),
        sa.Column('rough_errors', sa.Numeric(10, 2), server_default='0'),
        sa.Column('yellow_cards', sa.Numeric(10, 2), server_default='0'),
        sa.Column('red_cards', sa.Numeric(10, 2), server_default='0'),
        sa.Column('fouls_committed', sa.Numeric(10, 2), server_default='0'),
        sa.Column('fouls_suffered', sa.Numeric(10, 2), server_default='0'),
        
        sa.Column('goals', sa.Numeric(10, 2), server_default='0'),
        sa.Column('assists', sa.Numeric(10, 2), server_default='0'),
        sa.Column('goal_attempts', sa.Numeric(10, 2), server_default='0'),
        sa.Column('goal_attempts_successful', sa.Numeric(10, 2), server_default='0'),
        sa.Column('goal_attempts_success_rate', sa.Numeric(10, 2)),
        sa.Column('goal_moments_created', sa.Numeric(10, 2), server_default='0'),
        sa.Column('goal_attacks_participation', sa.Numeric(10, 2), server_default='0'),
        sa.Column('shots', sa.Numeric(10, 2), server_default='0'),
        sa.Column('shots_on_target', sa.Numeric(10, 2), server_default='0'),
        sa.Column('xg', sa.Numeric(10, 2)),
        
        sa.Column('passes_total', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_key', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_key_accuracy', sa.Numeric(10, 2)),
        sa.Column('crosses', sa.Numeric(10, 2), server_default='0'),
        sa.Column('crosses_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_progressive', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_progressive_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_progressive_clean', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_long', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_long_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_super_long', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_super_long_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_final_third', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_final_third_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_penalty_area', sa.Numeric(10, 2), server_default='0'),
        sa.Column('passes_penalty_area_accuracy', sa.Numeric(10, 2)),
        sa.Column('passes_for_shot', sa.Numeric(10, 2), server_default='0'),
        
        sa.Column('duels_total', sa.Numeric(10, 2), server_default='0'),
        sa.Column('duels_success_rate', sa.Numeric(10, 2)),
        sa.Column('duels_defensive', sa.Numeric(10, 2), server_default='0'),
        sa.Column('duels_defensive_success_rate', sa.Numeric(10, 2)),
        sa.Column('duels_offensive', sa.Numeric(10, 2), server_default='0'),
        sa.Column('duels_offensive_success_rate', sa.Numeric(10, 2)),
        sa.Column('duels_aerial', sa.Numeric(10, 2), server_default='0'),
        sa.Column('duels_aerial_success_rate', sa.Numeric(10, 2)),
        
        sa.Column('dribbles', sa.Numeric(10, 2), server_default='0'),
        sa.Column('dribbles_success_rate', sa.Numeric(10, 2)),
        sa.Column('dribbles_final_third', sa.Numeric(10, 2), server_default='0'),
        sa.Column('dribbles_final_third_success_rate', sa.Numeric(10, 2)),
        
        sa.Column('tackles', sa.Numeric(10, 2), server_default='0'),
        sa.Column('tackles_success_rate', sa.Numeric(10, 2)),
        sa.Column('interceptions', sa.Numeric(10, 2), server_default='0'),
        sa.Column('recoveries', sa.Numeric(10, 2), server_default='0'),
    )
    
    # Индексы для player_round_stats
    op.create_index('idx_round_player_name', 'player_round_stats', ['player_name'])
    op.create_index('idx_round_tournament_id', 'player_round_stats', ['tournament_id'])
    op.create_index('idx_round_stat_type', 'player_round_stats', ['stat_type'])
    op.create_index('idx_round_round_number', 'player_round_stats', ['round_number'])
    op.create_index('idx_round_tournament_round_stat', 'player_round_stats', ['tournament_id', 'round_number', 'stat_type'])


def downgrade() -> None:
    op.drop_table('player_round_stats')
    op.drop_table('tournament_rounds')
    op.drop_table('player_season_stats')

