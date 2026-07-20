"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";

type Approval = { id: string; request_type: string; entity_type: string; status: string; decision_reason: string | null; expires_at: string | null; created_at: string; leadName: string; brokerName: string; channel: string; preview: string };

/*
 * CC-6 · Aprovações — consolidação do redesign: cada item tinha três vozes de
 * estado (eyebrow âmbar, pill cinza com o status cru e botões), e o textarea de
 * motivo ficava desabilitado ocupando espaço em itens já decididos. Agora o
 * estado é um único par badge + banda lateral por item, o motivo registrado
 * substitui o formulário após a decisão e a expiração aparece quando existe.
 * Fila, decisão e regras de rejeição preservadas — nada é enviado sem clique
 * humano.
 */

const STATUS_META: Record<string, { tone: "warning" | "success" | "danger" | "neutral"; label: string; sev: string | null }> = {
  pending: { tone: "warning", label: "Pendente", sev: "#f5b544" },
  approved: { tone: "success", label: "Aprovada", sev: "#34d399" },
  rejected: { tone: "danger", label: "Rejeitada", sev: "#fb7185" },
  expired: { tone: "neutral", label: "Expirada", sev: null },
};

const WHEN_FORMAT = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load() {
    const session = await supabase.auth.getSession();
    const response = await fetch("/api/v2/approvals", { headers: { Authorization: `Bearer ${session.data.session?.access_token || ""}` }, cache: "no-store" });
    const body = await response.json();
    if (response.ok) { setItems(body.data.items); setError(""); } else setError(body.error?.message || "Não foi possível carregar aprovações.");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function decide(id: string, status: "approved" | "rejected") {
    setBusy(id);
    const session = await supabase.auth.getSession();
    const response = await fetch(`/api/v2/approvals/${id}`, { method: "POST", headers: { Authorization: `Bearer ${session.data.session?.access_token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ decision: status, reason: reasons[id] || "" }) });
    const body = await response.json();
    if (!response.ok) setError(body.error || "Não foi possível decidir esta aprovação.");
    await load();
    setBusy(null);
  }

  const pendingCount = items.filter((item) => item.status === "pending").length;

  return (
    <div className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Fase 47 · Revisão humana"
        title="Aprovações comerciais"
        description="Mensagens e propostas aguardam decisão humana na mesma fila — propostas só avançam após reconfirmar preço, estoque e regra de pagamento."
      />

      {error ? (
        <p
          role="status"
          className="cc6-sev-band cc6-panel-quiet cc6-reveal py-3 pl-5 pr-4 text-sm text-[#fb7185]"
          style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Fila de aprovações" className="cc6-panel cc6-reveal overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 pb-4">
          <p className="cc6-eyebrow">Fila governada</p>
          <p className="cc6-num text-[11px] text-[#6b7890]" aria-live="polite">
            {loading ? "carregando…" : `${pendingCount} ${pendingCount === 1 ? "pendente" : "pendentes"} · ${items.length} no total`}
          </p>
        </div>

        {loading ? (
          <p className="cc6-hairline px-5 py-8 text-center text-sm text-[#6b7890]" aria-busy="true">
            Carregando fila de aprovações…
          </p>
        ) : null}

        {!loading && items.length === 0 ? (
          <p className="cc6-hairline px-5 py-8 text-center text-sm text-[#6b7890]">
            Nenhuma aprovação pendente ou histórica.
          </p>
        ) : null}

        {items.map((item) => {
          const meta = STATUS_META[item.status] ?? { tone: "neutral" as const, label: item.status, sev: null };
          const pending = item.status === "pending";
          return (
            <article
              key={item.id}
              className={`cc6-hairline grid gap-4 px-5 py-4 lg:grid-cols-[1fr_.8fr] lg:items-start ${meta.sev ? "cc6-sev-band" : ""}`}
              style={meta.sev ? ({ "--cc6-sev": meta.sev } as CSSProperties) : undefined}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  <span className="cc6-chip">{item.channel} · {item.request_type}</span>
                </div>
                <h2 className="mt-2 text-base font-semibold tracking-tight text-[#e8eef8]">{item.leadName}</h2>
                <p className="cc6-num mt-1 text-[11px] text-[#6b7890]">
                  Corretor: {item.brokerName} · {WHEN_FORMAT.format(new Date(item.created_at))}
                  {pending && item.expires_at ? ` · expira ${WHEN_FORMAT.format(new Date(item.expires_at))}` : ""}
                </p>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#aab6ca]">{item.preview}</p>
              </div>

              <div className="space-y-3">
                {pending ? (
                  <>
                    <textarea
                      value={reasons[item.id] || ""}
                      onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Motivo obrigatório para rejeitar"
                      aria-label={`Motivo da decisão para ${item.leadName}`}
                      className="min-h-20 w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] p-3 text-sm text-[#e8eef8] outline-none transition-colors focus:border-[color:var(--atlas-accent)]"
                      maxLength={500}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        disabled={busy === item.id || (reasons[item.id] || "").trim().length < 5}
                        onClick={() => decide(item.id, "rejected")}
                        className="cc6-ghost-btn disabled:opacity-40"
                      >
                        Rejeitar
                      </button>
                      <button
                        disabled={busy === item.id}
                        onClick={() => decide(item.id, "approved")}
                        className="atlas-button-primary px-4 py-2 text-xs disabled:opacity-40"
                      >
                        {item.entity_type === "commercial_simulation" ? "Aprovar proposta" : "Aprovar e enfileirar"}
                      </button>
                    </div>
                  </>
                ) : item.decision_reason ? (
                  <div className="cc6-panel-quiet p-3">
                    <p className="cc6-eyebrow text-[10px]!">Motivo registrado</p>
                    <p className="mt-1 text-sm leading-6 text-[#aab6ca]">{item.decision_reason}</p>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}

        <p className="cc6-hairline px-5 py-3 text-[11px] leading-5 text-[#6b7890]">
          Nada é enviado ou executado sem aprovação humana registrada nesta fila.
        </p>
      </section>
    </div>
  );
}
