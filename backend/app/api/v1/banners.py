from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.core.config import settings
from app.models.banner import Banner
from app.models.user import User
from app.schemas.banner import BannerCreate, BannerUpdate, BannerResponse, BannerOrderUpdate
from app.services.storage import upload_image, delete_object
from app.services.websocket_manager import ws_manager
from app.services.audit import log_action

router = APIRouter(prefix="/banners", tags=["banners"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.get("/", response_model=List[BannerResponse])
async def list_banners(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from sqlalchemy.orm import aliased
    Creator = aliased(User)
    q = (
        select(Banner, Creator.full_name.label("creator_name"))
        .outerjoin(Creator, Banner.created_by == Creator.id)
    )
    if active_only:
        q = q.where(Banner.is_active == True)
    q = q.order_by(Banner.order_index).offset(skip).limit(limit)
    rows = (await db.execute(q)).all()
    result = []
    for banner, creator_name in rows:
        data = {c.key: getattr(banner, c.key) for c in Banner.__table__.columns}
        data["created_by_name"] = creator_name
        result.append(data)
    return result


@router.post("/", response_model=BannerResponse, status_code=status.HTTP_201_CREATED)
async def create_banner(
    title: str = Form(...),
    duration_seconds: int = Form(8),
    order_index: int = Form(0),
    is_active: bool = Form(True),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de arquivo não suportado: {file.content_type}. Use JPG, PNG, WebP ou GIF.",
        )

    file_data = await file.read()
    if len(file_data) > settings.max_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Imagem muito grande. Máximo: {settings.MAX_IMAGE_SIZE_MB}MB",
        )

    file_url, meta = upload_image(file_data, file.filename, file.content_type)

    banner = Banner(
        title=title,
        filename=file.filename,
        file_url=file_url,
        duration_seconds=duration_seconds,
        order_index=order_index,
        is_active=is_active,
        created_by=current_user.id,
        meta=meta,
    )
    db.add(banner)
    await db.flush()
    await db.refresh(banner)

    await log_action(db, current_user, "upload_banner", "banner", banner.id, title)
    await ws_manager.send_content_update()
    return banner


@router.get("/{banner_id}", response_model=BannerResponse)
async def get_banner(
    banner_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner não encontrado")
    return banner


@router.patch("/{banner_id}", response_model=BannerResponse)
async def update_banner(
    banner_id: str,
    data: BannerUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner não encontrado")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(banner, key, value)

    await db.flush()
    await db.refresh(banner)
    await ws_manager.send_content_update()
    return banner


@router.delete("/{banner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_banner(
    banner_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner não encontrado")

    await log_action(db, current_user, "delete_banner", "banner", banner_id, banner.title)
    delete_object(banner.file_url)
    await db.delete(banner)


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_banners(
    data: BannerOrderUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    for item in data.items:
        await db.execute(
            update(Banner)
            .where(Banner.id == item["id"])
            .values(order_index=item["order_index"])
        )
    await ws_manager.send_content_update()
