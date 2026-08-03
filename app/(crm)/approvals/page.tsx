"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { ProntidaoParaPublicarPanel } from "@/components/atlas/ProntidaoParaPublicarPanel";

/**
 * O que ainda falta para a proposta ir ao ar — medido no plano que o aprovador
 * vai assinar (lib/marketing/pendencias-de-ativacao.ts). Só existe em propostas
 * de campanha Meta; nas demais chega `undefined` e nada é desenhado.
 */
type Ativacao = {
  situacao: "sem_pendencia" | "com_pendencia" | "nao_medido" | "nao_se_aplica";
  /** Artefatos que faltam: peça visual, Página, formulário. */
  pendencias: number;
  /** Problemas da própria peça (texto, política, público) — a Meta recusaria. */
  problemasDaPeca: number;
  podeAtivar: boolean;
  motivos: string[];
  frase: string;
  /** Já vem só com os reprovados — a Caixa mostra o que falta, não a régua inteira. */
  itens: Array<{ chave: string; rotulo: string; impede: string; detalhe: string; ondeResolver?: { rotulo: string; href: string } | null }>;
};

type Approval = { id: string; request_type: string; entity_type: string; status: string; decision_reason: string | null; expires_at: string | null; created_at: string; leadName: string; brokerName: string; channel: string; preview: string; ativacao?: Ativacao };

/**
 * A linha que impede a proposta sem peça visual de parecer pronta.
 *
 * As quatro situações são desenhadas com quatro vozes diferentes de propósito:
 * "não medido" NÃO pode sair verde (zero pendências numa leitura que não
 * aconteceu não é saúde), e "não se aplica" NÃO pode sair vermelho (cobrar peça
 * visual de uma proposta de pausar campanha seria inventar uma falta).
 */
function PendenciaDeAtivacao({ ativacao }: { ativacao: Ativacao }) {
  const cor =
    ativacao.situacao === "com_pendencia"
      ? "var(--atlas-estado-atencao)"
      : ativacao.situacao === "nao_medido"
        ? "var(--atlas-texto-fraco)"
        : ativacao.situacao === "sem_pendencia"
          ? "var(--atlas-estado-sucesso)"
          : "var(--atlas-texto-medio)";
  return (
    <div className="cc6-panel-quiet p-3">
      <p className="cc6-eyebrow text-micro!">Para ir ao ar</p>
      <p className="mt-1 text-rotulo leading-5" style={{ color: cor }}>
        {ativacao.frase}
      </p>
      {ativacao.itens.length ? (
        <ul className="mt-2 space-y-1">
          {ativacao.itens.map((item) => (
            <li key={item.chave} className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
              — {item.rotulo}
              {item.impede === "propor" ? " (a Meta recusaria a peça)" : ""}
              {item.ondeResolver ? (
                <>
                  {" · "}
                  <a className="underline" href={item.ondeResolver.href}>{item.ondeResolver.rotulo}</a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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
          className="cc6-sev-band cc6-panel-quiet cc6-reveal py-3 pl-5 pr-4 text-sm text-[var(--atlas-estado-perigo)]"
          style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
        >
          {error}
        </p>
      ) : null}

      {/* Aprovar uma proposta de campanha é o ato que autoriza gasto — e é aqui,
          ANTES do clique, que o dono precisa saber que a conta da proposta pode
          não ser alcançável, que a Página dos anúncios pode não estar cadastrada
          e que o CRM pode não ter a peça. Descobrir isso depois do "Aprovar"
          significa descobrir na falha da execução, com a verba já comprometida. */}
      <ProntidaoParaPublicarPanel titulo="ANTES DE APROVAR CAMPANHA" />

      <section aria-label="Fila de aprovações" className="cc6-panel cc6-reveal overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 pb-4">
          <p className="cc6-eyebrow">Fila governada</p>
          <p className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]" aria-live="polite">
            {loading ? "carregando…" : `${pendingCount} ${pendingCount === 1 ? "pendente" : "pendentes"} · ${items.length} no total`}
          </p>
        </div>

        {loading ? (
          <p className="cc6-hairline px-5 py-8 text-center text-sm text-[var(--atlas-texto-fraco)]" aria-busy="true">
            Carregando fila de aprovações…
          </p>
        ) : null}

        {!loading && items.length === 0 ? (
          <p className="cc6-hairline px-5 py-8 text-center text-sm text-[var(--atlas-texto-fraco)]">
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
                <h2 className="mt-2 text-base font-semibold tracking-tight text-[var(--atlas-texto-forte)]">{item.leadName}</h2>
                <p className="cc6-num mt-1 text-rotulo text-[var(--atlas-texto-fraco)]">
                  Corretor: {item.brokerName} · {WHEN_FORMAT.format(new Date(item.created_at))}
                  {pending && item.expires_at ? ` · expira ${WHEN_FORMAT.format(new Date(item.expires_at))}` : ""}
                </p>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--atlas-texto-medio)]">{item.preview}</p>
              </div>

              <div className="space-y-3">
                {item.ativacao ? <PendenciaDeAtivacao ativacao={item.ativacao} /> : null}
                {pending ? (
                  <>
                    <textarea
                      value={reasons[item.id] || ""}
                      onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Motivo obrigatório para rejeitar"
                      aria-label={`Motivo da decisão para ${item.leadName}`}
                      className="min-h-20 w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] p-3 text-sm text-[var(--atlas-texto-forte)] outline-none transition-colors focus:border-[color:var(--atlas-accent)]"
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
                        {/* O rótulo diz o que o clique FAZ. Uma decisão de stop
                            loss chega como `meta_campaign` por ser de escopo
                            org, mas "Aprovar campanha" prometia a coisa errada:
                            não há campanha para aprovar, há corte de verba para
                            autorizar — e a mudança na Meta é passo à parte. */}
                        {item.entity_type === "commercial_simulation"
                          ? "Aprovar proposta"
                          : item.channel === "stop_loss"
                            ? "Autorizar decisão"
                            : item.entity_type === "meta_campaign"
                              ? "Aprovar campanha"
                              : "Aprovar e enfileirar"}
                      </button>
                    </div>
                  </>
                ) : item.decision_reason ? (
                  <div className="cc6-panel-quiet p-3">
                    <p className="cc6-eyebrow text-micro!">Motivo registrado</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--atlas-texto-medio)]">{item.decision_reason}</p>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}

        <p className="cc6-hairline px-5 py-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
          Nada é enviado ou executado sem aprovação humana registrada nesta fila.
        </p>
      </section>
    </div>
  );
}
