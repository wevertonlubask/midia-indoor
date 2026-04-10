"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, KeyRound, Loader2, ShieldCheck, Users } from "lucide-react";
import { usersApi, type User } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Select } from "@/components/ui/select";

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: { label: "Super Admin", color: "bg-destructive/10 text-destructive" },
  ADMIN:       { label: "Admin",       color: "bg-violet-600/10 text-violet-400" },
  OPERATOR:    { label: "Operador",    color: "bg-primary/10 text-primary" },
};

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
      {name?.[0]?.toUpperCase() ?? "U"}
    </div>
  );
}

// ── Modal criar/editar usuário ─────────────────────────────────────────────────
function UserModal({
  editUser,
  currentUserRole,
  onClose,
}: {
  editUser: User | null;
  currentUserRole: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(editUser?.full_name ?? "");
  const [email, setEmail]       = useState(editUser?.email ?? "");
  const [role, setRole]         = useState(editUser?.role ?? "OPERATOR");
  const [isActive, setIsActive] = useState(editUser?.is_active ?? true);

  const allowedRoles =
    currentUserRole === "SUPER_ADMIN"
      ? ["SUPER_ADMIN", "ADMIN", "OPERATOR"]
      : ["OPERATOR"];

  const createMutation = useMutation({
    mutationFn: () => usersApi.create({ email, full_name: fullName, role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Usuário criado!"); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? "Erro ao criar"),
  });

  const updateMutation = useMutation({
    mutationFn: () => usersApi.update(editUser!.id, { full_name: fullName, role, is_active: isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Usuário atualizado!"); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? "Erro ao atualizar"),
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 border border-border" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-5">{editUser ? "Editar Usuário" : "Novo Usuário"}</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Nome completo</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do usuário"
            />
          </div>

          {!editUser && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">E-mail</label>
                <input
                  type="email"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="flex items-start gap-2 p-3 bg-warning/10 border border-amber-200 rounded-lg text-xs text-amber-700">
                <span>🔑</span>
                <span>Senha padrão: <strong>Mudar@123</strong> — o usuário deverá alterá-la no primeiro acesso.</span>
              </div>
            </>
          )}

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Papel</label>
            <Select
              className="w-full"
              value={role}
              onChange={(v) => setRole(v as "SUPER_ADMIN" | "ADMIN" | "OPERATOR")}
              options={allowedRoles.map((r) => ({ value: r, label: ROLE_LABEL[r]?.label ?? r }))}
            />
          </div>

          {editUser && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-foreground">Usuário ativo</span>
            </label>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => editUser ? updateMutation.mutate() : createMutation.mutate()}
            disabled={isLoading || !fullName || (!editUser && !email)}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {editUser ? "Salvar" : "Criar usuário"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal redefinir senha ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => usersApi.resetPassword(user.id, password),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Senha redefinida!"); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? "Erro ao redefinir senha"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-6 border border-border" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Redefinir Senha</h2>
        <p className="text-sm text-muted-foreground mb-5">Usuário: <strong>{user.full_name}</strong></p>
        <input
          type="password"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nova senha (mín. 6 caracteres)"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || password.length < 6}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Redefinir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser]     = useState<User | null>(null);
  const [resetUser, setResetUser]   = useState<User | null>(null);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isAdmin      = currentUser?.role === "ADMIN" || isSuperAdmin;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list().then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Usuário removido"); },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? "Erro ao remover"),
  });

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/70">
        <ShieldCheck className="w-12 h-12" />
        <p className="text-lg font-medium">Acesso restrito</p>
        <p className="text-sm">Apenas administradores podem gerenciar usuários.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Usuários</h1>
            <p className="text-sm text-muted-foreground">{users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition"
        >
          <Plus className="w-4 h-4" />
          Novo usuário
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">E-mail</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Papel</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Cadastrado em</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const roleInfo = ROLE_LABEL[u.role] ?? { label: u.role, color: "bg-muted text-muted-foreground" };
                const canEdit = isSuperAdmin || (isAdmin && u.role !== "SUPER_ADMIN");
                const isSelf  = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="hover:bg-muted transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.full_name} />
                        <span className="font-medium text-foreground">{u.full_name}</span>
                        {isSelf && <span className="text-xs text-muted-foreground/70">(você)</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {u.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <>
                            <button
                              onClick={() => setEditUser(u)}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setResetUser(u)}
                              className="p-1.5 rounded-lg hover:bg-warning/10 text-muted-foreground hover:text-amber-600 transition"
                              title="Redefinir senha"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {isSuperAdmin && !isSelf && (
                          <button
                            onClick={() => {
                              if (confirm(`Remover o usuário "${u.full_name}"?`)) deleteMutation.mutate(u.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                            title="Remover"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modais */}
      {(showCreate || editUser) && (
        <UserModal
          editUser={editUser}
          currentUserRole={currentUser?.role ?? "OPERATOR"}
          onClose={() => { setShowCreate(false); setEditUser(null); }}
        />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  );
}
