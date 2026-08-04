import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { auditarCriativoContraFontes, podarTextosSemLastro, type AuditoriaDeLastro, type FonteDeLastro } from "@/lib/marketing/fato-com-lastro";

/**
 * O LASTRO DE UMA PEÇA, MEDIDO CONTRA O BANCO.
 *
 * `lib/marketing/fato-com-lastro.ts` sabe DECIDIR (é puro e tem contrato); este
 * módulo sabe PERGUNTAR — busca as fontes regionais do empreendimento e os
 * valores que já estão cadastrados nele, e entrega os dois ao portão.
 *
 * ── Por que a leitura das fontes traz TODAS ────────────────────────────────
 *
 * Inclusive as `pending` e as vencidas. Filtrar por `review_status='verified'`
 * no SQL pareceria mais direto e criaria duas verdades sobre "o que serve": uma
 * na cláusula WHERE e outra em `fontesUtilizaveis()`. Quem decide é o portão,
 * num lugar só — e a lista de ignoradas é o que explica ao operador por que a
 * fonte que ele cadastrou ontem ainda não sustenta a peça.
 *
 * ── Por que falha de leitura NÃO libera a peça ─────────────────────────────
 *
 * Se a consulta falhar, a lista volta vazia e o portão passa a não encontrar
 * lastro para número nenhum — a peça é reprovada, não aprovada. Ausência de
 * evidência nunca vira evidência de ausência aqui: liberar por erro de banco é
 * o modo de falha que coloca um número inventado num anúncio.
 */

/** As colunas de `developments` que legitimamente podem virar número na peça. */
const COLUNAS_DE_LASTRO = "price_min,price_max,delivery_date,private_area_min,private_area_max,total_units";

export type LastroDoEmpreendimento = {
  fontes: FonteDeLastro[];
  valoresCadastrados: Record<string, string>;
  /** true quando alguma leitura falhou — a peça reprova, e o motivo é dito. */
  leituraIncompleta: boolean;
};

export async function carregarLastroDoEmpreendimento(organizationId: string, developmentId: string): Promise<LastroDoEmpreendimento> {
  const admin = getSupabaseAdmin();
  const [fontes, cadastro] = await Promise.all([
    admin
      .from("project_region_sources")
      .select("id,category,publisher,source_url,summary,reference_date,valid_until,review_status")
      .eq("organization_id", organizationId)
      .eq("development_id", developmentId)
      .limit(200),
    admin
      .from("developments")
      .select(COLUNAS_DE_LASTRO)
      .eq("id", developmentId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  let leituraIncompleta = false;
  if (fontes.error) {
    leituraIncompleta = true;
    logger.warn("lastro.fontes_indisponiveis", { developmentId, reason: fontes.error.message });
  }
  if (cadastro.error) {
    leituraIncompleta = true;
    logger.warn("lastro.cadastro_indisponivel", { developmentId, reason: cadastro.error.message });
  }

  const linha = (cadastro.data ?? {}) as Record<string, unknown>;
  return {
    fontes: (fontes.data ?? []).map((item) => ({
      id: String(item.id),
      category: String(item.category),
      publisher: String(item.publisher),
      sourceUrl: String(item.source_url),
      summary: String(item.summary),
      referenceDate: String(item.reference_date),
      validUntil: String(item.valid_until),
      reviewStatus: String(item.review_status),
    })),
    // Campo nulo fica FORA: entrar como "0" daria lastro ao número zero em
    // qualquer peça, e "a partir de R$ 0" é exatamente o defeito a evitar.
    // POR COLUNA, e não numa lista plana: sem saber de onde o número veio,
    // `total_units = 80` lastreava "a 80 metros do metrô". Campo nulo fica FORA
    // — entrar como "0" daria lastro ao zero, e "a partir de R$ 0" é exatamente
    // o defeito a evitar.
    valoresCadastrados: Object.fromEntries(
      COLUNAS_DE_LASTRO.split(",")
        .map((coluna) => [coluna, linha[coluna]] as const)
        .filter(([, valor]) => valor !== null && valor !== undefined && valor !== "")
        .map(([coluna, valor]) => [coluna, String(valor)]),
    ),
    leituraIncompleta,
  };
}

export type VeredictoDeLastro = {
  aprovado: boolean;
  auditoria: AuditoriaDeLastro;
  mantidos: string[];
  removidos: Array<{ texto: string; motivo: string }>;
  fontesConhecidas: number;
  valoresCadastrados: Record<string, string>;
  leituraIncompleta: boolean;
  motivo: string;
};

/**
 * A pergunta completa: "estes textos podem ser publicados para este produto?".
 *
 * Devolve os textos que ficam de pé (`mantidos`) e os que caem, com o motivo de
 * cada um. Quem gera criativo deve chamar isto ANTES de gravar em
 * `creative_assets` — o texto sem lastro não deve chegar ao banco com uma marca
 * de "bloqueado", porque marca depende de todo consumidor futuro respeitá-la.
 */
export async function auditarPecaDoEmpreendimento(input: {
  organizationId: string;
  developmentId: string;
  textos: string[];
  hoje?: string;
}): Promise<VeredictoDeLastro> {
  const hoje = input.hoje || new Date().toISOString().slice(0, 10);
  const lastro = await carregarLastroDoEmpreendimento(input.organizationId, input.developmentId);
  const poda = podarTextosSemLastro({ textos: input.textos, fontes: lastro.fontes, cadastro: lastro.valoresCadastrados, hoje });
  const utilizaveis = poda.auditoria.fontesUtilizaveis;
  return {
    aprovado: poda.auditoria.aprovado,
    auditoria: poda.auditoria,
    mantidos: poda.mantidos,
    removidos: poda.removidos,
    fontesConhecidas: lastro.fontes.length,
    valoresCadastrados: lastro.valoresCadastrados,
    leituraIncompleta: lastro.leituraIncompleta,
    motivo: poda.auditoria.aprovado
      ? // `Object.keys(...).length`, e não `.length` direto: `valoresCadastrados`
        // é `Record<string, string>` — um objeto, não uma lista. O `.length` que
        // estava aqui vinha de quando ele ERA lista, e sobreviveu à troca de
        // forma porque o `tsc` não reclama: a assinatura de índice
        // `[key: string]: string` casa com QUALQUER acesso por nome, `.length`
        // inclusive, e o tipo resultante é `string`. Verificado: compila limpo e
        // imprime "undefined valor(es) cadastrado(s)" — na frase de APROVAÇÃO,
        // que é justamente a que deveria dar confiança a quem publica.
        `Todos os ${input.textos.length} texto(s) têm lastro: ${utilizaveis} fonte(s) regional(is) verificada(s) e vigente(s) e ${Object.keys(lastro.valoresCadastrados).length} valor(es) cadastrado(s) do produto.`
      : `${poda.removidos.length} de ${input.textos.length} texto(s) reprovados.${lastro.leituraIncompleta ? " ATENÇÃO: a leitura do lastro falhou, então o portão reprovou por não conseguir conferir — não por ter conferido e negado." : ""}`,
  };
}

/** Reexportado para quem só precisa auditar sem tocar no banco (ex.: prévia). */
export { auditarCriativoContraFontes };
