"use client";

import { useState, useRef, useCallback } from "react";
import { generateUUID } from "@/lib/uuid";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import {
  Trash2, GripVertical, Eye, EyeOff,
  Image as ImageIcon, Loader2, X, Upload, CheckCircle, AlertCircle,
} from "lucide-react";
import { bannersApi, type Banner } from "@/lib/api";
import { formatBytes } from "@/lib/utils";

interface QueueItem {
  id: string;
  file: File;
  preview: string;
  title: string;
  duration: number;
  status: "pending" | "uploading" | "done" | "error";
}

function SortableBannerItem({
  banner,
  onToggle,
  onDelete,
}: {
  banner: Banner;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: banner.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 px-4 py-3 hover:bg-muted transition"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <img
        src={banner.file_url}
        alt={banner.title}
        className="w-16 h-12 object-cover rounded-lg flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{banner.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground/70">{banner.duration_seconds}s por exibicao</p>
          {banner.created_by_name && (
            <p className="text-xs text-muted-foreground/70">
              · por <span className="text-muted-foreground">{banner.created_by_name}</span>
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className={`p-1.5 rounded-lg transition ${
            banner.is_active
              ? "text-success hover:bg-success/10"
              : "text-muted-foreground/70 hover:bg-muted"
          }`}
          title={banner.is_active ? "Desativar" : "Ativar"}
        >
          {banner.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function BannersPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: banners, isLoading } = useQuery({
    queryKey: ["banners"],
    queryFn: () => bannersApi.list().then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      bannersApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banners"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bannersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banners"] });
      toast.success("Banner excluido");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; order_index: number }[]) =>
      bannersApi.reorder(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banners"] }),
  });

  const addFiles = useCallback((files: FileList | File[]) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const arr = Array.from(files).filter((f) => allowed.includes(f.type));
    if (!arr.length) return;
    const items: QueueItem[] = arr.map((file) => ({
      id: generateUUID(),
      file,
      preview: URL.createObjectURL(file),
      title: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      duration: 8,
      status: "pending",
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
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const removeItem = (id: string) =>
    setQueue((q) => q.filter((item) => item.id !== id));

  const handleUploadAll = async () => {
    const pending = queue.filter((i) => i.status === "pending");
    if (!pending.length) return;
    setUploading(true);
    for (const item of pending) {
      updateItem(item.id, { status: "uploading" });
      try {
        const form = new FormData();
        form.append("file", item.file);
        form.append("title", item.title);
        form.append("duration_seconds", String(item.duration));
        await bannersApi.create(form);
        updateItem(item.id, { status: "done" });
      } catch {
        updateItem(item.id, { status: "error" });
      }
    }
    qc.invalidateQueries({ queryKey: ["banners"] });
    toast.success("Upload concluido!");
    setUploading(false);
  };

  const clearDone = () => setQueue((q) => q.filter((i) => i.status !== "done"));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !banners) return;

    const oldIndex = banners.findIndex((b) => b.id === active.id);
    const newIndex = banners.findIndex((b) => b.id === over.id);
    const reordered = arrayMove(banners, oldIndex, newIndex);
    reorderMutation.mutate(reordered.map((b, i) => ({ id: b.id, order_index: i })));
  };

  const pendingCount = queue.filter((i) => i.status === "pending").length;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Banners</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie as imagens exibidas na coluna lateral do telao
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
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
            ? "border-primary bg-primary/10"
            : "border-border hover:border-border hover:bg-muted"
        }`}
      >
        <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          Arraste imagens aqui ou clique para selecionar
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">JPG, PNG, WebP, GIF — multiplos arquivos permitidos</p>
      </div>

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
              <div key={item.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <img
                  src={item.preview}
                  alt=""
                  className="w-14 h-10 object-cover rounded-md flex-shrink-0"
                />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <input
                    value={item.title}
                    onChange={(e) => updateItem(item.id, { title: e.target.value })}
                    disabled={item.status !== "pending"}
                    className="flex-1 px-2 py-1 text-sm border border-border rounded-md bg-muted focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-transparent disabled:border-transparent disabled:text-muted-foreground"
                    placeholder="Titulo"
                  />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <input
                      type="number"
                      value={item.duration}
                      onChange={(e) => updateItem(item.id, { duration: Number(e.target.value) })}
                      disabled={item.status !== "pending"}
                      min={2} max={60}
                      className="w-14 px-2 py-1 text-sm border border-border rounded-md text-center bg-muted focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-transparent disabled:border-transparent"
                    />
                    <span className="text-xs text-muted-foreground/70">s</span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 flex-shrink-0 hidden sm:block">
                    {formatBytes(item.file.size)}
                  </p>
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
            ))}
          </div>
        </div>
      )}

      {/* Lista existente */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
        </div>
      ) : banners?.length === 0 && queue.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border p-16 text-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground/70">Nenhum banner. Arraste imagens acima para comecar.</p>
        </div>
      ) : banners && banners.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={banners.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="bg-card rounded-xl shadow-md shadow-black/10 border border-border divide-y divide-border">
              {banners.map((banner) => (
                <SortableBannerItem
                  key={banner.id}
                  banner={banner}
                  onToggle={() =>
                    toggleMutation.mutate({ id: banner.id, is_active: !banner.is_active })
                  }
                  onDelete={() => {
                    if (confirm(`Excluir "${banner.title}"?`)) deleteMutation.mutate(banner.id);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}
    </div>
  );
}
