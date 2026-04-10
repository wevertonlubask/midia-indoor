from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.core.config import settings
from app.models.video import Video, TranscodeStatus
from app.models.user import User
from app.schemas.video import VideoUpdate, VideoResponse
from app.services.storage import upload_video, upload_image, delete_object
from app.services.websocket_manager import ws_manager
from app.tasks.video_tasks import transcode_video
from app.tasks.slideshow_tasks import create_slideshow_video
from app.services.audit import log_action

router = APIRouter(prefix="/videos", tags=["videos"])

ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.get("/", response_model=List[VideoResponse])
async def list_videos(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from sqlalchemy.orm import aliased
    Creator = aliased(User)
    q = (
        select(Video, Creator.full_name.label("creator_name"))
        .outerjoin(Creator, Video.created_by == Creator.id)
    )
    if active_only:
        q = q.where(Video.is_active == True)
    q = q.order_by(Video.order_index).offset(skip).limit(limit)
    rows = (await db.execute(q)).all()
    result = []
    for video, creator_name in rows:
        data = {c.key: getattr(video, c.key) for c in Video.__table__.columns}
        data["created_by_name"] = creator_name
        result.append(data)
    return result


@router.post("/", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def upload_video_file(
    title: str = Form(...),
    order_index: int = Form(0),
    is_active: bool = Form(True),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de vídeo não suportado: {file.content_type}",
        )

    file_data = await file.read()
    if len(file_data) > settings.max_video_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Vídeo muito grande. Máximo: {settings.MAX_VIDEO_SIZE_MB}MB",
        )

    original_url = upload_video(file_data, file.filename)

    video = Video(
        title=title,
        filename=file.filename,
        original_url=original_url,
        order_index=order_index,
        is_active=is_active,
        created_by=current_user.id,
        transcode_status=TranscodeStatus.PENDING,
        meta={"original_size": len(file_data)},
    )
    db.add(video)
    await db.flush()
    await db.refresh(video)

    await log_action(db, current_user, "upload_video", "video", video.id, title)

    # Enfileirar transcodificação assíncrona
    transcode_video.apply_async(
        args=[video.id, original_url, file.filename],
        queue="video_transcode",
    )

    return video


@router.post("/from-images", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def create_video_from_images(
    title: str = Form(...),
    duration_per_image: float = Form(5.0),
    transition_duration: float = Form(1.0),
    order_index: int = Form(0),
    is_active: bool = Form(True),
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recebe múltiplas imagens e gera um vídeo slideshow com transições."""
    if len(files) < 1:
        raise HTTPException(status_code=400, detail="Envie ao menos 1 imagem.")

    for f in files:
        if f.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo não suportado: {f.content_type}. Use JPEG, PNG, WebP ou GIF.",
            )

    # Upload de cada imagem para MinIO (reutiliza upload_image existente)
    image_urls = []
    for f in files:
        file_data = await f.read()
        url, _ = upload_image(file_data, f.filename, f.content_type, compress=True)
        image_urls.append(url)

    # Criar registro de vídeo com status pendente
    video = Video(
        title=title,
        filename="slideshow.mp4",
        original_url=image_urls[0],  # primeira imagem como referência
        order_index=order_index,
        is_active=is_active,
        created_by=current_user.id,
        transcode_status=TranscodeStatus.PENDING,
        meta={
            "type": "slideshow",
            "image_count": len(files),
            "duration_per_image": duration_per_image,
            "transition_duration": transition_duration,
            "image_urls": image_urls,
        },
    )
    db.add(video)
    await db.flush()
    await db.refresh(video)

    await log_action(db, current_user, "create_slideshow", "video", video.id, title)

    # Enfileirar geração do vídeo
    create_slideshow_video.apply_async(
        args=[video.id, image_urls, duration_per_image, transition_duration],
        queue="video_transcode",
    )

    return video


@router.post("/{video_id}/regenerate-slideshow", response_model=VideoResponse)
async def regenerate_slideshow(
    video_id: str,
    duration_per_image: float = Form(5.0),
    transition_duration: float = Form(1.0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Regenera um vídeo slideshow com novos parâmetros de tempo, sem re-upload das imagens."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")

    meta = video.meta or {}
    if meta.get("type") != "slideshow" or not meta.get("image_urls"):
        raise HTTPException(status_code=400, detail="Este vídeo não é um slideshow.")

    # Atualizar parâmetros no meta
    meta["duration_per_image"] = duration_per_image
    meta["transition_duration"] = transition_duration
    video.meta = meta
    video.transcode_status = TranscodeStatus.PENDING
    video.transcode_error = None
    await db.flush()
    await db.refresh(video)

    # Deletar vídeo transcodificado anterior
    if video.transcoded_url:
        delete_object(video.transcoded_url)
    if video.thumbnail_url:
        delete_object(video.thumbnail_url)

    # Re-enfileirar geração
    create_slideshow_video.apply_async(
        args=[video.id, meta["image_urls"], duration_per_image, transition_duration],
        queue="video_transcode",
    )

    return video


@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")
    return video


@router.patch("/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: str,
    data: VideoUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(video, key, value)

    await db.flush()
    await db.refresh(video)
    await ws_manager.send_content_update()
    return video


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")

    await log_action(db, current_user, "delete_video", "video", video_id, video.title)
    delete_object(video.original_url)
    if video.transcoded_url:
        delete_object(video.transcoded_url)
    if video.thumbnail_url:
        delete_object(video.thumbnail_url)

    await db.delete(video)


@router.post("/{video_id}/retranscode", response_model=VideoResponse)
async def retranscode_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")

    video.transcode_status = TranscodeStatus.PENDING
    video.transcode_error = None
    await db.flush()
    await db.refresh(video)

    transcode_video.apply_async(
        args=[video.id, video.original_url, video.filename],
        queue="video_transcode",
    )
    return video
