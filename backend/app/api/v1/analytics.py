from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.content_log import ContentLog
from app.models.screen import Screen
from app.models.banner import Banner
from app.models.video import Video

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def analytics_summary(
    days: int = Query(default=7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Resumo de analytics dos ultimos N dias."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Total de reproducoes
    total_plays_q = await db.execute(
        select(func.count(ContentLog.id)).where(ContentLog.started_at >= since)
    )
    total_plays = total_plays_q.scalar() or 0

    # Plays por tipo
    plays_by_type_q = await db.execute(
        select(ContentLog.content_type, func.count(ContentLog.id))
        .where(ContentLog.started_at >= since)
        .group_by(ContentLog.content_type)
    )
    plays_by_type = {row[0]: row[1] for row in plays_by_type_q.all()}

    # Telas ativas (que tiveram alguma reproducao)
    active_screens_q = await db.execute(
        select(func.count(func.distinct(ContentLog.screen_id)))
        .where(ContentLog.started_at >= since)
    )
    active_screens = active_screens_q.scalar() or 0

    # Plays por dia (ultimos N dias)
    plays_per_day_q = await db.execute(
        select(
            func.date(ContentLog.started_at).label("day"),
            func.count(ContentLog.id).label("count"),
        )
        .where(ContentLog.started_at >= since)
        .group_by(func.date(ContentLog.started_at))
        .order_by(func.date(ContentLog.started_at))
    )
    plays_per_day = [
        {"date": str(row.day), "count": row.count}
        for row in plays_per_day_q.all()
    ]

    # Top conteudos mais reproduzidos
    top_content_q = await db.execute(
        select(
            ContentLog.content_type,
            ContentLog.content_id,
            func.count(ContentLog.id).label("play_count"),
        )
        .where(ContentLog.started_at >= since)
        .group_by(ContentLog.content_type, ContentLog.content_id)
        .order_by(func.count(ContentLog.id).desc())
        .limit(10)
    )
    top_content_rows = top_content_q.all()

    # Enriquecer com nomes
    top_content = []
    for row in top_content_rows:
        name = None
        if row.content_type == "banner":
            b = await db.execute(select(Banner.title).where(Banner.id == row.content_id))
            name = b.scalar()
        elif row.content_type == "video":
            v = await db.execute(select(Video.title).where(Video.id == row.content_id))
            name = v.scalar()
        top_content.append({
            "type": row.content_type,
            "id": row.content_id,
            "name": name or "Desconhecido",
            "plays": row.play_count,
        })

    # Plays por tela
    plays_per_screen_q = await db.execute(
        select(
            ContentLog.screen_id,
            Screen.name.label("screen_name"),
            func.count(ContentLog.id).label("play_count"),
        )
        .join(Screen, Screen.id == ContentLog.screen_id, isouter=True)
        .where(ContentLog.started_at >= since)
        .group_by(ContentLog.screen_id, Screen.name)
        .order_by(func.count(ContentLog.id).desc())
    )
    plays_per_screen = [
        {"screen_id": row.screen_id, "screen_name": row.screen_name or "Sem nome", "plays": row.play_count}
        for row in plays_per_screen_q.all()
    ]

    return {
        "period_days": days,
        "total_plays": total_plays,
        "plays_by_type": plays_by_type,
        "active_screens": active_screens,
        "plays_per_day": plays_per_day,
        "top_content": top_content,
        "plays_per_screen": plays_per_screen,
    }
