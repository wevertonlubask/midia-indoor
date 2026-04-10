"use client";

import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useDisplayWebSocket } from "@/hooks/useWebSocket";
import { BannerCarousel } from "@/components/display/BannerCarousel";
import { VideoPlayer } from "@/components/display/VideoPlayer";
import { TickerBar } from "@/components/display/TickerBar";
import { WeekForecast } from "@/components/display/WeekForecast";
import { ClockWidget } from "@/components/display/ClockWidget";
import { EmergencyOverlay } from "@/components/display/EmergencyOverlay";
import { ConnectionIndicator } from "@/components/display/ConnectionIndicator";
import type { WeatherData, WeatherForecast } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Service Worker helpers ──────────────────────────────────────────────────
function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").then(
    (reg) => console.log("[Display] SW registrado", reg.scope),
    (err) => console.warn("[Display] SW falhou:", err)
  );
}

function swPostMessage(msg: { type: string; payload?: unknown }) {
  navigator.serviceWorker?.controller?.postMessage(msg);
}

function invalidateApiCache(pattern?: string) {
  swPostMessage({ type: "INVALIDATE_API", payload: { pattern } });
}

function precacheMedia(urls: string[]) {
  if (urls.length > 0) {
    swPostMessage({ type: "PRECACHE_MEDIA", payload: { urls } });
  }
}

type BannerItem = { id: string; title: string; file_url: string; duration_seconds: number };

async function fetchDisplayData(screenId: string) {
  const { data } = await axios.get(`${API_URL}/api/v1/display/${screenId}/data`);
  return data as {
    screen_id: string;
    screen_name: string;
    playlist_id: string | null;
    banner_slot_count: number;
    banner_groups: BannerItem[][];
    banners: BannerItem[];
    videos: { id: string; title: string; video_url: string; thumbnail_url: string | null; duration_seconds: number | null; fullscreen: boolean }[];
    tickers: { id: string; content: string | null; type: string; config: Record<string, unknown> | null; display_duration?: number }[];
    company_logo_url: string | null;
    accent_color: string | null;
  };
}

async function fetchWeather(): Promise<WeatherData | null> {
  try { const { data } = await axios.get(`${API_URL}/api/v1/weather/current`); return data; }
  catch { return null; }
}

async function fetchForecast(): Promise<WeatherForecast | null> {
  try { const { data } = await axios.get(`${API_URL}/api/v1/weather/forecast`); return data; }
  catch { return null; }
}

// Design tokens v2.0 — otimizados para Pi (sem sombras pesadas)
const BG = "#878787";
const SURFACE_SOLID = "#0F172A";
const ACCENT = "#3B82F6";
const RED = "#e30613";

