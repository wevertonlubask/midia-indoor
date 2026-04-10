import uuid
from datetime import datetime, timezone
from typing import Optional
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, DateTime, JSON, Integer, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class TickerType(str, PyEnum):
    TEXT = "text"
    RSS = "rss"
    WEATHER = "weather"


class Ticker(Base):
    __tablename__ = "tickers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    content: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    type: Mapped[TickerType] = mapped_column(
        Enum(TickerType, values_callable=lambda obj: [e.value for e in obj]),
        default=TickerType.TEXT,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    display_duration: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<Ticker [{self.type}] {str(self.content)[:30]}>"
