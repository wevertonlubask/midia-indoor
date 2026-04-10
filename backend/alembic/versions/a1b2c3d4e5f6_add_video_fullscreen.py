"""add_video_fullscreen

Revision ID: a1b2c3d4e5f6
Revises: 49b2fc187587
Create Date: 2026-03-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '49b2fc187587'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('videos', sa.Column('fullscreen', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('videos', 'fullscreen')
