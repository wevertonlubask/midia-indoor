import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mídia Indoor - Pareamento",
  description: "Pareamento de display — Mídia Indoor SENAI Santo Paschoal Crepaldi",
};

export default function PairLayout({ children }: { children: React.ReactNode }) {
  return <div className="kiosk-root overflow-hidden w-screen h-screen">{children}</div>;
}
