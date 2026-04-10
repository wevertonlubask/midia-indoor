"use client";

import { useMemo, useEffect, useState, useRef, memo } from "react";
import type { WeatherData } from "@/lib/api";

interface TickerItem {
  id: string;
  content: string | null;
  type: string;
  config: Record<string, unknown> | null;
  display_duration?: number;
}

interface TickerBarProps {
  tickers: TickerItem[];
  weather?: WeatherData | null;
}

const SEPARATOR = "    \u2022    ";
const SPEED_PX_S = 55;

export const TickerBar = memo(function TickerBar({ tickers, weather }: TickerBarProps) {
  const text = useMemo(() => {
    const parts: string[] = [];

    if (weather?.temperature != null) {
      parts.push(
        `${weather.icon}  ${weather.city}: ${weather.temperature}\u00B0C` +
          ` \u00B7 Sensacao ${weather.feels_like}\u00B0C` +
          ` \u00B7 Umidade ${weather.humidity}%` +
          ` \u00B7 Vento ${weather.wind_speed} km/h` +
          ` \u00B7 ${weather.description}`
      );
    }

    for (const t of tickers) {
      if (t.type === "text" && t.content) {
        parts.push(t.content);
      } else if (t.type === "rss") {
        const headlines = t.config?.headlines as string[] | undefined;
        if (headlines?.length) {
          parts.push(...headlines);
        }
      }
    }

    if (parts.length === 0) {
      parts.push("Midia Indoor \u2014 Sistema de Midia Indoor Corporativa");
    }

    return parts.join(SEPARATOR) + SEPARATOR;
  }, [tickers, weather]);

  // Medir largura real do texto e calcular duração
  const measureRef = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const measure = () => {
      const el = measureRef.current;
      if (!el) return;
      const width = el.offsetWidth;
      if (width > 0) {
        setDuration(width / SPEED_PX_S);
      }
    };
    // Aguardar render e medir
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  return (
    <div
      className="w-full h-full"
      style={{
        position: "relative",
        overflow: "hidden",
        contain: "layout paint",
      }}
    >
      {/* Span invisível para medir largura real */}
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "nowrap",
          fontSize: "2.8vh",
          fontWeight: 500,
          letterSpacing: "0.05em",
        }}
      >
        {text}
      </span>

      {/* Ticker visível — CSS animation no compositor thread */}
      {duration > 0 && (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            alignItems: "center",
            animation: `ticker-move ${duration}s linear infinite`,
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              fontSize: "2.8vh",
              fontWeight: 500,
              letterSpacing: "0.05em",
              color: "rgba(255,255,255,0.9)",
              textTransform: "uppercase",
            }}
          >
            {text}
          </span>
          <span
            style={{
              whiteSpace: "nowrap",
              fontSize: "2.8vh",
              fontWeight: 500,
              letterSpacing: "0.05em",
              color: "rgba(255,255,255,0.9)",
              textTransform: "uppercase",
            }}
          >
            {text}
          </span>
        </div>
      )}

      <style>{`
        @keyframes ticker-move {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
      `}</style>
    </div>
  );
});
