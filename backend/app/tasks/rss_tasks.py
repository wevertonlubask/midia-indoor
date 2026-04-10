"""
Celery tasks para scraping de RSS feeds.
Busca o site, aplica seletores CSS, extrai itens e gera XML.
"""
import uuid
import re
from datetime import datetime, timezone
from urllib.parse import urljoin

import httpx
import structlog
from bs4 import BeautifulSoup
from sqlalchemy import select, delete

from app.tasks.celery_app import celery_app
from app.core.config import settings
from app.core.database import engine
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

logger = structlog.get_logger()

# Engine síncrono para tasks Celery
_sync_engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
SyncSession = sessionmaker(_sync_engine, expire_on_commit=False)


def _fetch_page(url: str) -> str:
    """Faz fetch de uma página com timeout e user-agent."""
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        r = client.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        })
        r.raise_for_status()
        return r.text


def _extract_items(html: str, source_url: str, selectors: dict) -> list[dict]:
    """
    Aplica seletores CSS ao HTML e extrai itens.
    selectors: { container, link, title?, description?, image?, date?, author? }
    """
    soup = BeautifulSoup(html, "html.parser")
    container_sel = selectors.get("container", "")
    if not container_sel:
        return []

    containers = soup.select(container_sel)
    items = []

    for container in containers:
        item = {}

        # Link (obrigatório)
        link_sel = selectors.get("link", "")
        if link_sel:
            el = container.select_one(link_sel)
            if el:
                href = el.get("href", "") if el.name == "a" else ""
                if not href:
                    a_tag = el.find("a")
                    href = a_tag.get("href", "") if a_tag else ""
                if href:
                    item["link"] = urljoin(source_url, href)

        # Título
        title_sel = selectors.get("title", "")
        if title_sel:
            el = container.select_one(title_sel)
            if el:
                item["title"] = el.get_text(strip=True)

        # Descrição
        desc_sel = selectors.get("description", "")
        if desc_sel:
            el = container.select_one(desc_sel)
            if el:
                text = el.get_text(strip=True)
                item["description"] = text[:2000] if text else None

        # Imagem
        img_sel = selectors.get("image", "")
        if img_sel:
            el = container.select_one(img_sel)
            if el:
                src = el.get("src", "") or el.get("data-src", "") or el.get("data-lazy-src", "")
                if not src and el.name != "img":
                    img_tag = el.find("img")
                    if img_tag:
                        src = img_tag.get("src", "") or img_tag.get("data-src", "")
                if src:
                    item["image_url"] = urljoin(source_url, src)

        # Data
        date_sel = selectors.get("date", "")
        if date_sel:
            el = container.select_one(date_sel)
            if el:
                item["pub_date"] = el.get_text(strip=True)

        # Autor
        author_sel = selectors.get("author", "")
        if author_sel:
            el = container.select_one(author_sel)
            if el:
                item["author"] = el.get_text(strip=True)

        # Só adiciona se tiver ao menos link ou título
        if item.get("link") or item.get("title"):
            item["guid"] = item.get("link") or item.get("title", "")
            items.append(item)

    return items


def _generate_rss_xml(feed_name: str, source_url: str, items: list[dict]) -> str:
    """Gera XML RSS 2.0 a partir dos itens extraídos."""
    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")

    xml_items = []
    for item in items:
        parts = ["    <item>"]
        if item.get("title"):
            parts.append(f"      <title><![CDATA[{item['title']}]]></title>")
        if item.get("link"):
            parts.append(f"      <link>{_xml_escape(item['link'])}</link>")
        if item.get("description"):
            parts.append(f"      <description><![CDATA[{item['description']}]]></description>")
        if item.get("pub_date"):
            parts.append(f"      <pubDate>{_xml_escape(item['pub_date'])}</pubDate>")
        if item.get("author"):
            parts.append(f"      <author><![CDATA[{item['author']}]]></author>")
        if item.get("image_url"):
            parts.append(f'      <enclosure url="{_xml_escape(item["image_url"])}" type="image/jpeg"/>')
        if item.get("guid"):
            parts.append(f"      <guid>{_xml_escape(item['guid'])}</guid>")
        parts.append("    </item>")
        xml_items.append("\n".join(parts))

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>{_xml_escape(feed_name)}</title>
    <link>{_xml_escape(source_url)}</link>
    <description>Feed gerado automaticamente pelo SignFlow</description>
    <lastBuildDate>{now}</lastBuildDate>
{chr(10).join(xml_items)}
  </channel>
