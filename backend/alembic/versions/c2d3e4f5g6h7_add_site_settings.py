"""add_site_settings

Revision ID: c2d3e4f5g6h7
Revises: b1c2d3e4f5g6
Create Date: 2026-04-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2d3e4f5g6h7'
down_revision: Union[str, None] = 'b1c2d3e4f5g6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'site_settings',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('company_logo_url', sa.String(1000), nullable=True),
        sa.Column('company_logo_filename', sa.String(500), nullable=True),
        sa.Column('accent_color', sa.String(20), nullable=True, server_default='#e30613'),
        sa.Column('meta', sa.JSON(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('site_settings')
