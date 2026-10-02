import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Interceptor: adicionar token JWT em todas as requisições
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("signflow_access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Interceptor: renovar token automaticamente em caso de 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem("signflow_refresh_token");
        if (!refreshToken) throw new Error("No refresh token");
        const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        });
        localStorage.setItem("signflow_access_token", data.access_token);
        localStorage.setItem("signflow_refresh_token", data.refresh_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        localStorage.removeItem("signflow_access_token");
        localStorage.removeItem("signflow_refresh_token");
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);

// --- Tipos ---
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "OPERATOR";
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  filename: string;
  file_url: string;
  duration_seconds: number;
  order_index: number;
  is_active: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

export interface Video {
  id: string;
  title: string;
  filename: string;
  original_url: string;
  transcoded_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  order_index: number;
  is_active: boolean;
  fullscreen: boolean;
  transcode_status: "pending" | "processing" | "done" | "error";
  transcode_error: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

export interface Screen {
  id: string;
  name: string;
  location: string | null;
  token: string;
  is_active: boolean;
  last_seen_at: string | null;
  config: Record<string, unknown> | null;
  playlist_id: string | null;
  created_at: string;
  is_online: boolean;
}

export interface DeviceSchedule {
  enabled: boolean;
  days: number[]; // 1 = segunda ... 7 = domingo
  on_time: string;
  off_time: string;
}

export interface DeviceSettings {
  schedule: DeviceSchedule;
  daily_restart: string | null;
  tv_control: "auto" | "cec" | "hdmi";
}

export interface DeviceStatus {
  temp_c?: number;
  throttled?: number;
  uptime_s?: number;
  load?: number;
  mem_used_pct?: number;
  disk_used_pct?: number;
  wifi_iface?: string;
  wifi_signal_dbm?: number;
  tv_state?: "on" | "off" | "unknown";
  tv_method?: "cec" | "hdmi" | null;
  browser_running?: boolean;
  display_url?: string;
  local_time?: string;
  clock_offset_s?: number | null;
  cache_files?: number;
  cache_mb?: number;
  cache_pending?: number;
  cache_ready?: string; // "baixadas/total" da playlist atual
  disk_free_gb?: number;
}

export type DeviceCommandName =
  | "restart_browser"
  | "reboot"
  | "shutdown"
  | "tv_on"
  | "tv_off"
  | "screenshot"
  | "update_agent"
  | "sync_time";

export interface Device {
  id: string;
  name: string;
  hostname: string | null;
  mac: string;
  ip: string | null;
  screen_id: string | null;
  agent_version: string | null;
  last_seen_at: string | null;
  status: DeviceStatus | null;
  settings: DeviceSettings;
  last_command: {
    id: string;
    command: DeviceCommandName;
    status: "pending" | "ok" | "error";
    message: string | null;
    sent_at: string;
    finished_at: string | null;
  } | null;
  created_at: string;
  is_online: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  is_active: boolean;
  banner_slot_count: number;
  schedule_start: string | null;
  schedule_end: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BannerItem {
  id: string;
  title: string;
  file_url: string;
  duration_seconds: number;
}

export interface Ticker {
  id: string;
  content: string | null;
  type: "text" | "rss" | "weather";
  is_active: boolean;
  config: Record<string, unknown> | null;
  display_duration: number;
  order_index: number;
  created_at: string;
}

export interface WeatherData {
  city: string;
  temperature: number | null;
  feels_like: number | null;
  humidity: number | null;
  wind_speed: number | null;
  description: string;
  icon: string;
}

export interface WeatherForecastDay {
  date: string;
  weather_code: number;
  description: string;
  icon: string;
  temp_max: number | null;
  temp_min: number | null;
  precipitation_probability: number | null;
}

export interface WeatherForecast {
  city: string;
  days: WeatherForecastDay[];
}

// --- API helpers ---
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  me: () => api.get<User>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<User>("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};

export const bannersApi = {
  list: (activeOnly = false) =>
    api.get<Banner[]>(`/banners/?active_only=${activeOnly}`),
  create: (form: FormData) =>
    api.post<Banner>("/banners/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (id: string, data: Partial<Banner>) =>
    api.patch<Banner>(`/banners/${id}`, data),
  delete: (id: string) => api.delete(`/banners/${id}`),
  reorder: (items: { id: string; order_index: number }[]) =>
    api.post("/banners/reorder", { items }),
};

export const videosApi = {
  list: (activeOnly = false) =>
    api.get<Video[]>(`/videos/?active_only=${activeOnly}`),
  create: (form: FormData, onProgress?: (pct: number) => void) =>
    api.post<Video>("/videos/", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }),
  createFromImages: (form: FormData, onProgress?: (pct: number) => void) =>
    api.post<Video>("/videos/from-images", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }),
  update: (id: string, data: Partial<Video>) =>
    api.patch<Video>(`/videos/${id}`, data),
  delete: (id: string) => api.delete(`/videos/${id}`),
  retranscode: (id: string) => api.post<Video>(`/videos/${id}/retranscode`),
  regenerateSlideshow: (id: string, durationPerImage: number, transitionDuration: number) => {
    const form = new FormData();
    form.append("duration_per_image", String(durationPerImage));
    form.append("transition_duration", String(transitionDuration));
    return api.post<Video>(`/videos/${id}/regenerate-slideshow`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export const screensApi = {
  list: () => api.get<Screen[]>("/screens/"),
  create: (data: Partial<Screen>) => api.post<Screen>("/screens/", data),
  update: (id: string, data: Partial<Screen>) =>
    api.patch<Screen>(`/screens/${id}`, data),
  delete: (id: string) => api.delete(`/screens/${id}`),
  reload: (id: string) => api.post(`/screens/${id}/reload`),
  reloadAll: () => api.post("/screens/reload-all"),
};

export const devicesApi = {
  list: () => api.get<Device[]>("/devices/"),
  update: (id: string, data: { name?: string; screen_id?: string | null; settings?: DeviceSettings }) =>
    api.patch<Device>(`/devices/${id}`, data),
  delete: (id: string) => api.delete(`/devices/${id}`),
  command: (id: string, command: DeviceCommandName) =>
    api.post<{ command_id: string }>(`/devices/${id}/command`, { command }),
  screenshot: (id: string) =>
    api.get<Blob>(`/devices/${id}/screenshot`, { responseType: "blob" }),
};

export const playlistsApi = {
  list: () => api.get<Playlist[]>("/playlists/"),
  create: (data: unknown) => api.post<Playlist>("/playlists/", data),
  update: (id: string, data: unknown) => api.patch<Playlist>(`/playlists/${id}`, data),
  delete: (id: string) => api.delete(`/playlists/${id}`),
  getContent: (id: string) => api.get(`/playlists/${id}/content`),
};

export const tickersApi = {
  list: () => api.get<Ticker[]>("/tickers/"),
  listActive: () => api.get<Ticker[]>("/tickers/active"),
  create: (data: unknown) => api.post<Ticker>("/tickers/", data),
  update: (id: string, data: unknown) => api.patch<Ticker>(`/tickers/${id}`, data),
  delete: (id: string) => api.delete(`/tickers/${id}`),
};

export const weatherApi = {
  current: () => api.get<WeatherData>("/weather/current"),
  forecast: () => api.get<WeatherForecast>("/weather/forecast"),
};

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
  created_at: string;
}

export const usersApi = {
  list: () => api.get<User[]>("/users/"),
  create: (data: { email: string; full_name: string; role: string }) =>
    api.post<User>("/users/", data),
  update: (id: string, data: { full_name?: string; role?: string; is_active?: boolean }) =>
    api.patch<User>(`/users/${id}`, data),
  resetPassword: (id: string, password: string) =>
    api.post(`/users/${id}/reset-password`, { password }),
  delete: (id: string) => api.delete(`/users/${id}`),
};

export interface RSSFeed {
  id: string;
  name: string;
  source_url: string;
  selectors: {
    container: string;
    link: string;
    title?: string;
    description?: string;
    image?: string;
    date?: string;
    author?: string;
  };
  refresh_interval: number;
  is_active: boolean;
  last_scraped_at: string | null;
  last_error: string | null;
  item_count: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RSSItem {
  id: string;
  feed_id: string;
  title: string | null;
  link: string | null;
  description: string | null;
  image_url: string | null;
  pub_date: string | null;
  author: string | null;
  guid: string | null;
  created_at: string;
}

export interface RSSFeedWithItems extends RSSFeed {
  items: RSSItem[];
}

export const rssApi = {
  list: () => api.get<RSSFeed[]>("/rss/"),
  get: (id: string) => api.get<RSSFeedWithItems>(`/rss/${id}`),
  create: (data: {
    name: string;
    source_url: string;
    selectors: RSSFeed["selectors"];
    refresh_interval: number;
    is_active: boolean;
  }) => api.post<RSSFeed>("/rss/", data),
  update: (id: string, data: Partial<RSSFeed>) =>
    api.patch<RSSFeed>(`/rss/${id}`, data),
  delete: (id: string) => api.delete(`/rss/${id}`),
  scrape: (id: string) => api.post(`/rss/${id}/scrape`),
  proxy: (url: string) =>
    api.get<string>("/rss/proxy", {
      params: { url },
      responseType: "text",
      transformResponse: [(data: string) => data],
    }),
  preview: (data: {
    name: string;
    source_url: string;
    selectors: RSSFeed["selectors"];
    refresh_interval: number;
    is_active: boolean;
  }) => api.post<{ items: Record<string, string>[]; total: number }>("/rss/preview", data),
  xmlUrl: (id: string) =>
    `${API_URL}/api/v1/rss/${id}/xml`,
};

export const logsApi = {
  list: (params?: {
    user_id?: string;
    resource_type?: string;
    action?: string;
    limit?: number;
    skip?: number;
  }) => api.get<AuditLog[]>("/logs/", { params }),
};

export const emergencyApi = {
  send: (message: string) => api.post("/emergency/", { message }),
  clear: () => api.delete("/emergency/"),
};

export interface AnalyticsSummary {
  period_days: number;
  total_plays: number;
  plays_by_type: Record<string, number>;
  active_screens: number;
  plays_per_day: { date: string; count: number }[];
  top_content: { type: string; id: string; name: string; plays: number }[];
  plays_per_screen: { screen_id: string; screen_name: string; plays: number }[];
}

export const analyticsApi = {
  summary: (days?: number) => api.get<AnalyticsSummary>("/analytics/summary", { params: { days } }),
};

export interface SiteSettingsData {
  company_logo_url: string | null;
  company_logo_filename: string | null;
  accent_color: string;
}

export const siteSettingsApi = {
  get: () => api.get<SiteSettingsData>("/site-settings/"),
  uploadLogo: (form: FormData) =>
    api.post<SiteSettingsData>("/site-settings/logo", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  deleteLogo: () => api.delete("/site-settings/logo"),
  updateAccentColor: (color: string) =>
    api.patch<SiteSettingsData>("/site-settings/accent-color", { accent_color: color }),
};
