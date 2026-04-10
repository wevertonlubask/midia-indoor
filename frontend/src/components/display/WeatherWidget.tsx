"use client";

import type { WeatherData } from "@/lib/api";

interface WeatherWidgetProps {
  weather: WeatherData;
}

export function WeatherWidget({ weather }: WeatherWidgetProps) {
  if (!weather.temperature) return null;

  return (
    <div className="flex items-center gap-4">
      <span className="text-2xl">{weather.icon}</span>
      <div className="text-right">
        <div className="text-xl font-bold leading-none" style={{ color: "rgba(255,255,255,0.95)" }}>
          {weather.temperature}&deg;C
        </div>
        <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
          {weather.description}
        </div>
      </div>
      <div className="text-xs space-y-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        <div>&#128167; {weather.humidity}%</div>
        <div>&#128168; {weather.wind_speed} km/h</div>
      </div>
    </div>
  );
}
