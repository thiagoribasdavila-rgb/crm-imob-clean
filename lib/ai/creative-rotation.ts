/**
 * Rotação criativa — as IAs conversando: o radar de fadiga (andromeda-report)
 * aponta o criativo cansado e o estrategista (creative-strategist) já entrega
 * o substituto pronto, com um ângulo conceitual AINDA não usado na campanha.
 *
 * Núcleo determinístico e puro: sem fetch, sem relógio, sem aleatório — mesma
 * entrada, mesma saída. Tudo aqui é PROPOSTA sob supervisão humana: nada pausa
 * anúncio nem sobe criativo contra a Meta; o resultado vai à Caixa de
 * Aprovações antes de qualquer efeito externo.
 *
 * Honestidade antes de volume: campanha cuja recomendação pede rotação mas que
 * não casa com nenhum brief conhecido fica FORA do resultado — propor copy sem
 * conhecer o produto seria inventar.
 */

import { buildAdCopy, type CreativeAngle, type ProductBrief } from "./creative-strategist";
import type { CreativeHealth } from "../meta/marketing/andromeda-report";

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

/** Subconjunto de CreativeHealth que a rotação precisa (compatível com o tipo pleno). */
export type CreativeHealthInput = Pick<
  CreativeHealth,
  "campaignId" | "campaignName" | "fatigue" | "recommendations"
>;

export type RotationProposal = {
  campaignId: string;
  campaignName: string;
  /** Criativo fatigado a pausar — sinais herdados do radar (kind + detalhe). */
  pauseAd: { adId: string; adName: string; signals: string[] };
  /** Substituto pronto: ângulo conceitual novo + copy validado do estrategista. */
  replacement: {
    angle: string;
    copy: { primaryText: string; headline: string; description: string };
  };
  /** Motivo herdado do move de origem (pausar_criativo / renovar_criativo). */
  reason: string;
  /** Prioridade herdada do move de origem (1 = urgente, 2 = importante). */
  priority: number;
};

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/** Ordem canônica dos 6 ângulos (a mesma do union type do estrategista). */
const CANONICAL_ANGLES: readonly CreativeAngle[] = [
  "sair_do_aluguel",
  "investimento",
  "localizacao",
  "renda_alvo",
  "estilo_de_vida",
  "entrega_imediata",
];

/**
 * Brief cujo product aparece (case-insensitive) no nome da campanha.
 * Empate: o product mais longo ganha (mais específico); persistindo, a ordem
 * de inserção do Record decide — determinístico.
 */
function matchBrief(campaignName: string, briefs: Record<string, ProductBrief>): ProductBrief | null {
  const name = campaignName.toLowerCase();
  let best: ProductBrief | null = null;
  let bestLen = 0;
  for (const brief of Object.values(briefs)) {
    const product = brief.product.trim().toLowerCase();
    if (!product || !name.includes(product)) continue;
    if (product.length > bestLen) {
      best = brief;
      bestLen = product.length;
    }
  }
  return best;
}

/**
 * Próximo ângulo AINDA não usado, na ordem canônica. Esgotados todos, cai no
 * primeiro ângulo da ordem de fallback (canônica pulando o primeiro) — sempre
 * o mesmo, repetível: melhor um ângulo reciclado explícito do que aleatório.
 */
function nextAngle(used: ReadonlySet<string>): CreativeAngle {
  for (const angle of CANONICAL_ANGLES) {
    if (!used.has(angle)) return angle;
  }
  return CANONICAL_ANGLES[1];
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Para cada campanha com recomendação pausar_criativo/renovar_criativo que
 * casa com um brief, propõe o par (pausa, substituto): o substituto usa um
 * ângulo ainda não gasto na campanha (opts.usedAngles, chave por campaignId ou
 * campaignName; sem histórico, assume que o primeiro ângulo canônico já foi
 * usado e parte do segundo) e o copy sai de buildAdCopy — já validado contra
 * limites e políticas Housing/Personal Attributes.
 */
export function proposeRotations(
  health: CreativeHealthInput[],
  briefs: Record<string, ProductBrief>,
  opts: { usedAngles?: Record<string, string[]> } = {},
): RotationProposal[] {
  const proposals: RotationProposal[] = [];

  for (const campaign of health) {
    const brief = matchBrief(campaign.campaignName, briefs);
    if (!brief) continue; // sem brief casado não se inventa copy — fora do resultado

    const external = opts.usedAngles?.[campaign.campaignId] ?? opts.usedAngles?.[campaign.campaignName];
    // Sem histórico externo, o fatigado provavelmente nasceu do primeiro ângulo
    // default — semeia o primeiro canônico como "já usado" (fallback pula ele).
    const used = new Set<string>(external ?? [CANONICAL_ANGLES[0]]);

    for (const move of campaign.recommendations) {
      if (move.kind !== "pausar_criativo" && move.kind !== "renovar_criativo") continue;

      const adSignals = campaign.fatigue.filter((s) => s.adName === move.target);
      const angle = nextAngle(used);
      used.add(angle);

      const copy = buildAdCopy(brief, [angle]);
      // buildAdCopy pode descartar um ângulo sem primário limpo — reporta o efetivo.
      const effectiveAngle = copy.angles[0] ?? angle;

      proposals.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        pauseAd: {
          adId: adSignals[0]?.adId ?? "",
          adName: move.target,
          signals: adSignals.map((s) => `${s.kind}: ${s.detail}`),
        },
        replacement: {
          angle: effectiveAngle,
          copy: {
            primaryText: copy.primaryTexts[0] ?? "",
            headline: copy.headlines[0] ?? "",
            description: copy.descriptions[0] ?? "",
          },
        },
        reason: move.reason,
        priority: move.priority,
      });
    }
  }

  // Urgente primeiro; desempate estável por campanha e anúncio.
  return proposals.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.campaignId.localeCompare(b.campaignId) ||
      a.pauseAd.adName.localeCompare(b.pauseAd.adName),
  );
}

/** Uma frase executiva em PT sobre o lote de rotações propostas. */
export function rotationSummary(proposals: RotationProposal[]): string {
  if (proposals.length === 0) {
    return "Nenhuma rotação criativa necessária: sem criativos fatigados com substituto a propor.";
  }
  const items = proposals
    .map((p) => `${p.pauseAd.adName} (${p.campaignName}) → ângulo ${p.replacement.angle}`)
    .join("; ");
  const head =
    proposals.length === 1
      ? "1 criativo fatigado com substituto pronto"
      : `${proposals.length} criativos fatigados com substitutos prontos`;
  return `${head}: ${items}.`;
}
