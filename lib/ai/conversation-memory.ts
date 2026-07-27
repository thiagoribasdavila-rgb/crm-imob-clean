/**
 * MEMÓRIA DE CONVERSA PARA A IA — fatos, não transcrição.
 *
 * ── O que estava faltando ───────────────────────────────────────────────────
 *
 * A IA lia `leads`, playbooks, materiais e imóveis. Nunca leu `messages` nem
 * `conversations`. Então ela sugeria "faça o primeiro contato" para uma lead
 * que já estava conversando há três dias, e não tinha como saber que o cliente
 * perguntou algo e ninguém respondeu.
 *
 * ── Por que fatos e não o texto ─────────────────────────────────────────────
 *
 * `governed-real-estate-context.ts` declara, em manifesto auditável:
 *
 *     previousConversationTextIncluded: false
 *     externalProviderAllowed: dataClass !== "personal"
 *
 * Isso não é descuido — é governança. Texto de conversa é dado pessoal do
 * cliente, e mandá-lo para um provedor externo é divulgação de verdade, não
 * detalhe técnico.
 *
 * A informação que a IA precisa para agir quase nunca é o texto. É o ESTADO:
 * quem falou por último, há quanto tempo, se a lead respondeu, se ficou
 * pergunta no ar. "O cliente escreveu ontem e ninguém voltou" resolve o
 * atendimento sem que uma linha do que ele escreveu saia daqui.
 *
 * Então `previousConversationTextIncluded` continua `false`, e passa a existir
 * `conversationFactsIncluded`. São coisas diferentes e o manifesto distingue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type FatosDaConversa = {
  /** Houve conversa registrada? Se não, todo o resto é null — não é zero. */
  houveConversa: boolean;
  totalDeMensagens: number;
  mensagensDaLead: number;
  mensagensDoCorretor: number;
  /** "lead" | "corretor" | null — quem falou por último. */
  ultimoAFalar: "lead" | "corretor" | null;
  ultimaMensagemEm: string | null;
  /** Horas desde a última mensagem. Null quando nunca houve conversa. */
  horasDesdeUltimaMensagem: number | null;
  /**
   * A lead falou por último e ninguém respondeu. É o fato mais acionável de
   * todos: cliente esperando é a lead mais perto de esfriar por descuido.
   */
  aguardandoResposta: boolean;
  /** Quanto tempo o cliente está esperando, em horas. */
  horasEsperando: number | null;
  /** A lead chegou a responder alguma vez? Distingue "não atende" de "sumiu". */
  leadJaRespondeu: boolean;
  /** Quantos áudios a lead mandou — sinal de interesse, e do que ainda não lemos. */
  audiosDaLead: number;
};

export const SEM_CONVERSA: FatosDaConversa = {
  houveConversa: false,
  totalDeMensagens: 0,
  mensagensDaLead: 0,
  mensagensDoCorretor: 0,
  ultimoAFalar: null,
  ultimaMensagemEm: null,
  horasDesdeUltimaMensagem: null,
  aguardandoResposta: false,
  horasEsperando: null,
  leadJaRespondeu: false,
  audiosDaLead: 0,
};

type LinhaDeMensagem = {
  direction?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  media?: unknown;
};

/**
 * Deriva os fatos a partir das mensagens. Puro e testável — nenhum acesso a
 * banco aqui, para que a regra possa ser exercitada sem infraestrutura.
 */
export function derivarFatos(
  mensagens: LinhaDeMensagem[],
  agora = new Date(),
): FatosDaConversa {
  if (!mensagens.length) return SEM_CONVERSA;

  const comData = mensagens
    .map((m) => ({
      entrada: m.direction === "inbound",
      quando: new Date(m.sent_at ?? m.created_at ?? 0).getTime(),
      audio: typeof m.media === "object" && m.media !== null
        && (m.media as Record<string, unknown>).tipo === "audio",
    }))
    .filter((m) => Number.isFinite(m.quando) && m.quando > 0)
    .sort((a, b) => a.quando - b.quando);

  if (!comData.length) return SEM_CONVERSA;

  const ultima = comData[comData.length - 1];
  const daLead = comData.filter((m) => m.entrada);
  const horas = (ms: number) => Math.round((agora.getTime() - ms) / 3_600_000);

  return {
    houveConversa: true,
    totalDeMensagens: comData.length,
    mensagensDaLead: daLead.length,
    mensagensDoCorretor: comData.length - daLead.length,
    ultimoAFalar: ultima.entrada ? "lead" : "corretor",
    ultimaMensagemEm: new Date(ultima.quando).toISOString(),
    horasDesdeUltimaMensagem: horas(ultima.quando),
    // Só conta como espera se a ÚLTIMA foi da lead. Se o corretor respondeu
    // depois, a bola não está mais com ele — mesmo que a conversa tenha
    // parado ali.
    aguardandoResposta: ultima.entrada,
    horasEsperando: ultima.entrada ? horas(ultima.quando) : null,
    leadJaRespondeu: daLead.length > 0,
    audiosDaLead: daLead.filter((m) => m.audio).length,
  };
}

/**
 * Busca as mensagens de uma lead e devolve os fatos.
 *
 * Lê só as colunas necessárias para derivar estado. `content` NÃO é
 * selecionada — o texto não precisa nem sair do banco para responder as
 * perguntas que a IA faz.
 */
export async function fatosDaConversaDaLead(
  admin: SupabaseClient,
  organizationId: string,
  leadId: string,
  limite = 200,
): Promise<FatosDaConversa> {
  const { data: conversas } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId);

  const ids = (conversas ?? []).map((c) => c.id as string).filter(Boolean);
  if (!ids.length) return SEM_CONVERSA;

  const { data: mensagens } = await admin
    .from("messages")
    .select("direction,sent_at,created_at,media")
    .eq("organization_id", organizationId)
    .in("conversation_id", ids)
    .order("sent_at", { ascending: false })
    .limit(limite);

  return derivarFatos(mensagens ?? []);
}

/**
 * Frase curta em PT-BR para a IA e para a tela.
 * Devolve null quando não há nada a dizer — melhor silêncio que ruído.
 */
export function resumirParaHumano(f: FatosDaConversa): string | null {
  if (!f.houveConversa) return null;

  if (f.aguardandoResposta) {
    const h = f.horasEsperando ?? 0;
    const quanto = h < 1 ? "há menos de uma hora"
      : h < 24 ? `há ${h}h`
      : `há ${Math.floor(h / 24)} dia(s)`;
    return `O cliente escreveu ${quanto} e ainda não teve resposta.`;
  }

  if (!f.leadJaRespondeu) {
    return `${f.mensagensDoCorretor} mensagem(ns) enviada(s), nenhuma resposta até agora.`;
  }

  const h = f.horasDesdeUltimaMensagem ?? 0;
  if (h >= 72) return `Conversa parada há ${Math.floor(h / 24)} dia(s) — a última palavra foi sua.`;
  return `Conversa em andamento (${f.totalDeMensagens} mensagens).`;
}
