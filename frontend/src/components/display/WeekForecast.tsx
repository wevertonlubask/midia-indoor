"use client";

import { memo } from "react";
import type { WeatherForecast } from "@/lib/api";

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface WeekForecastProps {
  forecast: WeatherForecast | null;
}

export const WeekForecast = memo(function WeekForecast({ forecast }: WeekForecastProps) {
  if (!forecast?.days?.length) return null;

  const days = forecast.days.slice(0, 7);

  return (
    <div className="flex flex-1 items-stretch gap-1 overflow-hidden h-full">
      {days.map((day, i) => {
        const date = new Date(day.date + "T12:00:00");
        const dayLabel = i === 0 ? "HOJE" : DAY_NAMES[date.getDay()].toUpperCase();
        const isToday = i === 0;

        return (
          <div
            key={day.date}
            className="flex flex-col items-center justify-center flex-1"
            style={{
              gap: "2px",
              padding: "4px 2px",
            }}
          >
            {/* Dia da semana */}
            <span
              className="font-semibold tracking-widest"
              style={{
                fontSize: "clamp(0.48rem, 0.72vw, 0.62rem)",
                color: isToday ? "#e30613" : "rgba(255,255,255,0.38)",
                letterSpacing: "0.1em",
              }}
            >
              {dayLabel}
            </span>

            {/* Ícone do tempo */}
            <span
              style={{
                fontSize: "clamp(1.6rem, 2.8vw, 2.3rem)",
                lineHeight: 1.15,
              }}
            >
              {day.icon}
            </span>

            {/* Temperatura máxima */}
            <span
              className="tabular-nums"
              style={{
                fontSize: "clamp(0.72rem, 1.25vw, 1rem)",
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1,
              }}
            >
              {day.temp_max != null ? `${Math.round(day.temp_max)}°` : "—"}
            </span>

            {/* Temperatura mínima */}
            <span
              className="tabular-nums"
              style={{
                fontSize: "clamp(0.52rem, 0.85vw, 0.7rem)",
                color: "rgba(255,255,255,0.28)",
                lineHeight: 1,
              }}
            >
              {day.temp_min != null ? `${Math.round(day.temp_min)}°` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
});
