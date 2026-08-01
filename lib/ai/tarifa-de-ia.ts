/**
 * TARIFA DE IA — a regra de preço, sozinha e testável.
 *
 * ── Por que este arquivo existe ────────────────────────────────────────────
 *
 * A regra morava em `lib/ai/provider-router.ts`, que abre com `import
 * "server-only"` e puxa mais nove módulos com alias `@/`. Nenhum teste
 * conseguia carregá-lo fora do Next — e a regra mais importante do FinOps
 * ("sem tarifa, o custo é NULO, não zero") não tinha contrato nenhum.
 *
 * Em 01/08/2026 isso cobrou: o job `validate` do PR #9 reprovou com
 * "ATLAS_AI_PRICE_TABLE ausente. Todo consumo de IA será gravado com custo
 * NULO." — e a única prova de que a regra funcionava era lê-la.
 *
 * EXTRAÇÃO PURA: zero mudança de comportamento. `provider-router.ts`
 * reexporta daqui, e o tipo de `usage` é ESTRUTURAL de propósito — assim o
 * módulo não importa nada do roteador e o compilador continua provando que os
 * dois casam.
 *
 * A regra que sustenta tudo: **nulo não é zero**. Zero significa "custou
 * nada" e faz o painel de FinOps parecer saudável; nulo significa "não sei",
 * que é a única resposta honesta quando a tarifa não foi declarada.
 */

export type AITariff = { inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion?: number; cacheWritePerMillion?: number };

export type UsoDeTokens = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  providerReportedCostUsd?: number | null;
};

export type CustoDeUso = {
  inputUsd: number | null;
  outputUsd: number | null;
  estimatedUsd: number | null;
  pricingConfigured: boolean;
  pricingSource: string;
};

let priceTableCache: { raw: string; table: Record<string, AITariff> } | null = null;

/**
 * Tarifa por (provedor, modelo) em ATLAS_AI_PRICE_TABLE (JSON).
 * Precificar por TIER produz número plausível e errado: o mesmo tier é servido
 * por modelos com ordens de grandeza de diferença de preço.
 * Formato: {"openai/gpt-5.2":{"input":1.25,"output":10,"cachedInput":0.125}}
 * Chave "provedor/*" vale como tarifa padrão daquele provedor.
 */
export function priceTable(): Record<string, AITariff> {
  const raw = process.env.ATLAS_AI_PRICE_TABLE || "";
  if (priceTableCache && priceTableCache.raw === raw) return priceTableCache.table;
  const table: Record<string, AITariff> = {};
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      for (const [key, value] of Object.entries(parsed || {})) {
        const positive = (candidate: unknown) => { const parsedNumber = Number(candidate); return Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : null; };
        const inputPerMillion = positive(value?.inputUsdPerMillion ?? value?.input);
        const outputPerMillion = positive(value?.outputUsdPerMillion ?? value?.output);
        if (inputPerMillion === null || outputPerMillion === null) continue;
        table[key.trim().toLowerCase()] = {
          inputPerMillion,
          outputPerMillion,
          cachedInputPerMillion: positive(value?.cachedInputUsdPerMillion ?? value?.cachedInput) ?? undefined,
          cacheWritePerMillion: positive(value?.cacheWriteUsdPerMillion ?? value?.cacheWrite) ?? undefined,
        };
      }
    } catch {
      // Tabela inválida = sem tarifa. Preço nunca é inferido: sem lastro, sem número.
    }
  }
  priceTableCache = { raw, table };
  return table;
}

export function tariffFor(provider: string, model: string): { tariff: AITariff | null; source: string } {
  const table = priceTable();
  const exact = table[`${provider}/${model}`.trim().toLowerCase()];
  if (exact) return { tariff: exact, source: `tabela:${provider}/${model}` };
  const byProvider = table[`${provider}/*`];
  if (byProvider) return { tariff: byProvider, source: `tabela:${provider}/*` };
  return { tariff: null, source: `sem_tarifa:${provider}/${model || "modelo_desconhecido"}` };
}

export function usageCost(provider: string, model: string, usage: UsoDeTokens): CustoDeUso {
  if (provider === "local") return { inputUsd: 0, outputUsd: 0, estimatedUsd: 0, pricingConfigured: true, pricingSource: "fallback_local_sem_custo" };
  // O custo informado pelo provedor ganha da tarifa cadastrada: é medição, não
  // estimativa. Sem isto, a taxa por requisição da Perplexity (US$ 0,005, que
  // domina o custo de chamadas curtas) ficava fora da conta inteira.
  const informado = usage.providerReportedCostUsd;
  if (typeof informado === "number" && Number.isFinite(informado) && informado >= 0) {
    // inputUsd/outputUsd ficam nulos de propósito: o provedor informou o TOTAL,
    // e repartir esse total entre entrada e saída seria inventar a divisão.
    return { inputUsd: null, outputUsd: null, estimatedUsd: informado, pricingConfigured: true, pricingSource: `provedor_informou:${provider}` };
  }
  const { tariff, source } = tariffFor(provider, model);
  // Sem tarifa cadastrada o custo é DESCONHECIDO, não zero. Gravar 0 transforma
  // ausência de dado em "de graça" e o Command Center exibe isso como medido.
  if (!tariff) return { inputUsd: null, outputUsd: null, estimatedUsd: null, pricingConfigured: false, pricingSource: source };
  const cached = Math.max(0, usage.cachedInputTokens ?? 0);
  const written = Math.max(0, usage.cacheWriteTokens ?? 0);
  const fresh = Math.max(0, usage.inputTokens - cached - written);
  // Sem tarifa de cache declarada, cobra-se a cheia: erra para cima, nunca para baixo.
  const inputUsd = (fresh * tariff.inputPerMillion + cached * (tariff.cachedInputPerMillion ?? tariff.inputPerMillion) + written * (tariff.cacheWritePerMillion ?? tariff.inputPerMillion)) / 1_000_000;
  const outputUsd = (usage.outputTokens * tariff.outputPerMillion) / 1_000_000;
  return { inputUsd, outputUsd, estimatedUsd: inputUsd + outputUsd, pricingConfigured: true, pricingSource: source };
}
