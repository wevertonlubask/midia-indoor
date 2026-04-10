"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, setAuth, accessToken, refreshToken } = useAuthStore();

  const [current, setCurrent]   = useState("");
  const [next, setNext]         = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]       = useState(false);

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: ({ data }) => {
      setAuth(data, accessToken!, refreshToken!);
      toast.success("Senha alterada com sucesso!");
      router.replace("/admin/dashboard");
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? "Erro ao alterar senha"),
  });

  const isValid =
    current.length >= 1 &&
    next.length >= 6 &&
    next === confirm &&
    next !== current;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-card rounded-2xl shadow-lg w-full max-w-md p-8 border border-border">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Alterar Senha</h1>
            <p className="text-sm text-muted-foreground">Você precisa criar uma nova senha antes de continuar.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Senha atual */}
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Senha atual</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm pr-10 bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="Mudar@123"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Nova senha */}
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Nova senha</label>
            <div className="relative">
              <input
                type={showNext ? "text" : "password"}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm pr-10 bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNext((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
              >
                {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirmar */}
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Confirmar nova senha</label>
            <input
              type="password"
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary ${
                confirm && next !== confirm ? "border-destructive bg-destructive/10" : "border-border"
              }`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
            />
            {confirm && next !== confirm && (
              <p className="text-xs text-destructive mt-1">As senhas não coincidem</p>
            )}
          </div>

          {next && next === current && (
            <p className="text-xs text-amber-600">A nova senha deve ser diferente da senha atual</p>
          )}
        </div>

        <button
          onClick={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
          className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Alterar senha e continuar
        </button>
      </div>
    </div>
  );
}
