/**
 * Checagem adversarial da rotação criativa (lib/ai/creative-rotation).
 *
 * Standalone, sem framework: node scripts/check-creative-rotation.mts
 * Acumula falhas em pt-BR e sai com código 1 se qualquer caso reprovar.
 *
 * O módulo importa ./creative-strategist sem extensão (contrato do repo para
 * rodar em node puro sem alias @/); o hook de resolução abaixo completa o
 * ".ts" que o ESM do node exige — registrado ANTES do import dinâmico.
 */

import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const { proposeRotations, rotationSummary } = await import("../lib/ai/creative-rotation.ts");
const { validateCopy } = await import("../lib/ai/creative-strategist.ts");

import type { CreativeHealthInput, RotationProposal } from "../lib/ai/creative-rotation.ts";
import type { FlexibleAdCopy, ProductBrief, CreativeAngle } from "../lib/ai/creative-strategist.ts";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed += 1;
  else failures.push(name);
}

const CANONICAL: CreativeAngle[] = [
  "sair_do_aluguel",
  "investimento",
  "localizacao",
  "renda_alvo",
  "estilo_de_vida",
  "entrega_imediata",
];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const perdizes: ProductBrief = {
  product: "Vertice Perdizes",
  neighborhood: "Perdizes",
  city: "São Paulo",
  metroDistanceM: 700,
  areaM2: "25 a 40 m²",
  priceFrom: 289000,
  incomeMinSm: 6,
  incomeMaxSm: 10,
  delivered: true,
  differentials: ["rooftop com vista"],
};
const ipiranga: ProductBrief = {
  product: "Reserva Ipiranga",
  neighborhood: "Ipiranga",
  city: "São Paulo",
  priceFrom: 350000,
};
const briefs: Record<string, ProductBrief> = { perdizes, ipiranga };

/** Campanha com um criativo fatigado (2 sinais → pausar_criativo, prioridade 1). */
function fatiguedCampaign(over: Partial<CreativeHealthInput> = {}): CreativeHealthInput {
  return {
    campaignId: "c1",
    campaignName: "[Atlas] Leads — Vertice Perdizes — São Paulo",
    fatigue: [
      { adId: "ad9", adName: "Criativo A", kind: "ctr_caindo", detail: "CTR caiu 40.0% entre janelas" },
      { adId: "ad9", adName: "Criativo A", kind: "cpm_subindo", detail: "CPM subiu 30.0% entre janelas" },
    ],
    recommendations: [
      {
        kind: "pausar_criativo",
        target: "Criativo A",
        reason: "2 sinais de fadiga simultâneos com 60% do gasto da campanha",
        priority: 1,
      },
    ],
    ...over,
  };
}

