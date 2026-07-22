/**
 * Alçada ÚNICA das decisões de campanha da Meta (criar, pausar, ativar, mudar
 * verba) — o mesmo predicado para APROVAR (Caixa de Aprovações) e para EXECUTAR
 * (/api/v1/marketing/execute).
 *
 * Existe porque os dois lados divergiam: a execução aceitava superintendente e a
 * decisão não, então um superintendente podia executar uma aprovação que ele
 * mesmo não podia conceder — e, numa organização cuja liderança é
 * superintendente, ninguém aprovava, empurrando o uso para fora do caminho
 * governado. Divergência de alçada é furo de governança, não detalhe de papel.
 *
 * Módulo puro e sem imports: pausar também exige diretor (é decisão comercial,
 * não "só reduzir despesa"), portanto NÃO há exceção por kind.
 */

/** entity_type/request_type emitidos por lib/marketing/campaign-proposals.ts. */
export const META_CAMPAIGN_ENTITY_TYPE = "meta_campaign";

/** Papéis comerciais com alçada de campanha (role "admin" também decide). */
export const META_CAMPAIGN_DECIDER_COMMERCIAL_ROLES: readonly string[] = ["director", "superintendent"];

export const META_CAMPAIGN_AUTHORITY_MESSAGE =
  "Decisões de campanha da Meta (criar, pausar, ativar, mudar verba) são do diretor ou superintendente.";

/** Alçada para decidir E executar campanha da Meta. */
export function canDecideMetaCampaign(input: { role?: string | null; commercialRole?: string | null }): boolean {
  const role = String(input.role ?? "").trim().toLowerCase();
  if (role === "admin") return true;
  const commercial = String(input.commercialRole ?? "").trim().toLowerCase();
  return META_CAMPAIGN_DECIDER_COMMERCIAL_ROLES.includes(commercial);
}

/** Uma aprovação é decisão de campanha da Meta? (entity_type ou request_type) */
export function isMetaCampaignApproval(input: { entityType?: string | null; requestType?: string | null }): boolean {
  return (
    String(input.entityType ?? "") === META_CAMPAIGN_ENTITY_TYPE ||
    String(input.requestType ?? "") === META_CAMPAIGN_ENTITY_TYPE
  );
}
