"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, ListVideo, Loader2, X, Pencil, Check, Layers } from "lucide-react";
import { playlistsApi, bannersApi, videosApi } from "@/lib/api";
import { Select } from "@/components/ui/select";

// ─── Seletor de banners por slot ─────────────────────────────────────────────
function BannerSlotSelector({
  slotCount,
  banners,
  selectedSlots,
  onChange,
}: {
  slotCount: number;
  banners: any[];
  selectedSlots: string[][];
  onChange: (slots: string[][]) => void;
}) {
  const toggle = (slotIdx: number, bannerId: string) => {
    const next = Array.from({ length: slotCount }, (_, i) => [...(selectedSlots[i] ?? [])]);
    if (next[slotIdx].includes(bannerId)) {
      next[slotIdx] = next[slotIdx].filter((x) => x !== bannerId);
    } else {
      next[slotIdx] = [...next[slotIdx], bannerId];
    }
    onChange(next);
  };

  const slotLabels = ["Slot 1", "Slot 2", "Slot 3"];

  return (
    <div className={`grid gap-3 ${slotCount > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {Array.from({ length: slotCount }).map((_, slotIdx) => {
        const selected = selectedSlots[slotIdx] ?? [];
        return (
          <div key={slotIdx} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
              <Layers className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {slotLabels[slotIdx]}
              </span>
              <span className="ml-auto text-xs text-muted-foreground/70">{selected.length} sel.</span>
            </div>
            <div className="divide-y divide-border max-h-44 overflow-y-auto">
              {banners?.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(b.id)}
                    onChange={() => toggle(slotIdx, b.id)}
                    className="rounded"
                  />
                  <img
                    src={b.file_url}
                    alt=""
                    className="w-8 h-6 object-cover rounded flex-shrink-0"
                  />
                  <span className="text-sm text-foreground truncate">{b.title}</span>
                </label>
              ))}
              {!banners?.length && (
                <p className="px-3 py-3 text-xs text-muted-foreground/70 text-center">Sem banners</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VideoSelector({
  videos,
  selected,
  onChange,
}: {
  videos: any[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );

  const allVideos = videos ?? [];

  const statusLabel: Record<string, { text: string; color: string }> = {
    done:       { text: "Pronto",       color: "text-success" },
    pending:    { text: "Aguardando",   color: "text-amber-500" },
    processing: { text: "Processando",  color: "text-primary"  },
    error:      { text: "Erro",         color: "text-destructive"   },
  };

  return (
    <div>
      <label className="text-sm font-medium text-foreground block mb-1">
        Vídeos ({selected.length} selecionados)
      </label>
      <div className="border border-border rounded-lg divide-y divide-border max-h-44 overflow-y-auto">
        {allVideos.map((v) => {
          const st = statusLabel[v.transcode_status] ?? { text: v.transcode_status, color: "text-muted-foreground/70" };
          return (
            <label
              key={v.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(v.id)}
                onChange={() => toggle(v.id)}
                className="rounded"
              />
              <span className="text-sm text-foreground truncate flex-1">{v.title}</span>
              <span className={`text-xs flex-shrink-0 ${st.color}`}>{st.text}</span>
            </label>
          );
        })}
        {!allVideos.length && (
          <p className="px-3 py-4 text-xs text-muted-foreground/70 text-center">Sem vídeos cadastrados</p>
        )}
      </div>
    </div>
  );
}

const SLOT_OPTIONS = [
  { value: 1, label: "1 slot  — imagem vertical inteira" },
  { value: 2, label: "2 slots — dois carrosseis empilhados" },
  { value: 3, label: "3 slots — três carrosseis empilhados" },
];

function emptySlots(n: number): string[][] {
  return Array.from({ length: n }, () => []);
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function PlaylistsPage() {
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlotCount, setCreateSlotCount] = useState(1);
  const [createBannerSlots, setCreateBannerSlots] = useState<string[][]>([[]]);
  const [createVideos, setCreateVideos] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSlotCount, setEditSlotCount] = useState(1);
  const [editBannerSlots, setEditBannerSlots] = useState<string[][]>([[]]);
  const [editVideos, setEditVideos] = useState<string[]>([]);

  const { data: playlists, isLoading } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => playlistsApi.list().then((r) => r.data),
  });
  const { data: banners } = useQuery({
    queryKey: ["banners"],
    queryFn: () => bannersApi.list().then((r) => r.data),
  });
  const { data: videos } = useQuery({
    queryKey: ["videos"],
    queryFn: () => videosApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      playlistsApi.create({
        name: createName,
        is_active: true,
        banner_slot_count: createSlotCount,
        banner_slots: createBannerSlots,
        video_ids: createVideos,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Playlist criada!");
      setShowCreate(false);
      setCreateName("");
      setCreateSlotCount(1);
      setCreateBannerSlots([[]]);
      setCreateVideos([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      playlistsApi.update(id, {
        banner_slot_count: editSlotCount,
        banner_slots: editBannerSlots,
        video_ids: editVideos,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Playlist atualizada! O telão irá atualizar automaticamente.");
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => playlistsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Playlist excluída");
    },
  });

  const startEdit = async (playlist: any) => {
    try {
      const { data } = await playlistsApi.getContent(playlist.id);
      const sc = data.banner_slot_count ?? 1;
      const slots = Array.from({ length: sc }, (_, i) =>
        (data.banner_slots?.[i] ?? []).map((b: any) => b.id)
      );
      setEditSlotCount(sc);
      setEditBannerSlots(slots);
      setEditVideos((data.videos ?? []).map((v: any) => v.id));
    } catch {
      setEditSlotCount(playlist.banner_slot_count ?? 1);
      setEditBannerSlots(emptySlots(playlist.banner_slot_count ?? 1));
      setEditVideos([]);
    }
    setEditingId(playlist.id);
  };

  const changeCreateSlots = (n: number) => {
    setCreateSlotCount(n);
    setCreateBannerSlots((p) => {
      const next = [...p];
      while (next.length < n) next.push([]);
      return next.slice(0, n);
    });
  };

  const changeEditSlots = (n: number) => {
    setEditSlotCount(n);
    setEditBannerSlots((p) => {
      const next = [...p];
      while (next.length < n) next.push([]);
      return next.slice(0, n);
    });
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Playlists</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Agrupe banners e vídeos e associe às telas
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nova Playlist
        </button>
      </div>

      {/* ── Formulário de criação ── */}
      {showCreate && (
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-6 mb-6">
          <h3 className="font-semibold text-foreground mb-4">Nova Playlist</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Nome *</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Nome da playlist"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Slots de banner</label>
                <Select
                  className="mt-1 w-full"
                  value={String(createSlotCount)}
                  onChange={(v) => changeCreateSlots(Number(v))}
                  options={SLOT_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Banners</label>
              <BannerSlotSelector
                slotCount={createSlotCount}
                banners={banners ?? []}
                selectedSlots={createBannerSlots}
                onChange={setCreateBannerSlots}
              />
            </div>

            <VideoSelector
              videos={videos ?? []}
              selected={createVideos}
              onChange={setCreateVideos}
            />

            <div className="flex gap-3">
              <button
                onClick={() => createMutation.mutate()}
                disabled={!createName.trim() || createMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-sm font-medium"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-lg hover:bg-muted transition text-sm"
              >
                <X className="w-4 h-4" />
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
        </div>
      ) : (
        <div className="space-y-3">
          {playlists?.length === 0 && (
            <div className="bg-card rounded-xl border border-dashed border-border p-16 text-center">
              <ListVideo className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground/70">Nenhuma playlist criada.</p>
            </div>
          )}

          {playlists?.map((playlist) => (
            <div key={playlist.id} className="bg-card rounded-xl shadow-md shadow-black/10 border border-border">
              <div className="flex items-center gap-4 px-4 py-3">
                <ListVideo className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{playlist.name}</p>
                  <p className="text-xs text-muted-foreground/70 flex items-center gap-2 mt-0.5">
                    {playlist.is_active ? "Ativa" : "Inativa"}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium" style={{ fontSize: "10px" }}>
                      <Layers className="w-2.5 h-2.5" />
                      {playlist.banner_slot_count ?? 1} slot(s)
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {editingId === playlist.id ? (
                    <>
                      <button
                        onClick={() => updateMutation.mutate(playlist.id)}
                        disabled={updateMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition"
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1 px-3 py-1.5 border border-border text-muted-foreground rounded-lg text-xs hover:bg-muted transition"
                      >
                        <X className="w-3 h-3" />
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEdit(playlist)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-border text-muted-foreground rounded-lg text-xs hover:bg-muted transition"
                    >
                      <Pencil className="w-3 h-3" />
                      Editar conteúdo
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Excluir "${playlist.name}"?`)) deleteMutation.mutate(playlist.id);
                    }}
                    className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Painel de edição */}
              {editingId === playlist.id && (
                <div className="border-t border-border px-4 py-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Slots de banner</label>
                    <Select
                      className="mt-1 w-64"
                      value={String(editSlotCount)}
                      onChange={(v) => changeEditSlots(Number(v))}
                      options={SLOT_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Banners por slot</p>
                    <BannerSlotSelector
                      slotCount={editSlotCount}
                      banners={banners ?? []}
                      selectedSlots={editBannerSlots}
                      onChange={setEditBannerSlots}
                    />
                  </div>

                  <VideoSelector
                    videos={videos ?? []}
                    selected={editVideos}
                    onChange={setEditVideos}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