export default function DisplayPage() {
  const { screenId } = useParams<{ screenId: string }>();
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [endCount, setEndCount] = useState(0);
  const [emergencyMessage, setEmergencyMessage] = useState<string | null>(null);
  const precachedRef = useRef<string>("");

  // Registrar Service Worker uma vez
  useEffect(() => {
    registerServiceWorker();
  }, []);

  const { data, refetch, isError } = useQuery({
    queryKey: ["display-data", screenId],
    queryFn: () => fetchDisplayData(screenId),
    staleTime: 30_000,
    retry: Infinity,
    retryDelay: (attempt) => Math.min(5_000 * Math.pow(1.5, attempt), 30_000),
    refetchInterval: (query) => (query.state.data ? 60_000 : 10_000),
  });

  // Pré-cachear mídia quando dados mudam
  useEffect(() => {
    if (!data) return;
    const urls: string[] = [];

    // Banners
    for (const group of data.banner_groups || []) {
      for (const b of group) {
        if (b.file_url) urls.push(b.file_url);
      }
    }

    // Vídeos
    for (const v of data.videos || []) {
      if (v.video_url) urls.push(v.video_url);
    }

    // Logo
    if (data.company_logo_url) urls.push(data.company_logo_url);

    // Só pre-cacheia se o set de URLs mudou
    const key = urls.sort().join("|");
    if (key && key !== precachedRef.current) {
      precachedRef.current = key;
      precacheMedia(urls);
    }
  }, [data]);

  const { data: weather } = useQuery({
    queryKey: ["display-weather"],
    queryFn: fetchWeather,
    staleTime: 600_000,
    refetchInterval: 600_000,
  });

  const { data: forecast } = useQuery({
    queryKey: ["display-forecast"],
    queryFn: fetchForecast,
    staleTime: 10_800_000,
    refetchInterval: 10_800_000,
  });

  const { sendMessage, connected } = useDisplayWebSocket({
    screenId,
    onContentUpdate: () => {
      invalidateApiCache("display");
      invalidateApiCache("weather");
      refetch();
    },
    onTickerUpdate: () => {
      invalidateApiCache("display");
      refetch();
    },
    onForceReload: () => window.location.reload(),
    onEmergencyMessage: (msg) => setEmergencyMessage(msg),
  });

  const reportPlaying = useCallback(
    (contentType: string, contentId: string) => {
      sendMessage({ event: "CONTENT_PLAYING", content_type: contentType, content_id: contentId });
    },
    [sendMessage]
  );

  // PRESERVADO: logica de banner groups/slots
  const bannerGroups: BannerItem[][] = useMemo(
    () => (data?.banner_groups?.length ? data.banner_groups : [data?.banners ?? []]),
    [data?.banner_groups, data?.banners]
  );
  const videos  = useMemo(() => data?.videos ?? [], [data?.videos]);
  const tickers = useMemo(() => data?.tickers ?? [], [data?.tickers]);
  const accentColor = data?.accent_color || RED;
  const logoUrl = data?.company_logo_url;

  const safeIndex = videos.length > 0 ? currentVideoIndex % videos.length : 0;
  const currentVideo = videos[safeIndex];
  const isFullscreen = currentVideo?.fullscreen === true;

  const handleVideoEnded = useCallback(() => {
    setEndCount((c) => c + 1);
    if (videos.length > 1) {
      setCurrentVideoIndex((i) => (i + 1) % videos.length);
    }
  }, [videos.length]);

  const handleBannerChange = useCallback(
    (id: string) => reportPlaying("banner", id),
    [reportPlaying]
  );

  const handleVideoPlay = useCallback(
    () => { if (currentVideo) reportPlaying("video", currentVideo.id); },
    [reportPlaying, currentVideo?.id]
  );

  // Loading screen
  if (!data) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          cursor: "none",
          background: BG,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            border: "3px solid rgba(255,255,255,0.06)",
            borderTopColor: ACCENT,
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            marginBottom: "2rem",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.4)", fontWeight: 300, letterSpacing: "0.02em" }}>
          {isError ? "Reconectando ao servidor..." : "Carregando conteudo..."}
        </p>
        <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.15)", marginTop: "0.5rem", fontFamily: "var(--font-mono), monospace" }}>
          {screenId.slice(0, 8)}
        </p>
      </div>
    );
  }

  const hasAnyBanner = bannerGroups.some((g) => g.length > 0);
  if (!hasAnyBanner && videos.length === 0) {
    return (
      <StandbyScreen
        screenId={screenId}
        playlistId={data?.playlist_id}
        bannerCount={data?.banners?.length ?? 0}
        videoCount={data?.videos?.length ?? 0}
      />
    );
  }

  // Fullscreen video mode
  if (isFullscreen && currentVideo) {
    return (
      <div style={{ position: "fixed", inset: 0, cursor: "none", background: "#000" }}>
        <VideoPlayer
          key={`${currentVideo.id}-${endCount}`}
          src={currentVideo.video_url}
          onEnded={handleVideoEnded}
          onPlay={handleVideoPlay}
          fullscreen
        />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        cursor: "none",
        background: BG,
        padding: "1vmin",
        gap: "1vmin",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Emergency Overlay */}
      <EmergencyOverlay message={emergencyMessage} />

      {/* Content area */}
      <div className="flex-1 flex min-h-0" style={{ gap: "1vmin" }}>

        {/* PRESERVADO: Coluna esquerda com slots de banner empilhados */}
        <div className="flex-shrink-0 flex flex-col min-h-0" style={{ width: "22vw", gap: "1vmin" }}>
          {bannerGroups.map((groupBanners, slotIdx) => (
            <div
              key={slotIdx}
              className="rounded-2xl overflow-hidden min-h-0"
              style={{ flex: 1 }}
            >
              <BannerCarousel
                banners={groupBanners}
                onBannerChange={handleBannerChange}
              />
            </div>
          ))}
        </div>

        {/* Video column */}
        <div className="flex-1 flex flex-col min-h-0" style={{ gap: "1vmin" }}>
          <div
            className="flex-1 rounded-2xl overflow-hidden min-h-0"
            style={{ background: "#000" }}
          >
            {currentVideo ? (
              <VideoPlayer
                key={`${currentVideo.id}-${endCount}`}
                src={currentVideo.video_url}
                onEnded={handleVideoEnded}
                onPlay={handleVideoPlay}
              />
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center gap-3"
                style={{ background: SURFACE_SOLID }}
              >
                <span style={{ fontSize: "3vh", color: "rgba(255,255,255,0.06)" }}>&#9654;</span>
                <p style={{ fontSize: "1.5vh", color: "rgba(255,255,255,0.15)", letterSpacing: "0.05em" }}>
                  Nenhum video disponivel
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar — sem sombra para performance */}
      <BottomBar
        tickers={tickers}
        weather={weather ?? undefined}
        accentColor={accentColor}
        logoUrl={logoUrl}
      />
    </div>
  );
}

