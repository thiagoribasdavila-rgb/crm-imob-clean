"use client";

/**
 * Painel de APROVAÇÃO 1-clique das campanhas Meta prontas (Arvo/Spin).
 *
 * Fecha o elo que faltava na UI: a viewing/approve de campanhas já vive em
 * /approvals, mas nada SUBMETIA as campanhas prontas. Aqui a liderança revisa e
 * envia cada uma para a Caixa de Aprovações com um clique (POST /proposals,
 * kind:create). Depois aprova em /approvals; a ATIVAÇÃO (que gasta) segue exigindo
 * Página + formulário + mídia — mostrados honestamente como pendências.
 *
 * Autocontido, fetch próprio, degrade honesto. Nada aqui toca a Meta.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type ExecutionStep = { kind: string; [k: string]: unknown };
type ReadyCampaign = {
  id: string;
  product: string;
  title: string;
  persona: string;
  dailyBrl: number;
  adCount: number;
  angles: string[];
  accountId: string;
  steps: ExecutionStep[];
  pageId: string | null;
  leadFormId: string | null;
  missingToActivate: string[];
};
type ProposalItem = { id: string; status: string; kind: string; title: string; note: string; expiresAt: string | null };

type PanelState =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "ready"; campaigns: ReadyCampaign[]; proposals: ProposalItem[]; readyToActivate: boolean };

const STATUS_TONE: Record<string, string> = {
  pending: "border-[rgba(251,191,36,0.4)] text-[#fbbf24]",
  approved: "border-[rgba(52,211,153,0.4)] text-[#34d399]",
  rejected: "border-[rgba(251,113,133,0.4)] text-[#fb7185]",
  expired: "border-[rgba(148,163,184,0.3)] text-[#8b97ab]",
};

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export function CampaignApprovalsPanel() {
  const [state, setState] = useState<PanelState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [flash, setFlash] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      if (!headers) {
        setState({ kind: "unavailable", reason: "Sessão necessária." });
        return;
      }
      const [readyRes, propRes] = await Promise.all([
        fetch("/api/v1/marketing/ready-campaigns", { headers, cache: "no-store" }),
        fetch("/api/v1/marketing/proposals", { headers, cache: "no-store" }),
      ]);
      const readyBody = (await readyRes.json().catch(() => null)) as
        | { ok?: boolean; data?: { campaigns?: ReadyCampaign[]; readyToActivate?: boolean }; error?: { message?: string } }
        | null;
      if (!readyRes.ok || !readyBody?.ok || !readyBody.data) {
        setState({ kind: "unavailable", reason: readyBody?.error?.message ?? "Campanhas prontas indisponíveis." });
        return;
      }
      const propBody = (await propRes.json().catch(() => null)) as
        | { ok?: boolean; data?: { items?: ProposalItem[] } }
        | null;
      setState({
        kind: "ready",
        campaigns: readyBody.data.campaigns ?? [],
        proposals: propRes.ok && propBody?.ok && propBody.data ? propBody.data.items ?? [] : [],
        readyToActivate: Boolean(readyBody.data.readyToActivate),
      });
    } catch {
      setState({ kind: "unavailable", reason: "Falha ao carregar." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (c: ReadyCampaign) => {
      setSubmitting(c.id);
      setFlash("");
      try {
        const headers = await authHeaders();
        if (!headers) {
          setFlash("Sessão necessária.");
          return;
        }
        const res = await fetch("/api/v1/marketing/proposals", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "create",
            title: c.title,
            payload: { accountId: c.accountId, steps: c.steps, pageId: c.pageId, leadFormId: c.leadFormId },
          }),
        });
        const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
        setFlash(res.ok && body?.ok ? `✓ ${c.product} enviada para a Caixa de Aprovações.` : `Não enviada: ${body?.error?.message ?? "erro"}`);
        if (res.ok && body?.ok) void load();
      } catch {
        setFlash("Falha ao enviar a proposta.");
      } finally {
        setSubmitting(null);
      }
    },
    [load],
  );

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow="◇ Governança · campanhas Meta"
        title="Aprovar campanhas (Arvo · Spin)"
        description="Revise e envie cada campanha para a Caixa com um clique. Tudo nasce PAUSED; ativar (que gasta) exige aprovação + Página, formulário e mídia."
        action={
          <Link
            href="/approvals"
            className="rounded-[8px] border border-[rgba(148,163,184,0.18)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b97ab] transition-colors hover:border-[rgba(75,141,248,0.5)] hover:text-[#4b8df8]"
          >
            Caixa de Aprovações →
          </Link>
        }
      />
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        {state.kind === "loading" ? (
          <div className="h-24 animate-pulse rounded-[12px] bg-[rgba(148,163,184,0.06)]" aria-hidden="true" />
        ) : state.kind === "unavailable" ? (
          <p className="text-sm leading-6 text-[#8b97ab]">{state.reason} As campanhas continuam disponíveis nas propostas revisáveis.</p>
        ) : (
          <>
            {flash ? <p className="rounded-[10px] border border-[rgba(148,163,184,0.14)] bg-[rgba(148,163,184,0.04)] px-3 py-2 text-sm text-[#c3ccdb]">{flash}</p> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {state.campaigns.map((c) => (
                <div key={c.id} className="flex flex-col gap-3 rounded-[12px] border border-[rgba(148,163,184,0.1)] bg-[rgba(148,163,184,0.03)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#e8eef8]">{c.product}</p>
                      <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#78a6f9]">persona: {c.persona}</p>
                    </div>
                    <span className="shrink-0 font-mono text-sm text-[#aab6ca] [font-variant-numeric:tabular-nums]">R$ {c.dailyBrl}/dia</span>
                  </div>
                  <p className="text-xs leading-5 text-[#8b97ab]">
                    {c.adCount} anúncios · ângulos: {c.angles.join(", ")}
                  </p>
                  {c.missingToActivate.length ? (
                    <p className="text-[11px] leading-4 text-[#c98a2b]">Para ativar falta: {c.missingToActivate.join("; ")}.</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={submitting === c.id}
                    onClick={() => void submit(c)}
                    className="mt-auto rounded-[8px] border border-[rgba(75,141,248,0.4)] px-3 py-2 text-sm font-medium text-[#78a6f9] transition-colors hover:bg-[rgba(75,141,248,0.1)] disabled:opacity-50"
                  >
                    {submitting === c.id ? "Enviando…" : "Enviar para aprovação"}
                  </button>
                </div>
              ))}
            </div>

            {state.proposals.length ? (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6b7890]">Fila de aprovação</p>
                <ul className="flex flex-col gap-1.5">
                  {state.proposals.slice(0, 6).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-[rgba(148,163,184,0.08)] px-3 py-2">
                      <span className="min-w-0 truncate text-sm text-[#c3ccdb]">{p.title} <span className="text-[#6b7890]">· {p.kind}</span></span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${STATUS_TONE[p.status] ?? STATUS_TONE.expired}`}>{p.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AtlasCard>
  );
}
