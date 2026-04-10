from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.models.video import TranscodeStatus


class VideoCreate(BaseModel):
    title: str
    order_index: int = 0
    is_active: bool = True
    fullscreen: bool = False


class VideoUpdate(BaseModel):
    title: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None
    fullscreen: Optional[bool] = None


class VideoResponse(BaseModel):
    id: str
    title: str
    filename: str
    original_url: str
    transcoded_url: Optional[str]
    thumbnail_url: Optional[str]
    duration_seconds: Optional[int]
    order_index: int
    is_active: bool
    fullscreen: bool
    transcode_status: TranscodeStatus
    transcode_error: Optional[str]
    created_by: Optional[str]
    created_by_name: Optional[str] = None
    created_at: datetime
    meta: Optional[dict]

    model_config = {"from_attributes": True}
