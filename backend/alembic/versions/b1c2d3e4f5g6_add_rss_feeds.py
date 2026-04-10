"""add_rss_feeds

Revision ID: b1c2d3e4f5g6
Revises: a1b2c3d4e5f6
Create Date: 2026-03-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1c2d3e4f5g6'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'rss_feeds',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('source_url', sa.String(2000), nullable=False),
        sa.Column('selectors', sa.JSON(), nullable=False),
        sa.Column('refresh_interval', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_scraped_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('item_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        'rss_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('feed_id', sa.String(36), sa.ForeignKey('rss_feeds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(1000), nullable=True),
        sa.Column('link', sa.String(2000), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(2000), nullable=True),
        sa.Column('pub_date', sa.String(255), nullable=True),
        sa.Column('author', sa.String(500), nullable=True),
        sa.Column('guid', sa.String(2000), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_rss_items_feed_id', 'rss_items', ['feed_id'])


def downgrade() -> None:
    op.drop_index('ix_rss_items_feed_id', table_name='rss_items')
    op.drop_table('rss_items')
    op.drop_table('rss_feeds')
