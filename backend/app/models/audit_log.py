import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # Sem FK — o log persiste mesmo que o usuário seja deletado
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False)  # snapshot
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    resource_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.user_name} → {self.action} {self.resource_type}>"
