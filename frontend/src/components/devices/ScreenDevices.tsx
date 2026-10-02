"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tv, Send, Loader2, X } from "lucide-react";
import { devicesApi, type Device, type Screen } from "@/lib/api";
import { Select } from "@/components/ui/select";
import { DeviceOnlineBadge, DeviceQuickActions, deviceCode } from "./device-utils";

/** Bloco do card de Tela: TVs que exibem esta tela e envio do link para um Raspberry. */
export function ScreenDevices({ screen, devices }: { screen: Screen; devices: Device[] }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState("");
  const linked = devices.filter((d) => d.screen_id === screen.id);
  const available = devices.filter((d) => d.screen_id !== screen.id);

  const link = useMutation({
    mutationFn: ({ device, screenId }: { device: Device; screenId: string | null }) =>
      devicesApi.update(device.id, { screen_id: screenId }),
    onSuccess: (_, { device, screenId }) => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      toast.success(
        screenId
          ? `Link enviado para "${device.name}" — a TV troca de conteúdo em instantes`
          : `"${device.name}" desvinculado desta tela`
      );
      setTarget("");
    },
    onError: () => toast.error("Falha ao enviar o link"),
  });

  const deviceLabel = (d: Device) => {
    const current = d.screen_id ? " (já exibe outra tela)" : " (aguardando vínculo)";
    return `${d.name} · ${d.ip ?? deviceCode(d.id)}${current}`;
  };

  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
        <Tv className="w-3.5 h-3.5" /> TVs exibindo esta tela
      </p>

      {linked.length > 0 ? (
        <div className="flex flex-col gap-1.5 mb-2">
          {linked.map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border">
              <span className="text-xs font-medium text-foreground flex-1 truncate">
                {d.name} <span className="text-muted-foreground/70 font-normal">· {d.ip ?? "—"}</span>
              </span>
              <DeviceOnlineBadge device={d} />
              <DeviceQuickActions device={d} />
              <button
                title="Desvincular"
                onClick={() => link.mutate({ device: d, screenId: null })}
                className="p-1.5 rounded-md text-muted-foreground/70 hover:bg-muted hover:text-destructive transition"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/70 mb-2">Nenhuma TV vinculada.</p>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            className="flex-1"
            size="xs"
            value={target}
            onChange={setTarget}
            emptyLabel="Enviar link para um dispositivo..."
            options={available.map((d) => ({ value: d.id, label: deviceLabel(d) }))}
          />
          <button
            onClick={() => {
              const device = available.find((d) => d.id === target);
              if (device) link.mutate({ device, screenId: screen.id });
            }}
            disabled={!target || link.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition"
          >
            {link.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Enviar
          </button>
        </div>
      )}
    </div>
  );
}
