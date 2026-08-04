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
import { logger } from "@/lib/observability/logger";

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

  // ── FALHA DE LEITURA NÃO É RESPOSTA ───────────────────────────────────────
  //
  // As três consultas abaixo decidem o destino de uma mensagem de cliente. Até
  // 02/08/2026 as três descartavam o `error` — e cada uma tinha um jeito
  // diferente de errar CALADA:
  //
  //   `messages`      → erro virava "não é reentrega", e a mensagem seguia
  //   `leads`         → erro virava "não é lead", e a mensagem era DESCARTADA
  //                     com `ok: true` de volta para a ponte
  //   `conversations` → erro virava "não existe conversa", e nascia OUTRA
  //
  // A do meio é a grave: o banco pisca, e o CRM responde à ponte que está tudo
  // certo e que aquele contato não interessa. A ponte só olha `r.ok`, não
  // reenvia, e a mensagem do cliente deixa de existir — sem uma linha de log,
  // sem nada na tela, com o CRM afirmando sucesso.
  //
  // 503 em vez disso: a ponte registra "CRM recusou 503" no log dela, e o que
  // era perda silenciosa vira perda VISÍVEL. Não é o ideal (o ideal é a ponte
  // reenviar — ver relatório), mas é a diferença entre um problema que alguém
  // pode achar e um que ninguém nunca vai achar.
  const naoDeuParaLer = (onde: string) =>
    NextResponse.json({ error: `não foi possível consultar ${onde} agora`, retryable: true }, { status: 503 });

  // Idempotência: o WhatsApp reentrega. Sem isto, uma reentrega vira mensagem
  // duplicada na conversa e o corretor lê duas vezes o mesmo texto.
  const { data: jaTemos, error: erroDaBusca } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("external_message_id", externalMessageId)
    .maybeSingle();
  if (erroDaBusca) return naoDeuParaLer("mensagens já recebidas");
  if (jaTemos) return NextResponse.json({ ok: true, duplicada: true });

  // A lead é encontrada pelo telefone normalizado. `phone_normalized` existe
  // exatamente para isso; `phone` guarda o que foi digitado, com máscara.
  const { data: lead, error: erroDaLead } = await admin
    .from("leads")
    .select("id,assigned_to,assigned_user_id")
    .eq("organization_id", organizationId)
    .eq("phone_normalized", contato)
    .maybeSingle();
  if (erroDaLead) return naoDeuParaLer("a carteira de leads");

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

  // `.maybeSingle()` aqui era uma armadilha de mão dupla: ele ERRA quando acha
  // mais de uma linha, e não existe índice único em
  // (organization_id, external_thread_id) — conferido no banco vivo, só há
  // `conversations_pkey` e um índice não-único por (organization_id,
  // updated_at). Ou seja: bastavam duas mensagens chegando juntas para nascerem
  // duas conversas do mesmo par corretor+contato; a partir daí TODA mensagem
  // seguinte batia no erro de "múltiplas linhas", o erro era descartado, e cada
  // mensagem passava a abrir mais uma conversa. A linha do tempo do cliente se
  // partia em N pedaços e o defeito se alimentava sozinho.
  //
  // Lista com teto de 2 em vez de `maybeSingle`: duas linhas deixam de ser erro
  // e passam a ser um FATO observável, a mais antiga continua sendo a conversa,
  // e a duplicidade fica gritando no log em vez de crescer calada.
  // A migration que cria o índice único está escrita e NÃO aplicada
  // (supabase/migrations/20260802T000000_conversa_unica_por_thread.sql).
  const { data: encontradas, error: erroDaConversa } = await admin
    .from("conversations")
    .select("id,unread_count,created_at")
    .eq("organization_id", organizationId)
    .eq("external_thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(2);
  if (erroDaConversa) return naoDeuParaLer("as conversas deste contato");

  const existente = encontradas?.[0];
  if ((encontradas?.length ?? 0) > 1) {
    logger.warn("ponte.conversa_duplicada", {
      organizationId,
      externalThreadId: threadId,
      usando: existente?.id,
      motivo: "existe mais de uma conversa para o mesmo corretor+contato; aplicar o índice único",
    });
  }

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
        // `leads` tem duas colunas para o mesmo dono (ver check-dono-da-lead.mjs).
        // `conversations` NÃO tem: só `assigned_to`. Escrever `assigned_user_id`
        // aqui derrubava o insert inteiro com PGRST204, e como esta tabela nunca
        // teve linha, a primeira mensagem de todo corretor se perdia sem que
        // nenhum teste notasse. Conferido contra o banco vivo em 02/08/2026.
        assigned_to: profileId,
        last_message_at: corpo?.enviadaEm ?? agora,
        unread_count: corpo?.direcao === "entrada" ? 1 : 0,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversationId = nova.id;
  } else {
    const atualizou = await admin.from("conversations").update({
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
    // O retorno era descartado. É este update que move a conversa para o topo
    // da caixa de entrada e acende o não-lido; se ele falhar em silêncio, a
    // mensagem é gravada e a conversa continua parada com o texto de ontem.
    if (atualizou.error) {
      logger.error("ponte.conversa_nao_atualizada", {
        conversationId, organizationId, code: atualizou.error.code,
      });
    }
  }

  const { error: erroMsg } = await admin.from("messages").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    direction: corpo?.direcao === "saida" ? "outbound" : "inbound",
    channel: "whatsapp",
    sender: corpo?.direcao === "saida" ? profileId : contato,
    recipient: corpo?.direcao === "saida" ? contato : profileId,
    content: corpo?.texto ?? null,
    // Array, e não objeto: a coluna nasce `'[]'::jsonb`, todo outro escritor de
    // `messages` grava lista, e quem lê faz `Array.isArray(media) ? media : []`
    // — um objeto solto ali era descartado na leitura. O tipo do anexo ficava
    // gravado num formato que ninguém consegue ler de volta.
    media: corpo?.tipo && corpo.tipo !== "texto" ? [{ tipo: corpo.tipo }] : [],
    status: "received",
    external_message_id: externalMessageId,
    sent_at: corpo?.enviadaEm ?? agora,
  });
  if (erroMsg) {
    // 23505 = o índice único `uq_messages_external_delivery` pegou uma
    // reentrega que passou pela busca de idempotência (duas entregas do mesmo
    // id chegando juntas: as duas leem "não existe", as duas tentam gravar).
    // Isso é o banco fazendo o trabalho certo — a mensagem JÁ está registrada.
    // Devolver 500 fazia a ponte anotar "CRM recusou" para uma entrega que
    // tinha dado certo, e enchia o log de erro com o sucesso do dia seguinte.
    if (erroMsg.code === "23505") return NextResponse.json({ ok: true, duplicada: true });
    return NextResponse.json({ error: erroMsg.message }, { status: 500 });
  }

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

  // Heartbeat da sessão do corretor. `update` que não casa linha nenhuma volta
  // 200 SEM erro no PostgREST — então "não deu erro" aqui nunca significou
  // "gravou". Duas coisas diferentes são medidas de propósito: o ERRO (o banco
  // recusou) e a AUSÊNCIA DE LINHA (não há sessão registrada para este
  // corretor, que é o estado de hoje — `whatsapp_broker_sessions` tem 0 linhas
  // em produção). A segunda não é falha, mas é exatamente o fato que explica
  // por que a presença do corretor nunca acende — e ficava invisível.
  const heartbeat = await admin.from("whatsapp_broker_sessions")
    .update({ last_activity_at: agora, updated_at: agora })
    .eq("profile_id", profileId)
    .select("id");
  if (heartbeat.error) {
    logger.error("ponte.heartbeat_recusado", { profileId, code: heartbeat.error.code });
  } else if (!heartbeat.data?.length) {
    logger.warn("ponte.sessao_sem_registro", {
      profileId,
      motivo: "mensagem processada sem linha em whatsapp_broker_sessions — /bridge/status nunca gravou o estado desta sessão",
    });
  }

  return NextResponse.json({
    ok: true,
    conversationId,
    leadId: lead.id,
    primeiroContatoFechado: fechamento.fechou,
  });
}
