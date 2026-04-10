"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock,
  ListVideo, X,
} from "lucide-react";
import { playlistsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PlaylistSchedule {
  id: string;
  name: string;
  is_active: boolean;
  schedule_start: string | null;
  schedule_end: string | null;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export default function SchedulePage() {
  const qc = useQueryClient();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const { data: playlists, isLoading } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => playlistsApi.list().then((r) => r.data as PlaylistSchedule[]),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, schedule_start, schedule_end }: { id: string; schedule_start: string | null; schedule_end: string | null }) =>
      playlistsApi.update(id, { schedule_start, schedule_end }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Agendamento atualizado");
      setSelectedPlaylist(null);
    },
    onError: () => toast.error("Erro ao atualizar agendamento"),
  });

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const scheduledPlaylists = useMemo(() => {
    if (!playlists) return new Map<number, PlaylistSchedule[]>();
    const map = new Map<number, PlaylistSchedule[]>();

    for (const pl of playlists) {
      if (!pl.schedule_start) continue;
      const start = new Date(pl.schedule_start);
      const end = pl.schedule_end ? new Date(pl.schedule_end) : start;

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
          const day = d.getDate();
          if (!map.has(day)) map.set(day, []);
          map.get(day)!.push(pl);
        }
      }
    }
    return map;
  }, [playlists, viewYear, viewMonth]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleEditPlaylist = (pl: PlaylistSchedule) => {
    setSelectedPlaylist(pl.id);
    setEditStart(pl.schedule_start?.split("T")[0] ?? "");
    setEditEnd(pl.schedule_end?.split("T")[0] ?? "");
  };

  const handleSaveSchedule = () => {
    if (!selectedPlaylist) return;
    updateMutation.mutate({
      id: selectedPlaylist,
      schedule_start: editStart || null,
      schedule_end: editEnd || null,
    });
  };

  const handleClearSchedule = () => {
    if (!selectedPlaylist) return;
    updateMutation.mutate({
      id: selectedPlaylist,
      schedule_start: null,
      schedule_end: null,
    });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Agendamento</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Agende playlists para datas especificas
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                <CalendarIcon className="w-4 h-4 text-primary" />
                {MONTH_NAMES[viewMonth]} {viewYear}
              </CardTitle>
              <div className="flex items-center gap-1">
                <button onClick={goToPrevMonth} className="p-1.5 rounded-lg hover:bg-muted transition">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition"
                >
                  Hoje
                </button>
                <button onClick={goToNextMonth} className="p-1.5 rounded-lg hover:bg-muted transition">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day names */}
            <div className="grid grid-cols-7 mb-2">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground/60 py-2">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                const scheduled = scheduledPlaylists.get(day);

                return (
                  <div
                    key={day}
                    className={`aspect-square rounded-lg p-1 text-xs transition ${
                      isToday ? "ring-1 ring-primary bg-primary/5" : "hover:bg-muted"
                    }`}
                  >
                    <span className={`block text-right mb-0.5 ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {day}
                    </span>
                    {scheduled?.slice(0, 2).map((pl) => (
                      <div
                        key={pl.id}
                        className="bg-primary/20 text-primary text-[9px] rounded px-1 truncate mb-0.5 cursor-pointer hover:bg-primary/30"
                        onClick={() => handleEditPlaylist(pl)}
                        title={pl.name}
                      >
                        {pl.name}
                      </div>
                    ))}
                    {scheduled && scheduled.length > 2 && (
                      <span className="text-[9px] text-muted-foreground/60">+{scheduled.length - 2}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Playlists sidebar */}
        <div className="space-y-4">
          {/* Edit panel */}
          {selectedPlaylist && (
            <Card className="bg-card border-primary/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground">Editar Agendamento</CardTitle>
                  <button onClick={() => setSelectedPlaylist(null)} className="p-1 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {playlists?.find((p) => p.id === selectedPlaylist)?.name}
                </p>
                <div>
                  <label className="text-xs text-muted-foreground/70">Inicio</label>
                  <input
                    type="date"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground/70">Fim</label>
                  <input
                    type="date"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveSchedule}
                    disabled={updateMutation.isPending}
                    className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={handleClearSchedule}
                    disabled={updateMutation.isPending}
                    className="px-3 py-2 bg-muted text-muted-foreground rounded-lg text-sm hover:bg-muted/80 transition"
                  >
                    Limpar
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Playlist list */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <ListVideo className="w-4 h-4 text-primary" />
                Playlists
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground/50">Carregando...</p>
              ) : playlists?.length === 0 ? (
                <p className="text-sm text-muted-foreground/50">Nenhuma playlist</p>
              ) : (
                <div className="space-y-2">
                  {playlists?.map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => handleEditPlaylist(pl)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                        selectedPlaylist === pl.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
                      }`}
                    >
                      <div>
                        <p className="text-sm text-foreground">{pl.name}</p>
                        {pl.schedule_start && (
                          <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(pl.schedule_start).toLocaleDateString("pt-BR")}
                            {pl.schedule_end && ` - ${new Date(pl.schedule_end).toLocaleDateString("pt-BR")}`}
                          </p>
                        )}
                      </div>
                      {pl.schedule_start ? (
                        <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px]">Agendada</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Sem data</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
