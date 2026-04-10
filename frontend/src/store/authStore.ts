import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/lib/api";

interface AuthState {
  _hasHydrated: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setHasHydrated: (v: boolean) => void;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setAuth: (user, accessToken, refreshToken) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("signflow_access_token", accessToken);
          localStorage.setItem("signflow_refresh_token", refreshToken);
        }
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      clearAuth: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("signflow_access_token");
          localStorage.removeItem("signflow_refresh_token");
        }
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: "signflow_auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
