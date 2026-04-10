"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Eye, EyeOff, Type, Loader2, X, Cloud, Rss } from "lucide-react";
import { tickersApi, type Ticker } from "@/lib/api";

const typeConfig = {
  text: { label: "Texto", icon: Type, color: "bg-primary/10 text-primary" },
  weather: { label: "Clima", icon: Cloud, color: "bg-sky-50 text-sky-700" },
  rss: { label: "RSS", icon: Rss, color: "bg-orange-400/10 text-orange-400" },
};

export default function TickersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [type, setType] = useState<"text" | "rss" | "weather">("text");
  const [duration, setDuration] = useState(30);

  const { data: tickers, isLoading } = useQuery({
    queryKey: ["tickers"],
    queryFn: () => tickersApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      tickersApi.create({ content: content || null, type, display_duration: duration, is_active: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickers"] });
      toast.success("Ticker criado!");
      setShowForm(false);
      setContent("");
      setType("text");
      setDuration(30);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      tickersApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickers"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tickersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickers"] });
      toast.success("Ticker excluído");
    },
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tickers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Informações exibidas na barra inferior do telão
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Novo Ticker
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6 mb-6">
          <h3 className="font-semibold text-foreground mb-4">Novo Ticker</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Tipo</label>
              <div className="mt-1 flex gap-2">
                {(["text", "weather", "rss"] as const).map((t) => {
                  const cfg = typeConfig[t];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition ${
                        type === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {type === "text" && (
              <div>
                <label className="text-sm font-medium text-foreground">Conteúdo</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Digite o texto que irá rolar na barra inferior..."
                  rows={3}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            )}

            {type === "rss" && (
              <div>
                <label className="text-sm font-medium text-foreground">URL do Feed RSS</label>
                <input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="https://exemplo.com/feed.rss"
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {type === "weather" && (
              <div className="bg-sky-50 rounded-lg p-4 text-sm text-sky-700">
                O widget de clima irá exibir automaticamente a temperatura e condições
                de Presidente Prudente (configurado em .env).
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground">
                Duração de exibição (segundos)
              </label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={5}
                max={300}
                className="mt-1 w-32 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || (type !== "weather" && !content.trim())}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-sm font-medium"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-lg hover:bg-muted transition text-sm"
              >
                <X className="w-4 h-4" />
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border divide-y divide-border">
          {tickers?.length === 0 && (
            <div className="p-16 text-center">
              <Type className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground/70">Nenhum ticker criado ainda.</p>
            </div>
          )}
          {tickers?.map((ticker) => {
            const cfg = typeConfig[ticker.type];
            const Icon = cfg.icon;
            return (
              <div key={ticker.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </span>
                <p className="flex-1 text-sm text-foreground truncate">
                  {ticker.content ?? "(automático)"}
                </p>
                <span className="text-xs text-muted-foreground/70">{ticker.display_duration}s</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleMutation.mutate({ id: ticker.id, is_active: !ticker.is_active })}
                    className={`p-1.5 rounded-lg transition ${
                      ticker.is_active ? "text-success hover:bg-success/10" : "text-muted-foreground/70 hover:bg-muted"
                    }`}
                  >
                    {ticker.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Excluir este ticker?")) deleteMutation.mutate(ticker.id);
                    }}
                    className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
