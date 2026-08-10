"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AtlasBadge, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import type { PipelineStageDefinition } from "@/lib/atlas/pipeline-stages";
import { supabase } from "@/lib/supabase";

type PipelineSettingsPayload = {
  ok?: boolean;
  data?: {
    stages?: PipelineStageDefinition[];
    fallback?: boolean;
    permissions?: { canEdit?: boolean };
    audited?: boolean;
  };
  error?: { message?: string };
};

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function PipelineSettingsPage() {
  const [stages, setStages] = useState<PipelineStageDefinition[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (method = "GET", body?: unknown) => {
    const token = await accessToken();
    if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
    const response = await fetch("/api/v1/pipeline/stages", {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json() as PipelineSettingsPayload;
    if (!response.ok || !payload.data?.stages) {
      throw new Error(
        payload.error?.message
        || "Não foi possível configurar as etapas agora.",
      );
    }
    return payload.data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request();
      setStages(data.stages ?? []);
      setCanEdit(data.permissions?.canEdit === true);
      setFallback(data.fallback === true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar as etapas.",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!canEdit || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await request("PUT", { stages });
      setStages(data.stages ?? []);
      setFallback(false);
      setMessage(
        "Etapas salvas, auditadas e aplicadas ao Kanban e ao forecast.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "A alteração não foi confirmada.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AtlasSkeleton className="h-96 w-full" />;

  return (
    <div
      className="mx-auto max-w-5xl space-y-6 pb-12"
      data-phase="31-stage-settings"
    >
      <header>
        <Link href="/pipeline" className="text-xs font-semibold text-sky-300">
          ← Voltar ao pipeline
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <AtlasBadge tone="info">FUNIL CANÔNICO</AtlasBadge>
          <AtlasBadge tone="success">ALTERAÇÃO AUDITADA</AtlasBadge>
          {fallback ? <AtlasBadge tone="warning">PADRÃO ATLAS</AtlasBadge> : null}
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-white">
          Etapas do funil
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Ajuste a apresentação e a previsão sem alterar as chaves que
          preservam relatórios, IA, histórico e integrações.
        </p>
      </header>

      {error
        ? (
          <AtlasRecoverableError
            description={error}
            onRetry={() => void load()}
            busy={saving}
          />
        )
        : null}
      {message
        ? (
          <div
            role="status"
            className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] p-4 text-sm text-emerald-100"
          >
            {message}
          </div>
        )
        : null}

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Contrato canônico v1"
          title="Rótulos, ordem, visibilidade e probabilidade"
          description={canEdit
            ? "A liderança pode personalizar. Toda alteração exige confirmação e registro."
            : "Seu perfil pode consultar esta configuração, mas não alterá-la."}
          action={<AtlasBadge tone="success">{stages.length} ETAPAS</AtlasBadge>}
        />
        <div className="space-y-3 p-5 sm:p-6">
          {stages.map((stage, index) => (
            <article
              key={stage.key}
              className="grid gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 md:grid-cols-[110px_1fr_110px_90px_100px] md:items-center"
            >
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  Chave fixa
                </span>
                <strong className="mt-1 block text-xs text-cyan-200">
                  {stage.key}
                </strong>
              </div>
              <input
                aria-label={`Rótulo de ${stage.key}`}
                disabled={!canEdit || saving}
                maxLength={40}
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50"
                value={stage.label}
                onChange={(event) =>
                  setStages((current) =>
                    current.map((item, position) =>
                      position === index
                        ? { ...item, label: event.target.value }
                        : item
                    )
                  )}
              />
              <label className="text-xs text-slate-400">
                Probabilidade
                <input
                  aria-label={`Probabilidade de ${stage.key}`}
                  disabled={!canEdit || saving}
                  type="number"
                  min="0"
                  max="100"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
                  value={stage.probability}
                  onChange={(event) =>
                    setStages((current) =>
                      current.map((item, position) =>
                        position === index
                          ? { ...item, probability: Number(event.target.value) }
                          : item
                      )
                    )}
                />
              </label>
              <label className="text-xs text-slate-400">
                Ordem
                <input
                  aria-label={`Ordem de ${stage.key}`}
                  disabled={!canEdit || saving}
                  type="number"
                  min="1"
                  max="999"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
                  value={stage.position}
                  onChange={(event) =>
                    setStages((current) =>
                      current.map((item, position) =>
                        position === index
                          ? { ...item, position: Number(event.target.value) }
                          : item
                      )
                    )}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  disabled={!canEdit || saving}
                  checked={stage.visible}
                  onChange={(event) =>
                    setStages((current) =>
                      current.map((item, position) =>
                        position === index
                          ? { ...item, visible: event.target.checked }
                          : item
                      )
                    )}
                />
                No Kanban
              </label>
            </article>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-white/[.06] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
            A probabilidade alimenta o forecast, não garante venda. Ganhos,
            perdas e compras externas conservam significado fixo.
          </p>
          <button
            type="button"
            disabled={saving || !canEdit || stages.length === 0}
            onClick={() => void save()}
            className="atlas-button-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Salvando com auditoria..." : "Confirmar configuração"}
          </button>
        </div>
      </AtlasCard>
    </div>
  );
}
