import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ContentLog(Base):
    __tablename__ = "content_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    screen_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("screens.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "banner" | "video"
    content_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_played: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<ContentLog screen={self.screen_id[:8]} type={self.content_type}>"
