"""
Dispositivos (Raspberry Pi) que exibem as Telas nas TVs.

O agente instalado no Pi se registra sozinho (POST /devices/register), mantém um
WebSocket aberto em /ws/device/{id} e recebe por ele a URL da tela vinculada,
o agendamento de liga/desliga da TV e os comandos remotos.
"""
import base64
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.device import Device, default_device_settings
from app.models.screen import Screen
from app.models.user import User
from app.schemas.device import (
    DeviceCommand,
    DevicePublic,
    DeviceRegister,
    DeviceRegisterResponse,
    DeviceResponse,
    DeviceUpdate,
)
from app.services.audit import log_action
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/devices", tags=["devices"])
agent_router = APIRouter(prefix="/agent", tags=["devices"])

# Sem heartbeat (a cada 30s) por mais que isso, o dispositivo é considerado offline
ONLINE_GRACE_PERIOD = timedelta(seconds=90)
SCREENSHOT_TTL_SECONDS = 24 * 3600
MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

# Arquivos do agente que podem ser baixados pelo Pi durante instalação/atualização
AGENT_FILES = {
    "install.sh": "text/x-shellscript",
    "signflow_agent.py": "text/x-python",
    "kiosk-browser.sh": "text/x-shellscript",
    "signflow-agent.service": "text/plain",
    "signflow-kiosk.service": "text/plain",
}


# ── Helpers ─────────────────────────────────────────────────────────────────

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def device_code(device_id: str) -> str:
    """Código curto exibido na TV para identificar o dispositivo no pareamento."""
    return device_id.replace("-", "")[:6].upper()


def is_device_online(device: Device) -> bool:
    if not device.is_connected or not device.last_seen_at:
        return False
    last_seen = device.last_seen_at
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - last_seen < ONLINE_GRACE_PERIOD


def enrich_device(device: Device) -> DeviceResponse:
    data = DeviceResponse.model_validate(device)
    data.is_online = is_device_online(device)
    data.settings = {**default_device_settings(), **(device.settings or {})}
    return data


def build_config_message(device: Device) -> dict:
    return {
        "event": "DEVICE_CONFIG",
        "device_id": device.id,
        "name": device.name,
        "code": device_code(device.id),
        "display_path": f"/display/{device.screen_id}" if device.screen_id else None,
        "settings": {**default_device_settings(), **(device.settings or {})},
    }


async def push_config(device: Device):
    await ws_manager.send_to_device(device.id, build_config_message(device))


def _screenshot_key(device_id: str) -> str:
    return f"signflow:device:{device_id}:screenshot"


async def _get_device(db: AsyncSession, device_id: str) -> Device:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    return device


async def authenticate_device(db: AsyncSession, device_id: str, token: Optional[str]) -> Device:
    """Valida o token do agente. Usado pelos endpoints do agente e pelo WebSocket."""
    if not token:
        raise HTTPException(status_code=401, detail="Token do dispositivo ausente")
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device or not secrets.compare_digest(device.token_hash, hash_token(token)):
        raise HTTPException(status_code=401, detail="Token do dispositivo inválido")
    return device


# ── Endpoints do painel (admin) ─────────────────────────────────────────────

