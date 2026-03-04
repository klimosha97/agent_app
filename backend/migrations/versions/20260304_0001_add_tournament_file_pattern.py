"""Add file_pattern column to tournaments table for dynamic tournament management.

Revision ID: add_tournament_file_pattern
Revises: (manual)
Create Date: 2026-03-04
"""

from alembic import op
import sqlalchemy as sa


revision = 'add_tournament_file_pattern'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS file_pattern VARCHAR(50);
    """)
    op.execute("UPDATE tournaments SET file_pattern = 'mfl' WHERE id = 0 AND file_pattern IS NULL;")
    op.execute("UPDATE tournaments SET file_pattern = 'yfl1' WHERE id = 1 AND file_pattern IS NULL;")
    op.execute("UPDATE tournaments SET file_pattern = 'yfl2' WHERE id = 2 AND file_pattern IS NULL;")
    op.execute("UPDATE tournaments SET file_pattern = 'yfl3' WHERE id = 3 AND file_pattern IS NULL;")
    op.execute("ALTER TABLE tournaments ALTER COLUMN file_pattern SET NOT NULL;")
    op.execute("SELECT setval('tournaments_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM tournaments), false);")


def downgrade():
    op.execute("ALTER TABLE tournaments DROP COLUMN IF EXISTS file_pattern;")
