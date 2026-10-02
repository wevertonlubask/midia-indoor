import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


def default_device_settings() -> dict:
    return {
        # Liga/desliga automático da TV (dias ISO: 1=segunda ... 7=domingo)
        "schedule": {
            "enabled": False,
            "days": [1, 2, 3, 4, 5],
            "on_time": "07:00",
            "off_time": "22:30",
        },
        # Reinício diário do navegador (evita vazamento de memória do Chromium)
        "daily_restart": "05:00",
        # Método de controle da TV: auto (CEC com fallback HDMI), cec, hdmi
        "tv_control": "auto",
    }


class Device(Base):
    """Dispositivo físico (Raspberry Pi) que exibe uma Tela na TV."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mac: Mapped[str] = mapped_column(String(17), unique=True, nullable=False)
    ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    screen_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("screens.id", ondelete="SET NULL"), nullable=True
    )
    agent_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    is_connected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=default_device_settings)
    last_command: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<Device {self.name} [{self.mac}]>"
