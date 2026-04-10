"""
API de RSS Feeds — CRUD, proxy de páginas e geração de XML.
"""
from typing import List
from urllib.parse import urljoin, urlparse
import re

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import aliased
from bs4 import BeautifulSoup

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.rss_feed import RSSFeed, RSSItem
from app.models.user import User
from app.schemas.rss_feed import (
    RSSFeedCreate, RSSFeedUpdate, RSSFeedResponse, RSSFeedWithItems, RSSItemResponse,
)
from app.services.audit import log_action
from app.tasks.rss_tasks import scrape_rss_feed, _generate_rss_xml

logger = structlog.get_logger()

router = APIRouter(prefix="/rss", tags=["rss"])


# ── Proxy para carregar páginas no builder ────────────────────────────────────

def _rewrite_urls(html: str, base_url: str) -> str:
    """Reescreve URLs relativas para absolutas no HTML."""
    soup = BeautifulSoup(html, "html.parser")

    # Reescrever links CSS
    for tag in soup.find_all("link", href=True):
        tag["href"] = urljoin(base_url, tag["href"])

    # Reescrever scripts
    for tag in soup.find_all("script", src=True):
        tag["src"] = urljoin(base_url, tag["src"])

    # Reescrever imagens
    for tag in soup.find_all("img"):
        for attr in ("src", "data-src", "data-lazy-src", "srcset"):
            if tag.get(attr):
                if attr == "srcset":
                    # srcset tem formato: "url 1x, url 2x"
                    parts = []
                    for entry in tag[attr].split(","):
                        entry = entry.strip()
                        if " " in entry:
                            url_part, descriptor = entry.rsplit(" ", 1)
                            parts.append(f"{urljoin(base_url, url_part.strip())} {descriptor}")
                        elif entry:
                            parts.append(urljoin(base_url, entry))
                    tag[attr] = ", ".join(parts)
                else:
                    tag[attr] = urljoin(base_url, tag[attr])

    # Reescrever backgrounds em style
    for tag in soup.find_all(style=True):
        style = tag["style"]
        tag["style"] = re.sub(
            r'url\(["\']?([^"\')\s]+)["\']?\)',
            lambda m: f'url("{urljoin(base_url, m.group(1))}")',
            style
        )

    # Reescrever <a> hrefs
    for tag in soup.find_all("a", href=True):
        tag["href"] = urljoin(base_url, tag["href"])

    # Reescrever <source> srcset/src
    for tag in soup.find_all("source"):
        if tag.get("src"):
            tag["src"] = urljoin(base_url, tag["src"])
        if tag.get("srcset"):
            parts = []
            for entry in tag["srcset"].split(","):
                entry = entry.strip()
                if " " in entry:
                    url_part, descriptor = entry.rsplit(" ", 1)
                    parts.append(f"{urljoin(base_url, url_part.strip())} {descriptor}")
                elif entry:
                    parts.append(urljoin(base_url, entry))
            tag["srcset"] = ", ".join(parts)

    # Adicionar <base> tag para resolver qualquer URL restante
    base_tag = soup.new_tag("base", href=base_url)
    if soup.head:
        soup.head.insert(0, base_tag)

    return str(soup)


@router.get("/proxy")
async def proxy_page(
    url: str = Query(..., description="URL da página para proxy"),
    _: User = Depends(get_current_user),
):
    """Faz proxy de uma página web para uso no RSS Builder visual."""
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        raise HTTPException(400, "URL inválida")

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            })
            r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Erro ao acessar a página: {str(e)[:200]}")

    base_url = f"{parsed.scheme}://{parsed.netloc}"
    html = _rewrite_urls(r.text, url)

    return Response(content=html, media_type="text/html; charset=utf-8")


# ── Preview: testa seletores e retorna amostra ───────────────────────────────

