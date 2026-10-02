import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import structlog

from app.core.database import AsyncSessionLocal
from app.models.screen import Screen
from app.models.device import Device
from app.models.content_log import ContentLog
from app.services.websocket_manager import ws_manager
from app.api.v1.devices import authenticate_device, build_config_message

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


@router.websocket("/ws/device/{device_id}")
async def device_websocket(websocket: WebSocket, device_id: str, token: str = ""):
    """
    Endpoint WebSocket do agente instalado no Raspberry Pi.

    Eventos recebidos do agente:
    - DEVICE_STATUS: telemetria a cada 30s (temperatura, throttling, Wi-Fi, TV...)
    - COMMAND_RESULT: resultado de um comando remoto

    Eventos enviados ao agente:
    - DEVICE_CONFIG: URL da tela vinculada e agendamento (na conexão e a cada alteração)
    - COMMAND: comando remoto (restart_browser, reboot, tv_on, tv_off, screenshot, update_agent)
    """
    async with AsyncSessionLocal() as db:
        try:
            device = await authenticate_device(db, device_id, token)
        except HTTPException:
            # Código 4401 indica ao agente que ele deve se registrar novamente
            await websocket.accept()
            await websocket.close(code=4401)
            return
        device.is_connected = True
        device.last_seen_at = datetime.now(timezone.utc)
        await db.commit()
        config_message = build_config_message(device)

    await ws_manager.connect_device(websocket, device_id)
    try:
        await websocket.send_json(config_message)
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                event = message.get("event")

                if event == "DEVICE_STATUS":
                    values = {
                        "last_seen_at": datetime.now(timezone.utc),
                        "is_connected": True,
                        "status": message.get("status") or {},
                    }
                    for field in ("ip", "hostname", "agent_version"):
                        if message.get(field):
                            values[field] = str(message[field])[:255]
                    async with AsyncSessionLocal() as db:
                        await db.execute(update(Device).where(Device.id == device_id).values(**values))
                        await db.commit()
                    await websocket.send_json({
                        "event": "STATUS_ACK",
                        "server_time": datetime.now(timezone.utc).isoformat(),
                    })

                elif event == "COMMAND_RESULT":
                    async with AsyncSessionLocal() as db:
                        device = await db.get(Device, device_id)
                        last = (device.last_command or {}) if device else {}
                        if device and last.get("id") == message.get("id"):
                            device.last_command = {
                                **last,
                                "status": "ok" if message.get("ok") else "error",
                                "message": (message.get("message") or "")[:500],
                                "finished_at": datetime.now(timezone.utc).isoformat(),
                            }
                            await db.commit()

            except json.JSONDecodeError:
                pass
            except Exception as e:
                logger.error("Erro ao processar mensagem WS do dispositivo", error=str(e))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("Dispositivo desconectado por erro", device_id=device_id, error=str(e))
    finally:
        if ws_manager.disconnect_device(websocket, device_id):
            async with AsyncSessionLocal() as db:
                await db.execute(update(Device).where(Device.id == device_id).values(is_connected=False))
                await db.commit()
