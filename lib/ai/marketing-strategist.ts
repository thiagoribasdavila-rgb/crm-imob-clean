/**
 * IA de Marketing — foco único em EFICIÊNCIA.
 *
 * Núcleo determinístico: a partir do relatório de custo (verba por produto +
 * agregados), decide onde escalar, pausar, revisar e REALOCAR verba — sempre
 * como PROPOSTA (nada executa sozinho; vai à Caixa de Aprovações). A narração
 * via LLM é opcional e vem por cima deste plano. Complementa a IA geral
 * (commercial-orchestrator), que cuida do resto da operação.
 */

import type { BudgetLine, CostBucket } from "@/lib/marketing/cost-report";

export type MarketingMove = {
  kind: "escalar" | "pausar" | "revisar" | "definir_meta" | "realocar" | "manter";
  scope: "produto" | "campanha";
  target: string;
  reason: string;
  amount?: number;   // R$/semana sugerido (escalar/realocar)
  from?: string;     // realocar: produto de origem
  to?: string;       // realocar: produto de destino
  priority: number;  // 1 (baixa) .. 5 (alta)
};

export type MarketingPlan = {
  moves: MarketingMove[];
  summary: {
    desperdicioSemanal: number;   // gasto em produtos/campanhas caros ou sem venda
    economiaPotencial: number;    // verba liberada por pausas
    produtosEficientes: number;
    produtosCaros: number;
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export type PlanOptions = {
  /** false quando a fonte não tem venda (ex.: meta_live — venda só existe no CRM).
   *  Nesse caso a IA julga campanhas por CPL, nunca por "0 vendas". */
  salesKnown?: boolean;
};

/** Plano de eficiência: escalar o que rende, cortar o que não, realocar a sobra. */
export function marketingEfficiencyPlan(budget: BudgetLine[], campaigns: CostBucket[] = [], opts: PlanOptions = {}): MarketingPlan {
  const salesKnown = opts.salesKnown !== false;
  const moves: MarketingMove[] = [];
  let desperdicio = 0;
  let liberada = 0;
  let eficientes = 0;
  let caros = 0;

  // candidatos a RECEBER realocação (eficientes com folga de verba)
  const receptores: Array<{ product: string; headroom: number }> = [];

  for (const l of budget) {
    if (l.verdict === "eficiente") eficientes += 1;
    if (l.verdict === "caro") caros += 1;

    if (l.verdict === "caro" && l.pacing === "estourou") {
      moves.push({ kind: "pausar", scope: "produto", target: l.product, priority: 5,
        reason: `CAC ${l.cac} acima da meta ${l.targetCac} e verba estourada (${l.pctUsed}%). Pausar e revisar antes de retomar.` });
      desperdicio += l.spent; liberada += l.spent;
    } else if (l.verdict === "caro") {
      moves.push({ kind: "revisar", scope: "produto", target: l.product, priority: 4,
        reason: `CAC ${l.cac} acima da meta ${l.targetCac}. Revisar criativo/público antes de escalar.` });
      desperdicio += l.spent;
    } else if (l.verdict === "eficiente" && (l.pacing === "abaixo" || l.pacing === "no_ritmo")) {
      const bump = r2(Math.max(l.remaining, l.weeklyBudget * 0.3));
      moves.push({ kind: "escalar", scope: "produto", target: l.product, amount: bump, priority: 4,
        reason: `CAC ${l.cac} dentro da meta e verba com folga (${l.pctUsed}% usado). Escalar +R$ ${bump}/semana.` });
      if (l.remaining > 0) receptores.push({ product: l.product, headroom: l.remaining });
    } else if (l.verdict === "sem_dados" && l.targetCac == null) {
      moves.push({ kind: "definir_meta", scope: "produto", target: l.product, priority: 3,
        reason: "Sem CAC-alvo definido — defina a meta para o motor avaliar eficiência." });
    } else {
      moves.push({ kind: "manter", scope: "produto", target: l.product, priority: 2,
        reason: "Rodando dentro do esperado — manter e coletar mais dados." });
    }
  }

  // REALOCAR a verba liberada para o melhor receptor eficiente
  if (liberada > 0 && receptores.length) {
    const best = receptores.sort((a, b) => b.headroom - a.headroom)[0];
    const paused = moves.find((m) => m.kind === "pausar");
    const amount = r2(Math.min(liberada, best.headroom || liberada));
    moves.push({ kind: "realocar", scope: "produto", target: best.product, amount,
      from: paused?.target, to: best.product, priority: 5,
      reason: `Mover R$ ${amount}/semana do que não rende para ${best.product}, que converte dentro da meta.` });
  }

  // CAMPANHAS que queimam verba sem vender (só quando a fonte TEM venda)
  if (salesKnown) {
    for (const c of campaigns) {
      if (c.spend >= 300 && c.sales === 0 && c.cac === null) {
        moves.push({ kind: "pausar", scope: "campanha", target: c.label, priority: 5,
          reason: `R$ ${c.spend} gastos, 0 vendas. Pausar e diagnosticar (criativo/público/oferta).` });
        desperdicio += c.spend;
      }
    }
  } else {
    // Venda desconhecida (fonte meta_live) — julgar por CPL, nunca por "0 vendas".
    const cpls = campaigns.filter((c) => c.leads > 0 && c.cpl != null).map((c) => c.cpl as number).sort((a, b) => a - b);
    const medianCpl = cpls.length ? cpls[Math.floor(cpls.length / 2)] : null;
    for (const c of campaigns) {
      if (c.spend >= 300 && c.leads === 0) {
        moves.push({ kind: "pausar", scope: "campanha", target: c.label, priority: 5,
          reason: `R$ ${c.spend} gastos e 0 leads. Pausar e diagnosticar (criativo/público/oferta).` });
        desperdicio += c.spend;
      } else if (medianCpl != null && c.cpl != null && c.spend >= 200 && c.cpl > 2 * medianCpl) {
        moves.push({ kind: "revisar", scope: "campanha", target: c.label, priority: 4,
          reason: `CPL R$ ${c.cpl} — mais de 2× a mediana da conta (R$ ${r2(medianCpl)}). Revisar criativo/público.` });
        desperdicio += r2(c.spend * 0.5);
      }
    }
  }

  moves.sort((a, b) => b.priority - a.priority);
  return {
    moves,
    summary: {
      desperdicioSemanal: r2(desperdicio),
      economiaPotencial: r2(liberada),
      produtosEficientes: eficientes,
      produtosCaros: caros,
    },
  };
}
