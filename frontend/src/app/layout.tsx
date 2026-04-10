import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Mídia Indoor - SENAI Santo Paschoal Crepaldi",
  description: "Sistema de Mídia Indoor Corporativa — SENAI Santo Paschoal Crepaldi",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className={`${inter.className} antialiased`}>
        <Providers>
          {children}
          <Toaster
            richColors
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-foreground)",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
