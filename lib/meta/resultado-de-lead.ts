/**
 * QUANTAS LEADS A META DIZ QUE A CAMPANHA GEROU.
 *
 * ── O defeito que este módulo corrige ─────────────────────────────────────
 *
 * `lib/meta/insights.ts` pedia à Graph `spend,impressions,clicks` — e nunca
 * `actions`. O número de leads não saía da Meta. Resultado medido em
 * 03/08/2026: `marketing_spend` tinha 102 linhas, TODAS com impressões e
 * cliques, e `leads_count` NULO nas 102.
 *
 * A coluna existia. O extrator pedia o dado à Meta sem o campo que importa, e
 * gravava um lugar vazio ao lado de dois cheios.
 *
 * A consequência não é cosmética: sem essa contagem, o custo por lead se divide
 * pelas leads que CHEGARAM ao CRM. Com R$ 4.122 e 4 leads chegadas, o relatório
 * dizia R$ 1.030 por lead. A Meta, perguntada, respondeu 119 leads em 30 dias —
 * CPL real entre R$ 24 e R$ 44.
 *
 * ── POR QUE UM MÓDULO SÓ PARA LER UM NÚMERO ──────────────────────────────
 *
 * Porque a Meta tem MAIS DE UM NOME para o mesmo fato, e escolher um só perde
 * dado conforme o tipo de anúncio:
 *
 *   · `lead`                            — o padrão de formulário nativo
 *   · `onsite_conversion.lead_grouped`  — o agrupado que a interface mostra
 *   · `offsite_conversion.fb_pixel_lead`— lead de site, via pixel
 *
 * Somar todos DUPLICARIA (o agrupado inclui o simples). A regra é preferência
 * ordenada: pega o primeiro que existir, e só ele.
 *
 * PURO: sem rede, sem banco. A regra é testável sem levantar meio produto.
 */

/** Em ordem de preferência. O primeiro presente vence; os outros são ignorados. */
export const ACOES_DE_LEAD = [
  "onsite_conversion.lead_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
] as const;

export type AcaoDaMeta = { action_type?: string; value?: string | number };

/**
 * Extrai a contagem de leads de um bloco `actions` do Insights.
 *
 * Devolve `null` quando `actions` NÃO veio na resposta — isso significa "não
 * perguntei" ou "a Meta não respondeu", e nunca pode virar zero: zero afirma
 * que a campanha não gerou lead nenhuma, e essa afirmação, errada, é o que faz
 * um CPL de R$ 1.030 parecer verdade.
 *
 * Devolve `0` quando `actions` VEIO e não traz ação de lead — aí zero é fato: a
 * campanha rodou, gastou e não gerou lead.
 */
export function leadsDoInsight(actions: AcaoDaMeta[] | null | undefined): number | null {
  if (!Array.isArray(actions)) return null;
  for (const preferida of ACOES_DE_LEAD) {
    const achada = actions.find((a) => String(a?.action_type ?? "") === preferida);
    if (achada) {
      const valor = Number(achada.value ?? 0);
      // Valor não numérico com a ação PRESENTE é dado corrompido, não ausência:
      // devolver null aqui faria a linha parecer "não perguntei".
      return Number.isFinite(valor) ? Math.max(0, Math.round(valor)) : 0;
    }
  }
  return 0;
}

/** Os campos que a consulta de Insights precisa pedir para esta conta bater. */
export const CAMPOS_DE_INSIGHT = "campaign_id,campaign_name,spend,impressions,clicks,actions";
