from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.playlist import Playlist, PlaylistBanner, PlaylistVideo
from app.models.user import User
from app.schemas.playlist import PlaylistCreate, PlaylistUpdate, PlaylistResponse
from app.services.audit import log_action
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/playlists", tags=["playlists"])


def _add_banners(db, playlist_id: str, banner_slots: List[List[str]]) -> None:
    """Insere banners com slot_index a partir de uma lista de listas."""
    for slot_idx, banner_ids in enumerate(banner_slots):
        for order, banner_id in enumerate(banner_ids):
            db.add(
                PlaylistBanner(
                    playlist_id=playlist_id,
                    banner_id=banner_id,
                    order_index=order,
                    slot_index=slot_idx,
                )
            )


@router.get("/", response_model=List[PlaylistResponse])
async def list_playlists(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Playlist).order_by(Playlist.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=PlaylistResponse, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    data: PlaylistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    playlist = Playlist(
        name=data.name,
        is_active=data.is_active,
        banner_slot_count=data.banner_slot_count,
        schedule_start=data.schedule_start,
        schedule_end=data.schedule_end,
        created_by=current_user.id,
    )
    db.add(playlist)
    await db.flush()

    # banner_slots (novo formato) tem prioridade sobre banner_ids (legado)
    if data.banner_slots is not None:
        _add_banners(db, playlist.id, data.banner_slots)
    elif data.banner_ids:
        _add_banners(db, playlist.id, [data.banner_ids])

    for i, video_id in enumerate(data.video_ids):
        db.add(PlaylistVideo(playlist_id=playlist.id, video_id=video_id, order_index=i))

    await log_action(db, current_user, "create_playlist", "playlist", playlist.id, data.name)
    await db.flush()
    await db.refresh(playlist)
    return playlist


@router.get("/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist não encontrada")
    return playlist


@router.get("/{playlist_id}/content")
async def get_playlist_content(
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retorna banners por slot e vídeos da playlist."""
    from app.models.banner import Banner
    from app.models.video import Video, TranscodeStatus

    playlist_result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = playlist_result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist não encontrada")

    slot_count = playlist.banner_slot_count

    pb_result = await db.execute(
        select(PlaylistBanner, Banner)
        .join(Banner, PlaylistBanner.banner_id == Banner.id)
        .where(PlaylistBanner.playlist_id == playlist_id)
        .where(Banner.is_active == True)
        .order_by(PlaylistBanner.slot_index, PlaylistBanner.order_index)
    )

    banner_slots_data: List[List[dict]] = [[] for _ in range(slot_count)]
    all_banners = []
    for pb, b in pb_result.all():
        entry = {"id": b.id, "title": b.title, "slot_index": pb.slot_index}
        all_banners.append(entry)
        slot = min(pb.slot_index, slot_count - 1)
        banner_slots_data[slot].append(entry)

    pv_result = await db.execute(
        select(PlaylistVideo, Video)
        .join(Video, PlaylistVideo.video_id == Video.id)
        .where(PlaylistVideo.playlist_id == playlist_id)
        .where(Video.is_active == True)
        .where(Video.transcode_status == TranscodeStatus.DONE)
        .order_by(PlaylistVideo.order_index)
    )
    videos = [{"id": v.id, "title": v.title} for pv, v in pv_result.all()]

    return {
        "playlist_id": playlist_id,
        "banner_slot_count": slot_count,
        "banner_slots": banner_slots_data,
        "banners": all_banners,
        "videos": videos,
    }


@router.patch("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(
    playlist_id: str,
    data: PlaylistUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist não encontrada")

    update_data = data.model_dump(exclude_unset=True)

    if "banner_slots" in update_data:
        await db.execute(delete(PlaylistBanner).where(PlaylistBanner.playlist_id == playlist_id))
        _add_banners(db, playlist_id, update_data.pop("banner_slots"))
        update_data.pop("banner_ids", None)
    elif "banner_ids" in update_data:
        await db.execute(delete(PlaylistBanner).where(PlaylistBanner.playlist_id == playlist_id))
        _add_banners(db, playlist_id, [update_data.pop("banner_ids")])

    if "video_ids" in update_data:
        await db.execute(delete(PlaylistVideo).where(PlaylistVideo.playlist_id == playlist_id))
        for i, video_id in enumerate(update_data.pop("video_ids")):
            db.add(PlaylistVideo(playlist_id=playlist_id, video_id=video_id, order_index=i))

    for key, value in update_data.items():
        setattr(playlist, key, value)

    await log_action(db, current_user, "update_playlist", "playlist", playlist_id, playlist.name)
    await db.flush()
    await db.refresh(playlist)
    # Raspberry Pis baixam as mídias novas para o cache local
    await ws_manager.broadcast_devices({"event": "SYNC_MEDIA"})
    return playlist


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist não encontrada")
    await log_action(db, current_user, "delete_playlist", "playlist", playlist_id, playlist.name)
    await db.delete(playlist)
