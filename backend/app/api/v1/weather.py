from fastapi import APIRouter, Request

from app.services.weather import get_weather, get_forecast

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/current")
async def get_current_weather(request: Request):
    """Retorna dados climáticos atuais com cache Redis."""
    redis_client = request.app.state.redis
    data = await get_weather(redis_client)
    if not data:
        return {
            "city": "Presidente Prudente",
            "temperature": None,
            "humidity": None,
            "wind_speed": None,
            "description": "Indisponível",
            "icon": "🌡️",
            "error": "Dados climáticos temporariamente indisponíveis",
        }
    return data


@router.get("/forecast")
async def get_weather_forecast(request: Request):
    """Retorna previsão do tempo para 7 dias com cache Redis."""
    redis_client = request.app.state.redis
    data = await get_forecast(redis_client)
    if not data:
        return {"city": "Presidente Prudente", "days": []}
    return data