@router.get("/", response_model=List[DeviceResponse])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Device).order_by(Device.created_at))
    return [enrich_device(d) for d in result.scalars().all()]


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return enrich_device(await _get_device(db, device_id))


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: str,
    data: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    device = await _get_device(db, device_id)
    changes = data.model_dump(exclude_unset=True)

    if "screen_id" in changes and changes["screen_id"]:
        screen = await db.get(Screen, changes["screen_id"])
        if not screen:
            raise HTTPException(status_code=404, detail="Tela não encontrada")

    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Nome não pode ser vazio")
        device.name = name
    if "screen_id" in changes:
        device.screen_id = changes["screen_id"] or None
    if "settings" in changes and changes["settings"] is not None:
        device.settings = data.settings.model_dump()

    await log_action(db, current_user, "update_device", "device", device.id, device.name)
    await db.flush()
    await db.refresh(device)
    await push_config(device)
    return enrich_device(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    device = await _get_device(db, device_id)
    await log_action(db, current_user, "delete_device", "device", device.id, device.name)
    await db.delete(device)


@router.post("/{device_id}/command", status_code=status.HTTP_202_ACCEPTED)
async def send_device_command(
    device_id: str,
    body: DeviceCommand,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    device = await _get_device(db, device_id)
    if not is_device_online(device):
        raise HTTPException(status_code=409, detail="Dispositivo offline")

    command_id = str(uuid.uuid4())
    device.last_command = {
        "id": command_id,
        "command": body.command,
        "status": "pending",
        "message": None,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
    }
    await log_action(db, current_user, f"device_{body.command}", "device", device.id, device.name)
    # Gravar antes de enviar: o agente pode responder antes do commit automático
    # do fim da requisição, e o resultado seria descartado (comando "pendente" para sempre)
    await db.commit()
    await ws_manager.send_to_device(
        device.id, {"event": "COMMAND", "id": command_id, "command": body.command}
    )
    return {"command_id": command_id}


@router.get("/{device_id}/screenshot")
async def get_device_screenshot(
    device_id: str,
    request: Request,
    _: User = Depends(get_current_user),
):
    raw = await request.app.state.redis.get(_screenshot_key(device_id))
    if not raw:
        raise HTTPException(status_code=404, detail="Nenhuma captura disponível")
    image = base64.b64decode(raw)
    return Response(
        content=image,
        media_type="image/png" if image.startswith(b"\x89PNG") else "image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


# ── Endpoints do agente (autenticados pelo token do dispositivo) ────────────

@router.post("/register", response_model=DeviceRegisterResponse)
async def register_device(
    data: DeviceRegister,
    db: AsyncSession = Depends(get_db),
):
    """
    Registro automático do agente. Se o MAC já existir, gera um novo token
    (ex.: cartão SD regravado) e mantém nome, tela vinculada e agendamento.
    """
    if settings.DEVICE_ENROLL_KEY and not secrets.compare_digest(
        data.enroll_key or "", settings.DEVICE_ENROLL_KEY
    ):
        raise HTTPException(status_code=403, detail="Chave de registro inválida")

    token = secrets.token_urlsafe(32)
    result = await db.execute(select(Device).where(Device.mac == data.mac))
    device = result.scalar_one_or_none()
    if device is None:
        device = Device(
            name=data.hostname or data.mac,
            mac=data.mac,
            settings=default_device_settings(),
            token_hash=hash_token(token),
        )
        db.add(device)
    else:
        device.token_hash = hash_token(token)

    device.hostname = data.hostname
    device.ip = data.ip
    device.agent_version = data.agent_version
    await db.flush()
    return DeviceRegisterResponse(device_id=device.id, token=token)


@router.post("/{device_id}/screenshot", status_code=status.HTTP_204_NO_CONTENT)
async def upload_device_screenshot(
    device_id: str,
    request: Request,
    x_device_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    await authenticate_device(db, device_id, x_device_token)
    body = await request.body()
    if not body or len(body) > MAX_SCREENSHOT_BYTES:
        raise HTTPException(status_code=413, detail="Captura vazia ou grande demais")
    await request.app.state.redis.set(
        _screenshot_key(device_id),
        base64.b64encode(body).decode(),
        ex=SCREENSHOT_TTL_SECONDS,
    )


@router.get("/{device_id}/public", response_model=DevicePublic)
async def get_device_public(device_id: str, db: AsyncSession = Depends(get_db)):
    """Dados mínimos para a página de pareamento exibida na TV (sem autenticação)."""
    device = await _get_device(db, device_id)
    return DevicePublic(
        id=device.id,
        name=device.name,
        hostname=device.hostname,
        ip=device.ip,
        code=device_code(device.id),
    )


# ── Distribuição do agente (instalação: curl .../api/v1/agent/install.sh | sudo bash)

@agent_router.get("/{filename}")
async def download_agent_file(filename: str, request: Request):
    if filename not in AGENT_FILES:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    path = os.path.join(settings.AGENT_DIST_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")

    # Modo texto converte CRLF em LF (CRLF quebraria o bash no Pi)
    with open(path, encoding="utf-8") as f:
        content = f.read()
    if filename == "install.sh":
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("host", request.url.netloc)
        content = content.replace("__SIGNFLOW_SERVER__", f"{proto}://{host}")
    return PlainTextResponse(content, media_type=AGENT_FILES[filename])
