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
        lead_id: lead?.id ?? null,
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
      // Se a lead foi criada DEPOIS da conversa começar, a conversa adota a
      // lead agora — sem isto o histórico anterior ficaria órfão.
      ...(lead?.id ? { lead_id: lead.id } : {}),
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

  await admin.from("whatsapp_broker_sessions")
    .update({ last_activity_at: agora, updated_at: agora })
    .eq("profile_id", profileId);

  return NextResponse.json({
    ok: true,
    conversationId,
    ligadaALead: Boolean(lead?.id),
  });
}
