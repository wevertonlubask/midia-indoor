import os
import subprocess
import tempfile
import uuid

import httpx
import structlog
from sqlalchemy import update

from app.tasks.celery_app import celery_app
from app.core.config import settings

logger = structlog.get_logger()


def _download(url: str) -> bytes:
    from app.services.storage import to_internal_url
    response = httpx.get(to_internal_url(url), timeout=60.0)
    response.raise_for_status()
    return response.content


@celery_app.task(
    bind=True,
    name="app.tasks.slideshow_tasks.create_slideshow_video",
    max_retries=2,
)
def create_slideshow_video(
    self,
    video_id: str,
    image_urls: list[str],
    duration_per_image: float,
    transition_duration: float,
):
    """
    Gera um vídeo MP4 a partir de uma lista de imagens com transição crossfade.
    Cada imagem é exibida por `duration_per_image` segundos.
    A transição entre imagens dura `transition_duration` segundos.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models.video import Video, TranscodeStatus

    engine = create_engine(settings.DATABASE_URL_SYNC)
    SessionLocal = sessionmaker(bind=engine)

    # Marcar como processando
    with SessionLocal() as db:
        db.execute(
            update(Video)
            .where(Video.id == video_id)
            .values(transcode_status=TranscodeStatus.PROCESSING)
        )
        db.commit()

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Baixar todas as imagens
            image_paths = []
            for i, url in enumerate(image_urls):
                ext = url.rsplit(".", 1)[-1] if "." in url else "webp"
                path = os.path.join(tmpdir, f"img_{i:04d}.{ext}")
                data = _download(url)
                with open(path, "wb") as f:
                    f.write(data)
                image_paths.append(path)
                logger.info("Imagem baixada", index=i, path=path)

            n = len(image_paths)
            output_path = os.path.join(tmpdir, "slideshow.mp4")
            thumbnail_path = os.path.join(tmpdir, "thumb.jpg")

            # Montar comando FFmpeg com xfade entre cada par de imagens
            # Cada input é um loop de duração = duration_per_image
            inputs = []
            for p in image_paths:
                inputs += ["-loop", "1", "-t", str(duration_per_image), "-i", p]

            # Filtro "Instagram Stories" com sombra: fundo blur escurecido/dessaturado + drop shadow + imagem
            # 1. Fundo: scale para cobrir, crop, blur, escurecer e dessaturar
            # 2. Sombra: cópia escura+blur da imagem principal, offset levemente
            # 3. Imagem principal: scale mantendo proporção, centralizada por cima da sombra
            def _bg_blur_filter(input_label: str, output_label: str) -> str:
                return (
                    f"[{input_label}]split=3[bg_{output_label}][sh_{output_label}][fg_{output_label}];"
                    # Fundo blur escurecido e dessaturado
                    f"[bg_{output_label}]scale=1920:1080:force_original_aspect_ratio=increase,"
                    f"crop=1920:1080,gblur=sigma=40,"
                    f"eq=brightness=-0.35:saturation=0.55[bgblur_{output_label}];"
                    # Sombra: imagem escalada, escurecida 100%, com blur amplo + alpha
                    f"[sh_{output_label}]scale=1920:1080:force_original_aspect_ratio=decrease,"
                    f"pad=iw+60:ih+60:30:30:color=black@0,"
                    f"format=rgba,colorchannelmixer=rr=0:gg=0:bb=0:aa=0.7,"
                    f"gblur=sigma=25[shadow_{output_label}];"
                    # Imagem principal
                    f"[fg_{output_label}]scale=1920:1080:force_original_aspect_ratio=decrease[fgscale_{output_label}];"
                    # Compor: fundo + sombra + imagem
                    f"[bgblur_{output_label}][shadow_{output_label}]overlay=(W-w)/2:(H-h)/2[bgshad_{output_label}];"
                    f"[bgshad_{output_label}][fgscale_{output_label}]overlay=(W-w)/2:(H-h)/2,"
                    f"setsar=1,format=yuv420p[{output_label}];"
                )

            if n == 1:
                # Apenas uma imagem - gerar vídeo com fundo blur
                filter_complex = _bg_blur_filter("0:v", "vout").rstrip(";")
                ffmpeg_cmd = [
                    "ffmpeg", *inputs,
                    "-filter_complex", filter_complex,
                    "-map", "[vout]",
                    "-c:v", "libx264", "-profile:v", "main", "-level", "4.0", "-preset", "fast", "-crf", "23",
                    "-movflags", "+faststart",
                    "-y", output_path,
                ]
            else:
                # Construir filtro complexo com xfade
                filter_parts = []
                # Primeiro: aplicar fundo blur em todas as imagens
                for i in range(n):
                    filter_parts.append(_bg_blur_filter(f"{i}:v", f"v{i}"))

                # Encadear xfade entre cada par
                td = min(transition_duration, duration_per_image - 0.1)
                prev = "v0"
                for i in range(1, n):
                    offset = i * duration_per_image - i * td
                    out_label = f"xf{i}" if i < n - 1 else "xflast"
                    filter_parts.append(
                        f"[{prev}][v{i}]xfade=transition=fade:duration={td}:offset={offset:.3f}[{out_label}];"
                    )
                    prev = out_label

                # Forçar yuv420p no output final
                filter_parts.append(f"[xflast]format=yuv420p[vout];")

                filter_complex = "".join(filter_parts).rstrip(";")

                ffmpeg_cmd = [
                    "ffmpeg", *inputs,
                    "-filter_complex", filter_complex,
                    "-map", "[vout]",
                    "-pix_fmt", "yuv420p",
                    "-c:v", "libx264", "-profile:v", "main", "-level", "4.0", "-preset", "fast", "-crf", "23",
                    "-movflags", "+faststart",
                    "-y", output_path,
                ]

            logger.info("Gerando slideshow", video_id=video_id, images=n)
            result = subprocess.run(
                ffmpeg_cmd, capture_output=True, text=True, timeout=600,
            )
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg falhou: {result.stderr[-800:]}")

            # Duração do vídeo
            duration = _get_duration(output_path)

            # Thumbnail no meio do vídeo
            thumb_time = max(1, (duration or 4) // 2)
            subprocess.run(
                [
                    "ffmpeg", "-i", output_path,
                    "-ss", str(thumb_time),
                    "-vframes", "1", "-q:v", "2",
                    "-y", thumbnail_path,
                ],
                capture_output=True, timeout=30,
            )

            # Upload para MinIO
            transcoded_url = _upload_file(
                output_path, f"slideshow_{video_id}.mp4", "video/mp4",
            )
            thumbnail_url = None
            if os.path.exists(thumbnail_path):
                thumbnail_url = _upload_file(
                    thumbnail_path, f"{video_id}_thumb.jpg", "image/jpeg",
                    prefix="videos/thumbnails",
                )

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

            logger.info("Slideshow criado", video_id=video_id, duration=duration)

    except Exception as exc:
        logger.error("Erro ao criar slideshow", video_id=video_id, error=str(exc))
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


def _get_duration(file_path: str):
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ],
            capture_output=True, text=True, timeout=30,
        )
        return int(float(result.stdout.strip()))
    except Exception:
        return None


def _upload_file(
    file_path: str,
    filename: str,
    content_type: str,
    prefix: str = "videos/transcoded",
) -> str:
    from app.services.storage import get_minio_client, ensure_bucket_exists

    object_name = f"{prefix}/{uuid.uuid4()}_{filename}"
    client = get_minio_client()
    ensure_bucket_exists()

    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        client.put_object(
            settings.MINIO_BUCKET, object_name, f,
            length=file_size, content_type=content_type,
        )

    return f"{settings.minio_public_base}/{settings.MINIO_BUCKET}/{object_name}"
