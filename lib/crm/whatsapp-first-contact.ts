import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O WHATSAPP FECHA O RELÓGIO DO PRIMEIRO CONTATO.
 *
 * ── O BURACO ────────────────────────────────────────────────────────────────
 *
 * Medido: 217 leads, **1 contatada**. E o WhatsApp — o canal que a operação de
 * fato usa — não tocava em `first_contacted_at`. Nem o envio pelo CRM, nem a
 * resposta da lead.
 *
 * Uma conversa inteira podia acontecer e a lead continuava aparecendo como
 * "SLA vencido, sem primeiro contato". O corretor atendia e o CRM cobrava.
 *
 * A única porta que fechava o relógio era o botão manual de 1 clique — que
 * depende de alguém lembrar de clicar depois de já ter falado com a pessoa.
 *
 * ── AS DUAS DIREÇÕES CONTAM COISAS DIFERENTES ───────────────────────────────
 *
 * **Saída** (o corretor mandou): é primeiro contato no sentido pleno. Foi a
 * empresa que buscou a pessoa dentro do prazo.
 *
 * **Entrada** (a lead escreveu): não é a empresa cumprindo prazo — mas é prova
 * de que a conversa começou. Deixar o relógio correndo numa lead que está
 * conversando faria o painel gritar sobre alguém que está sendo atendido, e
 * alarme falso é como um painel perde a confiança de quem olha.
 *
 * Por isso o relógio fecha nos dois casos, e a origem fica registrada. Quem
 * olhar a medição depois consegue separar "nós corremos atrás" de "ela veio".
 */

export type OrigemDoContato = "saida" | "entrada";

export type ResultadoDoFechamento = {
  fechou: boolean;
  jaEstavaFechado: boolean;
  indisponivel: boolean;
  motivo?: string;
};

/**
 * Fecha o SLA de primeiro contato de uma lead, se ainda estiver aberto.
 *
 * Idempotente por leitura: confere antes de chamar a RPC. A própria RPC também
 * é idempotente (`where first_contacted_at is null`), mas evitar a chamada
 * mantém o log limpo — mesma decisão da rota manual.
 *
 * Nunca lança. Este código roda dentro de webhook: derrubar a entrega de
 * mensagem porque a medição falhou seria trocar um dado por outro maior.
 */
export async function fecharPrimeiroContatoPorWhatsapp(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    leadId: string;
    origem: OrigemDoContato;
    ocorridoEm: string;
  },
): Promise<ResultadoDoFechamento> {
  try {
    const { data: lead, error: erroDeLeitura } = await admin
      .from("leads")
      .select("id,first_contacted_at")
      .eq("id", entrada.leadId)
      .eq("organization_id", entrada.organizationId)
      .maybeSingle();

    if (erroDeLeitura || !lead) {
      return { fechou: false, jaEstavaFechado: false, indisponivel: false, motivo: "lead_nao_encontrada" };
    }
    if (lead.first_contacted_at) {
      return { fechou: false, jaEstavaFechado: true, indisponivel: false };
    }

    const { error } = await admin.rpc("complete_first_contact_sla", {
      p_organization_id: entrada.organizationId,
      p_lead_id: entrada.leadId,
      p_occurred_at: entrada.ocorridoEm,
    });

    if (error) {
      // Banco sem a migration da fase 34: a mensagem continua registrada e a
      // medição não acontece. Melhor perder a métrica do que perder o contato.
      const indisponivel = error.code === "42883" || error.code === "PGRST202";
      return { fechou: false, jaEstavaFechado: false, indisponivel, motivo: error.code };
    }

    return { fechou: true, jaEstavaFechado: false, indisponivel: false };
  } catch (erro) {
    return {
      fechou: false,
      jaEstavaFechado: false,
      indisponivel: false,
      motivo: erro instanceof Error ? erro.message : "erro_desconhecido",
    };
  }
}

/**
 * Texto que vai para a linha do tempo da lead.
 *
 * Diz QUEM começou. Sem isso, daqui a um mês ninguém sabe se o tempo de
 * resposta de 4 minutos foi mérito do corretor ou uma lead ansiosa.
 */
export function descreverContatoDeWhatsapp(origem: OrigemDoContato): string {
  return origem === "saida"
    ? "Primeiro contato por WhatsApp — mensagem enviada pelo Atlas."
    : "Primeiro contato por WhatsApp — a lead escreveu primeiro.";
}
