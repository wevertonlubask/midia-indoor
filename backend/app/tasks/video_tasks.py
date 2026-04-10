import os
import subprocess
import tempfile
import uuid
import io
from typing import Optional

import httpx
import structlog

from app.tasks.celery_app import celery_app
from app.core.config import settings

logger = structlog.get_logger()


def _download_from_minio(url: str) -> bytes:
    """Baixa arquivo do MinIO via HTTP."""
    response = httpx.get(url, timeout=120.0)
    response.raise_for_status()
    return response.content


def _upload_transcoded(file_path: str, filename: str) -> str:
    """Faz upload do vídeo transcodificado para o MinIO."""
    from app.services.storage import get_minio_client, ensure_bucket_exists

    object_name = f"videos/transcoded/{uuid.uuid4()}_{filename}"
    client = get_minio_client()
    ensure_bucket_exists()

    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        client.put_object(
            settings.MINIO_BUCKET,
            object_name,
            f,
            length=file_size,
            content_type="video/mp4",
        )

    return f"{settings.minio_public_base}/{settings.MINIO_BUCKET}/{object_name}"


def _upload_thumbnail(file_path: str, video_id: str) -> str:
    """Faz upload da thumbnail gerada pelo FFmpeg."""
    from app.services.storage import get_minio_client, ensure_bucket_exists

    object_name = f"videos/thumbnails/{video_id}_thumb.jpg"
    client = get_minio_client()
    ensure_bucket_exists()

    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        client.put_object(
            settings.MINIO_BUCKET,
            object_name,
            f,
            length=file_size,
            content_type="image/jpeg",
        )

    return f"{settings.minio_public_base}/{settings.MINIO_BUCKET}/{object_name}"


def _get_video_duration(file_path: str) -> Optional[int]:
    """Usa ffprobe para obter a duração do vídeo em segundos."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        duration = float(result.stdout.strip())
        return int(duration)
    except Exception:
        return None


@celery_app.task(bind=True, name="app.tasks.video_tasks.transcode_video", max_retries=3)
def transcode_video(self, video_id: str, original_url: str, filename: str):
    """
    Transcodifica vídeo para H.264/AAC MP4 usando FFmpeg.
    Atualiza o registro no banco ao finalizar.
    """
    import asyncio
    from sqlalchemy import create_engine, select, update
    from sqlalchemy.orm import Session

    logger.info("Iniciando transcodificação", video_id=video_id)

    # Usar engine síncrono no Celery
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(settings.DATABASE_URL_SYNC)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        from app.models.video import Video, TranscodeStatus

        # Marcar como processando
        db.execute(
            update(Video)
            .where(Video.id == video_id)
            .values(transcode_status=TranscodeStatus.PROCESSING)
        )
        db.commit()

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Baixar original
            input_path = os.path.join(tmpdir, f"input_{filename}")
            logger.info("Baixando vídeo original", url=original_url)
            video_data = _download_from_minio(original_url)
            with open(input_path, "wb") as f:
                f.write(video_data)

            # Transcodificar para H.264
            base_name = os.path.splitext(filename)[0]
            output_path = os.path.join(tmpdir, f"{base_name}_transcoded.mp4")
            thumbnail_path = os.path.join(tmpdir, f"{base_name}_thumb.jpg")

            logger.info("Transcodificando com FFmpeg", input=input_path, output=output_path)
            ffmpeg_cmd = [
                "ffmpeg", "-i", input_path,
                "-c:v", "libx264",
                "-profile:v", "main", "-level", "4.0",
                "-preset", "ultrafast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                "-y",
                output_path,
            ]
            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=3600)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg falhou: {result.stderr[-500:]}")

            # Gerar thumbnail no meio do vídeo
            duration = _get_video_duration(output_path)
            thumb_time = max(1, (duration or 4) // 2)
            subprocess.run(
                [
                    "ffmpeg",
                    "-ss", str(thumb_time),
                    "-i", output_path,
                    "-vframes", "1",
                    "-q:v", "2",
                    "-y", thumbnail_path,
                ],
                capture_output=True,
                timeout=120,
            )

            # Upload para MinIO
            transcoded_url = _upload_transcoded(output_path, f"{base_name}_transcoded.mp4")
            thumbnail_url = None
            if os.path.exists(thumbnail_path):
                thumbnail_url = _upload_thumbnail(thumbnail_path, video_id)

            # Atualizar banco
            with SessionLocal() as db:
                db.execute(
                    update(Video)
                    .where(Video.id == video_id)
                    .values(
                        transcode_status=TranscodeStatus.DONE,
                        transcoded_url=transcoded_url,
                        thumbnail_url=thumbnail_url,
                        duration_seconds=duration,
                        transcode_error=None,
                    )
                )
                db.commit()

            logger.info("Transcodificação concluída", video_id=video_id, url=transcoded_url)

    except Exception as exc:
        logger.error("Erro na transcodificação", video_id=video_id, error=str(exc))
        with SessionLocal() as db:
            from app.models.video import Video, TranscodeStatus
            db.execute(
                update(Video)
                .where(Video.id == video_id)
                .values(
                    transcode_status=TranscodeStatus.ERROR,
                    transcode_error=str(exc)[:900],
                )
            )
            db.commit()

        raise self.retry(exc=exc, countdown=60)
