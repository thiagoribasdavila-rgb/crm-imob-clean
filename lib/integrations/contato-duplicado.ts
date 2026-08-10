/**
 * Reconhece o erro do trigger de telefone único — "Este contato já pertence a
 * uma lead única no CRM" (migrations 20260717000240 e 20260803000000) — para
 * que a ingestão da Meta o trate como IDEMPOTÊNCIA, não como falha de entrega.
 *
 * Por que casar pela MENSAGEM e não pelo código: no Postgres, `raise exception
 * 'texto'` sem SQLSTATE próprio chega ao PostgREST como code `P0001`, e cerca de
 * 30 regras de negócio deste banco compartilham esse mesmo P0001 (transferência,
 * copiloto, distribuição, escopo…). Casar só por `P0001` confundiria um contato
 * duplicado com "Perfil sem permissão para distribuir leads". A FRASE do telefone
 * único, ao contrário, é exclusiva desta regra — é ela o sinal desambiguador.
 * Esta é a escolha OPOSTA à da rede de segurança de FK (que casa por código
 * porque a mensagem pode não trazer o nome da tabela), e pelo mesmo princípio:
 * casar pelo sinal que de fato identifica o caso, e falhar para o comportamento
 * seguro (seguir como erro comum) quando o sinal não está lá.
 *
 * Puro e determinístico: sem rede, sem ambiente, sem imports — carregável por
 * `node --test`.
 */

/** A frase exata que o trigger de telefone único levanta (exclusiva desta regra). */
export const FRASE_CONTATO_JA_EH_LEAD_UNICA = "já pertence a uma lead única no CRM";

/**
 * Verdadeiro só quando o erro é o do contato que já é uma lead única. Aceita o
 * objeto de erro do Supabase (`{ code, message }`) ou qualquer coisa com
 * `message`. Ausência de mensagem, mensagem de outra regra, ou erro nulo →
 * falso, e o chamador segue tratando como erro comum (retry/dead_letter).
 */
export function ehContatoJaEhLeadUnica(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  const message = error?.message;
  return typeof message === "string" && message.includes(FRASE_CONTATO_JA_EH_LEAD_UNICA);
}
