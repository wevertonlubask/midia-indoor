from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import get_current_admin
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/emergency", tags=["emergency"])


class EmergencyMessageRequest(BaseModel):
    message: str


@router.post("/")
async def send_emergency(
    body: EmergencyMessageRequest,
    _=Depends(get_current_admin),
):
    """Envia mensagem de emergencia para todas as telas conectadas."""
    await ws_manager.send_emergency_message(body.message)
    return {"status": "sent", "message": body.message}


@router.delete("/")
async def clear_emergency(
    _=Depends(get_current_admin),
):
    """Limpa mensagem de emergencia de todas as telas."""
    await ws_manager.clear_emergency()
    return {"status": "cleared"}
