import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mídia Indoor - Display",
  description: "Tela de exibicao — Mídia Indoor SENAI Santo Paschoal Crepaldi",
};

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kiosk-root overflow-hidden w-screen h-screen">
      {children}
    </div>
  );
}
