"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface EmergencyOverlayProps {
  message: string | null;
  onDismiss?: () => void;
}

export function EmergencyOverlay({ message, onDismiss }: EmergencyOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [message]);

  if (!visible || !message) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(220, 38, 38, 0.95)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: "emergency-pulse 2s ease-in-out infinite",
        cursor: "none",
      }}
    >
      <style>{`
        @keyframes emergency-pulse {
          0%, 100% { background: rgba(220, 38, 38, 0.95); }
          50% { background: rgba(185, 28, 28, 0.98); }
        }
      `}</style>

      <AlertTriangle
        style={{
          width: "clamp(60px, 8vw, 120px)",
          height: "clamp(60px, 8vw, 120px)",
          color: "white",
          marginBottom: "3vh",
          filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
        }}
      />

      <p
        style={{
          fontSize: "clamp(1rem, 1.5vw, 1.2rem)",
          color: "rgba(255,255,255,0.7)",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          fontWeight: 600,
          marginBottom: "2vh",
        }}
      >
        Mensagem Urgente
      </p>

      <p
        style={{
          fontSize: "clamp(2rem, 4vw, 4rem)",
          color: "white",
          fontWeight: 700,
          textAlign: "center",
          maxWidth: "80vw",
          lineHeight: 1.3,
          textShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        {message}
      </p>
    </div>
  );
}