// ── Bottom Bar memoizada ────────────────────────────────────────────────────
const BottomBar = memo(function BottomBar({
  tickers,
  weather,
  accentColor,
  logoUrl,
}: {
  tickers: { id: string; content: string | null; type: string; config: Record<string, unknown> | null; display_duration?: number }[];
  weather?: WeatherData | null;
  accentColor: string;
  logoUrl?: string | null;
}) {
  return (
    <div
      className="flex-shrink-0 rounded-xl overflow-hidden flex items-stretch"
      style={{
        height: "8vh",
        background: "rgba(15, 23, 42, 0.96)",
        borderWidth: "4px 0 0 0",
        borderStyle: "solid",
        borderColor: accentColor,
      }}
    >
      {/* Logo da Empresa */}
      <div
        className="flex-shrink-0 flex items-center"
        style={{
          background: accentColor,
          padding: "0 2vmin",
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Logo"
            style={{ height: "4vh", width: "auto", objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "1.8vh", fontWeight: 700, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
            SUA LOGO
          </span>
        )}
      </div>

      {/* Diagonal separator */}
      <div style={{ width: 0, borderLeft: `2vh solid ${accentColor}`, borderBottom: "8vh solid transparent" }} />

      {/* Ticker */}
      <div className="flex-1 flex items-center overflow-hidden">
        <TickerBar tickers={tickers} weather={weather} />
      </div>

      {/* Clock */}
      <div
        className="flex-shrink-0 flex items-center"
        style={{ padding: "0 2.5vmin", borderLeft: "1px solid rgba(255,255,255,0.06)" }}
      >
        <ClockWidget />
      </div>
    </div>
  );
});

// ── Standby Screen ──────────────────────────────────────────────────────────
function StandbyScreen({
  screenId,
  playlistId,
  bannerCount,
  videoCount,
}: {
  screenId: string;
  playlistId: string | null | undefined;
  bannerCount: number;
  videoCount: number;
}) {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        cursor: "none",
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: "3px",
          background: `linear-gradient(to right, ${ACCENT}, ${ACCENT}88, transparent)`,
        }}
      />

      <div className="text-center text-white">
        {/* Time */}
        <div
          className="tabular-nums"
          style={{
            fontSize: "clamp(6rem, 14vw, 11rem)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            fontWeight: 200,
            color: "rgba(255,255,255,0.95)",
            fontFamily: "var(--font-mono), monospace",
          }}
          suppressHydrationWarning
        >
          {time?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) ?? ""}
        </div>

        {/* Date */}
        <div
          className="capitalize mt-3 mb-12"
          style={{
            fontSize: "clamp(1rem, 1.8vw, 1.4rem)",
            color: "rgba(255,255,255,0.3)",
            letterSpacing: "0.08em",
            fontWeight: 300,
          }}
          suppressHydrationWarning
        >
          {time?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) ?? ""}
        </div>

        {/* Status pill */}
        <div
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-5"
          style={{
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.15)",
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: ACCENT, animation: "pulse-soft 2s ease-in-out infinite" }}
          />
          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>
            Aguardando conteudo
          </span>
        </div>

        {/* Diagnostic info */}
        <div className="flex flex-col gap-1.5" style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-mono), monospace" }}>
          <span>
            ID: {screenId.slice(0, 8)} · Playlist:{" "}
            <span style={{ color: playlistId ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.5)" }}>
              {playlistId ? playlistId.slice(0, 8) + "..." : "nao vinculada"}
            </span>
          </span>
          <span>
            Banners:{" "}
            <span style={{ color: bannerCount > 0 ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.5)" }}>
              {bannerCount}
            </span>
            {" · "}
            Videos:{" "}
            <span style={{ color: videoCount > 0 ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.5)" }}>
              {videoCount}
            </span>
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse-soft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
