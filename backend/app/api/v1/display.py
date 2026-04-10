"""
Endpoint público para o telão — não requer autenticação.
Retorna tudo que a tela precisa para exibir em uma única chamada.
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update
from datetime import datetime, timezone, timedelta
import xml.etree.ElementTree as ET
import httpx

from app.core.database import AsyncSessionLocal
from app.models.screen import Screen
from app.models.banner import Banner
from app.models.video import Video, TranscodeStatus
from app.models.ticker import Ticker
from app.models.playlist import Playlist, PlaylistBanner, PlaylistVideo
from app.models.site_settings import SiteSettings

router = APIRouter(prefix="/display", tags=["display"])

# Cache em memória para feeds RSS: { url: (headlines, expires_at) }
_rss_cache: dict[str, tuple[list[str], datetime]] = {}
_RSS_TTL = timedelta(minutes=2)
_RSS_MAX_ITEMS = 15


def clear_rss_cache():
    """Limpa cache RSS para forçar refresh após scrape."""
    _rss_cache.clear()


async def _fetch_rss_headlines(url: str) -> list[str]:
    """Busca e faz parse de um feed RSS/Atom, retornando lista de títulos."""
    now = datetime.now(timezone.utc)
    if url in _rss_cache:
        headlines, expires_at = _rss_cache[url]
        if now < expires_at:
            return headlines

    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "SignFlow/1.0"})
            r.raise_for_status()
        root = ET.fromstring(r.text)
        # RSS 2.0
        items = root.findall(".//item/title")
        # Atom
        if not items:
            ns = {"a": "http://www.w3.org/2005/Atom"}
            items = root.findall(".//a:entry/a:title", ns)
        headlines = [el.text.strip() for el in items[:_RSS_MAX_ITEMS] if el.text]
        _rss_cache[url] = (headlines, now + _RSS_TTL)
        return headlines
    except Exception:
        return []


@router.get("/{screen_id}/data")
async def get_display_data(screen_id: str):
    """
    Retorna todos os dados necessários para o telão exibir conteúdo.
    Endpoint público — não requer autenticação.
    """
    async with AsyncSessionLocal() as db:
        # Buscar tela
        result = await db.execute(
            select(Screen).where(Screen.id == screen_id, Screen.is_active == True)
        )
        screen = result.scalar_one_or_none()

        if not screen:
            raise HTTPException(status_code=404, detail="Tela não encontrada")

        # Atualizar last_seen_at
        await db.execute(
            update(Screen)
            .where(Screen.id == screen_id)
            .values(last_seen_at=datetime.now(timezone.utc))
        )
        await db.commit()

        banner_groups: list = [[]]  # lista de slots, cada slot é uma lista de banners
        banner_slot_count = 1
        videos = []

        if screen.playlist_id:
            # Buscar playlist para saber quantos slots ela define
            pl_result = await db.execute(
                select(Playlist).where(Playlist.id == screen.playlist_id)
            )
            playlist = pl_result.scalar_one_or_none()
            if playlist:
                banner_slot_count = max(1, playlist.banner_slot_count)

            # Inicializar grupos
            banner_groups = [[] for _ in range(banner_slot_count)]

            # Banners da playlist ordenados por slot e order
            pb_result = await db.execute(
                select(PlaylistBanner, Banner)
                .join(Banner, PlaylistBanner.banner_id == Banner.id)
                .where(PlaylistBanner.playlist_id == screen.playlist_id)
                .where(Banner.is_active == True)
                .order_by(PlaylistBanner.slot_index, PlaylistBanner.order_index)
            )
            for pb, b in pb_result.all():
                slot = min(pb.slot_index, banner_slot_count - 1)
                banner_groups[slot].append({
                    "id": b.id,
                    "title": b.title,
                    "file_url": b.file_url,
                    "duration_seconds": b.duration_seconds,
                })

            # Vídeos da playlist — usa transcoded_url se disponível, senão original_url
            pv_result = await db.execute(
                select(PlaylistVideo, Video)
                .join(Video, PlaylistVideo.video_id == Video.id)
                .where(PlaylistVideo.playlist_id == screen.playlist_id)
                .where(Video.is_active == True)
                .where(Video.original_url.isnot(None))
                .order_by(PlaylistVideo.order_index)
            )
            videos = [
                {
                    "id": v.id,
                    "title": v.title,
                    "video_url": v.transcoded_url or v.original_url,
                    "thumbnail_url": v.thumbnail_url,
                    "duration_seconds": v.duration_seconds,
                    "fullscreen": v.fullscreen,
                }
                for pv, v in pv_result.all()
            ]

        # Tickers ativos (globais)
        tk_result = await db.execute(
            select(Ticker).where(Ticker.is_active == True).order_by(Ticker.order_index)
        )
        tickers = []
        for t in tk_result.scalars().all():
            entry: dict = {
                "id": t.id,
                "content": t.content,
                "type": t.type,
                "config": dict(t.config) if t.config else {},
                "display_duration": t.display_duration,
            }
            if t.type == "rss" and t.content:
                headlines = await _fetch_rss_headlines(t.content)
                entry["config"]["headlines"] = headlines
            tickers.append(entry)

        # banner_groups: lista de listas — índice = slot
        # banners (legado): todos os banners do slot 0 (backward compat)
        all_banners = [b for group in banner_groups for b in group]

        # Logo da empresa
        company_logo_url = None
        accent_color = "#e30613"
        try:
            settings_result = await db.execute(select(SiteSettings).limit(1))
            site_settings = settings_result.scalar_one_or_none()
            if site_settings:
                company_logo_url = site_settings.company_logo_url
                accent_color = site_settings.accent_color or "#e30613"
        except Exception:
            pass  # tabela pode não existir ainda

        return {
            "screen_id": screen_id,
            "screen_name": screen.name,
            "playlist_id": screen.playlist_id,
            "banner_slot_count": banner_slot_count,
            "banner_groups": banner_groups,
            "banners": all_banners,          # legado — mantido para compatibilidade
            "videos": videos,
            "tickers": tickers,
            "company_logo_url": company_logo_url,
            "accent_color": accent_color,
        }
