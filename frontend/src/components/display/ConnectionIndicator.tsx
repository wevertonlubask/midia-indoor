"use client";

import { memo } from "react";

interface ConnectionIndicatorProps {
  connected: boolean;
}

export const ConnectionIndicator = memo(function ConnectionIndicator({ connected }: ConnectionIndicatorProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5vmin",
        right: "1.5vmin",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: "0.5vmin",
        padding: "0.4vmin 1vmin",
        borderRadius: "999px",
        background: connected
          ? "rgba(16, 185, 129, 0.15)"
          : "rgba(239, 68, 68, 0.2)",
        border: `1px solid ${connected ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.3)"}`,
      }}
    >
      <div
        style={{
          width: "0.6vmin",
          height: "0.6vmin",
          minWidth: "4px",
          minHeight: "4px",
          borderRadius: "50%",
          background: connected ? "#10B981" : "#EF4444",
        }}
      />
      <span
        style={{
          fontSize: "max(0.7vmin, 8px)",
          color: connected
            ? "rgba(16, 185, 129, 0.7)"
            : "rgba(239, 68, 68, 0.8)",
          fontFamily: "var(--font-mono), monospace",
          letterSpacing: "0.05em",
        }}
      >
        {connected ? "LIVE" : "OFFLINE"}
      </span>
    </div>
  );
});
