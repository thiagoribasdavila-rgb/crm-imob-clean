/**
 * A PONTE ENTREGA UMA MENSAGEM AO CRM.
 *
 * É aqui que "gravar tudo na memória do CRM" acontece. Cada mensagem que passa
 * pelo WhatsApp do corretor — nos dois sentidos — vira uma linha em `messages`,
 * pendurada numa `conversation`, ligada à lead quando o telefone bate.
 *
 * ── Escreve nas tabelas que já existem ──────────────────────────────────────
 *
 * `conversations` e `messages` já estavam de pé (34 usos no código, webhook da
 * Cloud API, outbox de envio) e com ZERO linhas — nunca houve número conectado.
 * Criar `whatsapp_broker_messages` daria uma segunda memória, e as perguntas do
 * CRM ("quantas conversas essa lead teve") passariam a ter duas respostas.
 *
 * ── Quem pode chamar ────────────────────────────────────────────────────────
 *
 * Só a ponte, pelo segredo compartilhado, e só de rede local. Não há sessão de
 * usuário aqui: quem fala é um processo, não uma pessoa.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { segredoDaPonte, paraE164 } from "@/lib/whatsapp/bridge-contract";
import { fecharPrimeiroContatoPorWhatsapp } from "@/lib/crm/whatsapp-first-contact";

export const dynamic = "force-dynamic";

type Entrada = {
  profileId?: string;
  organizationId?: string;
  contatoE164?: string;
  externalMessageId?: string;
  direcao?: "entrada" | "saida";
  texto?: string | null;
  tipo?: string;
  enviadaEm?: string;
  nomeDoContato?: string | null;
};

/**
 * Compara pelo segredo em tempo constante.
 * Comparação com `!==` vaza o tamanho do prefixo correto pelo tempo de resposta.
 */
function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

export async function POST(request: NextRequest) {
  const esperado = segredoDaPonte();
  if (!esperado) return NextResponse.json({ error: "bridge disabled" }, { status: 503 });
  if (!segredoConfere(request.headers.get("x-atlas-bridge-secret"), esperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const corpo = (await request.json().catch(() => null)) as Entrada | null;
  const profileId = corpo?.profileId;
  const organizationId = corpo?.organizationId;
  const contato = paraE164(corpo?.contatoE164 ?? "");
  const externalMessageId = corpo?.externalMessageId;

  if (!profileId || !organizationId || !contato || !externalMessageId) {
    return NextResponse.json({ error: "campos obrigatórios ausentes" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Idempotência: o WhatsApp reentrega. Sem isto, uma reentrega vira mensagem
  // duplicada na conversa e o corretor lê duas vezes o mesmo texto.
  const { data: jaTemos } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("external_message_id", externalMessageId)
    .maybeSingle();
  if (jaTemos) return NextResponse.json({ ok: true, duplicada: true });

  // A lead é encontrada pelo telefone normalizado. `phone_normalized` existe
  // exatamente para isso; `phone` guarda o que foi digitado, com máscara.
  const { data: lead } = await admin
    .from("leads")
    .select("id,assigned_to,assigned_user_id")
    .eq("organization_id", organizationId)
    .eq("phone_normalized", contato)
    .maybeSingle();

  // ── SEGUNDA TRANCA ────────────────────────────────────────────────────────
  //
  // O CRM guarda conversa de LEAD. Conversa particular do corretor não entra —
  // nem o texto, nem o nome do contato, nem o registro de que existiu.
  //
  // A ponte já pergunta antes de mandar (/bridge/is-lead), então em operação
  // normal nada não-lead chega aqui. Esta segunda tranca existe porque a
  // primeira depende da ponte estar na versão certa, e o custo de errar é
  // gravar a vida particular de alguém — não é o tipo de erro que se conserta
  // depois pedindo desculpa.
  if (!lead?.id) {
    return NextResponse.json({ ok: true, ignorada: "contato não é lead desta organização" });
  }

  // A conversa é a linha do tempo daquele contato com aquele corretor.
  // `external_thread_id` junta o corretor e o contato: o mesmo cliente falando
  // com dois corretores são duas conversas, e é assim mesmo — são dois
  // atendimentos.
  const threadId = `wa:${profileId}:${contato}`;
  const agora = new Date().toISOString();

  const { data: existente } = await admin
    .from("conversations")
    .select("id,unread_count")
    .eq("organization_id", organizationId)
    .eq("external_thread_id", threadId)
    .maybeSingle();

  let conversationId = existente?.id as string | undefined;

  if (!conversationId) {
    const { data: nova, error } = await admin
      .from("conversations")
      .insert({
        organization_id: organizationId,
        lead_id: lead.id,
        channel: "whatsapp",
        external_thread_id: threadId,
        status: "open",
        assigned_to: profileId,
        last_message_at: corpo?.enviadaEm ?? agora,
        unread_count: corpo?.direcao === "entrada" ? 1 : 0,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversationId = nova.id;
  } else {
    await admin.from("conversations").update({
      last_message_at: corpo?.enviadaEm ?? agora,
      // Só o que ENTRA fica por ler. Contar o que o próprio corretor mandou
      // deixaria um badge que nunca zera.
      unread_count: corpo?.direcao === "entrada" ? (existente?.unread_count ?? 0) + 1 : (existente?.unread_count ?? 0),
      // A conversa sempre tem lead: sem lead a requisição já foi recusada
      // acima. Reafirmar aqui cobre a conversa que nasceu antes de um
      // recadastro trocar o id da lead.
      lead_id: lead.id,
      updated_at: agora,
    }).eq("id", conversationId);
  }

  const { error: erroMsg } = await admin.from("messages").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    direction: corpo?.direcao === "saida" ? "outbound" : "inbound",
    channel: "whatsapp",
    sender: corpo?.direcao === "saida" ? profileId : contato,
    recipient: corpo?.direcao === "saida" ? contato : profileId,
    content: corpo?.texto ?? null,
    media: corpo?.tipo && corpo.tipo !== "texto" ? { tipo: corpo.tipo } : {},
    status: "received",
    external_message_id: externalMessageId,
    sent_at: corpo?.enviadaEm ?? agora,
  });
  if (erroMsg) return NextResponse.json({ error: erroMsg.message }, { status: 500 });

  // ── O relógio de primeiro contato ─────────────────────────────────────────
  //
  // `fecharPrimeiroContatoPorWhatsapp` já era chamado pelo webhook da Cloud API
  // e pelo outbox de envio. A ponte do corretor não chamava — então o corretor
  // respondia pelo WhatsApp DELE e o CRM seguia achando que a lead nunca tinha
  // sido atendida: vigia de SLA cobrando quem já atendeu, e a métrica de
  // primeiro contato medindo o canal errado.
  //
  // Fecha nos DOIS sentidos, de propósito. Saída é o corretor atendendo.
  // Entrada é a lead falando primeiro — e lead que já está conversando não
  // pode continuar na fila de "ninguém atendeu"; o relógio dela perdeu o
  // sentido no instante em que a conversa começou.
  const fechamento = await fecharPrimeiroContatoPorWhatsapp(admin, {
    organizationId,
    leadId: lead.id,
    origem: corpo?.direcao === "saida" ? "saida" : "entrada",
    ocorridoEm: corpo?.enviadaEm ?? agora,
  });

  await admin.from("whatsapp_broker_sessions")
    .update({ last_activity_at: agora, updated_at: agora })
    .eq("profile_id", profileId);

  return NextResponse.json({
    ok: true,
    conversationId,
    leadId: lead.id,
    primeiroContatoFechado: fechamento.fechou,
  });
}
