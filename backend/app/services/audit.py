from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    user,
    action: str,
    resource_type: str,
    resource_id: str,
    resource_name: str = "",
) -> None:
    """Registra uma ação de auditoria na mesma transação do endpoint."""
    entry = AuditLog(
        user_id=user.id if user else None,
        user_name=user.full_name if user else "Sistema",
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
    )
    db.add(entry)
