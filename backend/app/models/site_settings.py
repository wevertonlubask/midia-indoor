import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class SiteSettings(Base):
    __tablename__ = "site_settings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    company_logo_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    company_logo_filename: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    accent_color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="#e30613")
    meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
