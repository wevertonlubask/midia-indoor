from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List


class PlaylistCreate(BaseModel):
    name: str
    is_active: bool = True
    banner_slot_count: int = 1
    # banner_slots[i] = lista de banner_ids para o slot i
    banner_slots: Optional[List[List[str]]] = None
    # legado: lista plana (todos vão para slot 0)
    banner_ids: List[str] = []
    video_ids: List[str] = []
    schedule_start: Optional[datetime] = None
    schedule_end: Optional[datetime] = None

    @field_validator("banner_slot_count")
    @classmethod
    def clamp_slots(cls, v: int) -> int:
        return max(1, min(3, v))


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    banner_slot_count: Optional[int] = None
    banner_slots: Optional[List[List[str]]] = None
    banner_ids: Optional[List[str]] = None
    video_ids: Optional[List[str]] = None
    schedule_start: Optional[datetime] = None
    schedule_end: Optional[datetime] = None

    @field_validator("banner_slot_count")
    @classmethod
    def clamp_slots(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        return max(1, min(3, v))


class PlaylistResponse(BaseModel):
    id: str
    name: str
    is_active: bool
    banner_slot_count: int
    schedule_start: Optional[datetime]
    schedule_end: Optional[datetime]
    created_by: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
