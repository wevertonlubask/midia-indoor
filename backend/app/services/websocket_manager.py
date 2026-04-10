import json
import asyncio
from typing import Dict, Set, Optional
from fastapi import WebSocket
import redis.asyncio as aioredis
import structlog

logger = structlog.get_logger()

PUBSUB_CHANNEL = "signflow:ws:broadcast"


class ConnectionManager:
    """Gerencia conexões WebSocket das telas (telões)."""

    def __init__(self):
        # screen_id -> set of WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._redis: Optional[aioredis.Redis] = None
        self._subscriber_task: Optional[asyncio.Task] = None

    def set_redis(self, redis_client: aioredis.Redis):
        self._redis = redis_client

    async def start_subscriber(self):
        """Inicia subscriber Redis Pub/Sub para receber mensagens de outros workers."""
        if not self._redis:
            return
        self._subscriber_task = asyncio.create_task(self._subscribe_loop())
        logger.info("Redis Pub/Sub subscriber iniciado")

    async def stop_subscriber(self):
        """Para o subscriber Redis Pub/Sub."""
        if self._subscriber_task:
            self._subscriber_task.cancel()
            try:
                await self._subscriber_task
            except asyncio.CancelledError:
                pass

    async def _subscribe_loop(self):
        """Loop de assinatura Redis Pub/Sub — recebe broadcasts de outros workers."""
        while True:
            try:
                pubsub = self._redis.pubsub()
                await pubsub.subscribe(PUBSUB_CHANNEL)
                async for raw_message in pubsub.listen():
                    if raw_message["type"] != "message":
                        continue
                    try:
                        message = json.loads(raw_message["data"])
                        # Broadcast localmente para as conexões deste worker
                        screen_id = message.pop("screen_id", None)
                        if screen_id:
                            await self.send_to_screen(screen_id, message)
                        else:
                            await self.broadcast(message)
                    except Exception as e:
                        logger.error("Erro ao processar mensagem Pub/Sub", error=str(e))
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error("Redis Pub/Sub desconectado, reconectando...", error=str(e))
                await asyncio.sleep(2)

    async def connect(self, websocket: WebSocket, screen_id: str):
        await websocket.accept()
        if screen_id not in self._connections:
            self._connections[screen_id] = set()
        self._connections[screen_id].add(websocket)
        logger.info("Tela conectada via WS", screen_id=screen_id)

    def disconnect(self, websocket: WebSocket, screen_id: str):
        if screen_id in self._connections:
            self._connections[screen_id].discard(websocket)
            if not self._connections[screen_id]:
                del self._connections[screen_id]
        logger.info("Tela desconectada via WS", screen_id=screen_id)

    def get_online_screens(self) -> Set[str]:
        return set(self._connections.keys())

    def is_online(self, screen_id: str) -> bool:
        return screen_id in self._connections and len(self._connections[screen_id]) > 0

    async def send_to_screen(self, screen_id: str, message: dict):
        """Envia mensagem para uma tela específica."""
        if screen_id not in self._connections:
            return
        dead_sockets = set()
        for ws in self._connections[screen_id].copy():
            try:
                await ws.send_json(message)
            except Exception:
                dead_sockets.add(ws)
        for ws in dead_sockets:
            self._connections[screen_id].discard(ws)

    async def broadcast(self, message: dict):
        """Envia mensagem para todas as telas conectadas."""
        for screen_id in list(self._connections.keys()):
            await self.send_to_screen(screen_id, message)

    async def publish_to_redis(self, message: dict):
        """Publica mensagem no Redis Pub/Sub para múltiplas instâncias."""
        if self._redis:
            try:
                await self._redis.publish(PUBSUB_CHANNEL, json.dumps(message))
            except Exception as e:
                logger.error("Erro ao publicar no Redis Pub/Sub", error=str(e))

    async def force_reload(self, screen_id: Optional[str] = None):
        """Força reload de uma tela específica ou de todas."""
        message = {"event": "FORCE_RELOAD"}
        if screen_id:
            await self.send_to_screen(screen_id, message)
        else:
            await self.broadcast(message)
        await self.publish_to_redis({"event": "FORCE_RELOAD", "screen_id": screen_id})

    async def send_content_update(self, screen_id: Optional[str] = None):
        """Notifica telas de novo conteudo disponivel."""
        message = {"event": "CONTENT_UPDATE"}
        if screen_id:
            await self.send_to_screen(screen_id, message)
        else:
            await self.broadcast(message)
        await self.publish_to_redis({"event": "CONTENT_UPDATE", "screen_id": screen_id})

    async def send_emergency_message(self, message_text: str):
        """Envia mensagem de emergencia para todas as telas."""
        msg = {"event": "EMERGENCY_MESSAGE", "message": message_text}
        await self.broadcast(msg)
        await self.publish_to_redis({**msg, "screen_id": None})

    async def clear_emergency(self):
        """Limpa mensagem de emergencia de todas as telas."""
        msg = {"event": "EMERGENCY_CLEAR"}
        await self.broadcast(msg)
        await self.publish_to_redis({**msg, "screen_id": None})


ws_manager = ConnectionManager()
