"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cpu, Loader2, Copy, Terminal } from "lucide-react";
import { devicesApi, screensApi } from "@/lib/api";
import { DeviceCard } from "@/components/devices/DeviceCard";

export default function DevicesPage() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const { data: devices, isLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: () => devicesApi.list().then((r) => r.data),
    refetchInterval: 5_000,
  });

  const { data: screens } = useQuery({
    queryKey: ["screens"],
    queryFn: () => screensApi.list().then((r) => r.data),
  });

  const installCmd = `curl -fsSL ${origin}/api/v1/agent/install.sh | sudo bash`;
  const pending = devices?.filter((d) => !d.screen_id) ?? [];
  const linked = devices?.filter((d) => d.screen_id) ?? [];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dispositivos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Raspberry Pis que exibem as telas nas TVs — vínculo, agendamento e controle remoto
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 mb-6">
        <p className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
          <Terminal className="w-4 h-4" /> Adicionar uma nova TV
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          No Raspberry Pi (Raspberry Pi OS com Chromium), execute o comando abaixo. Após reiniciar, a TV mostra um
          código e o dispositivo aparece aqui como &quot;aguardando vínculo&quot;.
        </p>
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <code className="text-xs text-foreground flex-1 truncate">{installCmd}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(installCmd);
              toast.success("Comando copiado!");
            }}
            className="text-muted-foreground/70 hover:text-foreground transition"
            title="Copiar"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
        </div>
      ) : devices?.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border p-16 text-center">
          <Cpu className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground/70">Nenhum dispositivo registrado ainda.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-amber-500 mb-3">
                Aguardando vínculo ({pending.length})
              </h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
                {pending.map((d) => (
                  <DeviceCard key={d.id} device={d} screens={screens ?? []} />
                ))}
              </div>
            </>
          )}
          {linked.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">Em operação ({linked.length})</h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {linked.map((d) => (
                  <DeviceCard key={d.id} device={d} screens={screens ?? []} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
