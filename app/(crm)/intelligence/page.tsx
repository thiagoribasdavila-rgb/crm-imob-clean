"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { isMissingRelation, mapLegacyLead, mapLegacyTask } from "@/lib/compat/legacy-v2";

type Insight = {
  id: string;
  title: string;
  summary: string | null;
  recommendation: string | null;
  score: number | null;
  confidence: number | null;
  status: string;
  created_at: string;
};

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";
const date = (value: unknown) => { const parsed = new Date(text(value)); return Number.isNaN(parsed.getTime()) ? null : parsed; };

function localInsights(leads: Row[], tasks: Row[]): Insight[] {
  const now = Date.now();
  const active = leads.filter((lead) => !["ganho", "perdido", "arquivado", "comprou_outro"].includes(text(lead.status).toLowerCase()));
  const withoutContact = active.filter((lead) => !lead.last_interaction_at);
  const hot = active.filter((lead) => Number(lead.score || 0) >= 70 || ["quente", "hot"].includes(text(lead.temperature).toLowerCase()));
  const overdue = tasks.filter((task) => !["done", "concluido", "concluida", "completed", "cancelado"].includes(text(task.status).toLowerCase()) && Boolean(date(task.due_at) && date(task.due_at)!.getTime() < now));
  return [
    { id: "local-no-contact", title: `${withoutContact.length} leads sem contato registrado`, summary: "Carteira ativa sem interação identificada na base atual.", recommendation: withoutContact.length ? "Priorize primeiro contato e registre o resultado no Lead 360." : "A carteira ativa possui contato registrado.", score: withoutContact.length, confidence: 100, status: withoutContact.length ? "atenção" : "saudável", created_at: new Date(now).toISOString() },
    { id: "local-hot", title: `${hot.length} oportunidades quentes`, summary: "Leads com score igual ou superior a 70 ou temperatura quente.", recommendation: hot.length ? "Revise a próxima ação e o prazo de retorno dessas oportunidades." : "Continue qualificando para identificar intenção de compra.", score: hot.length, confidence: 100, status: hot.length ? "oportunidade" : "monitorando", created_at: new Date(now).toISOString() },
    { id: "local-overdue", title: `${overdue.length} tarefas atrasadas`, summary: "Compromissos abertos cujo prazo já venceu.", recommendation: overdue.length ? "Recupere os atrasos antes de iniciar ações de menor prioridade." : "A agenda comercial está em dia.", score: overdue.length, confidence: 100, status: overdue.length ? "atenção" : "saudável", created_at: new Date(now).toISOString() },
  ];
}

/*
 * CC-6 · Central de inteligência — consolidação do redesign: o grid antigo de
 * cards repetia o número do título no rodapé ("3 leads…" e depois "Score: 3"),
 * usava fúcsia fora da identidade para o status e escondia a recomendação num
 * bloco azul genérico. Agora cada sinal é uma linha com um único estado
 * semântico (badge + banda lateral), a recomendação fica em evidência e os
 * sinais determinísticos locais declaram origem em vez de fingir "confiança
 * 100". A garantia "sem decisão automática sobre pessoas" virou faixa "Seguro
 * por padrão". Fetch e fallback local preservados.
 */

const STATUS_META: Record<string, { tone: "warning" | "success" | "info" | "neutral"; sev: string | null }> = {
  "atenção": { tone: "warning", sev: "#f5b544" },
  "oportunidade": { tone: "info", sev: "var(--atlas-accent)" },
  "saudável": { tone: "success", sev: null },
  "monitorando": { tone: "neutral", sev: null },
  "ativo": { tone: "info", sev: "var(--atlas-accent)" },
};

