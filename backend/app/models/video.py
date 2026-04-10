import uuid
from datetime import datetime, timezone
from typing import Optional
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, DateTime, JSON, Integer, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class TranscodeStatus(str, PyEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    transcoded_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    fullscreen: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    transcode_status: Mapped[TranscodeStatus] = mapped_column(
        Enum(TranscodeStatus, values_callable=lambda obj: [e.value for e in obj]),
        default=TranscodeStatus.PENDING,
        nullable=False,
    )
    transcode_error: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)

    def __repr__(self) -> str:
        return f"<Video {self.title} [{self.transcode_status}]>"
