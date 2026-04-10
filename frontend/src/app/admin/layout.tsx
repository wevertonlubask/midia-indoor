"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Image,
  Video,
  ListVideo,
  Type,
  Monitor,
  Settings,
  LogOut,
  Users,
  Activity,
  Rss,
  KeyRound,
  BarChart3,
  CalendarDays,
  Menu,
  ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { siteSettingsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard",      icon: LayoutDashboard, group: "main" },
  { href: "/admin/banners",   label: "Banners",         icon: Image,           group: "content" },
  { href: "/admin/videos",    label: "Videos",           icon: Video,           group: "content" },
  { href: "/admin/playlists", label: "Playlists",       icon: ListVideo,       group: "content" },
  { href: "/admin/tickers",   label: "Tickers",         icon: Type,            group: "content" },
  { href: "/admin/rss",       label: "RSS Builder",     icon: Rss,             group: "content" },
  { href: "/admin/screens",   label: "Telas",           icon: Monitor,         group: "manage" },
  { href: "/admin/schedule",  label: "Agendamento",    icon: CalendarDays,    group: "manage" },
  { href: "/admin/analytics", label: "Analytics",       icon: BarChart3,       group: "manage" },
  { href: "/admin/users",     label: "Usuarios",        icon: Users,           group: "manage",  adminOnly: true },
  { href: "/admin/logs",      label: "Registros",       icon: Activity,        group: "manage",  superAdminOnly: true },
  { href: "/admin/settings",  label: "Configuracoes",   icon: Settings,        group: "system" },
];

const groupLabels: Record<string, string> = {
  main: "Principal",
  content: "Conteudo",
  manage: "Gerenciamento",
  system: "Sistema",
};

function SidebarLink({
  item,
  isActive,
  collapsed,
}: {
  item: typeof navItems[0];
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
        collapsed && "justify-center px-2",
        isActive
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground"
      )}
    >
      <Icon className={cn("w-[18px] h-[18px] flex-shrink-0", isActive && "drop-shadow-sm")} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, _hasHydrated, user, clearAuth } = useAuthStore();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("signflow_sidebar_collapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("signflow_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  // Logo da empresa (hook deve ficar antes dos early returns)
  const { data: siteSettings } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingsApi.get().then((r) => r.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push("/auth/login");
    } else if (user?.must_change_password && pathname !== "/admin/change-password") {
      router.push("/admin/change-password");
    }
  }, [isAuthenticated, _hasHydrated, user, pathname, router]);

  if (!_hasHydrated) return null;
  if (!isAuthenticated) return null;
  if (user?.must_change_password && pathname !== "/admin/change-password") return null;

  const handleLogout = () => {
    clearAuth();
    router.push("/auth/login");
  };

  const filteredItems = navItems.filter(
    (item) =>
      (!("adminOnly" in item) || !item.adminOnly || isAdmin) &&
      (!("superAdminOnly" in item) || !item.superAdminOnly || isSuperAdmin)
  );

  const groups = ["main", "content", "manage", "system"];

  // Current page label for header
  const currentPage = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-background">
        {/* Top Header: Hamburger + Logo + Page Title */}
        <header className="h-14 flex-shrink-0 border-b border-border bg-sidebar flex items-center px-4 gap-4 z-10">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg text-muted-foreground hover:bg-sidebar-hover hover:text-foreground transition-colors flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {siteSettings?.company_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={siteSettings.company_logo_url}
                alt="Logo"
                className="h-8 w-auto object-contain"
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                  SF
                </div>
                <span className="text-sm font-semibold text-foreground">SignFlow</span>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-border" />

          <h1 className="text-sm font-semibold text-foreground flex-1">
            {currentPage?.label ?? "SignFlow"}
          </h1>

          <div className="text-right hidden sm:block mr-3">
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-hover transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold ring-2 ring-primary/30">
                {user?.full_name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-foreground leading-tight truncate max-w-[120px]">{user?.full_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {user?.role === "SUPER_ADMIN" ? "Super Admin" : user?.role === "ADMIN" ? "Admin" : "Operador"}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden md:block" />
            </button>

            {userMenuOpen && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-xl shadow-black/20 z-50 py-1">
                  <div className="px-3 py-2 border-b border-border md:hidden">
                    <p className="text-sm font-medium text-foreground truncate">{user?.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {user?.role === "SUPER_ADMIN" ? "Super Admin" : user?.role === "ADMIN" ? "Admin" : "Operador"}
                    </p>
                  </div>
                  <Link
                    href="/admin/change-password"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <KeyRound className="w-4 h-4" />
                    Alterar senha
                  </Link>
                  <button
                    onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar (menu only) */}
          <aside
            className={cn(
              "flex flex-col flex-shrink-0 bg-sidebar border-r border-border transition-all duration-300 ease-in-out overflow-hidden",
              collapsed ? "w-[68px]" : "w-60"
            )}
          >
            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {groups.map((group) => {
                const groupItems = filteredItems.filter((item) => item.group === group);
                if (groupItems.length === 0) return null;

                return (
                  <div key={group} className="mb-3">
                    {!collapsed && group !== "main" && (
                      <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        {groupLabels[group]}
                      </p>
                    )}
                    {collapsed && group !== "main" && (
                      <Separator className="my-2 bg-border/50" />
                    )}
                    <div className="space-y-0.5">
                      {groupItems.map((item) => (
                        <SidebarLink
                          key={item.href}
                          item={item}
                          isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                          collapsed={collapsed}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* Footer */}
            {!collapsed && (
              <div className="px-3 py-3 border-t border-border text-center">
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                  Desenvolvido pelo Prof. Weverton Everaldo Lubask
                </p>
                <p className="text-[10px] text-muted-foreground/50">
                  SENAI SP - 2026
                </p>
              </div>
            )}
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
