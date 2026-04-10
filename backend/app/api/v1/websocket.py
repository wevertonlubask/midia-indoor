import json
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import structlog

from app.core.database import AsyncSessionLocal
from app.models.screen import Screen
from app.models.content_log import ContentLog
from app.services.websocket_manager import ws_manager

router = APIRouter(tags=["websocket"])
logger = structlog.get_logger()


@router.websocket("/ws/screen/{screen_id}")
async def screen_websocket(websocket: WebSocket, screen_id: str):
    """
    Endpoint WebSocket para as telas (telões).

    Eventos recebidos do telão:
    - SCREEN_HEARTBEAT: ping a cada 30s
    - CONTENT_PLAYING: qual conteúdo está tocando (analytics)
    - SCREEN_ERROR: erro reportado pelo telão
    """
    await ws_manager.connect(websocket, screen_id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Screen).where(Screen.id == screen_id))
        screen = result.scalar_one_or_none()
        if screen:
            screen.last_seen_at = datetime.now(timezone.utc)
            await db.commit()

    # Enviar configuração inicial
    try:
        await websocket.send_json({
            "event": "SCREEN_CONFIG",
            "screen_id": screen_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                event = message.get("event")

                if event == "SCREEN_HEARTBEAT":
                    async with AsyncSessionLocal() as db:
                        await db.execute(
                            update(Screen)
                            .where(Screen.id == screen_id)
                            .values(last_seen_at=datetime.now(timezone.utc))
                        )
                        await db.commit()
                    await websocket.send_json({"event": "HEARTBEAT_ACK"})

                elif event == "CONTENT_PLAYING":
                    content_type = message.get("content_type")
                    content_id = message.get("content_id")
                    if content_type and content_id:
                        async with AsyncSessionLocal() as db:
                            log = ContentLog(
                                screen_id=screen_id,
                                content_type=content_type,
                                content_id=content_id,
                            )
                            db.add(log)
                            await db.commit()

                elif event == "SCREEN_ERROR":
                    logger.error(
                        "Erro reportado pelo telão",
                        screen_id=screen_id,
                        error=message.get("error"),
                    )

            except json.JSONDecodeError:
                pass
            except Exception as e:
                logger.error("Erro ao processar mensagem WS", error=str(e))

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, screen_id)
        logger.info("Telão desconectado", screen_id=screen_id)
    except Exception as e:
        ws_manager.disconnect(websocket, screen_id)
        logger.warning("Telão desconectado por erro", screen_id=screen_id, error=str(e))
