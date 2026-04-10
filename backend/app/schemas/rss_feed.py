from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class RSSSelectors(BaseModel):
    container: str
    link: str
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    date: Optional[str] = None
    author: Optional[str] = None


class RSSFeedCreate(BaseModel):
    name: str
    source_url: str
    selectors: RSSSelectors
    refresh_interval: int = 60
    is_active: bool = True


class RSSFeedUpdate(BaseModel):
    name: Optional[str] = None
    source_url: Optional[str] = None
    selectors: Optional[RSSSelectors] = None
    refresh_interval: Optional[int] = None
    is_active: Optional[bool] = None


class RSSItemResponse(BaseModel):
    id: str
    feed_id: str
    title: Optional[str]
    link: Optional[str]
    description: Optional[str]
    image_url: Optional[str]
    pub_date: Optional[str]
    author: Optional[str]
    guid: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class RSSFeedResponse(BaseModel):
    id: str
    name: str
    source_url: str
    selectors: dict
    refresh_interval: int
    is_active: bool
    last_scraped_at: Optional[datetime]
    last_error: Optional[str]
    item_count: int
    created_by: Optional[str]
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RSSFeedWithItems(RSSFeedResponse):
    items: list[RSSItemResponse] = []
