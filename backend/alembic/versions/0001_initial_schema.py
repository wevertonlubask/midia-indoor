"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("SUPER_ADMIN", "ADMIN", "OPERATOR", name="userrole"),
            nullable=False,
            server_default="OPERATOR",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # Playlists (criada antes de screens por causa da FK)
    op.create_table(
        "playlists",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("schedule_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("schedule_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Screens
    op.create_table(
        "screens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("playlist_id", sa.String(36), sa.ForeignKey("playlists.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Banners
    op.create_table(
        "banners",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("file_url", sa.String(1000), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=True),
    )

    # Videos
    op.create_table(
        "videos",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("original_url", sa.String(1000), nullable=False),
        sa.Column("transcoded_url", sa.String(1000), nullable=True),
        sa.Column("thumbnail_url", sa.String(1000), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "transcode_status",
            sa.Enum("pending", "processing", "done", "error", name="transcodestatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("transcode_error", sa.String(1000), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=True),
    )

    # Playlist <-> Banners
    op.create_table(
        "playlist_banners",
        sa.Column("playlist_id", sa.String(36), sa.ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("banner_id", sa.String(36), sa.ForeignKey("banners.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )

    # Playlist <-> Videos
    op.create_table(
        "playlist_videos",
        sa.Column("playlist_id", sa.String(36), sa.ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("video_id", sa.String(36), sa.ForeignKey("videos.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )

    # Tickers
    op.create_table(
        "tickers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("content", sa.String(2000), nullable=True),
        sa.Column(
            "type",
            sa.Enum("text", "rss", "weather", name="tickertype"),
            nullable=False,
            server_default="text",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("display_duration", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Content Logs (analytics)
    op.create_table(
        "content_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("screen_id", sa.String(36), sa.ForeignKey("screens.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content_type", sa.String(50), nullable=False),
        sa.Column("content_id", sa.String(36), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_played", sa.Integer(), nullable=True),
    )
    op.create_index("ix_content_logs_screen_id", "content_logs", ["screen_id"])
    op.create_index("ix_content_logs_content_id", "content_logs", ["content_id"])


def downgrade() -> None:
    op.drop_table("content_logs")
    op.drop_table("tickers")
    op.drop_table("playlist_videos")
    op.drop_table("playlist_banners")
    op.drop_table("videos")
    op.drop_table("banners")
    op.drop_table("screens")
    op.drop_table("playlists")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("DROP TYPE IF EXISTS transcodestatus")
    op.execute("DROP TYPE IF EXISTS tickertype")
