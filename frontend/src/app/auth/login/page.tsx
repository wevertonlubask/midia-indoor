"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { authApi, siteSettingsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { data: siteSettings } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingsApi.get().then((r) => r.data),
    staleTime: 60_000,
  });

  const onSubmit = async (data: FormData) => {
    try {
      const response = await authApi.login(data.email, data.password);
      const { access_token, refresh_token, user } = response.data;
      setAuth(user, access_token, refresh_token);
      toast.success(`Bem-vindo, ${user.full_name}!`);
      router.push("/admin/dashboard");
    } catch {
      toast.error("E-mail ou senha incorretos");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 rounded-2xl bg-card border border-border shadow-2xl shadow-black/20">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {siteSettings?.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={siteSettings.company_logo_url}
              alt="Logo"
              className="mb-4 drop-shadow-lg max-h-20 w-auto object-contain"
            />
          ) : (
            <div className="mb-4">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl">
                SF
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-1">Midia Indoor Corporativa</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">E-mail</label>
            <input
              {...register("email")}
              type="email"
              placeholder="admin@signflow.com"
              autoComplete="email"
              className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Senha</label>
            <div className="relative">
              <input
                {...register("password")}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2 mt-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Entrar
          </button>
        </form>

        <div className="text-center text-xs text-muted-foreground/50 mt-6 space-y-0.5">
          <p>Desenvolvido pelo Prof. Weverton Everaldo Lubask</p>
          <p>SENAI SP - 2026</p>
        </div>
      </div>
    </div>
  );
}
