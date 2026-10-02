"use client";

import { useState, useEffect, memo } from "react";

export const ClockWidget = memo(function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    return everyMinute(() => setNow(new Date()));
  }, []);

  const time = now?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) ?? "";
  const date = now?.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }) ?? "";

  return (
    <div className="text-center">
      <div
        className="font-bold tabular-nums leading-none"
        style={{
          fontSize: "clamp(1.2rem, 4vh, 3rem)",
          color: "rgba(255,255,255,0.95)",
          fontFamily: "var(--font-mono), monospace",
          letterSpacing: "-0.02em",
        }}
        suppressHydrationWarning
      >
        {time}
      </div>
      <div
        className="uppercase mt-0.5"
        style={{
          fontSize: "clamp(0.55rem, 1.4vh, 1.1rem)",
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.06em",
        }}
        suppressHydrationWarning
      >
        {date}
      </div>
    </div>
  );
});

/**
 * Chama `fn` na virada de cada minuto. O relógio mostra só HH:MM, então
 * atualizar a cada segundo gerava 59 re-renders/repaints inúteis por minuto no Pi.
 */
export function everyMinute(fn: () => void): () => void {
  let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = setTimeout(() => {
    fn();
    interval = setInterval(fn, 60_000);
  }, 60_000 - (Date.now() % 60_000) + 50);
  return () => {
    clearTimeout(timeout);
    if (interval) clearInterval(interval);
  };
}
