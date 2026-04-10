from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "signflow",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.video_tasks", "app.tasks.slideshow_tasks", "app.tasks.rss_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_routes={
        "app.tasks.video_tasks.transcode_video": {"queue": "video_transcode"},
        "app.tasks.slideshow_tasks.create_slideshow_video": {"queue": "video_transcode"},
        "app.tasks.rss_tasks.scrape_rss_feed": {"queue": "default"},
        "app.tasks.rss_tasks.scrape_all_feeds": {"queue": "default"},
    },
    task_default_queue="default",
    beat_schedule={
        "scrape-all-rss-feeds": {
            "task": "app.tasks.rss_tasks.scrape_all_feeds",
            "schedule": 300.0,  # a cada 5 minutos verifica quais feeds precisam atualizar
        },
    },
)
