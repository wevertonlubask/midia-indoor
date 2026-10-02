import io
import uuid
from typing import Optional, Tuple
from minio import Minio
from minio.error import S3Error
from PIL import Image
import structlog

from app.core.config import settings

logger = structlog.get_logger()

_client: Optional[Minio] = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def ensure_bucket_exists() -> None:
    client = get_minio_client()
    try:
        if not client.bucket_exists(settings.MINIO_BUCKET):
            client.make_bucket(settings.MINIO_BUCKET)
            # Tornar o bucket público para leitura
            policy = f'''{{
                "Version": "2012-10-17",
                "Statement": [{{
                    "Effect": "Allow",
                    "Principal": {{"AWS": "*"}},
                    "Action": "s3:GetObject",
                    "Resource": "arn:aws:s3:::{settings.MINIO_BUCKET}/*"
                }}]
            }}'''
            client.set_bucket_policy(settings.MINIO_BUCKET, policy)
            logger.info("Bucket criado", bucket=settings.MINIO_BUCKET)
    except S3Error as e:
        logger.error("Erro ao criar bucket", error=str(e))
        raise


def upload_image(
    file_data: bytes,
    filename: str,
    content_type: str = "image/jpeg",
    compress: bool = True,
) -> Tuple[str, dict]:
    """Faz upload de imagem com compressão opcional. Retorna (url, metadata)."""
    client = get_minio_client()
    ensure_bucket_exists()

    # Trocar extensão para .webp no nome do objeto
    base_name = filename.rsplit(".", 1)[0] if "." in filename else filename
    object_name = f"banners/{uuid.uuid4()}_{base_name}.webp"
    metadata = {}

    if compress:
        try:
            img = Image.open(io.BytesIO(file_data))
            metadata["width"] = img.width
            metadata["height"] = img.height
            metadata["original_size"] = len(file_data)

            # Converter para RGB se necessário (ex: PNG com transparência)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # Redimensionar se muito grande
            max_dim = 1920
            if img.width > max_dim or img.height > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)

            # Sempre salvar como WebP
            output = io.BytesIO()
            img.save(output, format="WEBP", quality=85)
            content_type = "image/webp"

            file_data = output.getvalue()
            metadata["compressed_size"] = len(file_data)
        except Exception as e:
            logger.warning("Falha na conversão WebP, usando original", error=str(e))

    metadata["size"] = len(file_data)

    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        io.BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )

    url = f"{settings.minio_public_base}/{settings.MINIO_BUCKET}/{object_name}"
    return url, metadata


def upload_logo(
    file_data: bytes,
    filename: str,
    content_type: str = "image/png",
) -> Tuple[str, dict]:
    """Faz upload de logo da empresa. Retorna (url, metadata)."""
    client = get_minio_client()
    ensure_bucket_exists()

    base_name = filename.rsplit(".", 1)[0] if "." in filename else filename
    object_name = f"logos/{uuid.uuid4()}_{base_name}.webp"
    metadata = {}

    try:
        img = Image.open(io.BytesIO(file_data))
        metadata["width"] = img.width
        metadata["height"] = img.height
        metadata["original_size"] = len(file_data)

        if img.mode in ("RGBA", "P"):
            img = img.convert("RGBA")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Logo max 512px
        max_dim = 512
        if img.width > max_dim or img.height > max_dim:
            img.thumbnail((max_dim, max_dim), Image.LANCZOS)

        output = io.BytesIO()
        img.save(output, format="WEBP", quality=90)
        content_type = "image/webp"
        file_data = output.getvalue()
        metadata["compressed_size"] = len(file_data)
    except Exception as e:
        logger.warning("Falha na conversão WebP do logo, usando original", error=str(e))

    metadata["size"] = len(file_data)

    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        io.BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )

    url = f"{settings.minio_public_base}/{settings.MINIO_BUCKET}/{object_name}"
    return url, metadata


def upload_video(file_data: bytes, filename: str) -> str:
    """Faz upload de vídeo original. Retorna URL."""
    client = get_minio_client()
    ensure_bucket_exists()

    object_name = f"videos/original/{uuid.uuid4()}_{filename}"
    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        io.BytesIO(file_data),
        length=len(file_data),
        content_type="video/mp4",
    )

    return f"{settings.minio_public_base}/{settings.MINIO_BUCKET}/{object_name}"


def upload_thumbnail(file_data: bytes, filename: str) -> str:
    """Faz upload de thumbnail gerada pelo FFmpeg."""
    client = get_minio_client()
    ensure_bucket_exists()

    object_name = f"videos/thumbnails/{uuid.uuid4()}_{filename}"
    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        io.BytesIO(file_data),
        length=len(file_data),
        content_type="image/jpeg",
    )

    return f"{settings.minio_public_base}/{settings.MINIO_BUCKET}/{object_name}"


def to_internal_url(url: str) -> str:
    """Troca a base pública do MinIO pelo endpoint interno (acessível de dentro dos containers/workers)."""
    public = settings.minio_public_base
    if url.startswith(public + "/"):
        scheme = "https" if settings.MINIO_SECURE else "http"
        return f"{scheme}://{settings.MINIO_ENDPOINT}{url[len(public):]}"
    return url


def delete_object(url: str) -> None:
    """Remove um objeto do MinIO dado sua URL."""
    try:
        client = get_minio_client()
        # Extrair object_name da URL
        prefix = f"{settings.minio_public_base}/{settings.MINIO_BUCKET}/"
        if url.startswith(prefix):
            object_name = url[len(prefix):]
            client.remove_object(settings.MINIO_BUCKET, object_name)
    except Exception as e:
        logger.warning("Erro ao deletar objeto MinIO", error=str(e), url=url)