</rss>"""


def _xml_escape(s: str) -> str:
    """Escapa caracteres especiais XML."""
    return (s
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;"))


@celery_app.task(name="app.tasks.rss_tasks.scrape_rss_feed", bind=True, max_retries=3)
def scrape_rss_feed(self, feed_id: str):
    """Scrape um feed RSS e atualiza os itens no banco."""
    from app.models.rss_feed import RSSFeed, RSSItem

    with SyncSession() as db:
        feed = db.execute(
            select(RSSFeed).where(RSSFeed.id == feed_id)
        ).scalar_one_or_none()

        if not feed:
            logger.warning("Feed RSS não encontrado", feed_id=feed_id)
            return

        try:
            logger.info("Scraping RSS feed", feed_id=feed_id, url=feed.source_url)

            html = _fetch_page(feed.source_url)
            items = _extract_items(html, feed.source_url, feed.selectors)

            logger.info("Itens extraídos", feed_id=feed_id, count=len(items))

            # Limpar itens antigos
            db.execute(delete(RSSItem).where(RSSItem.feed_id == feed_id))

            # Inserir novos
            for item_data in items:
                rss_item = RSSItem(
                    id=str(uuid.uuid4()),
                    feed_id=feed_id,
                    title=item_data.get("title"),
                    link=item_data.get("link"),
                    description=item_data.get("description"),
                    image_url=item_data.get("image_url"),
                    pub_date=item_data.get("pub_date"),
                    author=item_data.get("author"),
                    guid=item_data.get("guid"),
                )
                db.add(rss_item)

            feed.last_scraped_at = datetime.now(timezone.utc)
            feed.last_error = None
            feed.item_count = len(items)
            db.commit()

            # Limpar cache RSS do display e notificar telas via Redis
            try:
                from app.api.v1.display import clear_rss_cache
                clear_rss_cache()
            except Exception:
                pass
            try:
                import redis
                r = redis.from_url(settings.REDIS_URL)
                import json
                r.publish("signflow:ws:broadcast", json.dumps({"event": "TICKER_UPDATE", "screen_id": None}))
                r.close()
            except Exception as e:
                logger.warning("Não foi possível notificar telas após RSS update", error=str(e))

            logger.info("RSS feed atualizado", feed_id=feed_id, items=len(items))
            return {"feed_id": feed_id, "items": len(items)}

        except Exception as e:
            logger.error("Erro ao scrapear feed RSS", feed_id=feed_id, error=str(e))
            feed.last_error = str(e)[:500]
            feed.last_scraped_at = datetime.now(timezone.utc)
            db.commit()
            raise self.retry(exc=e, countdown=60)


@celery_app.task(name="app.tasks.rss_tasks.scrape_all_feeds")
def scrape_all_feeds():
    """Task periódica que verifica todos os feeds ativos e enfileira scraping."""
    from app.models.rss_feed import RSSFeed

    with SyncSession() as db:
        feeds = db.execute(
            select(RSSFeed).where(RSSFeed.is_active == True)
        ).scalars().all()

        now = datetime.now(timezone.utc)
        enqueued = 0

        for feed in feeds:
            # Verificar se precisa ser atualizado
            if feed.last_scraped_at:
                elapsed = (now - feed.last_scraped_at).total_seconds() / 60
                if elapsed < feed.refresh_interval:
                    continue

            scrape_rss_feed.delay(feed.id)
            enqueued += 1

        logger.info("RSS feeds enfileirados para scraping", total=len(feeds), enqueued=enqueued)
        return {"total": len(feeds), "enqueued": enqueued}
