from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.models.ticker import TickerType


class TickerCreate(BaseModel):
    content: Optional[str] = None
    type: TickerType = TickerType.TEXT
    is_active: bool = True
    config: Optional[dict] = None
    display_duration: int = 30
    order_index: int = 0


class TickerUpdate(BaseModel):
    content: Optional[str] = None
    type: Optional[TickerType] = None
    is_active: Optional[bool] = None
    config: Optional[dict] = None
    display_duration: Optional[int] = None
    order_index: Optional[int] = None


class TickerResponse(BaseModel):
    id: str
    content: Optional[str]
    type: TickerType
    is_active: bool
    config: Optional[dict]
    display_duration: int
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}
