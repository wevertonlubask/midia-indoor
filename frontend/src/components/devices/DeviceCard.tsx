"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cpu, Thermometer, Wifi, HardDrive, Clock, Tv, Globe, Send, Loader2, Camera, RotateCw,
  Power, PowerOff, RefreshCw, Download, Trash2, CalendarClock, ChevronDown,
  ChevronUp, Pencil, Check, X, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import {
  devicesApi, type Device, type DeviceCommandName, type DeviceSettings, type Screen,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  COMMAND_LABELS, WEEKDAYS, DeviceOnlineBadge, deviceCode, formatUptime,
  tempClassName, throttleWarnings, useDeviceCommand, wifiQuality,
} from "./device-utils";

const inputClass =
  "px-2 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary";

export function DeviceCard({ device, screens }: { device: Device; screens: Screen[] }) {
  const qc = useQueryClient();
  const command = useDeviceCommand();
  const status = device.status ?? {};
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(device.name);
  const [selectedScreen, setSelectedScreen] = useState(device.screen_id ?? "");
  const [showSchedule, setShowSchedule] = useState(false);
  const [settings, setSettings] = useState<DeviceSettings>(device.settings);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  useEffect(() => setSelectedScreen(device.screen_id ?? ""), [device.screen_id]);

  const update = useMutation({
    mutationFn: (data: Parameters<typeof devicesApi.update>[1]) => devicesApi.update(device.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Falha ao salvar");
    },
  });

  const remove = useMutation({
    mutationFn: () => devicesApi.delete(device.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Dispositivo removido");
    },
  });

  const loadScreenshot = async () => {
    try {
      const { data } = await devicesApi.screenshot(device.id);
      setScreenshotUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(data);
      });
    } catch {
      toast.error("Nenhuma captura disponível ainda");
    }
  };

  // Ao concluir uma captura, carrega a imagem automaticamente
  const last = device.last_command;
  useEffect(() => {
    if (last?.command === "screenshot" && last.status === "ok") loadScreenshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id, last?.status]);

  useEffect(() => () => { if (screenshotUrl) URL.revokeObjectURL(screenshotUrl); }, [screenshotUrl]);

  const sendScreen = () =>
    update.mutate(
      { screen_id: selectedScreen || null },
      {
        onSuccess: () =>
          toast.success(
            selectedScreen
              ? `Link enviado: "${device.name}" agora exibe "${screens.find((s) => s.id === selectedScreen)?.name}"`
              : `"${device.name}" desvinculado (voltou para a tela de pareamento)`
          ),
      }
    );

  const saveSettings = () =>
    update.mutate({ settings }, { onSuccess: () => toast.success("Agendamento salvo e enviado ao dispositivo") });

  const run = (cmd: DeviceCommandName, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    command.mutate({ device, command: cmd });
  };

  const throttle = throttleWarnings(status.throttled);
  const wifi = wifiQuality(status.wifi_signal_dbm);
  const clockOff = status.clock_offset_s != null && Math.abs(status.clock_offset_s) > 60;
  const linkedScreen = screens.find((s) => s.id === device.screen_id);
  const busy = command.isPending && command.variables?.device.id === device.id;

  return (
    <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-5 flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} flex-1`} autoFocus />
              <button
                onClick={() => update.mutate({ name }, { onSuccess: () => setEditingName(false) })}
                className="p-1.5 rounded-lg bg-primary text-white"
              >
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => { setName(device.name); setEditingName(false); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="group flex items-center gap-1.5 text-left">
              <span className="font-semibold text-foreground truncate">{device.name}</span>
              <Pencil className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition" />
            </button>
          )}
          <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">
            {deviceCode(device.id)} · {device.ip ?? "sem IP"} · {device.hostname ?? "—"}
          </p>
        </div>
        <DeviceOnlineBadge device={device} />
      </div>

      {/* Tela exibida (enviar link) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
          <Globe className="w-3.5 h-3.5" /> Tela exibida
        </label>
        <div className="flex items-center gap-2">
          <Select
            className="flex-1"
            size="xs"
            value={selectedScreen}
            onChange={setSelectedScreen}
            emptyLabel="— Nenhuma (tela de pareamento) —"
            options={screens.map((s) => ({ value: s.id, label: s.location ? `${s.name} — ${s.location}` : s.name }))}
          />
          <button
            onClick={sendScreen}
            disabled={update.isPending || selectedScreen === (device.screen_id ?? "")}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition"
          >
            {update.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Enviar
          </button>
        </div>
        {!linkedScreen && (
          <p className="text-xs text-amber-500 mt-1.5">
            Aguardando vínculo — a TV mostra o código {deviceCode(device.id)}.
          </p>
        )}
      </div>

      {/* Telemetria */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Metric icon={Thermometer} label="Temperatura">
          <span className={tempClassName(status.temp_c)}>{status.temp_c != null ? `${status.temp_c} °C` : "—"}</span>
        </Metric>
        <Metric icon={Wifi} label="Wi-Fi">
          {status.wifi_signal_dbm != null ? (
            <span className={wifi?.className}>{status.wifi_signal_dbm} dBm · {wifi?.label}</span>
          ) : (
            "Cabo/—"
          )}
        </Metric>
        <Metric icon={Tv} label="TV">
          {status.tv_state === "on" ? "Ligada" : status.tv_state === "off" ? "Desligada" : "—"}
          {status.tv_method ? ` (${status.tv_method.toUpperCase()})` : ""}
        </Metric>
        <Metric icon={Clock} label="Ligado há">{formatUptime(status.uptime_s)}</Metric>
        <Metric icon={Cpu} label="CPU / RAM">
          {status.load != null ? `${status.load.toFixed(2)} · ${status.mem_used_pct ?? "—"}%` : "—"}
        </Metric>
        <Metric icon={HardDrive} label="Cartão SD livre">
          {status.disk_free_gb != null ? `${status.disk_free_gb} GB · cache ${status.cache_mb ?? 0} MB` : "—"}
        </Metric>
        <Metric icon={HardDrive} label="Mídia no Pi">
          {status.cache_ready != null ? (
            <span title={`${status.cache_mb ?? 0} MB em cache · ${status.disk_free_gb ?? "—"} GB livres`}>
              {status.cache_ready} baixadas
              {status.cache_pending ? ` · baixando ${status.cache_pending}` : ""}
            </span>
          ) : (
            "—"
          )}
        </Metric>
        <Metric icon={Globe} label="Navegador">
          {status.browser_running == null ? "—" : status.browser_running ? "Rodando" : (
            <span className="text-destructive">Parado</span>
          )}
        </Metric>
      </div>

      {(throttle.now.length > 0 || throttle.past.length > 0 || clockOff) && (
        <div className="flex flex-col gap-1 text-xs">
          {throttle.now.length > 0 && (
            <p className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="w-3.5 h-3.5" /> Agora: {throttle.now.join(", ")} — verifique a fonte (5V/3A) e a ventilação
            </p>
          )}
          {throttle.past.length > 0 && (
            <p className="flex items-center gap-1.5 text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5" /> Desde o boot: {throttle.past.join(", ")}
            </p>
          )}
          {clockOff && (
            <p className="flex items-center gap-1.5 text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5" /> Relógio do Pi difere do servidor em {status.clock_offset_s}s — o agendamento usa a hora do Pi
            </p>
          )}
        </div>
      )}

      {/* Comandos */}
      <div className="flex flex-wrap gap-2">
        <ActionButton icon={Power} label="Ligar TV" onClick={() => run("tv_on")} disabled={!device.is_online || busy} />
        <ActionButton icon={PowerOff} label="Desligar TV" onClick={() => run("tv_off")} disabled={!device.is_online || busy} />
        <ActionButton icon={RotateCw} label="Reiniciar navegador" onClick={() => run("restart_browser")} disabled={!device.is_online || busy} />
        <ActionButton icon={Camera} label="Capturar tela" onClick={() => run("screenshot")} disabled={!device.is_online || busy} />
        <ActionButton
          icon={RefreshCw}
          label="Reiniciar Pi"
          onClick={() => run("reboot", `Reiniciar o Raspberry Pi "${device.name}"? A TV ficará ~1 min sem conteúdo.`)}
          disabled={!device.is_online || busy}
        />
        <ActionButton
          icon={Download}
          label="Atualizar agente"
          onClick={() => run("update_agent")}
          disabled={!device.is_online || busy}
        />
      </div>

      {last && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {last.status === "pending" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : last.status === "ok" ? (
            <CheckCircle2 className="w-3 h-3 text-success" />
          ) : (
            <XCircle className="w-3 h-3 text-destructive" />
          )}
          Último comando: {COMMAND_LABELS[last.command] ?? last.command}
          {last.message ? ` — ${last.message}` : ""} · {formatRelativeTime(last.sent_at)}
        </p>
      )}

      {screenshotUrl && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshotUrl} alt="Captura da TV" className="w-full rounded-lg border border-border" />
          <button
            onClick={() => setScreenshotUrl(null)}
            className="absolute top-2 right-2 p-1 rounded-md bg-black/60 text-white"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Agendamento */}
      <div className="border-t border-border pt-3">
        <button
          onClick={() => { setSettings(device.settings); setShowSchedule((v) => !v); }}
          className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" />
            Agendamento da TV
            {device.settings.schedule.enabled ? (
              <span className="text-success">
                · {device.settings.schedule.on_time}–{device.settings.schedule.off_time}
              </span>
            ) : (
              <span>· desativado</span>
            )}
          </span>
          {showSchedule ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showSchedule && (
          <div className="mt-3 flex flex-col gap-3 text-xs">
            <label className="flex items-center gap-2">
              <Switch
                checked={settings.schedule.enabled}
                onCheckedChange={(enabled) => setSettings({ ...settings, schedule: { ...settings.schedule, enabled } })}
              />
              Ligar e desligar a TV automaticamente
            </label>

            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = settings.schedule.days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        schedule: {
                          ...settings.schedule,
                          days: active
                            ? settings.schedule.days.filter((x) => x !== d.value)
                            : [...settings.schedule.days, d.value].sort(),
                        },
                      })
                    }
                    className={`px-2.5 py-1 rounded-md border transition ${
                      active ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TimeField
                label="Liga às"
                value={settings.schedule.on_time}
                onChange={(on_time) => setSettings({ ...settings, schedule: { ...settings.schedule, on_time } })}
              />
              <TimeField
                label="Desliga às"
                value={settings.schedule.off_time}
                onChange={(off_time) => setSettings({ ...settings, schedule: { ...settings.schedule, off_time } })}
              />
              <TimeField
                label="Reinício diário do navegador"
                value={settings.daily_restart ?? ""}
                onChange={(v) => setSettings({ ...settings, daily_restart: v || null })}
              />
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Controle da TV</span>
                <Select
                  size="xs"
                  value={settings.tv_control}
                  onChange={(v) => setSettings({ ...settings, tv_control: v as DeviceSettings["tv_control"] })}
                  options={[
                    { value: "auto", label: "Automático" },
                    { value: "cec", label: "HDMI-CEC" },
                    { value: "hdmi", label: "Cortar sinal HDMI" },
                  ]}
                />
              </div>
            </div>
            <p className="text-muted-foreground/70">
              O agendamento roda no próprio Raspberry, mesmo sem conexão com o servidor. Um comando manual vale até o próximo horário agendado.
            </p>
            <div>
              <button
                onClick={saveSettings}
                disabled={update.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {update.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                Salvar agendamento
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="flex items-center justify-between text-xs text-muted-foreground/70">
        <span className="font-mono">
          {device.mac} · agente {device.agent_version ?? "—"}
          {device.last_seen_at && ` · visto ${formatRelativeTime(device.last_seen_at)}`}
        </span>
        <button
          onClick={() => {
            if (confirm(`Remover "${device.name}"? Se o agente continuar instalado, ele aparecerá de novo como novo dispositivo.`)) {
              remove.mutate();
            }
          }}
          className="flex items-center gap-1 text-destructive hover:underline"
        >
          <Trash2 className="w-3 h-3" /> Remover
        </button>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, children }: { icon: typeof Cpu; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted rounded-lg px-2.5 py-2">
      <p className="text-muted-foreground/70 flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className="font-medium text-foreground truncate">{children}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon, label, onClick, disabled,
}: { icon: typeof Cpu; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition"
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}
