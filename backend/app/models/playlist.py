import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    banner_slot_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False, server_default="1")
    schedule_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    schedule_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<Playlist {self.name}>"


class PlaylistBanner(Base):
    __tablename__ = "playlist_banners"

    playlist_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True
    )
    banner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("banners.id", ondelete="CASCADE"), primary_key=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    slot_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")


class PlaylistVideo(Base):
    __tablename__ = "playlist_videos"

    playlist_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True
    )
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), primary_key=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
