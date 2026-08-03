import { NextResponse, type NextRequest } from "next/server";
import { assessLeadCompleteness } from "@/lib/ai/data-completeness";
import { perfilConfirmadoNoCrm, respostasDoFormularioNoMetadata, respostasLegadoDoPerfil, respostasLegadoNoMetadata, unificarQualificacao } from "@/lib/crm/qualificacao-canonica";
import {
  buildGovernedLeadContextAuditMetadata,
  normalizeCommercialContextText,
  normalizeCommercialProjectId,
  sameGovernedLeadCommercialContext,
  validateGovernedLeadContextCorrection,
} from "@/lib/atlas/governed-lead-context-correction";
import { commercialOutcomeFromStages } from "@/lib/ai/learning-loop";
import { LIVE_LEAD_SELECT, LIVE_LEAD_SELECT_WITH_SLA, canonicalLeadStatus, isMissingColumn, isMissingRelation, mapLegacyLead, mapLegacyProfile } from "@/lib/compat/legacy-v2";
import { liveLeadUpdatePayload, mapLiveLeadEvent, recordCommercialLearningEvent, recordLiveLeadEvent } from "@/lib/compat/live-writes";
import { computeAttentionSignalsForLead } from "@/lib/atlas/attention-signals";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";
import { FONTES_DO_HISTORICO, lerHistoricoDoLead } from "@/lib/crm/historico-do-lead";
import { logger } from "@/lib/observability/logger";
import { montarOrigemDaLead } from "@/lib/crm/origem-da-lead";
import { ehLeadForaDaCarteira, requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/security";
import { tarefaEncerrada } from "@/lib/crm/task-status";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type JsonRow = Record<string, unknown>;

/**
 * ── A FICHA É A ÚNICA LEITURA QUE PRECISA DO `metadata` ─────────────────────
 *
 * `metadata` não está em `LIVE_LEAD_SELECT` nem no estendido, e ficar fora dos
 * selects COMPARTILHADOS é correto: `distribution` e `director-daily` buscam até
 * 20.000 leads, e a coluna pesa 509 B em média nesta base (243 KB no total).
 * Somá-la lá acrescentaria ~10 MB a rotas que não leem o conteúdo.
 *
 * Mas `completenessInput` (logo abaixo) LÊ `lead.metadata`, e `mapLegacyLead`
 * resolve chave ausente para `{}`. Sem a coluna no select, a ficha recebia `{}`
 * SEMPRE — e `assessLeadCompleteness` tira `prazo de compra` (peso 12) e
 * `forma de pagamento` (peso 10) de `metadata.qualificationAnswers`.
 *
 * Efeito medido antes desta correção, executando as duas funções reais sobre uma
 * lead com TODOS os campos preenchidos: nota 78 de 100, com "prazo de compra" e
 * "forma de pagamento" listados como incompletos e a próxima pergunta sendo
 * "Quando pretende comprar?". Nenhuma lead da base conseguia passar de 78, e as
 * 14 que responderam as duas perguntas em /qualify eram interrogadas de novo —
 * a rota GRAVA a resposta num lugar que a rota de leitura não busca.
 *
 * Aqui a leitura é de UMA lead: 509 B. As duas escadas carregam a coluna porque
 * a degradação por 42703 troca o select inteiro — se só a primeira a tivesse, o
 * banco sem as colunas de SLA perderia junto o `metadata`, que nada tem a ver.
 */
const COLUNAS_DA_FICHA = `${LIVE_LEAD_SELECT_WITH_SLA},metadata`;
const COLUNAS_DA_FICHA_SEM_SLA = `${LIVE_LEAD_SELECT},metadata`;

function requestError(error: unknown) {
  // Lead de outra carteira é RECUSA, não falha de sessão nem dado inválido: a
  // Lead 360 escreve o MESMO campo que o Kanban (`leads.status`) e por aqui não
  // havia trava nenhuma — medido em 2026-07-29, um corretor de carteira vazia
  // renomeou, reescreveu e DESCARTOU a lead de um colega com 200.
  if (ehLeadForaDaCarteira(error)) {
    return NextResponse.json({ error: error.message, code: "LEAD_OUT_OF_SCOPE" }, { status: 403 });
  }
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  const status = /sessão|token|autenticação|autoriz|organiza|escopo/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

function completenessInput(lead: JsonRow) {
  return {
    name: typeof lead.name === "string" ? lead.name : null,
    phone: typeof lead.phone === "string" ? lead.phone : null,
    email: typeof lead.email === "string" ? lead.email : null,
    purpose: typeof lead.purpose === "string" ? lead.purpose : null,
    budget_min: typeof lead.budget_min === "number" ? lead.budget_min : null,
    budget_max: typeof lead.budget_max === "number" ? lead.budget_max : null,
    preferred_regions: Array.isArray(lead.preferred_regions) ? lead.preferred_regions.map(String) : [],
    bedrooms: typeof lead.bedrooms === "number" ? lead.bedrooms : null,
    development_id: typeof lead.development_id === "string" ? lead.development_id : null,
    next_action_at: typeof lead.next_action_at === "string" ? lead.next_action_at : null,
    metadata: lead.metadata,
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const admin = getSupabaseAdmin();

    // As colunas de SLA vêm no select estendido; o banco legado não as tem e
    // responde 42703. Sem esta degradação, ligar a medição na ficha derrubaria a
    // ficha inteira — que é justamente o erro que a fase 34 pagou caro para achar.
    const lerLead = (colunas: string) => admin
      .from("leads")
      .select(colunas)
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .maybeSingle();

    let slaMensuravel = true;
    let { data: storedLead, error: leadError } = await lerLead(COLUNAS_DA_FICHA);
    if (leadError && isMissingColumn(leadError)) {
      slaMensuravel = false;
      ({ data: storedLead, error: leadError } = await lerLead(COLUNAS_DA_FICHA_SEM_SLA));
    }
    if (leadError || !storedLead) return NextResponse.json({ error: "Lead fora do seu escopo comercial." }, { status: 403 });

    const lead = mapLegacyLead(storedLead as unknown as JsonRow);
    const [historico, taskResult, ownerResult, projectResult, projectOptionsResult, oportunidadesResult, perfilResult] = await Promise.all([
      // ── A FICHA LIA UMA GAVETA DE TRÊS ────────────────────────────────────
      //
      // Aqui havia um `select` direto em `lead_events`, e só nela. Medido no
      // banco vivo em 02/08/2026: 42 leads têm linha em `lead_events` e 444 têm
      // movimentação registrada — 415 leads tinham história e NENHUM evento.
      // Para essas 415 a ficha afirmava "Ainda não há interação registrada com
      // este cliente" e marcava `interação registrada` como campo incompleto na
      // nota de completude, enquanto a pontuação de qualificação contava a OUTRA
      // gaveta. Duas leituras, duas respostas, o mesmo cliente.
      //
      // A união (interações das duas gavetas + movimentação da fonte canônica,
      // sem o espelho que a RPC grava em `activities`) vive num lugar só:
      // `lib/crm/historico-do-lead.ts`. Repetir a mescla aqui seria repetir o
      // defeito com mais linhas.
      lerHistoricoDoLead(admin, { organizationId: identity.organizationId, leadId: id, limite: 100 }),
      admin
        .from("tasks")
        .select("id,title,description,status,due_date,priority,user_id,created_at")
        .eq("lead_id", id)
        .eq("organization_id", identity.organizationId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(100),
      // ── O DONO DA LEAD SUMIA DA FICHA ─────────────────────────────────────
      //
      // O select pedia `id,name,role,team`. `mapLegacyProfile` resolve
      // `full_name: first(row,"full_name","name")` e
      // `commercial_role: first(row,"commercial_role","role")` — ele PREFERE as
      // canônicas, mas nenhuma das duas estava aqui, então as duas caíam na
      // legada. E a ficha lê exatamente `owner.full_name`.
      //
      // Medido no banco vivo em 02/08/2026: 23 perfis, `full_name` preenchido em
      // 23, `name` em 10 — e 488 das 489 leads com dono pertencem a alguém com
      // `name` NULO. Ou seja, o cabeçalho dizia "Sem responsável · distribuição
      // necessária" em 488 fichas cujo dono está gravado, e o link ao lado
      // convidava a ATRIBUIR uma lead que já tem corretor.
      //
      // É a mesma doença que `LIVE_PROFILE_SELECT` documenta uma tabela adiante.
      // Não uso aquele select inteiro aqui de propósito: ele carrega `email` e
      // `organization_id`, e este objeto vai INTEIRO para o navegador dentro de
      // `relationshipContext.owner`. Pedir só o que o mapeador e a tela leem
      // conserta o nome sem alargar o que sai do servidor.
      lead.assigned_to
        ? admin.from("profiles").select("id,name,full_name,role,commercial_role,team").eq("id", lead.assigned_to).eq("organization_id", identity.organizationId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      lead.development_id
        ? admin.from("crm_projects").select("id,name,developer_name,status,city").eq("id", lead.development_id).eq("organization_id", identity.organizationId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin
        .from("crm_projects")
        .select("id,name,developer_name,status,city")
        .eq("organization_id", identity.organizationId)
        .order("name", { ascending: true })
        .limit(500),
      // Esta rota devolvia `opportunities: []` FIXO. Não era um bloco morto: a
      // tela usa o tamanho desta lista para pontuar prontidão (+10) e para
      // classificar risco. Com `[]` cravado, NENHUMA lead podia ser "risco
      // baixo" — o ramo era inalcançável — e a prontidão tinha teto de 90 para
      // todo mundo. Número errado que o corretor lê e usa é pior que bloco
      // vazio: bloco vazio se percebe, número plausível não.
      admin
        .from("opportunities")
        .select("id,stage,value,probability,expected_close_at,property_id,created_at")
        .eq("lead_id", id)
        .eq("organization_id", identity.organizationId)
        .order("created_at", { ascending: false })
        .limit(50),
      // A GAVETA CANÔNICA DA QUALIFICAÇÃO. `assessLeadCompleteness` tira 22 dos
      // 100 pontos de `metadata.qualificationAnswers`, mas o corretor confirma
      // prazo e forma de pagamento na tela conversacional, e aquilo grava em
      // `lead_qualification_profiles`. Sem esta leitura, quem respondeu POR LÁ
      // continuava com teto de 78 e a ficha continuava mandando perguntar de
      // novo — a mesma ausência que o contrato `ficha-le-o-metadata` já pegou
      // uma vez, agora pela outra gaveta.
      admin
        .from("lead_qualification_profiles")
        .select("purpose_key,timeline_key,financing_key,budget_readiness_key,region_readiness_key,unit_profile_key,decision_role_key,contact_preference_key")
        .eq("lead_id", id)
        .eq("organization_id", identity.organizationId)
        .maybeSingle(),
    ]);

    if (oportunidadesResult.error) {
      logger.warn("lead.opportunities.read_failed", { leadId: id, code: oportunidadesResult.error.code });
    }

    // As propostas da fase 37 vivem em commercial_simulations (a fase acrescentou
    // status, marcos e os três tempos àquela tabela). Esta rota devolvia
    // `proposals: []` cravado — a tela do lead tem o tipo completo, renderiza
    // preparação/revisão/resposta e nunca teve o que mostrar. É o mesmo padrão
    // do relógio que não fechava: a peça existe, a ligação não.
    //
    // Banco sem a fase 37 (relação ou coluna ausente) devolve lista vazia com
    // aviso, em vez de derrubar a ficha inteira.
    const COLUNAS_DE_PROPOSTA =
      "id,status,property_price,valid_until,review_requested_at,approved_at,sent_at,responded_at,expired_at,preparation_minutes,review_minutes,response_minutes,response_note,rule_snapshot,created_at";
    const propostas = await admin
      .from("commercial_simulations")
      .select(COLUNAS_DE_PROPOSTA)
      .eq("lead_id", id)
      .eq("organization_id", identity.organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    const propostasMensuraveis = !propostas.error
      || !(isMissingColumn(propostas.error) || isMissingRelation(propostas.error));
    if (propostas.error && propostasMensuraveis) {
      logger.warn("lead.proposals.read_failed", { leadId: id, code: propostas.error.code });
    }

    /**
     * ── OS EVENTOS DE CAMPANHA ERAM DESCARTADOS ────────────────────────────
     *
     * `campaignEvents: []` estava cravado no perfil unificado — três linhas abaixo
     * do comentário que diz "zero em cima de ausência é o erro que esta rota já
     * cometia". A lição estava escrita e o defeito logo ali.
     *
     * Medido em 2026-07-30: `campaign_events` tem 24 linhas, TODAS com `lead_id`
     * — 21 sinais de qualificação e 3 de criação. Não era ausência de dado: era
     * dado real jogado fora antes de chegar na tela.
     *
     * Relação ausente degrada para lista vazia com aviso, como as outras leituras
     * desta rota — o que não pode acontecer é o zero silencioso voltar.
     */
    const eventosDeCampanha = await admin
      .from("campaign_events")
      .select("id,campaign_id,event_type,source,value,currency,occurred_at,created_at")
      .eq("lead_id", id)
      .eq("organization_id", identity.organizationId)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(50);
    const campanhaMensuravel =
      !eventosDeCampanha.error
      || !(isMissingColumn(eventosDeCampanha.error) || isMissingRelation(eventosDeCampanha.error));
    if (eventosDeCampanha.error && campanhaMensuravel) {
      logger.warn("lead.campaign_events.read_failed", { leadId: id, code: eventosDeCampanha.error.code });
    }

    /**
     * ── DE ONDE ESTA LEAD VEIO ────────────────────────────────────────────
     *
     * Três leituras, em paralelo, para responder a pergunta que a ficha não
     * respondia: campanha (nome e verba), o evento da Meta (anúncio, conjunto,
     * formulário, Página e a RESPOSTA que a pessoa deu no anúncio) e o nome do
     * formulário.
     *
     * Nenhuma delas derruba a ficha: relação ausente ou erro degrada para
     * `medido: false`, e a tela distingue "esta lead não tem campanha" de "não
     * consegui ler a campanha". Zero silencioso aqui seria o mesmo defeito que
     * escondeu 103 leads na represa.
     */
    const [campanhaDaLead, eventoDaMeta] = await Promise.all([
      lead.campaign_id
        ? admin
            .from("marketing_campaigns")
            .select("id,name,external_campaign_id,platform,status")
            .eq("id", lead.campaign_id)
            .eq("organization_id", identity.organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin
        .from("meta_lead_events")
        .select("ad_id,adset_id,form_id,page_id,campaign_external_id,payload")
        .eq("lead_id", id)
        .eq("organization_id", identity.organizationId)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const gastoDaCampanha = lead.campaign_id
      ? await admin
          .from("marketing_spend")
          .select("amount")
          .eq("campaign_id", lead.campaign_id)
          .limit(1000)
          .then((r) =>
            r.error
              ? null
              // Centavos, não binário: somar 22 diárias em ponto flutuante
              // produziu 378.06000000000006 no primeiro ensaio. Dinheiro
              // arredonda na fronteira, senão a tela herda o resíduo.
              : Math.round((r.data ?? []).reduce((soma, l) => soma + (Number(l.amount) || 0), 0) * 100) / 100)
      : null;

    // O nome do formulário mora na fonte, não no evento — é o que o corretor
    // reconhece ("Inside Smart | Form - Mai26"), e o id sozinho não diz nada.
    const fonteDoFormulario = eventoDaMeta.data?.form_id
      ? await admin
          .from("meta_lead_sources")
          .select("name")
          .eq("form_id", String(eventoDaMeta.data.form_id))
          .eq("organization_id", identity.organizationId)
          .maybeSingle()
      : { data: null, error: null };

    /**
     * ── A CONVERSA DO WHATSAPP, QUE A FICHA DECLARAVA COMO ZERO ───────────
     *
     * `conversations: []` e `communications: {conversations: 0, messages: 0…}`
     * estavam CRAVADOS. A captura existe e é boa: `/api/v1/whatsapp/bridge/inbound`
     * cria a conversa, liga à lead, grava a mensagem e ainda fecha o relógio de
     * primeiro contato nos dois sentidos — corretor respondendo OU lead falando
     * primeiro.
     *
     * Nada disso chegava à ficha. Medido em 03/08/2026: 0 conversas e 0
     * mensagens, porque a ponte não está no ar — mas no dia em que subir, o
     * corretor abriria a lead e veria "nenhuma conversa" sobre alguém com quem
     * acabou de falar. Zero cravado sobrevive à chegada do dado.
     */
    const [conversasDaLead, mensagensDaLead] = await Promise.all([
      admin
        .from("conversations")
        .select("id,channel,status,last_message_at,unread_count")
        .eq("lead_id", id)
        .eq("organization_id", identity.organizationId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(20),
      admin
        .from("messages")
        .select("id,direction,body,created_at,conversation_id")
        .eq("lead_id", id)
        .eq("organization_id", identity.organizationId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    // Relação ausente (banco sem a migração) não é falha de medição; erro de
    // leitura é. A ficha precisa distinguir "não conversou" de "não consegui ver".
    const conversaMensuravel =
      !(conversasDaLead.error && !isMissingRelation(conversasDaLead.error))
      && !(mensagensDaLead.error && !isMissingRelation(mensagensDaLead.error));
    if (!conversaMensuravel) {
      logger.warn("lead.conversas.leitura_falhou", {
        leadId: id,
        conversas: conversasDaLead.error?.code, mensagens: mensagensDaLead.error?.code,
      });
    }
    const conversas = conversasDaLead.data ?? [];
    const mensagens = mensagensDaLead.data ?? [];
    const entrada = mensagens.filter((m) => String(m.direction) === "inbound").length;

    const origemDaLead = montarOrigemDaLead({
      fonteDaLead: lead.source ? String(lead.source) : null,
      campanha: campanhaDaLead.data ?? null,
      gastoDaCampanha,
      evento: eventoDaMeta.data ?? null,
      nomeDoFormulario: fonteDoFormulario.data?.name ? String(fonteDoFormulario.data.name) : null,
      // Erro de LEITURA vira `medido: false`. Ausência de relação (banco sem a
      // migration) não é falha de medição: é ausência honesta.
      medido:
        !(campanhaDaLead.error && !isMissingRelation(campanhaDaLead.error))
        && !(eventoDaMeta.error && !isMissingRelation(eventoDaMeta.error)),
    });

    // Reserva pendente de aceite (fase 58). Relação ausente não derruba a ficha.
    const reserva = await admin
      .from("lead_assignment_reservations")
      .select("id,lead_id,broker_id,status,reserved_at,expires_at,accepted_at")
      .eq("lead_id", id)
      .eq("organization_id", identity.organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reserva.error && !isMissingRelation(reserva.error)) {
      logger.warn("lead.reservation.read_failed", { leadId: id, code: reserva.error.code });
    }

    // Gaveta que FALHOU não pode virar "esta lead não tem história": o total
    // menor derrubaria a nota de completude e o engajamento sem ninguém saber.
    for (const falha of historico.falhas) {
      logger.warn("lead.historico.read_failed", { leadId: id, fonte: falha.fonte, code: falha.code, message: falha.message });
    }
    // ── QUEM ASSINOU CADA INTERAÇÃO — MESMA COLUNA FALTANDO, SEGUNDO LUGAR ──
    //
    // Este select pedia só `name`. Medido em 02/08/2026: das 481 linhas de
    // `activities`, 479 têm autor cujo `name` é NULO e cujo `full_name` está
    // preenchido — todas apareciam assinadas como "Equipe Atlas".
    //
    // E o pior é na MESMA tela: a linha do tempo mescla estas interações com a
    // movimentação de `/api/v1/acompanhamento-corretor/linha-do-tempo`, que lê
    // `id,name,full_name` e resolve `full_name || name`. O mesmo corretor, na
    // mesma lista, assinava "ddcorretorsp" na movimentação e "Equipe Atlas" na
    // interação de dois minutos antes.
    //
    // "Equipe Atlas" é o rótulo de quem NÃO tem perfil identificado; usá-lo para
    // quem tem apaga a autoria em vez de admitir a ausência.
    const authorIds = [...new Set(historico.interacoes.map((item) => String(item.user_id || "")).filter(Boolean))];
    const { data: authors } = authorIds.length
      ? await admin.from("profiles").select("id,name,full_name").eq("organization_id", identity.organizationId).in("id", authorIds)
      : { data: [] as Array<{ id: string; name: string | null; full_name: string | null }> };
    const authorNames = new Map((authors ?? []).map((profile) => [profile.id, profile.full_name || profile.name || "Equipe Atlas"]));
    const activities = historico.interacoes.map((item) => ({
      ...item,
      authorName: item.user_id ? authorNames.get(String(item.user_id)) || "Equipe Atlas" : "Automação Atlas",
    }));
    const tasks = (taskResult.data ?? []).map((task) => ({
      ...task,
      due_at: task.due_date ?? task.created_at ?? null,
      assigned_to: task.user_id ?? null,
    }));
    const openTasks = tasks.filter((task) => !tarefaEncerrada(task.status));
    // A união devolve o perfil canônico traduzido para o vocabulário que a
    // régua de completude já entende. A gaveta legada não é apagada: ela entra
    // primeiro e a canônica vence onde as duas falam do mesmo campo.
    const qualificacaoUnificada = unificarQualificacao({
      perfil: perfilResult.data as Record<string, unknown> | null,
      respostasLegado: respostasLegadoNoMetadata(lead.metadata),
      finalidadeDaLead: typeof lead.purpose === "string" ? lead.purpose : null,
      respostasDoFormulario: respostasDoFormularioNoMetadata(lead.metadata),
    });
    const respostasParaAFicha = { ...respostasLegadoNoMetadata(lead.metadata), ...respostasLegadoDoPerfil(perfilConfirmadoNoCrm(qualificacaoUnificada)) };
    const leadComQualificacao = { ...lead, metadata: { ...(lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {}), qualificationAnswers: respostasParaAFicha } };
    // `historico.total`, não `activities.length`: o campo "interação registrada"
    // pergunta se existe história com este cliente, e a movimentação do funil é
    // história — 415 leads a tinham e eram marcadas como incompletas por causa
    // da gaveta que esta rota não abria.
    const completeness = assessLeadCompleteness(completenessInput(leadComQualificacao as JsonRow), historico.total > 0);
    const inconsistencies = [
      lead.budget_min != null && lead.budget_max != null && Number(lead.budget_min) > Number(lead.budget_max) ? "Orçamento mínimo maior que o máximo" : null,
      !lead.phone && !lead.email ? "Cliente sem canal de contato" : null,
    ].filter((value): value is string => Boolean(value));
    const missing = completeness.fields.filter((field) => !field.complete).map(({ key, label }) => ({ key, label }));
    const owner = ownerResult.data ? mapLegacyProfile(ownerResult.data as JsonRow) : null;
    const project = projectResult.data ?? null;
    const nextTask = openTasks[0];
    const nextAction = typeof lead.next_action_label === "string" ? lead.next_action_label : "Validar interesse atual e combinar a próxima ação com data.";

    // Fase 100 · Sinais de atenção proativos para este lead específico (etapa
    // parada, follow-up vencido, quente sem contato recente). Mesma função
    // usada em broker-daily e no contexto do Copilot — nada duplicado aqui.
    const attentionSignals = await computeAttentionSignalsForLead(admin, identity.organizationId, {
      id: String(lead.id),
      status: String(lead.status || "novo"),
      score: Number(lead.score || 0),
      temperature: typeof lead.temperature === "string" ? lead.temperature : null,
      createdAt: typeof lead.created_at === "string" ? lead.created_at : null,
    });

    return NextResponse.json({
      lead,
      activities,
      opportunities: oportunidadesResult.data ?? [],
      // `?? []` sozinho recriaria o defeito: leitura que FALHOU viraria zero, e
      // zero silencioso é o que a tela lê como "sem oportunidade". A tela precisa
      // distinguir "nenhuma" de "não deu para medir" — mesma disciplina das
      // propostas, logo acima.
      opportunitiesMensuraveis: !oportunidadesResult.error,
      attentionSignals: attentionSignals.map((signal) => ({
        kind: signal.kind,
        severity: signal.severity,
        reason: signal.reason,
        detail: signal.detail,
        since: signal.since,
        metric: signal.metric,
      })),
      proposals: propostas.data ?? [],
      // A tela precisa distinguir "nenhuma proposta" de "este banco não guarda
      // proposta". Zero em cima de ausência é o erro que esta rota já cometia.
      proposalsMensuraveis: propostasMensuraveis,
      unifiedProfile: {
        conversations: conversas,
        /** `false` = a leitura FALHOU. Lista vazia com isto `true` é ausência de verdade. */
        conversationsMensuraveis: conversaMensuravel,
        tasks,
        campaignEvents: eventosDeCampanha.data ?? [],
        /** `false` = a leitura FALHOU. Lista vazia com isto `true` é ausência de verdade. */
        campaignEventsMensuraveis: campanhaMensuravel,
        historicalMemories: [],
        sources: ["CRM", ...(lead.import_batch_id ? ["Base histórica"] : []), ...(historico.total ? ["Histórico comercial"] : [])],
      },
      relationshipContext: {
        owner,
        development: project,
        // Era `campaign: null` CRAVADO. A lead carregava `campaign_id` (FK para
        // marketing_campaigns), a campanha tinha nome e verba registrada, e a
        // ficha mostrava campanha vazia — o corretor abria a lead sem saber de
        // qual anúncio ela veio, e o diretor não podia perguntar quanto ela
        // custou. Medido em 03/08/2026: 7 das 8 campanhas cadastradas são
        // "[Cia360] Inside Smart", somando R$ 4.122 de verba.
        campaign: origemDaLead.campanha,
        origemCompleta: origemDaLead,
        communications: {
          conversations: conversas.length,
          messages: mensagens.length,
          inbound: entrada,
          outbound: mensagens.length - entrada,
          unread: conversas.reduce((soma, c) => soma + (Number(c.unread_count) || 0), 0),
          // Canal importa: WhatsApp do corretor e Cloud API são caminhos
          // diferentes, e a ficha precisa dizer por onde a conversa aconteceu.
          channels: [...new Set(conversas.map((c) => String(c.channel ?? "")).filter(Boolean))],
          lastMessageAt: mensagens[0]?.created_at ?? conversas[0]?.last_message_at ?? null,
          /** Zero com isto `false` é cegueira, não silêncio. */
          medido: conversaMensuravel,
        },
        // A contagem também era zero cravado — e é ela que a tela mostra no
        // resumo de origem, ao lado da lista.
        origin: { source: lead.source || "Não informada", createdAt: lead.created_at || null, campaignEvents: (eventosDeCampanha.data ?? []).length, historicalMemories: lead.import_batch_id ? 1 : 0 },
      },
      dataQuality: {
        completeness: completeness.completeness,
        completedFields: completeness.completedFields,
        totalFields: completeness.totalFields,
        missing,
        inconsistencies,
        status: inconsistencies.length ? "review" : completeness.completedFields === completeness.totalFields ? "complete" : "enrich",
        recommendation: inconsistencies[0] || completeness.nextQuestion?.question || "Perfil consistente e pronto para personalização.",
        nextQuestion: completeness.nextQuestion,
        questions: completeness.questions,
        calculation: "weighted_commercial_completeness_live_v2",
      },
      contactBriefing: {
        unreadMessages: 0,
        openTasks: openTasks.length,
        activeOpportunities: 0,
        // O fato mais recente de QUALQUER natureza — e a frase que o descreve.
        // Antes, uma lead movida para "perdido" ontem, sem evento em
        // `lead_events`, era apresentada ao corretor como "Ainda não há
        // interação registrada com este cliente": ele ligava sem saber que o
        // cliente já tinha sido encerrado, e por quê.
        lastInteractionAt: historico.ultimoFato?.quando || lead.last_interaction_at || null,
        context: historico.ultimoFato?.resumo || "Ainda não há interação registrada com este cliente.",
        actions: [nextTask?.due_at ? `Concluir a próxima tarefa prevista para ${new Date(String(nextTask.due_at)).toLocaleDateString("pt-BR")}.` : null, nextAction].filter((value): value is string => Boolean(value)).slice(0, 3),
        generatedBy: "Atlas Intelligence local",
        requiresApproval: true,
      },
      // A reserva de aceite da fase 58 vinha cravada em null. A tela do lead tem o
      // bloco inteiro pronto — "Reserva aguardando aceite", contagem e o botão
      // "Aceitar lead" — e ele nunca aparecia, porque nada era buscado.
      assignmentReservation: reserva.data ?? null,
      // O relógio de primeiro contato, exposto para a tela poder mostrar quanto
      // falta e oferecer o registro em 1 clique. `mensuravel: false` significa
      // "este banco não mede", que é diferente de "ninguém contatou ainda".
      firstContactSla: {
        mensuravel: slaMensuravel,
        prazo: lead.first_contact_due_at ?? null,
        contatadoEm: lead.first_contacted_at ?? null,
        minutosDePrazo: lead.first_contact_sla_minutes ?? null,
        minutosDeResposta: lead.first_response_minutes ?? null,
        dentroDoPrazo: lead.first_contact_sla_met ?? null,
      },
      projectOptions: projectOptionsResult.data ?? [],
      // O histórico que a ficha usa para decidir "há interação?" — publicado com
      // as contagens separadas para a tela poder dizer O QUE existe, e com
      // `mensuravel` por gaveta: lista curta porque a leitura falhou é diferente
      // de lista curta porque não houve história.
      historico: {
        interacoes: historico.interacoesTotal,
        movimentacoes: historico.movimentosTotal,
        total: historico.total,
        mensuravel: historico.mensuravel,
      },
      compatibility: { source: "live_v2", history: FONTES_DO_HISTORICO, projects: "crm_projects" },
    });
  } catch (error) {
    logger.warn("lead.intelligence.read_failed", { error: error instanceof Error ? error.message : String(error) });
    return requestError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  // A escrita mais frequente do CRM. Teto alto o bastante para o corretor
    // trabalhar sem tropeçar, e baixo o bastante para barrar laço de UI.
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "lead.patch" });
  if (!rate.ok) return rate.response;
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json() as JsonRow;
    const admin = getSupabaseAdmin();
    const { data: currentLead } = await admin
      .from("leads")
      /**
       * `name`, `email` e `phone` entram na leitura porque `liveLeadUpdatePayload`
       * preserva o valor ATUAL quando o campo não vem no corpo — e ele só pode
       * preservar o que estiver aqui. Sem os três, um PATCH parcial montava um
       * payload sem nome nem contato, e a validação logo abaixo o recusava com
       * 400: "Informe um nome válido".
       *
       * Achado executando, não lendo: o contrato da regra pura estava verde e a
       * rota devolvia 400 em todas as chamadas de um campo só.
       */
      /* Esta leitura é o que faz "campo ausente no PATCH preserva o gravado"
         funcionar: `liveLeadUpdatePayload` cai nela quando a tela não manda o
         campo. Coluna que falta AQUI não é preservada — é apagada, e em
         silêncio, com HTTP 200.

         Os cinco campos da ficha do comprador entraram por isso: medido em
         03/08/2026, salvar só o orçamento zerava forma de pagamento, prazo,
         renda, finalidade e "precisa financiar" que já estavam preenchidos. É a
         mesma doença que já apagou nome e telefone por aqui, uma entrega atrás. */
      .select("name,email,phone,status,source,temperature,score_ia,budget_min,budget_max,preferred_bedrooms,preferred_neighborhoods,notes,purpose,payment_method,purchase_timeline,monthly_income,financing_required")
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .maybeSingle();
    if (!currentLead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    const previousStatus = canonicalLeadStatus(currentLead.status);
    const nextStatus = canonicalLeadStatus(body.status || currentLead.status);
    const notes = String(body.notes || "").trim();
    if (nextStatus === "comprou_outro" && notes.length < 10) {
      return NextResponse.json({ error: "Descreva o acompanhamento da compra em outro lugar no campo de observações." }, { status: 400 });
    }
    // O registro atual entra na conta para que campo ausente no PATCH preserve o
    // valor gravado (e o score seja recalculado sobre o lead consolidado, não
    // sobre o pedaço que a tela enviou).
    const update = liveLeadUpdatePayload(
      { ...body, source: currentLead.source, status: nextStatus },
      currentLead.status,
      currentLead as JsonRow,
    );
    if (!update.name || String(update.name).length < 2) return NextResponse.json({ error: "Informe um nome válido." }, { status: 400 });
    if (!update.phone && !update.email) return NextResponse.json({ error: "Informe pelo menos telefone ou e-mail." }, { status: 400 });
    if (update.budget_min != null && update.budget_max != null && update.budget_min > update.budget_max) {
      return NextResponse.json({ error: "O orçamento mínimo não pode superar o máximo." }, { status: 400 });
    }

    /**
     * ── A ETAPA MUDAVA AQUI E O LEDGER NUNCA FICAVA SABENDO ──────────────────
     *
     * `pipeline_stage_moves` é a fonte canônica da movimentação de funil: é ela
     * que a linha do tempo da ficha desenha, que o relatório de descarte conta e
     * que `move_pipeline_lead` escreve na MESMA transação que muda
     * `leads.status`. O Kanban passa por lá. Esta rota não passava: fazia
     * `update leads set status = …` direto, e nenhum gatilho do banco supre isso
     * — conferido em `pg_trigger`, nada em `leads` escreve no ledger.
     *
     * MEDIDO em produção (pozbrcsfthnhmnebfoxv) em 02/08/2026, cruzando os
     * eventos `lead_updated` desta rota com o ledger: 5 mudanças de etapa feitas
     * por aqui, 5 AUSENTES de `pipeline_stage_moves`. Entre elas:
     *
     *   41297361 · contrato → ganho ....... a VENDA, e o ledger não a tem
     *   c5eb4a8c · novo → qualificacao .... buraco: o movimento seguinte
     *                                       (qualificacao → perdido) parte de uma
     *                                       etapa que o ledger nunca viu chegar
     *   f7333996 · novo → contato ......... lead com ZERO linha no ledger
     *   cf80b198 · novo → contato ......... idem
     *
     * Não é número errado: é fato comercial que some. E some CALADO — HTTP 200,
     * ficha mostrando a etapa nova, e a auditoria do funil sem uma linha.
     *
     * A correção manda a troca de etapa pelo MESMO caminho atômico do Kanban.
     * Ou as duas escritas acontecem (ledger + `leads.status`), ou nenhuma.
     */
    let movimentoNoLedger: string | null = null;
    let ledgerIndisponivel = false;
    let etapaAplicadaPeloLedger = false;
    if (nextStatus !== previousStatus
      && canonicalPipelineStage(nextStatus)
      && canonicalPipelineStage(previousStatus)) {
      const movimento = await admin.rpc("move_pipeline_lead", {
        p_actor_id: identity.userId,
        p_organization_id: identity.organizationId,
        p_lead_id: id,
        p_to_stage: nextStatus,
        p_expected_from_stage: previousStatus,
        // A Lead 360 não coleta motivo estruturado de descarte (só o Kanban o
        // exige). O que ela TEM é a observação — e mandá-la é melhor do que
        // gravar `reason` nulo, que foi o defeito que custou 102 motivos.
        p_reason: notes || null,
        p_reversal_of: null,
      });
      if (!movimento.error) {
        const movida = (movimento.data ?? {}) as JsonRow;
        movimentoNoLedger = typeof movida.moveId === "string" ? movida.moveId : null;
        // A RPC JÁ gravou `leads.status = nextStatus` na transação dela. A
        // guarda de concorrência abaixo precisa saber disso, ou compararia com a
        // etapa velha e devolveria 409 sobre a própria escrita.
        etapaAplicadaPeloLedger = true;
      } else {
        const motivo = String(movimento.error.message || "");
        // Banco sem a fase do ledger: a etapa continua mudando pelo caminho
        // simples. É degradação declarada, não silêncio.
        ledgerIndisponivel = movimento.error.code === "42883" || movimento.error.code === "PGRST202";
        if (/pipeline_stage_conflict/.test(motivo)) {
          return NextResponse.json(
            { error: "A etapa deste lead mudou em outra sessão. Recarregue a ficha antes de salvar.", code: "LEAD_STATUS_CONFLICT" },
            { status: 409 },
          );
        }
        if (/pipeline_move_out_of_scope|pipeline_lead_not_found/.test(motivo)) {
          return NextResponse.json(
            { error: "Você não pode mover a etapa desta lead. Peça ao gestor responsável.", code: "LEAD_STAGE_OUT_OF_SCOPE" },
            { status: 403 },
          );
        }
        if (/pipeline_buyer_reason_required/.test(motivo)) {
          return NextResponse.json(
            { error: "Descreva o acompanhamento da compra em outro lugar no campo de observações.", code: "LEAD_STAGE_REASON_REQUIRED" },
            { status: 400 },
          );
        }
        if (!ledgerIndisponivel) {
          // Falha desconhecida do ledger NÃO pode virar "grava a etapa e segue":
          // seria recriar exatamente o defeito, agora por dentro do conserto.
          logger.error("lead.stage_move_failed", movimento.error, { leadId: id, from: previousStatus, to: nextStatus, code: movimento.error.code });
          return NextResponse.json(
            { error: "Não foi possível registrar a mudança de etapa no histórico do funil. Nada foi alterado.", code: "LEAD_STAGE_LEDGER_UNAVAILABLE" },
            { status: 503 },
          );
        }
        logger.warn("lead.stage_move_ledger_missing", { leadId: id, from: previousStatus, to: nextStatus, code: movimento.error.code });
      }
    }

    // Guarda de concorrência espelhando a do Kanban: sem o `.eq("status", …)`,
    // duas requisições simultâneas liam o mesmo status anterior e gravavam DOIS
    // eventos de aprendizado para a mesma transição, inflando aquele desfecho.
    // Só a requisição que de fato mudou a linha ensina alguma coisa.
    const guarded = admin
      .from("leads")
      .update(update)
      .eq("id", id)
      .eq("organization_id", identity.organizationId);
    // Depois da RPC, a etapa gravada no banco é a NOVA — comparar com a velha
    // faria a guarda barrar a continuação da própria operação.
    const etapaEsperadaNoBanco = etapaAplicadaPeloLedger ? nextStatus : currentLead.status;
    // `.eq(coluna, null)` não casa em SQL; linha sem status precisa de `.is`.
    const { data: stored, error } = await (etapaEsperadaNoBanco == null
      ? guarded.is("status", null)
      : guarded.eq("status", etapaEsperadaNoBanco))
      .select(LIVE_LEAD_SELECT)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Não foi possível salvar este lead agora." }, { status: 400 });
    if (!stored) {
      return NextResponse.json(
        { error: "A etapa deste lead mudou em outra sessão. Recarregue a ficha antes de salvar.", code: "LEAD_STATUS_CONFLICT" },
        { status: 409 },
      );
    }
    const storedRow = stored as unknown as JsonRow;
    const lead = mapLegacyLead(storedRow);
    const event = await recordLiveLeadEvent(admin, {
      organizationId: identity.organizationId,
      leadId: id,
      actorId: identity.userId,
      type: "lead_updated",
      title: "Dados do lead atualizados",
      description: "Perfil comercial revisado no Lead 360.",
      metadata: { previousStatus, status: lead.status },
    });
    if (event.error) logger.warn("lead.update_event_failed", { leadId: id, message: event.error.message });

    // Memória de operação: metade da operação move o lead no Kanban e a outra
    // metade troca o status aqui na ficha. Instrumentar só um dos caminhos
    // produziria amostra torta — e verba decidida sobre amostra torta custa mais
    // caro do que não decidir. O núcleo puro filtra o que não é desfecho nem
    // avanço (retrocesso, arquivamento, status inalterado).
    const learningOutcome = commercialOutcomeFromStages(previousStatus, nextStatus);
    if (learningOutcome) {
      const [learning] = await Promise.allSettled([
        recordCommercialLearningEvent(admin, {
          organizationId: identity.organizationId,
          leadId: id,
          actorId: identity.userId,
          outcome: learningOutcome,
          fromStage: previousStatus,
          // O fato nasce do que foi PERSISTIDO, não da intenção da requisição:
          // o update é condicionado ao status lido, então `storedRow.status` é a
          // única etapa que existe de verdade no banco neste instante.
          toStage: canonicalLeadStatus(storedRow.status) || nextStatus,
          // A Lead 360 não coleta motivo estruturado de descarte. null aqui
          // significa "não coletado por este caminho" — e `writePath: lead_360`
          // no metadata é o que separa isso de "o corretor não informou".
          reasonKey: null,
          source: typeof storedRow.source === "string" ? storedRow.source : null,
          campaignId: storedRow.campaign_id == null ? null : String(storedRow.campaign_id),
          // Agora que a troca de etapa passa pelo ledger, o fato de aprendizado
          // ganha a MESMA identidade de movimentação que o Kanban registra —
          // é ela que permite casar `reverses`/`moveId` e abater o par quando o
          // corretor desfaz. Sem ela, o desfazer nunca alcançaria esta linha.
          moveId: movimentoNoLedger,
          writePath: "lead_360",
        }),
      ]);
      const learningError: unknown = learning.status === "rejected" ? learning.reason : learning.value.error;
      if (learningError) {
        // Mesma regra do Kanban: schema ausente é erro permanente e sobe como
        // erro; o resto é aviso.
        const drift = learning.status === "fulfilled" && learning.value.drift === true;
        const payload = {
          leadId: id,
          outcome: learningOutcome,
          table: "ai_learning_events",
          message: learningError instanceof Error
            ? learningError.message
            : typeof (learningError as { message?: unknown })?.message === "string"
              ? String((learningError as { message: string }).message)
              : String(learningError),
        };
        if (drift) logger.error("lead.learning_event_schema_drift", payload);
        else logger.warn("lead.learning_event_failed", payload);
      }
    }
    return NextResponse.json({ lead });
  } catch (error) {
    logger.warn("lead.intelligence.update_failed", { error: error instanceof Error ? error.message : String(error) });
    return requestError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json() as JsonRow;
    const admin = getSupabaseAdmin();
    const { data: lead } = await admin
      .from("leads")
      .select("id,name,status,assigned_user_id,project_id,source")
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .maybeSingle();
    if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    if (body.action === "correct_commercial_context") {
      const hasExpectedProject = Object.prototype.hasOwnProperty.call(body, "expectedProjectId");
      const hasExpectedSource = Object.prototype.hasOwnProperty.call(body, "expectedSource");
      if (!hasExpectedProject || !hasExpectedSource) {
        return NextResponse.json({
          code: "LEAD_CONTEXT_EXPECTATION_REQUIRED",
          error: "Recarregue a Lead 360 antes de corrigir projeto ou origem.",
        }, { status: 409 });
      }

      const validated = validateGovernedLeadContextCorrection({
        projectId: body.projectId,
        source: body.source,
        reason: body.reason,
        humanConfirmed: body.humanConfirmed,
      });
      if (!validated.ok) {
        return NextResponse.json({ code: "LEAD_CONTEXT_CORRECTION_INVALID", error: validated.error }, { status: 422 });
      }

      const currentContext = {
        projectId: normalizeCommercialProjectId(lead.project_id),
        source: normalizeCommercialContextText(lead.source),
      };
      const expectedContext = {
        projectId: normalizeCommercialProjectId(body.expectedProjectId),
        source: normalizeCommercialContextText(body.expectedSource),
      };
      if (!sameGovernedLeadCommercialContext(currentContext, expectedContext)) {
        return NextResponse.json({
          code: "LEAD_CONTEXT_CORRECTION_CONFLICT",
          error: "Projeto ou origem mudou desde a última leitura. Revise os valores atuais antes de confirmar.",
          currentContext,
        }, { status: 409 });
      }

      const nextContext = {
        projectId: validated.correction.projectId,
        source: validated.correction.source,
      };
      const projectIds = [...new Set([currentContext.projectId, nextContext.projectId].filter((value): value is string => Boolean(value)))];
      const { data: contextProjects, error: projectLookupError } = projectIds.length
        ? await admin
          .from("crm_projects")
          .select("id,name,developer_name,status,city")
          .eq("organization_id", identity.organizationId)
          .in("id", projectIds)
        : { data: [], error: null };
      if (projectLookupError) {
        return NextResponse.json({ error: "Não foi possível validar os projetos desta organização." }, { status: 503 });
      }
      const projectMap = new Map((contextProjects ?? []).map((project) => [project.id, project]));
      if (nextContext.projectId && !projectMap.has(nextContext.projectId)) {
        return NextResponse.json({ code: "LEAD_CONTEXT_PROJECT_OUT_OF_SCOPE", error: "O projeto selecionado não pertence a esta organização." }, { status: 422 });
      }

      if (sameGovernedLeadCommercialContext(currentContext, nextContext)) {
        return NextResponse.json({
          lead: mapLegacyLead(lead as unknown as JsonRow),
          context: {
            ...currentContext,
            project: currentContext.projectId ? projectMap.get(currentContext.projectId) ?? null : null,
          },
          unchanged: true,
        });
      }

      let updateQuery = admin
        .from("leads")
        .update({ project_id: nextContext.projectId, source: nextContext.source })
        .eq("id", id)
        .eq("organization_id", identity.organizationId);
      updateQuery = lead.project_id
        ? updateQuery.eq("project_id", lead.project_id)
        : updateQuery.is("project_id", null);
      updateQuery = lead.source
        ? updateQuery.eq("source", lead.source)
        : updateQuery.is("source", null);
      const { data: correctedLead, error: updateError } = await updateQuery
        .select(LIVE_LEAD_SELECT)
        .maybeSingle();
      if (updateError) {
        return NextResponse.json({ error: "Não foi possível corrigir o contexto comercial agora." }, { status: 400 });
      }
      if (!correctedLead) {
        const { data: latest } = await admin
          .from("leads")
          .select("project_id,source")
          .eq("id", id)
          .eq("organization_id", identity.organizationId)
          .maybeSingle();
        return NextResponse.json({
          code: "LEAD_CONTEXT_CORRECTION_CONFLICT",
          error: "Projeto ou origem mudou durante a correção. Recarregue e confirme novamente.",
          currentContext: {
            projectId: normalizeCommercialProjectId(latest?.project_id),
            source: normalizeCommercialContextText(latest?.source),
          },
        }, { status: 409 });
      }

      const previousProject = currentContext.projectId ? projectMap.get(currentContext.projectId) ?? null : null;
      const currentProject = nextContext.projectId ? projectMap.get(nextContext.projectId) ?? null : null;
      const auditEvent = await recordLiveLeadEvent(admin, {
        organizationId: identity.organizationId,
        leadId: id,
        actorId: identity.userId,
        type: "commercial_context_corrected",
        title: "Projeto e origem revisados",
        description: validated.correction.reason,
        metadata: buildGovernedLeadContextAuditMetadata({
          previous: { ...currentContext, projectName: previousProject?.name ?? null },
          current: { ...nextContext, projectName: currentProject?.name ?? null },
          reason: validated.correction.reason,
        }),
      });
      if (auditEvent.error) {
        let rollbackQuery = admin
          .from("leads")
          .update({ project_id: lead.project_id ?? null, source: lead.source ?? null })
          .eq("id", id)
          .eq("organization_id", identity.organizationId);
        rollbackQuery = nextContext.projectId
          ? rollbackQuery.eq("project_id", nextContext.projectId)
          : rollbackQuery.is("project_id", null);
        rollbackQuery = nextContext.source
          ? rollbackQuery.eq("source", nextContext.source)
          : rollbackQuery.is("source", null);
        const { error: rollbackError } = await rollbackQuery;
        logger.error("lead.context_correction_audit_failed", auditEvent.error, {
          leadId: id,
          auditError: auditEvent.error.message,
          rollbackError: rollbackError?.message ?? null,
        });
        return NextResponse.json({
          code: rollbackError ? "LEAD_CONTEXT_AUDIT_RECOVERY_REQUIRED" : "LEAD_CONTEXT_AUDIT_FAILED",
          error: rollbackError
            ? "A correção exige revisão administrativa. Nenhuma nova tentativa deve ser feita agora."
            : "A auditoria não pôde ser registrada; a alteração foi desfeita com segurança.",
        }, { status: rollbackError ? 500 : 503 });
      }

      logger.info("lead.context_corrected", {
        leadId: id,
        actorId: identity.userId,
        projectChanged: currentContext.projectId !== nextContext.projectId,
        sourceChanged: currentContext.source !== nextContext.source,
      });
      return NextResponse.json({
        lead: mapLegacyLead(correctedLead as unknown as JsonRow),
        context: { ...nextContext, project: currentProject },
        auditEventId: auditEvent.data?.id ?? null,
        policy: { historicalSnapshotsRewritten: false, automaticFill: false, humanConfirmed: true },
      });
    }

    if (body.action === "activity") {
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim().slice(0, 4000);
      if (!title) return NextResponse.json({ error: "Informe a atividade." }, { status: 400 });
      const event = await recordLiveLeadEvent(admin, {
        organizationId: identity.organizationId,
        leadId: id,
        actorId: identity.userId,
        type: String(body.type || "note"),
        title,
        description: description || null,
      });
      if (event.error || !event.data) return NextResponse.json({ error: "Não foi possível registrar a interação." }, { status: 400 });
      return NextResponse.json({ activity: mapLiveLeadEvent(event.data as JsonRow) }, { status: 201 });
    }

    if (body.action === "accept_assignment") {
      if (lead.assigned_user_id && lead.assigned_user_id !== identity.userId) {
        return NextResponse.json({ error: "Esta lead já possui um responsável. Solicite a transferência ao gestor." }, { status: 409 });
      }

      // O aceite passa por accept_lead_assignment, que é atômico: trava a
      // reserva, confere validade e dono único, marca 'accepted' e libera a
      // capacidade — tudo numa transação.
      //
      // O caminho anterior atribuía a lead na mão e NÃO fechava a reserva. Ela
      // ficava 'pending' para sempre e o worker de expiração acabaria devolvendo
      // uma lead que o corretor já tinha aceitado.
      const aceite = await admin.rpc("accept_lead_assignment", {
        p_actor_id: identity.userId,
        p_organization_id: identity.organizationId,
        p_lead_id: id,
      });

      if (!aceite.error) {
        const trilha = await recordLiveLeadEvent(admin, { organizationId: identity.organizationId, leadId: id, actorId: identity.userId, type: "assignment_accepted", title: "Responsabilidade aceita", description: "Lead assumida pelo corretor no Atlas." });
        if (trilha.error) logger.error("lead.assignment_accept_event_failed", trilha.error, { leadId: id, organizationId: identity.organizationId });
        return NextResponse.json({ reservation: aceite.data });
      }

      // Erros de regra vêm da própria RPC e devem chegar ao corretor com nome.
      const motivo = String(aceite.error.message || "");
      if (/reservation_not_found/.test(motivo) && lead.assigned_user_id === identity.userId) {
        return NextResponse.json({ error: "Esta lead já está com você — não há reserva pendente para aceitar." }, { status: 409 });
      }
      if (/reservation_expired/.test(motivo)) {
        return NextResponse.json({ error: "A reserva expirou e a lead voltou para a distribuição." }, { status: 409 });
      }

      // Banco sem a fase 58: o aceite continua possível pelo caminho simples.
      const semReserva = aceite.error.code === "42883" || aceite.error.code === "PGRST202" || /reservation_not_found/.test(motivo);
      if (!semReserva) {
        logger.warn("lead.assignment_accept_failed", { leadId: id, code: aceite.error.code, message: motivo });
        return NextResponse.json({ error: "Não foi possível aceitar a lead agora." }, { status: 409 });
      }
      if (!lead.assigned_user_id) {
        // As DUAS colunas de dono. Aceitar a lead gravando só uma deixava o
        // corretor dono numa tela e a lead órfã na outra — logo depois de ele
        // clicar em "assumir", que é o pior momento possível para duvidar.
        // `.is("assigned_user_id", null)` é a trava de corrida certa — mas no
        // PostgREST um update que não casa com linha nenhuma devolve 200 SEM
        // erro. Sem `.select()`, "outro corretor assumiu no meio do caminho" e
        // "gravou" eram a MESMA resposta, e o corretor saía da tela achando
        // que a lead era dele. `maybeSingle()` é o que separa os dois.
        const { data: assumida, error: erroDoAceite } = await admin.from("leads").update({ assigned_to: identity.userId, assigned_user_id: identity.userId }).eq("id", id).eq("organization_id", identity.organizationId).is("assigned_user_id", null).select("id").maybeSingle();
        if (erroDoAceite || !assumida) {
          logger.warn("lead.assignment_accept_not_stored", { leadId: id, organizationId: identity.organizationId, code: erroDoAceite?.code ?? "sem_linha_afetada" });
          return NextResponse.json({ error: "Esta lead ganhou responsável enquanto você aceitava. Recarregue a ficha.", code: "LEAD_ASSIGNMENT_CONFLICT" }, { status: 409 });
        }
      }
      // Trilha descartada é trilha que pode não existir sem ninguém saber.
      const trilhaDoAceite = await recordLiveLeadEvent(admin, { organizationId: identity.organizationId, leadId: id, actorId: identity.userId, type: "assignment_accepted", title: "Responsabilidade aceita", description: "Lead assumida pelo corretor no Atlas." });
      if (trilhaDoAceite.error) logger.error("lead.assignment_accept_event_failed", trilhaDoAceite.error, { leadId: id, organizationId: identity.organizationId });
      return NextResponse.json({ reservation: { lead_id: id, broker_id: identity.userId, status: "accepted", accepted_at: new Date().toISOString() } });
    }

    if (body.action === "opportunity") {
      const previousStatus = canonicalLeadStatus(lead.status);
      const status = previousStatus === "novo" ? "qualificacao" : previousStatus;
      const { data: stored, error } = await admin
        .from("leads")
        .update({ status })
        .eq("id", id)
        .eq("organization_id", identity.organizationId)
        .select("id,status,budget_max,created_at")
        .single();
      if (error || !stored) return NextResponse.json({ error: "Não foi possível abrir a oportunidade." }, { status: 400 });
      const trilhaDaOportunidade = await recordLiveLeadEvent(admin, { organizationId: identity.organizationId, leadId: id, actorId: identity.userId, type: "opportunity_opened", title: "Oportunidade aberta", description: "Lead promovida para acompanhamento no pipeline.", metadata: { previousStatus, status } });
      if (trilhaDaOportunidade.error) logger.error("lead.opportunity_event_failed", trilhaDaOportunidade.error, { leadId: id, organizationId: identity.organizationId });
      return NextResponse.json({ opportunity: { id: stored.id, lead_id: stored.id, stage: canonicalLeadStatus(stored.status), value: stored.budget_max ?? null, probability: 25, property_id: null, created_at: stored.created_at } }, { status: 201 });
    }

    return NextResponse.json({ error: "Este recurso ainda não está conectado à base atual. Nenhum dado foi alterado." }, { status: 503 });
  } catch (error) {
    logger.warn("lead.intelligence.action_failed", { error: error instanceof Error ? error.message : String(error) });
    return requestError(error);
  }
}
