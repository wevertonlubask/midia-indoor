from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import os


class Settings(BaseSettings):
    # Aplicação
    APP_NAME: str = "SignFlow"
    VERSION: str = "2.3.1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "info"

    # Banco de dados
    DATABASE_URL: str = "postgresql+asyncpg://signflow:signflow123@localhost:5433/signflow"
    DATABASE_URL_SYNC: str = "postgresql://signflow:signflow123@localhost:5433/signflow"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"       # conexão interna do backend
    MINIO_PUBLIC_URL: str = ""                   # URL pública acessível pelos browsers (ex: http://servidor:9000)
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET: str = "signflow-media"
    MINIO_SECURE: bool = False

    @property
    def minio_public_base(self) -> str:
        """Base URL pública do MinIO. Usa MINIO_PUBLIC_URL se definido, senão MINIO_ENDPOINT."""
        if self.MINIO_PUBLIC_URL:
            return self.MINIO_PUBLIC_URL.rstrip("/")
        scheme = "https" if self.MINIO_SECURE else "http"
        return f"{scheme}://{self.MINIO_ENDPOINT}"

    # JWT
    JWT_SECRET_KEY: str = "mude-esta-chave-em-producao-use-openssl-rand-hex-32"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Clima
    WEATHER_LAT: float = -22.1256
    WEATHER_LON: float = -51.3889
    WEATHER_CITY: str = "Presidente Prudente"
    WEATHER_CACHE_TTL: int = 600

    # Uploads
    MAX_IMAGE_SIZE_MB: int = 10
    MAX_VIDEO_SIZE_MB: int = 500

    # Dispositivos (Raspberry Pi)
    DEVICE_ENROLL_KEY: str = ""                  # se definido, o agente precisa informá-la para se registrar
    AGENT_DIST_DIR: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
        "raspi-agent",
    )

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def max_image_bytes(self) -> int:
        return self.MAX_IMAGE_SIZE_MB * 1024 * 1024

    @property
    def max_video_bytes(self) -> int:
        return self.MAX_VIDEO_SIZE_MB * 1024 * 1024

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