/** Embrulha o substituto no shape FlexibleAdCopy para revalidar com validateCopy. */
function asCopy(p: RotationProposal): FlexibleAdCopy {
  return {
    product: "substituto",
    angles: [p.replacement.angle as CreativeAngle],
    primaryTexts: [p.replacement.copy.primaryText],
    headlines: [p.replacement.copy.headline],
    descriptions: [p.replacement.copy.description],
    callToAction: "LEARN_MORE",
    complianceNotes: [],
  };
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

// 1) fatigado com brief casado → exatamente uma proposta, campanha correta
const base = proposeRotations([fatiguedCampaign()], briefs);
check(
  "caso 1: fatigado com brief → 1 proposta na campanha certa",
  base.length === 1 && base[0]?.campaignId === "c1" && base[0]?.campaignName.includes("Vertice Perdizes"),
);

// 2) pauseAd resolve adId e herda sinais do radar (kind + detalhe)
check(
  "caso 2: pauseAd com adId do radar e 2 sinais herdados",
  base[0]?.pauseAd.adId === "ad9" &&
    base[0]?.pauseAd.adName === "Criativo A" &&
    base[0]?.pauseAd.signals.length === 2 &&
    base[0]?.pauseAd.signals.every((s) => /ctr_caindo|cpm_subindo/.test(s)),
);

// 3) reason e priority herdados do move de origem
check(
  "caso 3: reason/priority herdados do move",
  base[0]?.priority === 1 && base[0]?.reason.includes("2 sinais de fadiga"),
);

// 4) sem usedAngles → pula o primeiro ângulo canônico (parte do segundo)
check("caso 4: sem histórico, ângulo = segundo canônico", base[0]?.replacement.angle === "investimento");

// 5) copy do substituto tem os 3 campos e passa validateCopy
check(
  "caso 5: substituto completo e aprovado no validateCopy",
  base[0] !== undefined &&
    base[0].replacement.copy.primaryText.length > 0 &&
    base[0].replacement.copy.headline.length > 0 &&
    base[0].replacement.copy.description.length > 0 &&
    validateCopy(asCopy(base[0])).length === 0,
);

// 6) campanha sem brief casado → omitida (não inventa copy)
const semBrief = proposeRotations(
  [fatiguedCampaign({ campaignId: "c2", campaignName: "[Atlas] Leads — Torre Desconhecida" })],
  briefs,
);
check("caso 6: campanha sem brief casado fica fora do resultado", semBrief.length === 0);

// 7) usedAngles parcial → primeiro ângulo canônico ainda não usado
const parcial = proposeRotations([fatiguedCampaign()], briefs, {
  usedAngles: { c1: ["sair_do_aluguel", "investimento", "localizacao"] },
});
check("caso 7: usedAngles parcial → próximo ângulo livre (renda_alvo)", parcial[0]?.replacement.angle === "renda_alvo");

// 8) usedAngles esgotados (os 6) → cai no fallback repetível e determinístico
const esgotadoOpts = { usedAngles: { c1: [...CANONICAL] } };
const esgotadoA = proposeRotations([fatiguedCampaign()], briefs, esgotadoOpts);
const esgotadoB = proposeRotations([fatiguedCampaign()], briefs, esgotadoOpts);
check(
  "caso 8: usedAngles esgotados → fallback 'investimento', mesma saída em duas chamadas",
  esgotadoA[0]?.replacement.angle === "investimento" && JSON.stringify(esgotadoA) === JSON.stringify(esgotadoB),
);

// 9) health vazio → [] sem crash; resumo também não quebra
const vazio = proposeRotations([], briefs);
check(
  "caso 9: health vazio → [] e resumo honesto",
  vazio.length === 0 && rotationSummary(vazio).includes("Nenhuma rotação"),
);

// 10) recomendações que não são rotação (manter/adicionar/consolidar) → nada proposto
const semRotacao = proposeRotations(
  [
    fatiguedCampaign({
      fatigue: [],
      recommendations: [
        { kind: "manter", target: "c1", reason: "saudável", priority: 3 },
        { kind: "adicionar_criativos", target: "c1", reason: "poucos criativos", priority: 2 },
        { kind: "consolidar_campanhas", target: "conta", reason: "fragmentada", priority: 2 },
      ],
    }),
  ],
  briefs,
);
check("caso 10: moves sem rotação → nenhuma proposta", semRotacao.length === 0);

// 11) dois fatigados na MESMA campanha → dois substitutos com ângulos distintos
const dupla = proposeRotations(
  [
    fatiguedCampaign({
      fatigue: [
        { adId: "ad1", adName: "Criativo A", kind: "ctr_caindo", detail: "CTR caiu 40.0%" },
        { adId: "ad1", adName: "Criativo A", kind: "cpm_subindo", detail: "CPM subiu 30.0%" },
        { adId: "ad2", adName: "Criativo B", kind: "frequencia_alta", detail: "frequência 3.10/semana" },
      ],
      recommendations: [
        { kind: "pausar_criativo", target: "Criativo A", reason: "2 sinais", priority: 1 },
        { kind: "renovar_criativo", target: "Criativo B", reason: "1 sinal", priority: 2 },
      ],
    }),
  ],
  briefs,
);
check(
  "caso 11: dois fatigados na campanha → ângulos distintos entre si",
  dupla.length === 2 && dupla[0]?.replacement.angle !== dupla[1]?.replacement.angle,
);

// 12) ordenação: prioridade 1 (pausar) antes da 2 (renovar), prioridade herdada
check(
  "caso 12: prioridade herdada ordena o lote (1 antes de 2)",
  dupla[0]?.priority === 1 && dupla[0]?.pauseAd.adName === "Criativo A" && dupla[1]?.priority === 2,
);

// 13) match do brief é case-insensitive por inclusão do product no nome
const caseInsensitive = proposeRotations(
  [fatiguedCampaign({ campaignName: "LEADS — VERTICE PERDIZES — Q3" })],
  briefs,
);
check("caso 13: match case-insensitive do product no nome", caseInsensitive.length === 1);

// 14) renovar_criativo sem entrada correspondente no fatigue → não quebra, sinais vazios
const semSinal = proposeRotations(
  [
    fatiguedCampaign({
      fatigue: [],
      recommendations: [{ kind: "renovar_criativo", target: "Criativo X", reason: "renovar conceito", priority: 2 }],
    }),
  ],
  briefs,
);
check(
  "caso 14: move sem fatigue correspondente → proposta com sinais vazios, sem crash",
  semSinal.length === 1 && semSinal[0]?.pauseAd.signals.length === 0 && semSinal[0]?.pauseAd.adId === "",
);

// 15) determinismo ponta a ponta: mesma entrada complexa, mesma saída serializada
const runA = proposeRotations([fatiguedCampaign()], briefs, { usedAngles: { c1: ["investimento"] } });
const runB = proposeRotations([fatiguedCampaign()], briefs, { usedAngles: { c1: ["investimento"] } });
check("caso 15: determinístico (JSON idêntico em chamadas repetidas)", JSON.stringify(runA) === JSON.stringify(runB));

// 16) resumo executivo: 1 frase em PT com contagem e destino dos substitutos
const resumo = rotationSummary(dupla);
check(
  "caso 16: resumo executivo cita contagem, criativos e ângulos",
  resumo.startsWith("2 criativos fatigados com substitutos prontos:") &&
    resumo.includes("Criativo A") &&
    resumo.includes("Criativo B") &&
    resumo.includes("ângulo"),
);

// 17) brief com differentials maliciosos → substituto continua limpo (validateCopy)
const malicioso = proposeRotations([fatiguedCampaign()], {
  perdizes: { ...perdizes, differentials: ["valorização garantida", "exclusivo para solteiros"] },
});
const copySerial = malicioso[0] ? JSON.stringify(malicioso[0].replacement.copy) : "";
check(
  "caso 17: differentials proibidos não vazam para o substituto",
  malicioso.length === 1 &&
    malicioso[0] !== undefined &&
    validateCopy(asCopy(malicioso[0])).length === 0 &&
    !/garantid/i.test(copySerial) &&
    !/exclusivo\s+para/i.test(copySerial),
);

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

console.log(`creative-rotation: ${passed} caso(s) aprovado(s), ${failures.length} falha(s).`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FALHA — ${f}`);
  process.exit(1);
}
