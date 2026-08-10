"use client";

import { useCallback, useEffect, useState } from "react";
import { AtlasBadge, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Organization = {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
  active: boolean;
};

type SettingsPayload = {
  ok?: boolean;
  data?: {
    organization?: Organization;
    permissions?: { canEdit?: boolean };
  };
  error?: { message?: string };
};

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function SettingsPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const accessToken = await token();
      if (!accessToken) {
        setError("Sua sessão expirou. Entre novamente para revisar as configurações.");
        return;
      }
      const response = await fetch("/api/v1/settings/organization", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = await response.json() as SettingsPayload;
      if (!response.ok || !payload.data?.organization) {
        setError(payload.error?.message || "Não foi possível carregar as configurações.");
        return;
      }
      const current = payload.data.organization;
      setOrganization(current);
      setName(current.name);
      setSlug(current.slug || "");
      setCanEdit(payload.data.permissions?.canEdit === true);
    } catch {
      setError("As configurações não responderam. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!organization || !canEdit || name.trim().length < 2) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const accessToken = await token();
      if (!accessToken) {
        setError("Sua sessão expirou. Entre novamente antes de salvar.");
        return;
      }
      const response = await fetch("/api/v1/settings/organization", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });
      const payload = await response.json() as SettingsPayload;
      if (!response.ok || !payload.data?.organization) {
        setError(payload.error?.message || "Não foi possível salvar as configurações.");
        return;
      }
      const current = payload.data.organization;
      setOrganization(current);
      setName(current.name);
      setSlug(current.slug || "");
      setMessage("Identidade atualizada e registrada na auditoria.");
    } catch {
      setError("A alteração não foi confirmada. Nenhum resultado foi assumido.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 pb-10">
        <AtlasSkeleton className="h-44 w-full" />
        <AtlasSkeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10" data-settings-surface="governed-organization">
      <header className="atlas-grid-glow rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.07] to-violet-500/[.1] p-6 sm:p-8">
        <div className="flex flex-wrap gap-2">
          <AtlasBadge tone="info">TENANT PROTEGIDO</AtlasBadge>
          <AtlasBadge tone="success">AUDITORIA OBRIGATÓRIA</AtlasBadge>
          <AtlasBadge tone="violet">APROVAÇÃO HUMANA</AtlasBadge>
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Configurações da operação.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Identidade, governança e políticas que mantêm cada organização isolada. Alterações críticas passam pelo servidor e só permanecem quando a auditoria é registrada.</p>
      </header>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={saving} /> : null}
      {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] p-4 text-sm text-emerald-100" role="status">{message}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Identidade da organização"
            title="Uma fonte oficial para toda a operação"
            description={canEdit ? "A administração e a diretoria podem alterar estes dados." : "Seu perfil pode consultar, mas não alterar estes dados."}
            action={<AtlasBadge tone={organization?.active ? "success" : "neutral"}>{organization?.active ? "ATIVA" : "INDISPONÍVEL"}</AtlasBadge>}
          />
          <div className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
            <label className="block text-sm text-slate-400">
              Nome da empresa
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit || saving}
                maxLength={120}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:opacity-55"
              />
            </label>
            <label className="block text-sm text-slate-400">
              Identificador
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                disabled={!canEdit || saving}
                maxLength={80}
                placeholder="minha-organizacao"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-700 focus:border-cyan-400 disabled:opacity-55"
              />
              <span className="mt-2 block text-[11px] text-slate-600">Use letras minúsculas, números e hífens.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Plano</p>
                <p className="mt-2 font-semibold capitalize text-white">{organization?.plan || "Não informado"}</p>
              </div>
              <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Escopo</p>
                <p className="mt-2 font-semibold text-white">Organização atual</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !organization || !canEdit || name.trim().length < 2}
              className="atlas-button-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Validando e salvando…" : "Salvar com auditoria"}
            </button>
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Decisões protegidas"
            title="Aprovação humana permanece obrigatória"
            description="A IA recomenda e prepara; a pessoa autorizada decide."
          />
          <div className="space-y-3 p-5 pt-0 sm:p-6 sm:pt-0">
            {[
              "Publicação de campanhas",
              "Disparos em massa",
              "Alterações financeiras",
              "Exclusão de dados",
              "Ações autônomas de agentes",
            ].map((item) => (
              <div key={item} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <span className="text-sm text-slate-200">{item}</span>
                <AtlasBadge tone="success">OBRIGATÓRIA</AtlasBadge>
              </div>
            ))}
          </div>
        </AtlasCard>
      </section>
    </div>
  );
}
