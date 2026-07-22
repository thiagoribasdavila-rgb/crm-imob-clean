/**
 * Procedência da linha de marketing_campaigns — quem a criou.
 *
 * A tabela não tem coluna de procedência (id, organization_id, project_id,
 * name, platform, external_campaign_id, status, started_at, ended_at,
 * created_at, updated_at) e acrescentar uma tornaria a ingestão dependente da
 * ordem de deploy: um insert com coluna que o banco ainda não tem falha com
 * 42703 e desliga o religamento inteiro em silêncio. Então a procedência mora
 * onde toda tela já lê: o NOME, com prefixo estável no início (a lista trunca o
 * fim, nunca o começo).
 *
 * Por que isso importa: a campanha registrada por automação nasce a partir de
 * UM id externo vindo do lead. O Atlas nunca consultou a Meta para saber o
 * estado dela — o webhook de leadgen não traz status de campanha e a Graph API
 * não é chamada aqui de propósito. Imprimir "ACTIVE" nessa linha seria asserir
 * um estado que ninguém verificou. A tela usa isAutoRegisteredCampaign() para
 * trocar o status por "estado não verificado".
 *
 * Complemento inegociável: nada nasce ATIVO. O CHECK da tabela só admite
 * ACTIVE/PAUSED/COMPLETED/ARCHIVED, então a automação grava PAUSED — o valor
 * que NÃO afirma que a campanha está rodando. Nenhum consumidor filtra ou
 * decide por status (verificado: director-daily, launch-os, leads/page e
 * campaign-quality apenas exibem), logo a escolha não muda número nenhum.
 */

export const AUTO_REGISTERED_CAMPAIGN_PREFIX = "[auto] ";

/** Status gravado por automação: PAUSED nunca afirma "está no ar". */
export const AUTO_REGISTERED_CAMPAIGN_STATUS = "PAUSED";

/** O que a tela mostra no lugar do status quando a linha veio de automação. */
export const AUTO_REGISTERED_CAMPAIGN_STATUS_LABEL = "estado não verificado";

export const AUTO_REGISTERED_CAMPAIGN_STATUS_TITLE =
  "Linha registrada automaticamente a partir do id externo do lead. O estado desta campanha na Meta nunca foi consultado pelo Atlas — o webhook de leadgen não traz status e a Graph API não é chamada aqui.";

/** Nome canônico da campanha registrada por automação. */
export function autoRegisteredCampaignName(
  externalCampaignId: string,
  origin: "ingestao" | "backfill",
): string {
  return `${AUTO_REGISTERED_CAMPAIGN_PREFIX}Campanha Meta ${externalCampaignId} (registrada pel${origin === "ingestao" ? "a ingestão" : "o backfill"} — sem nome no evento)`;
}

export function isAutoRegisteredCampaign(name: string | null | undefined): boolean {
  return typeof name === "string" && name.startsWith(AUTO_REGISTERED_CAMPAIGN_PREFIX);
}
