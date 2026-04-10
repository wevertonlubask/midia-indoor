import json
from typing import Optional
import httpx
import redis.asyncio as aioredis
import structlog

from app.core.config import settings

logger = structlog.get_logger()

WEATHER_CODES = {
    0: {"desc": "Céu limpo", "icon": "☀️"},
    1: {"desc": "Predominantemente limpo", "icon": "🌤️"},
    2: {"desc": "Parcialmente nublado", "icon": "⛅"},
    3: {"desc": "Nublado", "icon": "☁️"},
    45: {"desc": "Neblina", "icon": "🌫️"},
    48: {"desc": "Neblina com geada", "icon": "🌫️"},
    51: {"desc": "Garoa leve", "icon": "🌦️"},
    53: {"desc": "Garoa moderada", "icon": "🌦️"},
    55: {"desc": "Garoa intensa", "icon": "🌧️"},
    61: {"desc": "Chuva leve", "icon": "🌧️"},
    63: {"desc": "Chuva moderada", "icon": "🌧️"},
    65: {"desc": "Chuva forte", "icon": "🌧️"},
    80: {"desc": "Pancadas de chuva leve", "icon": "🌦️"},
    81: {"desc": "Pancadas de chuva moderada", "icon": "🌧️"},
    82: {"desc": "Pancadas de chuva forte", "icon": "⛈️"},
    95: {"desc": "Tempestade", "icon": "⛈️"},
    96: {"desc": "Tempestade com granizo leve", "icon": "⛈️"},
    99: {"desc": "Tempestade com granizo forte", "icon": "⛈️"},
}

REDIS_KEY = "signflow:weather:current"
REDIS_KEY_FORECAST = "signflow:weather:forecast"


async def fetch_forecast() -> Optional[dict]:
    """Busca previsão de 7 dias do Open-Meteo."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": settings.WEATHER_LAT,
        "longitude": settings.WEATHER_LON,
        "daily": [
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
        ],
        "timezone": "America/Sao_Paulo",
        "forecast_days": 7,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

        daily = data.get("daily", {})
        times = daily.get("time", [])
        codes = daily.get("weather_code", [])
        maxes = daily.get("temperature_2m_max", [])
        mins = daily.get("temperature_2m_min", [])
        precip = daily.get("precipitation_probability_max", [])

        days = []
        for i, t in enumerate(times):
            code = codes[i] if i < len(codes) else 0
            info = WEATHER_CODES.get(code, {"desc": "Desconhecido", "icon": "🌡️"})
            days.append({
                "date": t,
                "weather_code": code,
                "description": info["desc"],
                "icon": info["icon"],
                "temp_max": round(maxes[i], 1) if i < len(maxes) and maxes[i] is not None else None,
                "temp_min": round(mins[i], 1) if i < len(mins) and mins[i] is not None else None,
                "precipitation_probability": precip[i] if i < len(precip) else None,
            })

        return {"city": settings.WEATHER_CITY, "days": days}

    except Exception as e:
        logger.error("Erro ao buscar previsão semanal", error=str(e))
        return None


async def get_forecast(redis_client: aioredis.Redis) -> Optional[dict]:
    """Retorna previsão 7 dias com cache Redis de 3 horas."""
    try:
        if redis_client:
            cached = await redis_client.get(REDIS_KEY_FORECAST)
            if cached:
                return json.loads(cached)
    except BaseException:
        pass

    data = await fetch_forecast()
    if data:
        try:
            if redis_client:
                await redis_client.setex(REDIS_KEY_FORECAST, 10800, json.dumps(data))
        except BaseException:
            pass

    return data


async def fetch_weather() -> Optional[dict]:
    """Busca dados climáticos do Open-Meteo (gratuito, sem API key)."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": settings.WEATHER_LAT,
        "longitude": settings.WEATHER_LON,
        "current": [
            "temperature_2m",
            "relative_humidity_2m",
            "wind_speed_10m",
            "weather_code",
            "apparent_temperature",
        ],
        "timezone": "America/Sao_Paulo",
        "forecast_days": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

        current = data.get("current", {})
        weather_code = current.get("weather_code", 0)
        weather_info = WEATHER_CODES.get(weather_code, {"desc": "Desconhecido", "icon": "🌡️"})

        result = {
            "city": settings.WEATHER_CITY,
            "temperature": round(current.get("temperature_2m", 0), 1),
            "feels_like": round(current.get("apparent_temperature", 0), 1),
            "humidity": current.get("relative_humidity_2m", 0),
            "wind_speed": round(current.get("wind_speed_10m", 0), 1),
            "weather_code": weather_code,
            "description": weather_info["desc"],
            "icon": weather_info["icon"],
        }

        logger.info("Clima atualizado", city=settings.WEATHER_CITY, temp=result["temperature"])
        return result

    except Exception as e:
        logger.error("Erro ao buscar clima", error=str(e))
        return None


async def get_weather(redis_client: aioredis.Redis) -> Optional[dict]:
    """Retorna dados climáticos com cache Redis de 10 minutos."""
    try:
        if redis_client:
            cached = await redis_client.get(REDIS_KEY)
            if cached:
                return json.loads(cached)
    except BaseException:
        pass

    data = await fetch_weather()
    if data:
        try:
            if redis_client:
                await redis_client.setex(REDIS_KEY, settings.WEATHER_CACHE_TTL, json.dumps(data))
        except BaseException:
            pass

    return data
