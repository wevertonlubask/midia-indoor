"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, TrendingUp, Monitor, Image, Video, Play,
} from "lucide-react";
import { analyticsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => analyticsApi.summary(days).then((r) => r.data),
  });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Estatisticas de reproducao de conteudo
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reproducoes</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {summary?.total_plays ?? 0}
                  </p>
                )}
              </div>
              <Play className="w-8 h-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Banners</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {summary?.plays_by_type?.banner ?? 0}
                  </p>
                )}
              </div>
              <Image className="w-8 h-8 text-violet-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Videos</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {summary?.plays_by_type?.video ?? 0}
                  </p>
                )}
              </div>
              <Video className="w-8 h-8 text-success/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Telas Ativas</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {summary?.active_screens ?? 0}
                  </p>
                )}
              </div>
              <Monitor className="w-8 h-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Chart - Plays per day */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <BarChart3 className="w-4 h-4 text-primary" />
              Reproducoes por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : summary?.plays_per_day?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={summary.plays_per_day}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    stroke="rgba(255,255,255,0.3)"
                    fontSize={11}
                    tickFormatter={(v) => {
                      const d = new Date(v + "T00:00:00");
                      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                    }}
                  />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "#1E293B",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      color: "#F8FAFC",
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => {
                      const d = new Date(v + "T00:00:00");
                      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
                    }}
                  />
                  <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Reproducoes" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground/50">
                <p className="text-sm">Nenhum dado disponivel para o periodo</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Content */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <TrendingUp className="w-4 h-4 text-primary" />
              Top Conteudos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : summary?.top_content?.length ? (
              <div className="space-y-2">
                {summary.top_content.map((item, idx) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 py-2">
                    <span className="text-sm font-mono text-muted-foreground/50 w-5">{idx + 1}</span>
                    <Badge variant="secondary" className={
                      item.type === "banner"
                        ? "bg-violet-500/15 text-violet-400 border-violet-500/20"
                        : "bg-success/15 text-success border-success/20"
                    }>
                      {item.type === "banner" ? <Image className="w-3 h-3 mr-1" /> : <Video className="w-3 h-3 mr-1" />}
                      {item.type}
                    </Badge>
                    <span className="text-sm text-foreground truncate flex-1">{item.name}</span>
                    <span className="text-sm font-mono text-muted-foreground">{item.plays}x</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/50 py-8 text-center">Sem dados</p>
            )}
          </CardContent>
        </Card>

        {/* Plays per Screen */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <Monitor className="w-4 h-4 text-primary" />
              Reproducoes por Tela
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : summary?.plays_per_screen?.length ? (
              <div className="space-y-2">
                {summary.plays_per_screen.map((screen) => (
                  <div key={screen.screen_id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-sm text-foreground">{screen.screen_name}</span>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground">{screen.plays}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/50 py-8 text-center">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
