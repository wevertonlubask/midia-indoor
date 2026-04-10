import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Screen(Base):
    __tablename__ = "screens"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4())
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    playlist_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("playlists.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<Screen {self.name} [{self.id[:8]}]>"
