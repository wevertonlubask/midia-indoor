"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Power, PowerOff, RotateCw, Loader2 } from "lucide-react";
import { devicesApi, type Device, type DeviceCommandName } from "@/lib/api";

export const COMMAND_LABELS: Record<DeviceCommandName, string> = {
  restart_browser: "Reiniciar navegador",
  reboot: "Reiniciar Raspberry",
  tv_on: "Ligar TV",
  tv_off: "Desligar TV",
  screenshot: "Capturar tela",
  update_agent: "Atualizar agente",
};

export const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

export function deviceCode(id: string) {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export function formatUptime(seconds?: number) {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

/** Decodifica `vcgencmd get_throttled` em avisos legíveis. */
export function throttleWarnings(value?: number): { now: string[]; past: string[] } {
  const labels = ["Subtensão", "Frequência limitada", "Throttling", "Limite térmico"];
  const now: string[] = [];
  const past: string[] = [];
  if (value == null) return { now, past };
  labels.forEach((label, bit) => {
    if (value & (1 << bit)) now.push(label);
    else if (value & (1 << (bit + 16))) past.push(label);
  });
  return { now, past };
}

export function wifiQuality(dbm?: number): { label: string; className: string } | null {
  if (dbm == null) return null;
  if (dbm >= -60) return { label: "Ótimo", className: "text-success" };
  if (dbm >= -70) return { label: "Bom", className: "text-success" };
  if (dbm >= -78) return { label: "Fraco", className: "text-amber-500" };
  return { label: "Ruim", className: "text-destructive" };
}

export function tempClassName(temp?: number) {
  if (temp == null) return "text-muted-foreground";
  if (temp >= 80) return "text-destructive";
  if (temp >= 70) return "text-amber-500";
  return "text-foreground";
}

export function useDeviceCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ device, command }: { device: Device; command: DeviceCommandName }) =>
      devicesApi.command(device.id, command),
    onSuccess: (_, { device, command }) => {
      toast.success(`${COMMAND_LABELS[command]}: comando enviado para "${device.name}"`);
      // O resultado chega pelo agente alguns segundos depois
      setTimeout(() => qc.invalidateQueries({ queryKey: ["devices"] }), 1500);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["devices"] }), 6000);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Falha ao enviar comando");
    },
  });
}

export function DeviceOnlineBadge({ device }: { device: Device }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        device.is_online ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${device.is_online ? "bg-green-500" : "bg-slate-400"}`} />
      {device.is_online ? "Online" : "Offline"}
    </span>
  );
}

/** Ações rápidas: ligar/desligar TV e reiniciar navegador. */
export function DeviceQuickActions({ device }: { device: Device }) {
  const command = useDeviceCommand();
  const busy = command.isPending && command.variables?.device.id === device.id;
  const actions: { cmd: DeviceCommandName; icon: typeof Power; title: string }[] = [
    { cmd: "tv_on", icon: Power, title: "Ligar TV" },
    { cmd: "tv_off", icon: PowerOff, title: "Desligar TV" },
    { cmd: "restart_browser", icon: RotateCw, title: "Reiniciar navegador" },
  ];
  return (
    <div className="flex items-center gap-1">
      {actions.map(({ cmd, icon: Icon, title }) => (
        <button
          key={cmd}
          title={title}
          disabled={!device.is_online || busy}
          onClick={() => command.mutate({ device, command: cmd })}
          className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition"
        >
          {busy && command.variables?.command === cmd ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Icon className="w-3 h-3" />
          )}
        </button>
      ))}
    </div>
  );
}
