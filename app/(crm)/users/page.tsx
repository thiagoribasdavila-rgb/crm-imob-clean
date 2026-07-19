"use client";

import { useEffect, useState } from "react";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  access_role: "admin" | "director_decisor" | "director" | "broker";
  commercial_role: string | null;
  active: boolean;
  organization_id: string | null;
  created_at: string;
};

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  director_decisor: "Diretor decisor",
  director: "Diretor comercial",
  broker: "Corretor",
};

async function readApiResponse(response: Response) {
  const payload = await response.json().catch(() => null) as { data?: { profiles?: Profile[] }; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Não foi possível concluir esta operação.");
  return payload;
}

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/v1/admin/users", { cache: "no-store" });
      const payload = await readApiResponse(response).catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os acessos.");
        return null;
      });
      if (!active) return;
      setProfiles(payload?.data?.profiles ?? []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  async function toggleActive(profile: Profile) {
    const next = !profile.active;
    setProfiles(current => current.map(item => item.id === profile.id ? { ...item, active: next } : item));
    const response = await fetch("/api/v1/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, active: next }) });
    try {
      await readApiResponse(response);
    } catch (cause) {
      setProfiles(current => current.map(item => item.id === profile.id ? profile : item));
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar este acesso.");
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Governança</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Usuários e permissões</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Controle administrativo dos acessos oficiais. A hierarquia comercial é administrada na área de Equipe.</p>
      </header>

      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-sm text-zinc-400">Usuários</p><p className="mt-3 text-3xl font-black">{loading ? "—" : profiles.length}</p></article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-sm text-zinc-400">Ativos</p><p className="mt-3 text-3xl font-black">{loading ? "—" : profiles.filter(p => p.active).length}</p></article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-sm text-zinc-400">Liderança</p><p className="mt-3 text-3xl font-black">{loading ? "—" : profiles.filter(p => p.access_role !== "broker").length}</p></article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-500"><tr>{["Usuário","Telefone","Papel","Status","Ação"].map(h => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-800">
            {!loading && profiles.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500">Nenhum perfil encontrado.</td></tr> : null}
            {profiles.map(profile => <tr key={profile.id} className="text-zinc-300">
              <td className="px-5 py-4 font-semibold text-white">{profile.full_name || "Usuário sem nome"}</td>
              <td className="px-5 py-4">{profile.phone || "—"}</td>
              <td className="px-5 py-4">{roleLabel[profile.access_role] || profile.access_role}</td>
              <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${profile.active ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>{profile.active ? "Ativo" : "Inativo"}</span></td>
              <td className="px-5 py-4"><button onClick={() => toggleActive(profile)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold hover:bg-zinc-800">{profile.active ? "Desativar" : "Ativar"}</button></td>
            </tr>)}
          </tbody>
        </table>
      </section>
    </div>
  );
}