export default function IntelligencePage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("ai_insights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error && isMissingRelation(error)) {
        const [leadResult, taskResult] = await Promise.all([
          supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(2000),
          supabase.from("tasks").select("*").limit(2000),
        ]);
        if (leadResult.error || taskResult.error) setError("Inteligência temporariamente indisponível. Tente novamente.");
        else setItems(localInsights(((leadResult.data ?? []) as Row[]).map(mapLegacyLead), ((taskResult.data ?? []) as Row[]).map(mapLegacyTask)));
      } else {
        if (error) setError("Módulo temporariamente indisponível. O Atlas registrou o problema.");
        setItems(((data ?? []) as Row[]).map((item) => ({ id: text(item.id), title: text(item.title || item.type) || "Insight operacional", summary: text(item.summary || item.content) || null, recommendation: text(item.recommendation) || null, score: Number.isFinite(Number(item.score)) ? Number(item.score) : null, confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null, status: text(item.status) || "ativo", created_at: text(item.created_at) || new Date().toISOString() })));
      }
      setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Inteligência · Sinais explicáveis"
        title="Central de inteligência"
        description="Sinais e recomendações explicáveis para a operação imobiliária."
      />

      {error ? (
        <div
          role="status"
          className="cc6-sev-band cc6-panel-quiet cc6-reveal flex flex-wrap items-center justify-between gap-3 py-3 pl-5 pr-4"
          style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
        >
          <span className="text-sm text-[#fb7185]">{error}</span>
          <button type="button" onClick={() => void load()} className="cc6-ghost-btn">
            Tentar novamente
          </button>
        </div>
      ) : null}

      <section aria-label="Sinais da operação">
        <TiltShell className="cc6-panel cc6-reveal overflow-hidden" delayMs={40}>
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 pb-4">
            <p className="cc6-eyebrow">Sinais da operação</p>
            <p className="cc6-num text-[11px] text-[#6b7890]" aria-live="polite">
              {loading ? "analisando…" : `${items.length} ${items.length === 1 ? "sinal" : "sinais"}`}
            </p>
          </div>

          {loading ? (
            <div className="cc6-hairline space-y-2 px-5 py-4" aria-busy="true">
              {[1, 2, 3].map((item) => (
                <AtlasSkeleton key={item} className="h-16" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="cc6-hairline px-5 py-8 text-center">
              <p className="text-sm font-medium text-[#e8eef8]">Nenhum sinal exige atenção agora</p>
              <p className="mt-1 text-sm text-[#6b7890]">
                A inteligência analisou os dados visíveis e continuará observando novos eventos.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const meta = STATUS_META[item.status.toLowerCase()] ?? { tone: "neutral" as const, sev: null };
              return (
                <article
                  key={item.id}
                  className={`cc6-hairline px-5 py-4 ${meta.sev ? "cc6-sev-band" : ""}`}
                  style={meta.sev ? ({ "--cc6-sev": meta.sev } as CSSProperties) : undefined}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <h2 className="min-w-0 text-base font-semibold tracking-tight text-[#e8eef8]">
                      {item.title}
                    </h2>
                    <StatusBadge tone={meta.tone}>{item.status}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#aab6ca]">
                    {item.summary || "Insight sem resumo."}
                  </p>
                  {item.recommendation ? (
                    <div className="mt-3">
                      <p className="cc6-eyebrow text-[10px]!">Recomendação</p>
                      <p className="mt-1 text-sm font-medium leading-6 text-[#e8eef8]">
                        {item.recommendation}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.id.startsWith("local-") ? (
                      <span className="cc6-chip">Regra local · dados visíveis</span>
                    ) : (
                      <>
                        {item.score != null ? <span className="cc6-chip">Score {item.score}</span> : null}
                        {item.confidence != null ? (
                          <span className="cc6-chip">Confiança {item.confidence}</span>
                        ) : null}
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </TiltShell>
      </section>

      <section
        aria-label="Garantias de segurança"
        className="cc6-panel-quiet cc6-reveal flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3"
        style={{ animationDelay: "120ms" }}
      >
        <StatusBadge tone="success">Seguro por padrão</StatusBadge>
        <p className="text-sm leading-6 text-[#aab6ca]">
          Nenhuma decisão automática sobre pessoas — os sinais explicam; a execução é sempre humana.
        </p>
      </section>
    </div>
  );
}
