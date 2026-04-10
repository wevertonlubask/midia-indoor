"use client";

import { useEffect, useRef, memo } from "react";

interface VideoPlayerProps {
  src: string;
  onEnded?: () => void;
  onPlay?: () => void;
  fullscreen?: boolean;
}

export const VideoPlayer = memo(function VideoPlayer({ src, onEnded, onPlay, fullscreen }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Refs sempre atualizados — evita closure stale sem reiniciar o vídeo
  const onEndedRef = useRef(onEnded);
  const onPlayRef = useRef(onPlay);
  useEffect(() => {
    onEndedRef.current = onEnded;
    onPlayRef.current = onPlay;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.src = src;
    video.loop = false; // nunca usa loop nativo — quem controla é o pai
    video.load();

    const handlePlay  = () => onPlayRef.current?.();
    const handleEnded = () => onEndedRef.current?.();
    const handleError = () => setTimeout(() => onEndedRef.current?.(), 2000);

    video.addEventListener("playing", handlePlay);
    video.addEventListener("ended",   handleEnded);
    video.addEventListener("error",   handleError);

    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => setTimeout(() => onEndedRef.current?.(), 5000));
    });

    return () => {
      video.removeEventListener("playing", handlePlay);
      video.removeEventListener("ended",   handleEnded);
      video.removeEventListener("error",   handleError);
      video.pause();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={`w-full h-full bg-black ${fullscreen ? "object-cover" : "object-contain"}`}
      autoPlay
      muted={false}
      playsInline
      preload="auto"
      style={{ outline: "none", transform: "translateZ(0)" }}
    />
  );
});
