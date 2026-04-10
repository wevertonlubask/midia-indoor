from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.screen import Screen
from app.models.user import User
from app.schemas.screen import ScreenCreate, ScreenUpdate, ScreenResponse
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/screens", tags=["screens"])

# Período de graça: se o último heartbeat foi há menos de 90s, considerar online
# Isso evita que desconexões breves (comum em TVs) mostrem a tela como offline
ONLINE_GRACE_PERIOD = timedelta(seconds=90)


def _enrich_screen(screen: Screen) -> ScreenResponse:
    data = ScreenResponse.model_validate(screen)
    # Primeiro verifica conexão WebSocket ativa
    if ws_manager.is_online(screen.id):
        data.is_online = True
    # Fallback: se o último heartbeat foi recente, ainda considerar online
    elif screen.last_seen_at:
        last_seen = screen.last_seen_at
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        data.is_online = (datetime.now(timezone.utc) - last_seen) < ONLINE_GRACE_PERIOD
    else:
        data.is_online = False
    return data


@router.get("/", response_model=List[ScreenResponse])
async def list_screens(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Screen).order_by(Screen.created_at))
    screens = result.scalars().all()
    return [_enrich_screen(s) for s in screens]


@router.post("/", response_model=ScreenResponse, status_code=status.HTTP_201_CREATED)
async def create_screen(
    data: ScreenCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    screen = Screen(**data.model_dump())
    db.add(screen)
    await db.flush()
    await db.refresh(screen)
    return _enrich_screen(screen)


@router.get("/{screen_id}", response_model=ScreenResponse)
async def get_screen(
    screen_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Screen).where(Screen.id == screen_id))
    screen = result.scalar_one_or_none()
    if not screen:
        raise HTTPException(status_code=404, detail="Tela não encontrada")
    return _enrich_screen(screen)


@router.patch("/{screen_id}", response_model=ScreenResponse)
async def update_screen(
    screen_id: str,
    data: ScreenUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Screen).where(Screen.id == screen_id))
    screen = result.scalar_one_or_none()
    if not screen:
        raise HTTPException(status_code=404, detail="Tela não encontrada")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(screen, key, value)

    await db.flush()
    await db.refresh(screen)
    return _enrich_screen(screen)


@router.delete("/{screen_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_screen(
    screen_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Screen).where(Screen.id == screen_id))
    screen = result.scalar_one_or_none()
    if not screen:
        raise HTTPException(status_code=404, detail="Tela não encontrada")
    await db.delete(screen)


@router.post("/{screen_id}/reload", status_code=status.HTTP_204_NO_CONTENT)
async def force_reload_screen(
    screen_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Força o reload de uma tela específica via WebSocket."""
    result = await db.execute(select(Screen).where(Screen.id == screen_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tela não encontrada")
    await ws_manager.force_reload(screen_id)


@router.post("/reload-all", status_code=status.HTTP_204_NO_CONTENT)
async def force_reload_all(
    _: User = Depends(get_current_admin),
):
    """Força o reload de todas as telas conectadas."""
    await ws_manager.force_reload()
