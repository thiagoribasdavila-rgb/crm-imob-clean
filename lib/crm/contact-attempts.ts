/**
 * QUANTAS VEZES JÁ SE TENTOU FALAR COM ESTA LEAD.
 *
 * ── O problema que isto resolve ─────────────────────────────────────────────
 *
 * `leads.first_contacted_at` é binário: contatado ou não. Não distingue a lead
 * que ninguém ligou da lead que se tentou cinco vezes e nunca atendeu.
 *
 * São situações opostas. A primeira é falha de atendimento; a segunda é lead
 * que provavelmente não presta. Tratar as duas igual faz o corretor descartar a
 * primeira — que era boa — e insistir na segunda.
 *
 * ── Sem coluna nova ─────────────────────────────────────────────────────────
 *
 * As tentativas já viram evento em `lead_events`: `call` e `whatsapp` estão
 * lá. Criar `leads.contact_attempts` daria duas verdades sobre o mesmo fato, e
 * a coluna sairia do lugar no primeiro evento gravado por outro caminho.
 *
 * Contar o que já é registrado está sempre certo.
 *
 * ── Por que existe um piso antes do descarte ────────────────────────────────
 *
 * Lead com ZERO tentativa não pode ser descartada. "Não deu certo" e "ninguém
 * tentou" são coisas diferentes, e só a primeira é informação — a segunda é o
 * atendimento sendo apagado antes de existir.
 *
 * E quando o descarte vira sinal para a Meta, isso deixa de ser questão de
 * organização interna: descartar quem nunca foi contatado ensina o algoritmo a
 * evitar um público que talvez fosse ótimo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Eventos que contam como tentativa de falar com a pessoa. */
export const EVENTOS_DE_TENTATIVA = new Set([
  "call", "ligacao", "whatsapp", "email", "sms", "message",
]);

/** Piso antes de o descarte ficar disponível. */
export const TENTATIVAS_MINIMAS = 3;

export type TentativasDaLead = {
  total: number;
  porCanal: Record<string, number>;
  ultimaEm: string | null;
  /** A lead chegou a responder alguma vez? */
  houveResposta: boolean;
  /** Já dá para descartar? */
  podeDescartar: boolean;
  faltam: number;
};

export const SEM_TENTATIVA: TentativasDaLead = {
  total: 0, porCanal: {}, ultimaEm: null,
  houveResposta: false, podeDescartar: false, faltam: TENTATIVAS_MINIMAS,
};

type Evento = { event_type?: string | null; created_at?: string | null; metadata?: unknown };

/** Puro: a regra pode ser exercitada e revisada sem banco. */
export function contarTentativas(
  eventos: Evento[],
  jaRespondeu = false,
): TentativasDaLead {
  const tentativas = (eventos ?? []).filter((e) =>
    EVENTOS_DE_TENTATIVA.has(String(e?.event_type ?? "").toLowerCase()),
  );

  if (!tentativas.length) return { ...SEM_TENTATIVA, houveResposta: jaRespondeu };

  const porCanal: Record<string, number> = {};
  for (const e of tentativas) {
    const canal = String(e.event_type).toLowerCase();
    porCanal[canal] = (porCanal[canal] ?? 0) + 1;
  }

  const datas = tentativas
    .map((e) => e.created_at)
    .filter((d): d is string => Boolean(d))
    .sort();

  const total = tentativas.length;
  return {
    total,
    porCanal,
    ultimaEm: datas.length ? datas[datas.length - 1] : null,
    houveResposta: jaRespondeu,
    // Quem já respondeu pode ser descartada com menos tentativas: houve
    // contato, a informação existe. O piso protege quem nunca atendeu.
    podeDescartar: jaRespondeu || total >= TENTATIVAS_MINIMAS,
    faltam: Math.max(0, TENTATIVAS_MINIMAS - total),
  };
}

export async function tentativasDaLead(
  admin: SupabaseClient,
  organizationId: string,
  leadId: string,
): Promise<TentativasDaLead> {
  const [{ data: eventos }, { data: lead }] = await Promise.all([
    admin
      .from("lead_events")
      .select("event_type,created_at")
      .eq("organization_id", organizationId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(200),
    admin
      .from("leads")
      .select("first_contacted_at")
      .eq("organization_id", organizationId)
      .eq("id", leadId)
      .maybeSingle(),
  ]);

  return contarTentativas(eventos ?? [], Boolean(lead?.first_contacted_at));
}

/**
 * O que dizer ao corretor. Null quando não há nada a dizer.
 *
 * A frase muda o que ele faz: "tentou 1 de 3" convida a tentar de novo;
 * "3 tentativas, ninguém atendeu" autoriza a fechar o assunto.
 */
export function frasePara(t: TentativasDaLead): string | null {
  if (t.houveResposta) return null;

  if (t.total === 0) {
    return "Ninguém tentou falar com esta lead ainda — ela está no CRM, mas sem contato.";
  }
  if (t.podeDescartar) {
    return `${t.total} tentativas e nenhuma resposta. Se descartar, diga o motivo — ele volta para a Meta parar de trazer parecidos.`;
  }
  const falta = t.faltam;
  return `${t.total} tentativa(s) até agora. Mais ${falta} antes de poder descartar — lead que ninguém alcançou não é lead ruim.`;
}
