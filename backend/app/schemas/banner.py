from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class BannerCreate(BaseModel):
    title: str
    duration_seconds: int = 8
    order_index: int = 0
    is_active: bool = True


class BannerUpdate(BaseModel):
    title: Optional[str] = None
    duration_seconds: Optional[int] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None


class BannerResponse(BaseModel):
    id: str
    title: str
    filename: str
    file_url: str
    duration_seconds: int
    order_index: int
    is_active: bool
    created_by: Optional[str]
    created_by_name: Optional[str] = None
    created_at: datetime
    meta: Optional[dict]

    model_config = {"from_attributes": True}


class BannerOrderUpdate(BaseModel):
    items: list[dict]  # [{"id": "...", "order_index": 0}, ...]
