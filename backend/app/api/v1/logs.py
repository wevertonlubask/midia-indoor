from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_super_admin
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogResponse

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/", response_model=List[AuditLogResponse])
async def list_logs(
    user_id: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_super_admin),
):
    q = select(AuditLog)

    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if resource_type:
        q = q.where(AuditLog.resource_type == resource_type)
    if action:
        q = q.where(AuditLog.action == action)

    q = q.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()
