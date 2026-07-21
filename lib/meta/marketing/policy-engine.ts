/**
 * Motor de política — a evolução de DESCRITIVO para PRESCRITIVO governado.
 *
 * Os motores de leitura já produzem veredictos acionáveis (placementReport diz
 * "descartar audience_network"; andromeda-report diz "pausar_criativo";
 * accountConsolidation diz "fragmentada"; forecast alerta anomalias). Hoje isso
 * é só texto na tela. Este núcleo puro COMPÕE esses veredictos em PROPOSTAS
 * prontas para a Caixa de Aprovações — cada uma com confiança, reversibilidade
 * e o efeito esperado — para virarem ação de UM clique do diretor.
 *
 * Invariantes preservadas: nada executa aqui (só propõe); só entra o que é
 * REVERSÍVEL e acima do limiar de confiança; dado ausente não vira proposta.
 * O ciclo continua "a IA propõe, o humano decide".
 */

import type { PlacementLine } from "@/lib/meta/marketing/audience-finder";
import type { CreativeHealth } from "@/lib/meta/marketing/andromeda-report";

export type PolicyKind = "pausar_placement" | "pausar_criativo" | "renovar_criativo" | "consolidar_conta" | "revisar_geo";

export type PolicyProposal = {
  kind: PolicyKind;
  /** Rótulo humano do alvo (placement, criativo, conta). */
  target: string;
  /** Id da Meta quando a ação é executável direto (ex.: adId a pausar). */
  targetId?: string;
  confidence: "media" | "alta";
  /** Reversível = pode ser desfeito (pausar/consolidar). Prescrição só de reversíveis. */
  reversible: boolean;
  rationale: string;   // por que a IA propõe (o veredicto de origem)
  evidence: string;    // o número que sustenta
  expectedEffect: string;
  priority: number;    // 1 (alta) .. 5 (baixa)
};

export type PolicyInput = {
  placements?: PlacementLine[];
  creativeHealth?: CreativeHealth[];
  anomalies?: string[];
  consolidation?: { verdict: "consolidada" | "fragmentada"; reason: string };
  geo?: { verdict: "focado" | "vazando"; leak: { sharePct: number } };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compõe os veredictos em propostas governadas. Só reversíveis e confiantes:
 * uma prescrição errada tem que ser desfazível com um clique.
 */
export function proposePolicies(input: PolicyInput, opts: { minLeadsForConfidence?: number } = {}): PolicyProposal[] {
  const minLeads = opts.minLeadsForConfidence ?? 20;
  const out: PolicyProposal[] = [];

  // 1) Placements "descartar" (Audience Network etc.) — reversível, alta prioridade
  for (const p of input.placements ?? []) {
    if (p.verdict === "descartar" && p.spend > 0) {
      out.push({
        kind: "pausar_placement", target: `${p.platform} · ${p.position}`,
        confidence: p.leads >= minLeads ? "alta" : "media", reversible: true,
        rationale: "Placement com fama de lead de clique acidental — excluir é controle permitido em HOUSING.",
        evidence: `R$ ${r2(p.spend)} gastos, ${p.leads} leads, CPL R$ ${p.cpl ?? "—"} (barato demais = suspeito).`,
        expectedEffect: `Libera ~R$ ${r2(p.spend)}/período para placements que qualificam; o CRM valida a queda de volume vs qualidade.`,
        priority: 2,
      });
    } else if (p.verdict === "revisar" && p.leads === 0 && p.spend >= 20) {
      out.push({
        kind: "pausar_placement", target: `${p.platform} · ${p.position}`,
        confidence: "media", reversible: true,
        rationale: "Placement queimando verba sem nenhum lead.",
        evidence: `R$ ${r2(p.spend)} sem leads.`,
        expectedEffect: `Corta o desperdício; reversível se o padrão mudar.`,
        priority: 3,
      });
    }
  }

  // 2) Criativos fatigados (do relatório Andromeda) — pausar/renovar reversível
  for (const h of input.creativeHealth ?? []) {
    for (const rec of h.recommendations) {
      if (rec.kind === "pausar_criativo" || rec.kind === "renovar_criativo") {
        out.push({
          kind: rec.kind === "pausar_criativo" ? "pausar_criativo" : "renovar_criativo",
          target: rec.target,
          confidence: h.fatigue.length >= 2 ? "alta" : "media", reversible: true,
          rationale: rec.reason,
          evidence: `Campanha ${h.campaignName} · score ${h.andromedaScore}/100 · ${h.fatigue.length} sinal(is) de fadiga.`,
          expectedEffect: rec.kind === "pausar_criativo" ? "Para de gastar num criativo saturado; substituto entra no lugar." : "Renova o conceito antes da fadiga derrubar a entrega.",
          priority: rec.priority,
        });
      }
    }
  }

  // 3) Conta fragmentada — consolidar (reversível: dá para separar de novo)
  if (input.consolidation?.verdict === "fragmentada") {
    out.push({
      kind: "consolidar_conta", target: "conta",
      confidence: "media", reversible: true,
      rationale: "Andromeda premia consolidação — poucas campanhas com sinal forte batem muitas famintas.",
      evidence: input.consolidation.reason,
      expectedEffect: "Concentra o aprendizado; cada conjunto passa a receber conversões suficientes para sair do aprendizado.",
      priority: 3,
    });
  }

  // 4) Geo vazando — propor foco (reversível)
  if (input.geo?.verdict === "vazando" && input.geo.leak.sharePct > 15) {
    out.push({
      kind: "revisar_geo", target: "segmentação geográfica",
      confidence: "media", reversible: true,
      rationale: "Verba escapando da praça-alvo — lead de fora raramente compra imóvel local.",
      evidence: `${r2(input.geo.leak.sharePct)}% do gasto fora da praça.`,
      expectedEffect: "Recentraliza a verba no raio do produto (controle permitido em HOUSING).",
      priority: 3,
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/** Resumo executivo em PT — quantas prescrições e o tema. */
export function policySummary(proposals: PolicyProposal[]): string {
  if (!proposals.length) return "Nenhuma prescrição no momento — a conta está dentro dos parâmetros.";
  const altas = proposals.filter((p) => p.confidence === "alta").length;
  const kinds = [...new Set(proposals.map((p) => p.kind.replace(/_/g, " ")))];
  return `${proposals.length} prescrição(ões) prontas para aprovar (${altas} de alta confiança): ${kinds.join(", ")}. Todas reversíveis, um clique cada.`;
}