@router.post("/preview")
async def preview_selectors(
    data: RSSFeedCreate,
    _: User = Depends(get_current_user),
):
    """Testa seletores CSS em uma página e retorna preview dos itens."""
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(data.source_url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            })
            r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Erro ao acessar a página: {str(e)[:200]}")

    from app.tasks.rss_tasks import _extract_items
    items = _extract_items(r.text, data.source_url, data.selectors.model_dump())

    return {"items": items[:20], "total": len(items)}


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[RSSFeedResponse])
async def list_feeds(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    Creator = aliased(User)
    q = (
        select(RSSFeed, Creator.full_name.label("creator_name"))
        .outerjoin(Creator, RSSFeed.created_by == Creator.id)
        .order_by(RSSFeed.created_at.desc())
    )
    rows = (await db.execute(q)).all()
    result = []
    for feed, creator_name in rows:
        data = {c.key: getattr(feed, c.key) for c in RSSFeed.__table__.columns}
        data["created_by_name"] = creator_name
        result.append(data)
    return result


@router.post("/", response_model=RSSFeedResponse, status_code=status.HTTP_201_CREATED)
async def create_feed(
    data: RSSFeedCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    feed = RSSFeed(
        name=data.name,
        source_url=data.source_url,
        selectors=data.selectors.model_dump(),
        refresh_interval=data.refresh_interval,
        is_active=data.is_active,
        created_by=current_user.id,
    )
    db.add(feed)
    await db.flush()
    await db.refresh(feed)

    await log_action(db, current_user, "create_rss_feed", "rss_feed", feed.id, feed.name)

    # Dispara primeiro scrape imediatamente
    scrape_rss_feed.delay(feed.id)

    return {**{c.key: getattr(feed, c.key) for c in RSSFeed.__table__.columns}, "created_by_name": current_user.full_name}


@router.get("/{feed_id}", response_model=RSSFeedWithItems)
async def get_feed(
    feed_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(RSSFeed).where(RSSFeed.id == feed_id))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(404, "Feed RSS não encontrado")

    items_result = await db.execute(
        select(RSSItem).where(RSSItem.feed_id == feed_id).order_by(RSSItem.created_at)
    )
    items = items_result.scalars().all()

    data = {c.key: getattr(feed, c.key) for c in RSSFeed.__table__.columns}
    data["items"] = [
        {c.key: getattr(item, c.key) for c in RSSItem.__table__.columns}
        for item in items
    ]
    return data


@router.patch("/{feed_id}", response_model=RSSFeedResponse)
async def update_feed(
    feed_id: str,
    data: RSSFeedUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(RSSFeed).where(RSSFeed.id == feed_id))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(404, "Feed RSS não encontrado")

    update_data = data.model_dump(exclude_unset=True)
    if "selectors" in update_data and update_data["selectors"] is not None:
        update_data["selectors"] = update_data["selectors"] if isinstance(update_data["selectors"], dict) else update_data["selectors"].model_dump()

    for key, value in update_data.items():
        setattr(feed, key, value)

    await db.flush()
    await db.refresh(feed)
    return {c.key: getattr(feed, c.key) for c in RSSFeed.__table__.columns}


@router.delete("/{feed_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feed(
    feed_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(RSSFeed).where(RSSFeed.id == feed_id))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(404, "Feed RSS não encontrado")

    await log_action(db, current_user, "delete_rss_feed", "rss_feed", feed_id, feed.name)
    await db.execute(delete(RSSItem).where(RSSItem.feed_id == feed_id))
    await db.delete(feed)


@router.post("/{feed_id}/scrape")
async def trigger_scrape(
    feed_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Força scraping imediato de um feed."""
    result = await db.execute(select(RSSFeed).where(RSSFeed.id == feed_id))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(404, "Feed RSS não encontrado")

    scrape_rss_feed.delay(feed_id)
    return {"message": "Scraping enfileirado", "feed_id": feed_id}


# ── XML Output ────────────────────────────────────────────────────────────────

@router.get("/{feed_id}/xml")
async def get_feed_xml(
    feed_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retorna o feed em formato RSS 2.0 XML. Endpoint público (sem auth)."""
    result = await db.execute(select(RSSFeed).where(RSSFeed.id == feed_id))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(404, "Feed RSS não encontrado")

    items_result = await db.execute(
        select(RSSItem).where(RSSItem.feed_id == feed_id).order_by(RSSItem.created_at)
    )
    items = items_result.scalars().all()

    items_data = [
        {
            "title": item.title,
            "link": item.link,
            "description": item.description,
            "image_url": item.image_url,
            "pub_date": item.pub_date,
            "author": item.author,
            "guid": item.guid,
        }
        for item in items
    ]

    xml = _generate_rss_xml(feed.name, feed.source_url, items_data)
    return Response(content=xml, media_type="application/rss+xml; charset=utf-8")
