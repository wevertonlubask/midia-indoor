"use client";

import { useState, useEffect, useRef, memo } from "react";

interface BannerItem {
  id: string;
  title: string;
  file_url: string;
  duration_seconds: number;
}

interface BannerCarouselProps {
  banners: BannerItem[];
  onBannerChange?: (id: string) => void;
}

export const BannerCarousel = memo(function BannerCarousel({ banners, onBannerChange }: BannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showNext = () => {
    if (banners.length <= 1) return;
    setCurrentIndex((prev) => {
      const next = (prev + 1) % banners.length;
      setPrevIndex(prev);
      setFading(true);
      onBannerChange?.(banners[next].id);
      return next;
    });
  };

  // Limpar prevIndex após transição completar
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => {
      setPrevIndex(null);
      setFading(false);
    }, 800);
    return () => clearTimeout(t);
  }, [fading, currentIndex]);

  // Timer para próximo banner
  useEffect(() => {
    if (!banners.length) return;
    onBannerChange?.(banners[currentIndex]?.id);

    const duration = (banners[currentIndex]?.duration_seconds ?? 8) * 1000;
    timerRef.current = setTimeout(showNext, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentIndex, banners]);

  if (!banners.length) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#0F172A" }}>
        <div className="text-center p-4" style={{ color: "rgba(255,255,255,0.15)" }}>
          <div className="w-12 h-12 border-2 rounded-lg mx-auto mb-3" style={{ borderColor: "rgba(255,255,255,0.1)" }} />
          <p className="text-xl font-medium">Sem banners</p>
        </div>
      </div>
    );
  }

  const current = banners[currentIndex];
  const prev = prevIndex !== null ? banners[prevIndex] : null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Imagem anterior (por baixo, desaparece) */}
      {prev && (
        <img
          key={`prev-${prev.id}`}
          src={prev.file_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition: "bottom",
            transform: "translateZ(0)",
          }}
        />
      )}

      {/* Imagem atual (por cima, aparece com fade-in) */}
      <img
        key={`curr-${current.id}`}
        src={current.file_url}
        alt={current.title}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          objectPosition: "bottom",
          opacity: fading ? 0 : 1,
          transition: "opacity 0.8s ease-in-out",
          transform: "translateZ(0)",
        }}
        onLoad={(e) => {
          // Após carregar, iniciar o fade-in
          if (fading) {
            requestAnimationFrame(() => {
              (e.target as HTMLImageElement).style.opacity = "1";
            });
          }
        }}
      />

      {/* Pré-carregar próxima imagem */}
      {banners.length > 1 && (
        <link
          rel="prefetch"
          href={banners[(currentIndex + 1) % banners.length].file_url}
          as="image"
        />
      )}
    </div>
  );
});
