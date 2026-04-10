from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ScreenCreate(BaseModel):
    name: str
    location: Optional[str] = None
    is_active: bool = True
    config: Optional[dict] = None


class ScreenUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[dict] = None
    playlist_id: Optional[str] = None


class ScreenResponse(BaseModel):
    id: str
    name: str
    location: Optional[str]
    token: str
    is_active: bool
    last_seen_at: Optional[datetime]
    config: Optional[dict]
    playlist_id: Optional[str]
    created_at: datetime
    is_online: bool = False

    model_config = {"from_attributes": True}
