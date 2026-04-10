"use client";

import { useState, useEffect, memo } from "react";

export const ClockWidget = memo(function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
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
