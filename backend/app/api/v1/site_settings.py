from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.site_settings import SiteSettings
from app.models.user import User
from app.services.storage import upload_logo, delete_object
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/site-settings", tags=["site-settings"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}


async def _get_or_create(db: AsyncSession) -> SiteSettings:
    """Retorna o registro global de configurações, criando se não existir."""
    result = await db.execute(select(SiteSettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = SiteSettings()
        db.add(settings)
        await db.flush()
    return settings


async def _ensure_table(db: AsyncSession) -> bool:
    """Verifica se a tabela site_settings existe com todas as colunas."""
    try:
        from sqlalchemy import text
        # Tenta criar a coluna accent_color se não existir
        try:
            await db.execute(text(
                "ALTER TABLE site_settings ADD COLUMN accent_color VARCHAR(20) DEFAULT '#e30613'"
            ))
            await db.commit()
        except Exception:
            await db.rollback()
        await db.execute(select(SiteSettings).limit(1))
        return True
    except Exception:
        await db.rollback()
        return False


@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Retorna as configurações do site (endpoint público para o telão)."""
    if not await _ensure_table(db):
        return {"company_logo_url": None, "company_logo_filename": None, "accent_color": "#e30613"}
    s = await _get_or_create(db)
    return {
        "company_logo_url": s.company_logo_url,
        "company_logo_filename": s.company_logo_filename,
        "accent_color": s.accent_color or "#e30613",
    }


@router.post("/logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Faz upload do logo da empresa."""
    if not await _ensure_table(db):
        raise HTTPException(status_code=503, detail="Tabela site_settings não existe. Rode a migration: alembic upgrade head")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo não suportado: {file.content_type}. Use JPG, PNG, WebP, GIF ou SVG.",
        )

    file_data = await file.read()
    if len(file_data) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo muito grande. Máximo 5MB.",
        )

    s = await _get_or_create(db)

    # Deletar logo anterior se existir
    if s.company_logo_url:
        delete_object(s.company_logo_url)

    url, meta = upload_logo(file_data, file.filename or "logo.png", file.content_type)

    s.company_logo_url = url
    s.company_logo_filename = file.filename
    s.meta = meta
    s.updated_at = datetime.now(timezone.utc)
    await db.flush()

    await ws_manager.send_content_update()

    return {
        "company_logo_url": s.company_logo_url,
        "company_logo_filename": s.company_logo_filename,
        "accent_color": s.accent_color or "#e30613",
    }


@router.delete("/logo")
async def delete_company_logo(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Remove o logo da empresa."""
    if not await _ensure_table(db):
        return {"ok": True}
    s = await _get_or_create(db)

    if s.company_logo_url:
        delete_object(s.company_logo_url)

    s.company_logo_url = None
    s.company_logo_filename = None
    s.meta = {}
    s.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return {"ok": True}


class AccentColorUpdate(BaseModel):
    accent_color: str


@router.patch("/accent-color")
async def update_accent_color(
    data: AccentColorUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Atualiza a cor de destaque (borda e barra da logo)."""
    if not await _ensure_table(db):
        raise HTTPException(status_code=503, detail="Tabela site_settings não existe. Rode a migration.")
    s = await _get_or_create(db)
    s.accent_color = data.accent_color
    s.updated_at = datetime.now(timezone.utc)
    await db.flush()

    # Notificar telões para recarregar
    await ws_manager.send_content_update()

    return {
        "company_logo_url": s.company_logo_url,
        "company_logo_filename": s.company_logo_filename,
        "accent_color": s.accent_color,
    }
