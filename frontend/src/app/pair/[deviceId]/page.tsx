"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type DevicePublic = { id: string; name: string; hostname: string | null; ip: string | null; code: string };

/**
 * Exibida na TV enquanto o Raspberry Pi não está vinculado a uma Tela.
 * Quando o admin envia o link pelo painel, o agente troca a URL do navegador.
 */
export default function PairPage() {
  const { deviceId } = useParams<{ deviceId: string }>();

  const { data } = useQuery({
    queryKey: ["pair", deviceId],
    queryFn: () => axios.get<DevicePublic>(`${API_URL}/api/v1/devices/${deviceId}/public`).then((r) => r.data),
    enabled: deviceId !== "novo",
    retry: Infinity,
    retryDelay: 10_000,
    refetchInterval: 30_000,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        cursor: "none",
        background: "#0F172A",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "4vmin",
      }}
    >
      <div style={{ height: 4, width: "12vw", background: "#e30613", borderRadius: 2, marginBottom: "5vh" }} />
      <p style={{ fontSize: "2.4vh", letterSpacing: "0.3em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
        Mídia Indoor · Novo display
      </p>

      {data ? (
        <>
          <p
            style={{
              fontSize: "18vh",
              fontWeight: 700,
              letterSpacing: "0.12em",
              fontFamily: "var(--font-mono), monospace",
              lineHeight: 1.1,
              margin: "3vh 0",
            }}
          >
            {data.code}
          </p>
          <p style={{ fontSize: "3.2vh", fontWeight: 500 }}>{data.name}</p>
          <p style={{ fontSize: "2.2vh", color: "rgba(255,255,255,0.45)", marginTop: "1vh", fontFamily: "var(--font-mono), monospace" }}>
            IP {data.ip ?? "—"} · {data.hostname ?? "—"}
          </p>
        </>
      ) : (
        <p style={{ fontSize: "4vh", margin: "6vh 0", color: "rgba(255,255,255,0.7)" }}>
          {deviceId === "novo" ? "Registrando dispositivo no servidor..." : "Conectando ao servidor..."}
        </p>
      )}

      <p style={{ fontSize: "2.4vh", color: "rgba(255,255,255,0.6)", marginTop: "6vh", maxWidth: "60vw", lineHeight: 1.5 }}>
        No painel do SignFlow, abra <b>Telas</b> ou <b>Dispositivos</b> e envie o link de uma tela para este
        dispositivo. A TV começará a exibir o conteúdo automaticamente.
      </p>
    </div>
  );
}
