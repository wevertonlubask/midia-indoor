import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, JSON, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class RSSFeed(Base):
    __tablename__ = "rss_feeds"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    # JSON com seletores CSS mapeados: container, link, title, description, image, date, author
    selectors: Mapped[dict] = mapped_column(JSON, nullable=False)
    refresh_interval: Mapped[int] = mapped_column(Integer, default=60, nullable=False)  # minutos
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_scraped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    item_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<RSSFeed {self.name}>"


class RSSItem(Base):
    __tablename__ = "rss_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    feed_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rss_feeds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    link: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    pub_date: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    author: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    guid: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<RSSItem {self.title}>"
