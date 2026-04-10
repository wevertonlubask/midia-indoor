"use client";

import { useState, useRef, useCallback } from "react";
import { generateUUID } from "@/lib/uuid";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Trash2, Eye, EyeOff, Video as VideoIcon,
  Loader2, X, Upload, RefreshCw, CheckCircle, AlertCircle, Clock, Maximize2, Minimize2,
  ImageIcon, GripVertical, SlidersHorizontal,
} from "lucide-react";
import { videosApi, type Video } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/utils";

const statusConfig = {
  pending:    { label: "Aguardando",   icon: Clock,         color: "text-warning bg-warning/10" },
  processing: { label: "Processando",  icon: Loader2,       color: "text-primary bg-primary/10"    },
  done:       { label: "Pronto",       icon: CheckCircle,   color: "text-success bg-success/10"  },
  error:      { label: "Erro",         icon: AlertCircle,   color: "text-destructive bg-destructive/10"      },
};

interface QueueItem {
  id: string;
  file: File;
  title: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
}

interface SlideshowImage {
  id: string;
  file: File;
  preview: string;
}

export default function VideosPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const slideshowFileRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Slideshow state
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [slideshowImages, setSlideshowImages] = useState<SlideshowImage[]>([]);
  const [slideshowTitle, setSlideshowTitle] = useState("");
  const [durationPerImage, setDurationPerImage] = useState(5);
  const [transitionDuration, setTransitionDuration] = useState(1);
  const [slideshowUploading, setSlideshowUploading] = useState(false);
  const [slideshowProgress, setSlideshowProgress] = useState(0);

  // Edição de slideshow existente
  const [editingSlideshow, setEditingSlideshow] = useState<Video | null>(null);
  const [editDuration, setEditDuration] = useState(5);
  const [editTransition, setEditTransition] = useState(1);

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => videosApi.list().then((r) => r.data),
    refetchInterval: 5_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      videosApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["videos"] }),
  });

  const fullscreenMutation = useMutation({
    mutationFn: ({ id, fullscreen }: { id: string; fullscreen: boolean }) =>
      videosApi.update(id, { fullscreen }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["videos"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => videosApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Vídeo excluído");
    },
  });

  const retranscodeMutation = useMutation({
    mutationFn: (id: string) => videosApi.retranscode(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Reprocessamento enfileirado");
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: ({ id, dur, trans }: { id: string; dur: number; trans: number }) =>
      videosApi.regenerateSlideshow(id, dur, trans),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Slideshow sendo regenerado com novos parâmetros");
      setEditingSlideshow(null);
    },
    onError: () => toast.error("Erro ao regenerar slideshow"),
  });

  const addFiles = useCallback((files: FileList | File[]) => {
    const allowed = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
    const arr = Array.from(files).filter((f) => allowed.includes(f.type));
    if (!arr.length) return;
    const items: QueueItem[] = arr.map((file) => ({
      id: generateUUID(),
      file,
      title: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      status: "pending",
      progress: 0,
    }));
    setQueue((q) => [...q, ...items]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const removeItem = (id: string) => setQueue((q) => q.filter((i) => i.id !== id));

  const handleUploadAll = async () => {
    const pending = queue.filter((i) => i.status === "pending");
    if (!pending.length) return;
    setUploading(true);
    for (const item of pending) {
      updateItem(item.id, { status: "uploading", progress: 0 });
      try {
        const form = new FormData();
        form.append("file", item.file);
        form.append("title", item.title);
        await videosApi.create(form, (p) => updateItem(item.id, { progress: p }));
        updateItem(item.id, { status: "done", progress: 100 });
      } catch {
        updateItem(item.id, { status: "error" });
      }
    }
    qc.invalidateQueries({ queryKey: ["videos"] });
    toast.success("Upload concluído! Transcodificação iniciada em background.");
    setUploading(false);
  };

  const clearDone = () => setQueue((q) => q.filter((i) => i.status !== "done"));

  const pendingCount = queue.filter((i) => i.status === "pending").length;

  // ── Slideshow ──────────────────────────────────────────────────────────
  const addSlideshowImages = useCallback((files: FileList | File[]) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const arr = Array.from(files).filter((f) => allowed.includes(f.type));
    if (!arr.length) return;
    const items: SlideshowImage[] = arr.map((file) => ({
      id: generateUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));
    setSlideshowImages((prev) => [...prev, ...items]);
  }, []);

  const removeSlideshowImage = (id: string) => {
    setSlideshowImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  };

  const moveSlideshowImage = (index: number, direction: -1 | 1) => {
    setSlideshowImages((prev) => {
      const arr = [...prev];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  const handleSlideshowUpload = async () => {
    if (!slideshowImages.length || !slideshowTitle.trim()) return;
    setSlideshowUploading(true);
    setSlideshowProgress(0);
    try {
      const form = new FormData();
      form.append("title", slideshowTitle.trim());
      form.append("duration_per_image", String(durationPerImage));
      form.append("transition_duration", String(transitionDuration));
      for (const img of slideshowImages) {
        form.append("files", img.file);
      }
      await videosApi.createFromImages(form, (p) => setSlideshowProgress(p));
      toast.success("Slideshow enviado! Gerando vídeo em background...");
      qc.invalidateQueries({ queryKey: ["videos"] });
      // Limpar
      slideshowImages.forEach((i) => URL.revokeObjectURL(i.preview));
      setSlideshowImages([]);
      setSlideshowTitle("");
      setShowSlideshow(false);
    } catch {
      toast.error("Erro ao enviar slideshow");
    }
    setSlideshowUploading(false);
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Vídeos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload e gerenciamento de vídeos institucionais
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Zona de drop */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-6 ${
          isDraggingOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-border hover:bg-muted"
        }`}
      >
        <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          Arraste vídeos aqui ou clique para selecionar
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">MP4, WebM, MOV — múltiplos arquivos permitidos</p>
      </div>

      {/* Botão Slideshow */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setShowSlideshow(!showSlideshow)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            showSlideshow
              ? "bg-violet-600 text-white"
              : "bg-card border border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          {showSlideshow ? "Fechar slideshow" : "Criar vídeo a partir de imagens"}
        </button>
      </div>

      {/* Painel Slideshow */}
      {showSlideshow && (
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-5 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Criar Slideshow de Imagens
          </h2>

          {/* Título */}
          <input
            value={slideshowTitle}
            onChange={(e) => setSlideshowTitle(e.target.value)}
            placeholder="Título do slideshow"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
          />

          {/* Configurações */}
          <div className="flex items-center gap-6 mb-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Tempo por imagem:
              <input
                type="number"
                min={1}
                max={60}
                step={0.5}
                value={durationPerImage}
                onChange={(e) => setDurationPerImage(Number(e.target.value))}
                className="w-20 px-2 py-1 border border-border rounded-md text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <span className="text-xs text-muted-foreground/70">seg</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Transição:
              <input
                type="number"
                min={0}
                max={5}
                step={0.5}
                value={transitionDuration}
                onChange={(e) => setTransitionDuration(Number(e.target.value))}
                className="w-20 px-2 py-1 border border-border rounded-md text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <span className="text-xs text-muted-foreground/70">seg</span>
            </label>
            <span className="text-xs text-muted-foreground/70">
              Duração total: ~{Math.max(0, slideshowImages.length * durationPerImage - Math.max(0, slideshowImages.length - 1) * transitionDuration).toFixed(1)}s
            </span>
          </div>

          {/* Input de imagens */}
          <input
            ref={slideshowFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addSlideshowImages(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            onClick={() => slideshowFileRef.current?.click()}
            className="border-2 border-dashed border-violet-500/30 rounded-lg p-6 text-center cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition mb-4"
          >
            <ImageIcon className="w-6 h-6 text-violet-400/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Clique para adicionar imagens</p>
            <p className="text-xs text-muted-foreground/70 mt-1">JPEG, PNG, WebP, GIF — a ordem define a sequência do vídeo</p>
          </div>

          {/* Preview das imagens com reordenação */}
          {slideshowImages.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {slideshowImages.length} {slideshowImages.length === 1 ? "imagem" : "imagens"} — arraste para reordenar
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {slideshowImages.map((img, idx) => (
                  <div key={img.id} className="relative group">
                    <div className="aspect-video rounded-lg overflow-hidden border border-border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.preview}
                        alt={`Slide ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* Número de ordem */}
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                      {idx + 1}
                    </div>
                    {/* Controles */}
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                      {idx > 0 && (
                        <button
                          onClick={() => moveSlideshowImage(idx, -1)}
                          className="bg-black/60 text-white rounded p-0.5 hover:bg-black/80"
                          title="Mover para esquerda"
                        >
                          <GripVertical className="w-3 h-3 rotate-90" />
                        </button>
                      )}
                      <button
                        onClick={() => removeSlideshowImage(img.id)}
                        className="bg-red-500/80 text-white rounded p-0.5 hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botão Enviar */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSlideshowUpload}
              disabled={slideshowUploading || !slideshowImages.length || !slideshowTitle.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition text-sm font-medium"
            >
              {slideshowUploading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <VideoIcon className="w-4 h-4" />}
              {slideshowUploading ? `Enviando... ${slideshowProgress}%` : "Gerar vídeo"}
            </button>
            {slideshowUploading && (
              <div className="flex-1 bg-border rounded-full h-1.5">
                <div
                  className="bg-violet-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${slideshowProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fila de upload */}
      {queue.length > 0 && (
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              Fila de upload — {queue.length} {queue.length === 1 ? "arquivo" : "arquivos"}
            </h2>
            <div className="flex items-center gap-3">
              {queue.some((i) => i.status === "done") && (
                <button
                  onClick={clearDone}
                  className="text-xs text-muted-foreground/70 hover:text-foreground transition"
                >
                  Limpar enviados
                </button>
              )}
              <button
                onClick={handleUploadAll}
                disabled={uploading || pendingCount === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-xs font-medium"
              >
                {uploading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Upload className="w-3.5 h-3.5" />}
                {uploading ? "Enviando..." : `Enviar todos (${pendingCount})`}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {queue.map((item) => (
              <div key={item.id} className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <VideoIcon className="w-8 h-8 text-muted-foreground/50 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <input
                      value={item.title}
                      onChange={(e) => updateItem(item.id, { title: e.target.value })}
                      disabled={item.status !== "pending"}
                      className="w-full px-2 py-1 text-sm border border-border rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-transparent disabled:border-transparent disabled:text-muted-foreground"
                      placeholder="Título"
                    />
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{formatBytes(item.file.size)}</p>
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    {item.status === "pending" && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 text-muted-foreground/70 hover:text-foreground transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {item.status === "uploading" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                    {item.status === "done" && <CheckCircle className="w-4 h-4 text-success" />}
                    {item.status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                  </div>
                </div>
                {item.status === "uploading" && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-muted-foreground/70 mb-1">
                      <span>Enviando...</span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="w-full bg-border rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista existente */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
        </div>
      ) : videos?.length === 0 && queue.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border p-16 text-center">
          <VideoIcon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground/70">Nenhum vídeo. Arraste arquivos acima para começar.</p>
        </div>
      ) : videos && videos.length > 0 ? (
        <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border divide-y divide-border">
          {videos.map((video) => {
            const status = statusConfig[video.transcode_status];
            const StatusIcon = status.icon;
            return (
              <div key={video.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted transition">
                <div className="w-20 h-14 bg-muted rounded-lg flex-shrink-0 overflow-hidden">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoIcon className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                  {video.created_by_name && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">por <span className="text-muted-foreground">{video.created_by_name}</span></p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      <StatusIcon className={`w-3 h-3 ${video.transcode_status === "processing" ? "animate-spin" : ""}`} />
                      {status.label}
                    </span>
                    {video.duration_seconds && (
                      <span className="text-xs text-muted-foreground/70">{formatDuration(video.duration_seconds)}</span>
                    )}
                  </div>
                  {video.transcode_error && (
                    <p className="text-xs text-destructive mt-0.5 truncate">{video.transcode_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(video.meta as Record<string, unknown>)?.type === "slideshow" && video.transcode_status === "done" && (
                    <button
                      onClick={() => {
                        const meta = video.meta as Record<string, unknown>;
                        setEditingSlideshow(video);
                        setEditDuration(Number(meta.duration_per_image) || 5);
                        setEditTransition(Number(meta.transition_duration) || 1);
                      }}
                      className="p-1.5 rounded-lg text-violet-400 hover:bg-violet-500/10 transition"
                      title="Alterar tempos do slideshow"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                    </button>
                  )}
                  {video.transcode_status === "error" && (
                    <button
                      onClick={() => retranscodeMutation.mutate(video.id)}
                      className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition"
                      title="Reprocessar"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => fullscreenMutation.mutate({ id: video.id, fullscreen: !video.fullscreen })}
                    className={`p-1.5 rounded-lg transition ${
                      video.fullscreen ? "text-violet-400 hover:bg-violet-500/10" : "text-muted-foreground/70 hover:bg-muted"
                    }`}
                    title={video.fullscreen ? "Tela cheia ativada" : "Tela cheia desativada"}
                  >
                    {video.fullscreen ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: video.id, is_active: !video.is_active })}
                    className={`p-1.5 rounded-lg transition ${
                      video.is_active ? "text-success hover:bg-success/10" : "text-muted-foreground/70 hover:bg-muted"
                    }`}
                  >
                    {video.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir "${video.title}"?`)) deleteMutation.mutate(video.id);
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
      ) : null}

      {/* Modal edição de slideshow */}
      {editingSlideshow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-xl border border-border shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-1">Editar Slideshow</h3>
            <p className="text-sm text-muted-foreground mb-5 truncate">{editingSlideshow.title}</p>

            <div className="space-y-4 mb-6">
              <label className="block">
                <span className="text-sm text-muted-foreground">Tempo por imagem (seg)</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={0.5}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg bg-transparent text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Duração da transição (seg)</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={editTransition}
                  onChange={(e) => setEditTransition(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg bg-transparent text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>
              <p className="text-xs text-muted-foreground/70">
                {(editingSlideshow.meta as Record<string, unknown>)?.image_count
                  ? `${(editingSlideshow.meta as Record<string, unknown>).image_count} imagens · `
                  : ""}
                Duração estimada: ~{(
                  Number((editingSlideshow.meta as Record<string, unknown>)?.image_count || 0) * editDuration -
                  Math.max(0, Number((editingSlideshow.meta as Record<string, unknown>)?.image_count || 0) - 1) * editTransition
                ).toFixed(1)}s
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingSlideshow(null)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => regenerateMutation.mutate({
                  id: editingSlideshow.id,
                  dur: editDuration,
                  trans: editTransition,
                })}
                disabled={regenerateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition text-sm font-medium"
              >
                {regenerateMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RefreshCw className="w-4 h-4" />}
                Regenerar vídeo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
