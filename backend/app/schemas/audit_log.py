from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str]
    user_name: str
    action: str
    resource_type: str
    resource_id: str
    resource_name: str
    created_at: datetime

    model_config = {"from_attributes": True}
