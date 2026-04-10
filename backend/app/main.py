from contextlib import asynccontextmanager
import structlog
import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1 import auth, banners, videos, playlists, tickers, screens, weather, websocket, display, users, logs, rss, emergency, analytics, site_settings
from app.services.websocket_manager import ws_manager

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Iniciando SignFlow", version=settings.VERSION, env=settings.ENVIRONMENT)

    # Conectar ao Redis
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    app.state.redis = redis_client
    ws_manager.set_redis(redis_client)

    # Verificar/criar bucket MinIO
    try:
        from app.services.storage import ensure_bucket_exists
        ensure_bucket_exists()
        logger.info("MinIO bucket verificado", bucket=settings.MINIO_BUCKET)
    except Exception as e:
        logger.warning("MinIO não disponível na inicialização", error=str(e))

    # Iniciar subscriber Redis Pub/Sub (para multi-worker)
    await ws_manager.start_subscriber()

    logger.info("SignFlow pronto")
    yield

    # Shutdown
    await ws_manager.stop_subscriber()
    await redis_client.close()
    logger.info("SignFlow encerrado")


app = FastAPI(
    title="SignFlow API",
    description="Sistema de Mídia Indoor Corporativa — SENAI CFP 914",
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas
PREFIX = "/api/v1"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(banners.router, prefix=PREFIX)
app.include_router(videos.router, prefix=PREFIX)
app.include_router(playlists.router, prefix=PREFIX)
app.include_router(tickers.router, prefix=PREFIX)
app.include_router(screens.router, prefix=PREFIX)
app.include_router(weather.router, prefix=PREFIX)
app.include_router(display.router, prefix=PREFIX)  # Endpoint público para o telão
app.include_router(users.router, prefix=PREFIX)
app.include_router(logs.router, prefix=PREFIX)
app.include_router(rss.router, prefix=PREFIX)
app.include_router(emergency.router, prefix=PREFIX)
app.include_router(analytics.router, prefix=PREFIX)
app.include_router(site_settings.router, prefix=PREFIX)
app.include_router(websocket.router)  # WebSocket sem prefixo /api/v1


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": settings.VERSION}


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
    }
