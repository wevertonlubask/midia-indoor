"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Monitor, Image, Video, Type, Wifi, WifiOff, Activity,
  TrendingUp, Clock, Zap,
} from "lucide-react";
import { screensApi, bannersApi, videosApi, tickersApi, logsApi } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function KPICard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="h-9 w-20" />
            ) : (
              <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color} shadow-lg`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScreenStatusRow({ screen }: { screen: { id: string; name: string; location?: string | null; is_online: boolean; last_seen_at?: string | null } }) {
  return (
    <div className="flex items-center justify-between py-3 px-1">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          screen.is_online ? "bg-success animate-pulse-soft" : "bg-muted-foreground/40"
        }`} />
        <div>
          <p className="text-sm font-medium text-foreground">{screen.name}</p>
          <p className="text-xs text-muted-foreground">{screen.location ?? "Sem localizacao"}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={screen.is_online ? "default" : "secondary"} className={
          screen.is_online
            ? "bg-success/15 text-success border-success/20 hover:bg-success/20"
            : "bg-muted text-muted-foreground border-border"
        }>
          {screen.is_online ? (
            <><Wifi className="w-3 h-3 mr-1" /> Online</>
          ) : (
            <><WifiOff className="w-3 h-3 mr-1" /> Offline</>
          )}
        </Badge>
        {screen.last_seen_at && (
          <span className="text-xs text-muted-foreground font-mono">
            {formatRelativeTime(screen.last_seen_at)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: screens, isLoading: screensLoading } = useQuery({
    queryKey: ["screens"],
    queryFn: () => screensApi.list().then((r) => r.data),
    refetchInterval: 10_000,
  });
  const { data: banners, isLoading: bannersLoading } = useQuery({
    queryKey: ["banners"],
    queryFn: () => bannersApi.list().then((r) => r.data),
  });
  const { data: videos, isLoading: videosLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => videosApi.list().then((r) => r.data),
  });
  const { data: tickers, isLoading: tickersLoading } = useQuery({
    queryKey: ["tickers"],
    queryFn: () => tickersApi.list().then((r) => r.data),
  });
  const { data: logs } = useQuery({
    queryKey: ["logs", "recent"],
    queryFn: () => logsApi.list({ limit: 8 }).then((r) => r.data),
  });

  const onlineScreens = screens?.filter((s) => s.is_online).length ?? 0;
  const totalScreens = screens?.length ?? 0;
  const activeBanners = banners?.filter((b) => b.is_active).length ?? 0;
  const activeVideos = videos?.filter((v) => v.transcode_status === "done").length ?? 0;
  const activeTickers = tickers?.filter((t) => t.is_active).length ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Telas Online"
          value={`${onlineScreens}/${totalScreens}`}
          subtitle={onlineScreens === totalScreens && totalScreens > 0 ? "Todas conectadas" : undefined}
          icon={Monitor}
          color="bg-primary"
          loading={screensLoading}
        />
        <KPICard
          label="Banners Ativos"
          value={activeBanners}
          subtitle={banners ? `${banners.length} total` : undefined}
          icon={Image}
          color="bg-violet-600"
          loading={bannersLoading}
        />
        <KPICard
          label="Videos Prontos"
          value={activeVideos}
          subtitle={videos ? `${videos.length} total` : undefined}
          icon={Video}
          color="bg-success"
          loading={videosLoading}
        />
        <KPICard
          label="Tickers Ativos"
          value={activeTickers}
          subtitle={tickers ? `${tickers.length} total` : undefined}
          icon={Type}
          color="bg-warning"
          loading={tickersLoading}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Screen Status */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <Activity className="w-4 h-4 text-primary" />
              Status das Telas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {screensLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-3">
                    <Skeleton className="w-2 h-2 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : screens?.length === 0 ? (
              <div className="text-center py-8">
                <Monitor className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma tela cadastrada</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {screens?.map((screen) => (
                  <ScreenStatusRow key={screen.id} screen={screen} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <Clock className="w-4 h-4 text-primary" />
              Atividade Recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!logs || logs.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma atividade recente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate">
                        <span className="font-medium">{log.user_name}</span>{" "}
                        <span className="text-muted-foreground">{log.action}</span>{" "}
                        <span className="text-foreground">{log.resource_name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativeTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Health */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-success animate-pulse-soft" />
              <div>
                <p className="text-sm font-medium text-foreground">Sistema operacional</p>
                <p className="text-xs text-muted-foreground">
                  {onlineScreens} tela{onlineScreens !== 1 ? "s" : ""} conectada{onlineScreens !== 1 ? "s" : ""} · {activeBanners} banner{activeBanners !== 1 ? "s" : ""} · {activeTickers} ticker{activeTickers !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
