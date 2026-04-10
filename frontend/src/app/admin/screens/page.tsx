"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Trash2, Wifi, WifiOff, RefreshCw, Monitor,
  Loader2, X, Copy, ExternalLink, ListVideo, Check,
} from "lucide-react";
import { screensApi, playlistsApi, type Screen } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Select } from "@/components/ui/select";

export default function ScreensPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  // Estado de edição de playlist por tela
  const [editingPlaylist, setEditingPlaylist] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("");

  const { data: screens, isLoading } = useQuery({
    queryKey: ["screens"],
    queryFn: () => screensApi.list().then((r) => r.data),
    refetchInterval: 10_000,
  });

  const { data: playlists } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => playlistsApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => screensApi.create({ name, location: location || undefined, is_active: true }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["screens"] });
      toast.success(`Tela "${res.data.name}" criada!`);
      setShowForm(false);
      setName("");
      setLocation("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => screensApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screens"] });
      toast.success("Tela excluída");
    },
  });

  const reloadMutation = useMutation({
    mutationFn: (id: string) => screensApi.reload(id),
    onSuccess: () => toast.success("Comando de reload enviado"),
    onError: () => toast.error("Tela não está conectada"),
  });

  const linkPlaylistMutation = useMutation({
    mutationFn: ({ screenId, playlistId }: { screenId: string; playlistId: string | null }) =>
      screensApi.update(screenId, { playlist_id: playlistId } as Partial<Screen>),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["screens"] });
      toast.success(vars.playlistId ? "Playlist vinculada! O telão irá atualizar." : "Playlist desvinculada.");
      setEditingPlaylist(null);
    },
  });

  const startEditPlaylist = (screen: Screen) => {
    setSelectedPlaylist(screen.playlist_id ?? "");
    setEditingPlaylist(screen.id);
  };

  const displayUrl = (screenId: string) =>
    `${window.location.origin}/display/${screenId}`;

  const copyUrl = (screenId: string) => {
    navigator.clipboard.writeText(displayUrl(screenId));
    toast.success("URL copiada!");
  };

  const playlistName = (id: string | null) =>
    playlists?.find((p) => p.id === id)?.name ?? null;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie os telões cadastrados no sistema
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nova Tela
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6 mb-6">
          <h3 className="font-semibold text-foreground mb-4">Nova Tela</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Telão Recepção"
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Localização</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Corredor principal"
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
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
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
        </div>
      ) : screens?.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border p-16 text-center">
          <Monitor className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground/70">Nenhuma tela cadastrada ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {screens?.map((screen) => (
            <div
              key={screen.id}
              className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {screen.is_online ? (
                    <Wifi className="w-4 h-4 text-success" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-muted-foreground/50" />
                  )}
                  <div>
                    <p className="font-semibold text-foreground">{screen.name}</p>
                    {screen.location && (
                      <p className="text-xs text-muted-foreground/70">{screen.location}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    screen.is_online
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${screen.is_online ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
                  {screen.is_online ? "Online" : "Offline"}
                </span>
              </div>

              {/* URL */}
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 mb-3">
                <code className="text-xs text-muted-foreground flex-1 truncate">
                  /display/{screen.id}
                </code>
                <button
                  onClick={() => copyUrl(screen.id)}
                  className="text-muted-foreground/70 hover:text-foreground transition"
                  title="Copiar URL"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <a
                  href={displayUrl(screen.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground/70 hover:text-primary transition"
                  title="Abrir telão"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Playlist vinculada */}
              <div className="mb-3">
                {editingPlaylist === screen.id ? (
                  <div className="flex items-center gap-2">
                    <ListVideo className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0" />
                    <Select
                      className="flex-1"
                      size="xs"
                      value={selectedPlaylist}
                      onChange={setSelectedPlaylist}
                      emptyLabel="— Sem playlist —"
                      options={(playlists ?? []).map((p) => ({ value: p.id, label: p.name }))}
                    />
                    <button
                      onClick={() =>
                        linkPlaylistMutation.mutate({
                          screenId: screen.id,
                          playlistId: selectedPlaylist || null,
                        })
                      }
                      disabled={linkPlaylistMutation.isPending}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 transition"
                    >
                      {linkPlaylistMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      OK
                    </button>
                    <button
                      onClick={() => setEditingPlaylist(null)}
                      className="p-1.5 rounded-lg text-muted-foreground/70 hover:bg-muted transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEditPlaylist(screen)}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-muted transition group"
                  >
                    <ListVideo className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0" />
                    {screen.playlist_id ? (
                      <span className="text-xs font-medium text-foreground flex-1 truncate">
                        {playlistName(screen.playlist_id) ?? screen.playlist_id.slice(0, 8)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/70 flex-1">
                        Sem playlist — clique para vincular
                      </span>
                    )}
                    <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition">
                      Alterar
                    </span>
                  </button>
                )}
              </div>

              {screen.last_seen_at && (
                <p className="text-xs text-muted-foreground/70 mb-3">
                  Visto {formatRelativeTime(screen.last_seen_at)}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => reloadMutation.mutate(screen.id)}
                  disabled={!screen.is_online}
                  className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reload
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Excluir tela "${screen.name}"?`)) {
                      deleteMutation.mutate(screen.id);
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 border border-destructive/20 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition"
                >
                  <Trash2 className="w-3 h-3" />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
