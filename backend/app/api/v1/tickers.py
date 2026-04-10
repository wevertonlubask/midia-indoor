from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.ticker import Ticker
from app.models.user import User
from app.schemas.ticker import TickerCreate, TickerUpdate, TickerResponse
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/tickers", tags=["tickers"])


@router.get("/", response_model=List[TickerResponse])
async def list_tickers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Ticker).order_by(Ticker.order_index))
    return result.scalars().all()


@router.get("/active", response_model=List[TickerResponse])
async def list_active_tickers(db: AsyncSession = Depends(get_db)):
    """Endpoint público para o telão."""
    result = await db.execute(
        select(Ticker).where(Ticker.is_active == True).order_by(Ticker.order_index)
    )
    return result.scalars().all()


@router.post("/", response_model=TickerResponse, status_code=status.HTTP_201_CREATED)
async def create_ticker(
    data: TickerCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    ticker = Ticker(**data.model_dump())
    db.add(ticker)
    await db.flush()
    await db.refresh(ticker)
    await ws_manager.send_content_update()
    return ticker


@router.patch("/{ticker_id}", response_model=TickerResponse)
async def update_ticker(
    ticker_id: str,
    data: TickerUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Ticker).where(Ticker.id == ticker_id))
    ticker = result.scalar_one_or_none()
    if not ticker:
        raise HTTPException(status_code=404, detail="Ticker não encontrado")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(ticker, key, value)

    await db.flush()
    await db.refresh(ticker)
    await ws_manager.send_content_update()
    return ticker


@router.delete("/{ticker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticker(
    ticker_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Ticker).where(Ticker.id == ticker_id))
    ticker = result.scalar_one_or_none()
    if not ticker:
        raise HTTPException(status_code=404, detail="Ticker não encontrado")
    await db.delete(ticker)
