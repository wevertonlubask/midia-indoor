"use client";

import { useState, useRef } from "react";
import { Settings, Server, Database, Cloud, RefreshCw, AlertTriangle, X, Upload, ImageIcon, Trash2, Palette } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { weatherApi, screensApi, emergencyApi, siteSettingsApi } from "@/lib/api";
import { toast } from "sonner";

export default function SettingsPage() {
  const qc = useQueryClient();
  const [emergencyMsg, setEmergencyMsg] = useState("");
  const [emergencyActive, setEmergencyActive] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [pendingColor, setPendingColor] = useState<string | null>(null);

  const emergencySendMutation = useMutation({
    mutationFn: (message: string) => emergencyApi.send(message),
    onSuccess: () => {
      toast.success("Mensagem de emergencia enviada para todas as telas");
      setEmergencyActive(true);
    },
    onError: () => toast.error("Erro ao enviar mensagem de emergencia"),
  });

  const emergencyClearMutation = useMutation({
    mutationFn: () => emergencyApi.clear(),
    onSuccess: () => {
      toast.success("Mensagem de emergencia removida");
      setEmergencyActive(false);
      setEmergencyMsg("");
    },
  });

  const { data: weather, isLoading: weatherLoading, refetch: refetchWeather } = useQuery({
    queryKey: ["weather"],
    queryFn: () => weatherApi.current().then((r) => r.data),
  });

  const reloadAllMutation = useMutation({
    mutationFn: () => screensApi.reloadAll(),
    onSuccess: () => toast.success("Comando de reload enviado para todas as telas"),
  });

  const { data: siteSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingsApi.get().then((r) => r.data),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return siteSettingsApi.uploadLogo(form);
    },
    onSuccess: () => {
      toast.success("Logo atualizado com sucesso");
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: () => toast.error("Erro ao enviar logo"),
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => siteSettingsApi.deleteLogo(),
    onSuccess: () => {
      toast.success("Logo removido");
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: () => toast.error("Erro ao remover logo"),
  });

  const accentColorMutation = useMutation({
    mutationFn: (color: string) => siteSettingsApi.updateAccentColor(color),
    onSuccess: () => {
      toast.success("Cor atualizada");
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: () => toast.error("Erro ao atualizar cor"),
  });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Informações do sistema e ações globais</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logo da Empresa */}
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6 md:col-span-2">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <ImageIcon className="w-4 h-4" />
            Logo da Empresa
          </h2>
          <p className="text-xs text-muted-foreground/70 mb-4">
            Logo exibido na barra inferior do telão. Recomendado: imagem com fundo transparente (PNG) na cor branca.
          </p>

          <div className="flex items-center gap-6">
            {/* Preview */}
            <div
              className="flex items-center justify-center rounded-xl border-2 border-dashed border-border overflow-hidden"
              style={{ width: 200, height: 100, background: siteSettings?.accent_color || "#e30613" }}
            >
              {siteSettings?.company_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={siteSettings.company_logo_url}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain p-2"
                />
              ) : (
                <span className="text-white/40 text-xs">Sem logo</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogoMutation.mutate(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadLogoMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                {uploadLogoMutation.isPending ? "Enviando..." : "Enviar Logo"}
              </button>

              {siteSettings?.company_logo_url && (
                <button
                  onClick={() => deleteLogoMutation.mutate()}
                  disabled={deleteLogoMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-muted text-destructive border border-border rounded-lg hover:bg-destructive/10 transition text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Remover Logo
                </button>
              )}

              {siteSettings?.company_logo_filename && (
                <span className="text-xs text-muted-foreground">
                  Arquivo: {siteSettings.company_logo_filename}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cor da Barra / Borda */}
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6 md:col-span-2">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Palette className="w-4 h-4" />
            Cor da Barra e Borda do Telão
          </h2>
          <p className="text-xs text-muted-foreground/70 mb-4">
            Define a cor da barra onde fica o logo e da borda superior do ticker no telão.
          </p>
          <div className="flex items-center gap-6 flex-wrap">
            {/* Color picker + preview */}
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={pendingColor ?? siteSettings?.accent_color ?? "#e30613"}
                onChange={(e) => setPendingColor(e.target.value)}
                className="w-12 h-12 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-mono text-foreground">{pendingColor ?? siteSettings?.accent_color ?? "#e30613"}</span>
                <span className="text-xs text-muted-foreground/70">Escolha a cor e clique em Salvar</span>
              </div>
            </div>
            {/* Preview da barra */}
            <div
              className="flex items-center rounded-lg overflow-hidden"
              style={{ height: 48, minWidth: 240 }}
            >
              <div
                className="h-full flex items-center px-4"
                style={{ background: pendingColor ?? siteSettings?.accent_color ?? "#e30613" }}
              >
                <span className="text-white text-xs font-bold tracking-wide">LOGO</span>
              </div>
              <div
                className="h-full flex-1 flex items-center px-4"
                style={{
                  background: "rgba(15, 23, 42, 0.88)",
                  borderTop: `3px solid ${pendingColor ?? siteSettings?.accent_color ?? "#e30613"}`,
                }}
              >
                <span className="text-white/50 text-xs">Preview do ticker...</span>
              </div>
            </div>
            {/* Botões */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const color = pendingColor ?? siteSettings?.accent_color ?? "#e30613";
                  accentColorMutation.mutate(color);
                  setPendingColor(null);
                }}
                disabled={accentColorMutation.isPending || (!pendingColor)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-sm font-medium"
              >
                {accentColorMutation.isPending ? "Salvando..." : "Salvar cor"}
              </button>
              <button
                onClick={() => {
                  setPendingColor("#e30613");
                  accentColorMutation.mutate("#e30613");
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition"
              >
                Restaurar padrão
              </button>
            </div>
          </div>
        </div>

        {/* Clima */}
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Cloud className="w-4 h-4" />
            API de Clima
          </h2>
          {weatherLoading ? (
            <p className="text-sm text-muted-foreground/70">Carregando...</p>
          ) : weather ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{weather.icon}</span>
                <div>
                  <p className="text-2xl font-bold">{weather.temperature}°C</p>
                  <p className="text-sm text-muted-foreground">{weather.description}</p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>💧 Umidade: {weather.humidity}%</p>
                <p>💨 Vento: {weather.wind_speed} km/h</p>
                <p>📍 {weather.city}</p>
              </div>
              <button
                onClick={() => refetchWeather()}
                className="mt-2 flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition"
              >
                <RefreshCw className="w-3 h-3" />
                Atualizar dados
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/70">API indisponível</p>
          )}
        </div>

        {/* Ações globais */}
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Server className="w-4 h-4" />
            Ações Globais
          </h2>
          <div className="space-y-3">
            <button
              onClick={() => reloadAllMutation.mutate()}
              disabled={reloadAllMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${reloadAllMutation.isPending ? "animate-spin" : ""}`} />
              Recarregar Todas as Telas
            </button>
            <p className="text-xs text-muted-foreground/70">
              Envia o comando de reload para todos os telões conectados via WebSocket.
            </p>
          </div>
        </div>

        {/* Mensagem de Emergencia */}
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6 md:col-span-2">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Mensagem de Emergencia
          </h2>
          <p className="text-xs text-muted-foreground/70 mb-3">
            Envia uma mensagem em tela cheia vermelha para todos os teloes conectados. Util para avisos urgentes como evacuacao ou alertas.
          </p>
          <div className="flex items-center gap-3 mb-3">
            <input
              value={emergencyMsg}
              onChange={(e) => setEmergencyMsg(e.target.value)}
              placeholder="Digite a mensagem de emergencia..."
              className="flex-1 px-3 py-2 text-sm bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-destructive"
            />
            <button
              onClick={() => {
                if (emergencyMsg.trim()) emergencySendMutation.mutate(emergencyMsg.trim());
              }}
              disabled={!emergencyMsg.trim() || emergencySendMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-destructive text-white rounded-lg hover:bg-destructive/90 disabled:opacity-50 transition text-sm font-medium"
            >
              <AlertTriangle className="w-4 h-4" />
              Enviar
            </button>
          </div>
          {emergencyActive && (
            <button
              onClick={() => emergencyClearMutation.mutate()}
              disabled={emergencyClearMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground border border-border rounded-lg hover:bg-muted/80 transition text-sm"
            >
              <X className="w-4 h-4" />
              Limpar mensagem de emergencia
            </button>
          )}
        </div>

        {/* Infraestrutura */}
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6 md:col-span-2">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Database className="w-4 h-4" />
            Serviços de Infraestrutura
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: "API Backend", url: "http://localhost:8000/docs", port: "8000" },
              { name: "MinIO Console", url: "http://localhost:9001", port: "9001" },
              { name: "Adminer (DB)", url: "http://localhost:8080", port: "8080" },
              { name: "Redis Commander", url: "http://localhost:8081", port: "8081" },
            ].map((svc) => (
              <a
                key={svc.name}
                href={svc.url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col gap-1 p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/10 transition"
              >
                <span className="text-sm font-medium text-foreground">{svc.name}</span>
                <span className="text-xs text-muted-foreground/70">Porta {svc.port}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
