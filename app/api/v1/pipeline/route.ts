import { NextResponse } from "next/server";
import { ehLeadForaDaCarteira, requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { recordFunnelLearning } from "@/lib/atlas/funnel-learning";
import { canonicalPipelineStage, mergePipelineStageSettings } from "@/lib/atlas/pipeline-stages";
import { commercialOutcomeFromStages } from "@/lib/ai/learning-loop";
import { LIVE_LEAD_SELECT, mapLegacyLead, type CompatRow } from "@/lib/compat/legacy-v2";
import { recordCommercialLearningEvent, recordLiveLeadEvent } from "@/lib/compat/live-writes";
import { readCompatiblePipeline } from "@/lib/atlas/core-v2/live-repositories";
import { DISCARD_REASON_KEYS, DISCARD_TAXONOMY_VERSION, getDiscardReason } from "@/lib/atlas/discard-reasons";
import { tentativasDaLead, TENTATIVAS_MINIMAS, HA_PISO } from "@/lib/crm/contact-attempts";
import { orientar, orientarAcesso } from "@/lib/crm/pipeline-guidance";
import { idsDaEquipe, leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";

export const dynamic = "force-dynamic";

/**
 * Recusa com o CAMINHO DE VOLTA junto.
 *
 * Toda recusa do pipeline passa por aqui. `error` continua sendo a frase curta
 * (é o que clientes antigos leem) e `caminho` diz o que fazer — sem ele, metade
 * das recusas manda o corretor atualizar uma tela que não vai mudar nada.
 *
 * `extras` carrega o que a tela precisa para agir: a etapa atual num conflito,
 * as chaves válidas num motivo inválido.
 */
function recusar(codigo: string, status: number, extras: Record<string, unknown> = {}) {
  const o = orientar(codigo);
  return NextResponse.json(
    { error: o.problema, caminho: o.caminho, acao: o.acao ?? null, code: codigo, ...extras },
    { status },
  );
}

function authError(error: unknown) {
  // O piso de carteira passou a valer também na checagem de acesso, e ela roda
  // ANTES da RPC. A recusa tem de continuar chegando à tela EXATAMENTE como
  // chegava quando vinha do banco — mesmo código, mesmo caminho de volta — ou o
  // Kanban perde a orientação "peça a transferência ao gestor" que já existia.
  if (ehLeadForaDaCarteira(error)) return recusar("pipeline_move_out_of_scope", 403);
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /sessão|token|autenticação|organização|autoriz|escopo/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  // A recusa de acesso é a MAIS comum de todas — "esta lead não é sua" — e era
  // a única que chegava sem saída, porque `requireLeadAccess` estoura por
  // exceção e desviava do caminho normal de recusa.
  const o = orientarAcesso(message);
  return NextResponse.json(
    o ? { error: o.problema, caminho: o.caminho, acao: o.acao ?? null } : { error: message },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    // A restrição de dono vai para a CONSULTA. Filtrar depois não funciona:
    // `mapLegacyLead` devolve as colunas de dono nulas, e as leads de outra
    // pessoa passavam batido.
    // A regra de quem vê o funil inteiro vive em lib/crm/escopo-de-leitura,
    // compartilhada com a listagem de leads: eram duas cópias, e por um tempo
    // responderam diferente — o Kanban filtrava por dono e a listagem não.
    const lideranca = leLiderancaInteira(identity);

    // ── FILTRO POR CORRETOR E POR EQUIPE ──────────────────────────────────
    //
    // Só faz sentido para quem já enxerga o funil inteiro: um corretor não
    // "filtra" para ver a carteira de outro — ele simplesmente não a vê. Por
    // isso os parâmetros são IGNORADOS para quem não é liderança, em vez de
    // recusados: recusar entregaria a informação de que a pessoa existe.
    const params = new URL(request.url).searchParams;
    const corretorPedido = lideranca ? (params.get("corretor") || "").trim() : "";
    const equipePedida = lideranca ? (params.get("equipe") || "").trim() : "";
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    let idsDoFiltro: string[] | null = null;
    let filtroAplicado: { tipo: "corretor" | "equipe"; id: string; pessoas: number } | null = null;
    if (equipePedida && UUID.test(equipePedida)) {
      // A equipe sai da HIERARQUIA (`reports_to`), não da coluna de texto
      // `team` — que está vazia em toda a base e fazia o filtro devolver só o
      // próprio gerente. Ver lib/crm/escopo-de-leitura.
      const { data: perfis } = await identity.supabase
        .from("profiles").select("id,reports_to")
        .eq("organization_id", identity.organizationId).eq("active", true);
      idsDoFiltro = idsDaEquipe(perfis ?? [], equipePedida);
      filtroAplicado = { tipo: "equipe", id: equipePedida, pessoas: idsDoFiltro.length };
    } else if (corretorPedido && UUID.test(corretorPedido)) {
      // Confere que a pessoa é da MESMA organização antes de filtrar por ela:
      // um uuid de fora devolveria um funil vazio e pareceria "sem leads".
      const { data: alvo } = await identity.supabase
        .from("profiles").select("id")
        .eq("organization_id", identity.organizationId).eq("id", corretorPedido).maybeSingle();
      if (alvo) {
        idsDoFiltro = [corretorPedido];
        filtroAplicado = { tipo: "corretor", id: corretorPedido, pessoas: 1 };
      }
    }

    const compatiblePipeline = await readCompatiblePipeline(identity.supabase, {
      organizationId: identity.organizationId,
      limit: 500,
      ownerId: lideranca ? null : identity.userId,
      ownerIds: idsDoFiltro,
      // O card do Kanban mostra `metadata.meta.campaignName` (ver `metaCampaign`
      // em app/(crm)/pipeline/page.tsx). Sem a coluna, `mapLegacyLead` entrega
      // `{}` e o card cai no `campaign_id` — o UUID da campanha aparecia onde
      // deveria estar o nome, e buscar pelo nome não devolvia lead nenhuma.
      // O custo (509 B/lead) é pedido só aqui: os outros quatro chamadores do
      // repositório não leem o campo. Ver `comMetadata` em live-repositories.
      comMetadata: true,
    });
    if (!compatiblePipeline.ok) throw new Error(compatiblePipeline.error.code);

    let settings: Array<{ stage_key?: string; label?: string; probability?: number; position?: number; visible?: boolean }> = [];
    let stageSettingsSource = "canonical-defaults";
    if (process.env.ATLAS_PIPELINE_STAGE_SETTINGS_ENABLED === "true") {
      const stageSettings = await identity.supabase.from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", identity.organizationId);
      if (!stageSettings.error) {
        settings = stageSettings.data ?? [];
        stageSettingsSource = "organization-settings";
      } else logger.warn("pipeline.stage_settings_unavailable", { organizationId: identity.organizationId, message: stageSettings.error.message });
    }
    const role = identity.commercialRole || identity.role;

    const leads = compatiblePipeline.rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

    // Medição de SLA de primeiro contato. Sai daqui porque o Kanban já sabe
    // renderizá-la (badge "No SLA" / "Fora do SLA") e só faltava a API mandar.
    // `slaDisponivel` distingue "ninguém contatou ainda" de "este banco não sabe
    // medir" — são coisas diferentes e a interface não pode confundi-las.
    const agora = Date.now();
    const emAberto = leads.filter((lead) => !lead.first_contacted_at && String(lead.status || "").toLowerCase() !== "perdido");
    const contatadas = leads.filter((lead) => lead.first_contacted_at);
    const medidas = contatadas.filter((lead) => lead.first_response_minutes != null);
    const dentroDoSla = medidas.filter((lead) => lead.first_contact_sla_met === true);
    const firstContactSla = {
      disponivel: compatiblePipeline.slaDisponivel !== false,
      emAberto: emAberto.length,
      vencidas: emAberto.filter((lead) => lead.first_contact_due_at && Date.parse(String(lead.first_contact_due_at)) < agora).length,
      contatadas: contatadas.length,
      // first_response_minutes e first_contact_sla_met: as duas medições reais,
      // nunca derivadas de idade do lead.
      medidas: medidas.length,
      dentroDoSla: dentroDoSla.length,
      // Percentual só com amostra: taxa sobre 1 ou 2 leads é ruído.
      complianceRate: medidas.length >= 5 ? Number((dentroDoSla.length / medidas.length).toFixed(3)) : null,
      averageResponseMinutes: medidas.length
        ? Math.round(medidas.reduce((soma, lead) => soma + Number(lead.first_response_minutes || 0), 0) / medidas.length)
        : null,
    };

    return NextResponse.json({
      // ── O RECORTE SE DECLARA ────────────────────────────────────────────
      //
      // A rota já aplicava o piso corretamente — provado no navegador em
      // 2026-07-29: um corretor recebe 195 leads (a carteira dele) e os
      // parâmetros de dono são ignorados. O que faltava era DIZER isso.
      //
      // A listagem de leads publica `escopo` desde sempre, e é por isso que dá
      // para auditá-la de fora. Aqui não dava: para saber qual recorte foi
      // aplicado era preciso reler o código. Isso é a diferença entre "está
      // certo" e "dá para provar que está certo" — e foi a falta dessa prova
      // que me fez levar horas para achar os dois vazamentos irmãos deste dia.
      //
      // Declarar para quem já é o dono do recorte não vaza nada: a pessoa
      // recebe a informação de qual fronteira se aplica a ela mesma.
      escopo: lideranca ? "organizacao" : "carteira",
      leads,
      firstContactSla,
      stages: mergePipelineStageSettings(settings),
      stageContract: "canonical-v1",
      stageSettingsSource,
      compatibility: compatiblePipeline.compatibility,
      pagination: {
        loaded: leads.length,
        totalOperational: compatiblePipeline.count,
        archivedMemoryExcluded: true,
        limit: 500,
      },
      canConfigureStages: ["admin", "director", "superintendent"].includes(String(role || "")),
      /**
       * Quem a pessoa PODE filtrar. Vem da rota, e não de uma consulta própria
       * da tela, porque quem decide o que é visível é o servidor — a tela
       * montar a lista por conta própria abriria a porta de mostrar nomes que
       * a pessoa não deveria ver.
       *
       * Vazio para corretor: ele vê a própria carteira e ponto, então um
       * seletor ali seria um controle que não faz nada.
       */
      equipe: lideranca ? await (async () => {
        const { data: perfis } = await identity.supabase
          .from("profiles")
          .select("id,full_name,commercial_role,reports_to")
          .eq("organization_id", identity.organizationId)
          .eq("active", true)
          .order("full_name");
        const pessoas = (perfis ?? []).filter((p) => p.commercial_role);
        return {
          corretores: pessoas
            .filter((p) => p.commercial_role === "broker")
            .map((p) => ({ id: p.id, nome: p.full_name })),
          // Gerente sem ninguém abaixo não vira opção: filtrar por ele
          // devolveria o funil de uma pessoa só e o rótulo "equipe" mentiria.
          gerentes: pessoas
            .filter((p) => ["manager", "superintendent", "director"].includes(String(p.commercial_role)))
            .map((p) => ({ id: p.id, nome: p.full_name, pessoas: idsDaEquipe(pessoas, p.id).length }))
            .filter((g) => g.pessoas > 1),
        };
      })() : null,
      filtroAplicado,
    });
  } catch (error) {
    logger.warn("pipeline.read_failed", { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : "";
    if (!/sessão|token|autenticação|organização|escopo|autoriz/i.test(message)) return recusar("PIPELINE_UNAVAILABLE", 503);
    return authError(error);
  }
}

export async function PATCH(request: Request) {
  const rate = checkRateLimit(clientKey(request, "v1-pipeline-move"), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    const espera = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    const o = orientar("RATE_LIMITED");
    return NextResponse.json(
      { error: o.problema, caminho: `${o.caminho} (${espera}s)`, acao: o.acao, code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  try {
    const identity = await requireApiIdentity(request);
    const body = await request.json();
    const leadId = String(body.leadId || "");
    const stage = canonicalPipelineStage(body.stage);
    const expectedFromStage = canonicalPipelineStage(body.expectedFromStage);
    const reversalOf = typeof body.reversalOf === "string" && /^[0-9a-f-]{36}$/i.test(body.reversalOf) ? body.reversalOf : null;
    const followUpDescription = String(body.followUpDescription || "").trim().slice(0, 4000);
    const source = body.source === "atlas-copilot" ? "atlas-copilot" : "pipeline";
    const humanConfirmed = body.humanConfirmed === true;

    // Descarte estruturado (padrão Meta lead quality / Andromeda): mover para
    // o estágio de perda EXIGE { discardReason: { key, notes? } } — o seletor
    // de motivos do Kanban envia o campo desde a onda 2. Única exceção:
    // desfazer (reversalOf) de volta para "perdido" não é um novo descarte e
    // não pede motivo (o evento lead_discarded original permanece no
    // histórico). Chave enviada fora da taxonomia é 400, para o vocabulário
    // nunca divergir de lib/atlas/discard-reasons.ts.
    const discardInput = body.discardReason && typeof body.discardReason === "object" && !Array.isArray(body.discardReason)
      ? (body.discardReason as Record<string, unknown>)
      : null;
    const discardReason = stage === "perdido" && discardInput ? getDiscardReason(discardInput.key) : null;
    const discardNotes = discardInput && typeof discardInput.notes === "string" ? discardInput.notes.trim().slice(0, 2000) : "";

    // Antes: quatro problemas diferentes devolviam "Lead ou etapa inválida." —
    // inclusive a justificativa curta de "comprou em outro lugar", que é o caso
    // MAIS comum e o único em que o corretor tem o que fazer.
    if (stage === "comprou_outro" && followUpDescription.length < 10) {
      return recusar("FOLLOWUP_REQUIRED", 400);
    }
    // ── O VALOR DA VENDA É OBRIGATÓRIO PARA FECHAR ────────────────────────
    //
    // O evento de venda da CAPI lê `sale_value_brl`. A coluna não existia até
    // 2026-07-28: o evento era suprimido em silêncio e o ciclo fechado nunca
    // fechava. Criada a coluna, ela precisa de porta de entrada — senão nasce
    // morta e o defeito continua, só que com schema novo.
    //
    // Exigir aqui, e não "depois", é o que garante que todo ganho tenha
    // lastro. Orçamento declarado (budget_min/max) NÃO serve: é intenção do
    // cliente, e mandar intenção como venda ensina o algoritmo com número
    // inventado — sem desfazer.
    const valorBruto = body.saleValueBrl;
    const temValor = valorBruto !== undefined && valorBruto !== null && String(valorBruto).trim() !== "";
    const saleValue = temValor ? Number(valorBruto) : null;
    if (temValor && (!Number.isFinite(saleValue) || (saleValue as number) < 0)) {
      return recusar("SALE_VALUE_INVALID", 400);
    }
    if (stage === "ganho" && !reversalOf && saleValue === null) {
      return recusar("SALE_VALUE_REQUIRED", 400);
    }
    if (!leadId || !stage || !expectedFromStage) {
      return recusar("LEAD_OR_STAGE_MISSING", 400);
    }
    if (stage === "perdido" && discardInput && !discardReason) {
      // As chaves seguem na resposta para quem integra; o corretor lê o caminho.
      return recusar("INVALID_DISCARD_REASON", 400, { validKeys: DISCARD_REASON_KEYS });
    }
    // ── PISO DE TENTATIVAS — DESLIGADO nesta fase ─────────────────────────
    //
    // `TENTATIVAS_MINIMAS` vem de `ATLAS_TENTATIVAS_MINIMAS` e hoje vale 0:
    // decisão do dono do produto para destravar a largada, quando a base é
    // importada e as tentativas anteriores nunca viraram evento aqui.
    //
    // Sem piso, nem consulta o banco: seria uma ida a mais em todo descarte
    // para calcular um número que não decide nada.
    //
    // Quando religar, a trava continua no SERVIDOR de propósito — bloquear só o
    // botão da tela é sugestão, não regra. Quem já respondeu escapa do piso:
    // houve contato, a informação existe.
    if (HA_PISO && stage === "perdido" && !reversalOf) {
      const tentativas = await tentativasDaLead(getSupabaseAdmin(), identity.organizationId, leadId);
      if (!tentativas.podeDescartar) {
        // Esta recusa passava SEM `caminho` — e o contrato que deveria pegar
        // isso estava quebrado (filtrava linha a linha num objeto de várias
        // linhas, enxergando zero recusas). Uma auditoria adversarial achou as
        // duas coisas. Aqui a recusa também explica o passo, como as outras.
        return NextResponse.json(
          {
            error: tentativas.total === 0
              ? "Ninguém tentou falar com esta lead ainda."
              : `${tentativas.total} tentativa(s) registrada(s) de ${TENTATIVAS_MINIMAS} necessárias.`,
            caminho: tentativas.total === 0
              ? "Registre ao menos uma ligação ou WhatsApp antes de descartar — lead que ninguém alcançou não é lead ruim, e descartá-la ensina a Meta a evitar um público que talvez fosse ótimo."
              : `Faltam ${tentativas.faltam}. Tente de novo por outro canal ou em outro horário; se ninguém atender depois disso, o descarte libera.`,
            acao: "tentar-de-novo",
            code: "MINIMO_DE_TENTATIVAS",
            tentativas: tentativas.total,
            minimo: TENTATIVAS_MINIMAS,
            faltam: tentativas.faltam,
          },
          { status: 422 },
        );
      }
    }

    if (stage === "perdido" && !reversalOf && !discardReason) {
      return recusar("DISCARD_REASON_REQUIRED", 400, { validKeys: DISCARD_REASON_KEYS });
    }
    if (source === "atlas-copilot" && !humanConfirmed) {
      return recusar("COPILOT_PIPELINE_CONFIRMATION_REQUIRED", 400);
    }

    await requireLeadAccess(identity, leadId);

    const admin = getSupabaseAdmin();
    const { data: current } = await identity.supabase
      .from("leads")
      .select("id,name,status,organization_id")
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!current) return recusar("LEAD_NOT_FOUND", 404);

    const previousStage = canonicalPipelineStage(current.status) || "novo";
    if (previousStage !== expectedFromStage) return recusar("PIPELINE_STAGE_CONFLICT", 409, { currentStage: previousStage });
    if (reversalOf) {
      // ── DUAS TABELAS, DOIS CAMINHOS ─────────────────────────────────────
      //
      // A RPC `move_pipeline_lead` (caminho atômico, o preferencial) grava em
      // `pipeline_stage_moves` — colunas `from_stage`/`to_stage` — e devolve o
      // id de LÁ. O caminho compensatório grava em `pipeline_history` —
      // colunas `old_status`/`new_status`.
      //
      // Esta trava procurava só em `pipeline_history`. Como o caminho atômico é
      // o que roda, o id nunca era encontrado e o desfazer devolvia 409
      // SEMPRE: o aviso "Desfazer movimentação" aparecia e o botão não
      // funcionava nunca. Medido com login real antes de corrigir.
      //
      // Procura nas duas, na ordem em que os caminhos são tentados.
      const [atomico, compensatorio] = await Promise.all([
        admin.from("pipeline_stage_moves")
          .select("id,from_stage,to_stage,reversal_of")
          .eq("id", reversalOf).eq("lead_id", leadId).eq("organization_id", identity.organizationId)
          .maybeSingle(),
        admin.from("pipeline_history")
          .select("id,old_status,new_status")
          .eq("id", reversalOf).eq("lead_id", leadId).eq("organization_id", identity.organizationId)
          .maybeSingle(),
      ]);

      const origem = atomico.data
        ? { de: atomico.data.from_stage, para: atomico.data.to_stage, jaDesfeito: atomico.data.reversal_of != null }
        : compensatorio.data
          ? { de: compensatorio.data.old_status, para: compensatorio.data.new_status, jaDesfeito: false }
          : null;

      // Desfazer é voltar: a etapa de DESTINO do movimento original tem que ser
      // onde a lead está agora, e a de ORIGEM tem que ser para onde ela volta.
      // `jaDesfeito` barra desfazer um desfazer, que viraria um vaivém sem fim.
      if (!origem || origem.jaDesfeito
        || canonicalPipelineStage(origem.para) !== previousStage
        || canonicalPipelineStage(origem.de) !== stage) {
        return recusar("pipeline_undo_invalid", 409, { currentStage: previousStage });
      }
    }

    // Caminho preferencial: move_pipeline_lead faz a troca de etapa e o registro
    // no histórico DENTRO de uma transação. Isso importa porque a alternativa
    // abaixo é uma escrita compensatória — muda a etapa, tenta auditar, e desfaz
    // se a auditoria falhar. Se o próprio desfazer falhar (rede, permissão), a
    // lead fica numa etapa que o histórico não conhece. Com a RPC isso não é
    // possível: ou as duas escritas acontecem, ou nenhuma.
    //
    // A RPC também confere `p_expected_from_stage` e valida a reversão no banco,
    // eliminando a janela entre a leitura e a escrita em que outra pessoa pode
    // mover a mesma lead.
    const atomicMove = await admin.rpc("move_pipeline_lead", {
      p_actor_id: identity.userId,
      p_organization_id: identity.organizationId,
      p_lead_id: leadId,
      p_to_stage: stage,
      p_expected_from_stage: expectedFromStage,
      p_reason: followUpDescription || null,
      p_reversal_of: reversalOf,
    });

    if (!atomicMove.error) {
      const moved = (atomicMove.data ?? {}) as Record<string, unknown>;
      const movedHistoryId = typeof moved.moveId === "string" ? moved.moveId
        : typeof moved.historyId === "string" ? moved.historyId
        : null;
      // ── POR QUE NÃO EXIGIMOS MAIS `moved.lead` ────────────────────────────
      //
      // `move_pipeline_lead` devolve {moveId, leadId, previousStage, stage,
      // occurredAt, reversalOf} — nunca devolveu `lead`. A condição antiga
      // exigia essa chave, então NUNCA entrava aqui: a movimentação acontecia
      // no banco e a rota caía no caminho compensatório, que reconferia a etapa
      // e a encontrava JÁ ALTERADA — devolvendo 409.
      //
      // O corretor arrastava o card, a lead mudava de etapa no banco, e a tela
      // dizia "a lead foi movimentada por outra pessoa". Ele atualizava, via a
      // lead no lugar certo, e não entendia.
      //
      // `movedLead` era redundante: `refreshed` logo abaixo busca a lead
      // inteira e é ela que vai na resposta. O que precisa existir é o id do
      // movimento — a prova de que a auditoria foi gravada.
      if (movedHistoryId) {
        /**
         * ── O MOTIVO DO DESCARTE, QUE ESTAVA SENDO JOGADO FORA ──────────────
         *
         * Esta rota EXIGE o motivo: mover para `perdido` sem `discardReason`
         * devolve 400 `DISCARD_REASON_REQUIRED` (linha 321), e chave fora da
         * taxonomia devolve 400 `INVALID_DISCARD_REASON`. A guarda entrou em
         * 20/07/2026.
         *
         * E o motivo morria aqui. A chamada da RPC logo acima passa apenas
         * `p_reason: followUpDescription`; `discardReason.key` e
         * `discardNotes` não chegavam a lugar nenhum. O único código que os
         * gravava (`recordLiveLeadEvent` com `lead_discarded`, mais abaixo)
         * vive DEPOIS do `return` desta função — no ramo compensatório, que só
         * roda se a RPC não existir. Ela existe.
         *
         * Medido em 2026-07-30: 104 saídas registradas entre 27/07 e 30/07,
         * TODAS posteriores à guarda, e `reason` nulo em 102. O corretor
         * escolheu o motivo 102 vezes; o sistema descartou 102 vezes. A tela
         * /pipeline/discards mostrava zero e dizia que o time não classificava.
         *
         * Grava num update próprio, e não na RPC, pelo mesmo motivo já
         * registrado abaixo para o valor da venda: mudar a assinatura de
         * `move_pipeline_lead` exigiria DROP+CREATE (CREATE OR REPLACE com
         * assinatura nova gera SOBRECARGA e o PostgREST passa a errar por
         * ambiguidade). Se este update falhar, a saída fica sem motivo — que é
         * exatamente o estado de hoje, já rotulado "não medido" na leitura.
         * Falhar para o lado de não classificar é o lado seguro.
         */
        if (discardReason) {
          const gravouMotivo = await admin
            .from("pipeline_stage_moves")
            .update({ discard_reason_key: discardReason.key, discard_notes: discardNotes || null })
            .eq("id", movedHistoryId)
            .eq("organization_id", identity.organizationId);
          if (gravouMotivo.error) {
            logger.warn("pipeline.motivo_do_descarte_nao_gravado", {
              leadId,
              moveId: movedHistoryId,
              erro: gravouMotivo.error.message,
            });
          }
        }
        // O valor vai num update próprio porque a RPC não o conhece (mudar a
        // assinatura dela obrigaria migration em banco que já roda). Se este
        // update falhar, a lead fica em "ganho" sem valor — que é exatamente o
        // estado "vendeu e ainda não informou" já previsto por
        // `sale_value_recorded_at`, e a CAPI simplesmente não emite o evento.
        // Falhar para o lado de não enviar é o lado certo de falhar.
        if (saleValue !== null) {
          const gravou = await admin.from("leads")
            .update({ sale_value_brl: saleValue, sale_value_recorded_at: new Date().toISOString() })
            .eq("id", leadId).eq("organization_id", identity.organizationId);
          if (gravou.error) logger.warn("pipeline.valor_da_venda_nao_gravado", { leadId, erro: gravou.error.message });
        }
        const refreshed = await admin.from("leads").select(LIVE_LEAD_SELECT).eq("id", leadId).eq("organization_id", identity.organizationId).maybeSingle();
        if (refreshed.data) {
          logger.info("pipeline.move_atomic", { leadId, fromStage: previousStage, toStage: stage, reversalOf });
          return NextResponse.json({
            ok: true,
            atomic: true,
            lead: mapLegacyLead(refreshed.data as unknown as CompatRow),
            move: { id: movedHistoryId, fromStage: previousStage, toStage: stage, reversalOf },
          });
        }
      }
    } else if (atomicMove.error.code !== "42883" && atomicMove.error.code !== "PGRST202") {
      // Recusa de regra do banco (etapa inválida, reversão inconsistente): é
      // resposta legítima, não motivo para tentar a escrita manual por cima.
      // ── OITO RECUSAS, OITO SAÍDAS ─────────────────────────────────────────
      //
      // A RPC levanta exceções distintas: etapa inválida, lead fora do escopo,
      // conflito de etapa, desfazer inconsistente. Todas caíam numa frase só —
      // "Atualize o Kanban e confira a etapa atual".
      //
      // Para `pipeline_move_out_of_scope` isso é um beco: a lead não muda de
      // dono porque o corretor atualizou a tela. Ele atualiza, tenta de novo,
      // lê a mesma frase, e conclui que o CRM está quebrado. O caminho ali é
      // pedir a lead ao gestor — e ninguém dizia.
      const motivo = String(atomicMove.error.message || "");
      logger.warn("pipeline.move_rejected", { leadId, stage, code: atomicMove.error.code, motivo });
      // Lead de outra carteira é permissão (403), não disputa de versão (409):
      // devolver 409 faz cliente e tela tratarem como "tente de novo".
      const foraDoEscopo = motivo.includes("pipeline_move_out_of_scope");
      const naoEncontrada = motivo.includes("pipeline_lead_not_found");
      return recusar(
        motivo.match(/pipeline_[a-z_]+/)?.[0] ?? "PIPELINE_STAGE_CONFLICT",
        foraDoEscopo ? 403 : naoEncontrada ? 404 : 409,
        { currentStage: previousStage },
      );
    }

    // Caminho compensatório: bancos que ainda não têm a RPC. Muda a etapa e
    // restaura imediatamente se a linha de auditoria não puder ser gravada.
    const { data: updated, error: updateError } = await admin
      .from("leads")
      // Aqui o valor entra no MESMO update da etapa: sem janela entre "virou
      // ganho" e "tem valor".
      .update(saleValue !== null
        ? { status: stage, sale_value_brl: saleValue, sale_value_recorded_at: new Date().toISOString() }
        : { status: stage })
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .eq("status", current.status)
      .select(LIVE_LEAD_SELECT)
      .maybeSingle();
    if (updateError || !updated) {
      return recusar("PIPELINE_STAGE_CONFLICT", 409, { currentStage: previousStage });
    }

    const occurredAt = new Date().toISOString();
    const { data: history, error: historyError } = await admin
      .from("pipeline_history")
      .insert({
        organization_id: identity.organizationId,
        lead_id: leadId,
        status: stage,
        old_status: previousStage,
        new_status: stage,
        changed_by: identity.userId,
        created_at: occurredAt,
      })
      .select("id,lead_id,old_status,new_status,changed_by,created_at")
      .single();

    if (historyError || !history) {
      const rollback = await admin
        .from("leads")
        .update({ status: current.status })
        .eq("id", leadId)
        .eq("organization_id", identity.organizationId)
        .eq("status", stage);
      logger.error("pipeline.history_failed", { leadId, stage, previousStage, rollbackError: rollback.error?.message, historyError: historyError?.message });
      return recusar("PIPELINE_AUDIT_FAILED", 503);
    }

    const liveEventWrites = [
      recordLiveLeadEvent(admin, {
        organizationId: identity.organizationId,
        leadId,
        actorId: identity.userId,
        type: reversalOf ? "pipeline_move_reverted" : "pipeline_stage_changed",
        title: reversalOf ? "Movimentação desfeita" : "Etapa comercial atualizada",
        description: followUpDescription || `${previousStage} → ${stage}`,
        metadata: {
          fromStage: previousStage,
          toStage: stage,
          pipelineHistoryId: history.id,
          reversalOf,
          source,
          humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
        },
      }),
    ];
    // Evento estruturado de descarte: só quando o motivo veio e a movimentação
    // não é um desfazer (reversalOf) — desfazer não é um novo descarte. Vive no
    // mesmo Promise.allSettled best-effort: o audit crítico é pipeline_history;
    // falha aqui NÃO desfaz a movimentação (observabilidade no bloco abaixo,
    // mesmo padrão do commit 31328039).
    const shouldRecordDiscard = stage === "perdido" && discardReason !== null && !reversalOf;
    if (shouldRecordDiscard && discardReason) {
      liveEventWrites.push(
        recordLiveLeadEvent(admin, {
          organizationId: identity.organizationId,
          leadId,
          actorId: identity.userId,
          type: "lead_discarded",
          title: "Lead descartado",
          description: discardNotes || discardReason.label,
          metadata: {
            reasonKey: discardReason.key,
            reasonLabel: discardReason.label,
            metaLeadStatus: discardReason.metaLeadStatus,
            metaCategory: discardReason.metaCategory,
            decisionSignal: discardReason.decisionSignal,
            notes: discardNotes || null,
            fromStage: previousStage,
            source,
            campaignId: (updated as unknown as Record<string, unknown>).campaign_id ?? null,
            pipelineHistoryId: history.id,
            taxonomyVersion: DISCARD_TAXONOMY_VERSION,
          },
        }),
      );
    }
    const liveEventResults = await Promise.allSettled(liveEventWrites);
    if (shouldRecordDiscard) {
      const discardResult = liveEventResults[liveEventResults.length - 1];
      const discardError: unknown = discardResult.status === "rejected" ? discardResult.reason : discardResult.value.error;
      if (discardError) {
        logger.warn("pipeline.discard_event_failed", {
          organizationId: identity.organizationId,
          leadId,
          reasonKey: discardReason?.key,
          message: discardError instanceof Error
            ? discardError.message
            : typeof (discardError as { message?: unknown })?.message === "string"
              ? String((discardError as { message: string }).message)
              : String(discardError),
        });
      }
    }

    const updatedRow = updated as unknown as Record<string, unknown>;
    const data = mapLegacyLead(updatedRow);

    // Memória de operação: a movimentação de etapa é o ponto de maior densidade
    // de fato comercial do sistema, e até aqui ela não ensinava nada. Vive no
    // mesmo allSettled best-effort do aprendizado de funil — o audit crítico já
    // é pipeline_history, então falha nesta linha não pode desfazer a venda.
    //
    // Desfazer não é desfecho novo: é a COMPENSAÇÃO de um. E desfazer é sempre
    // retrocesso de etapa ("perdido" → "contato"), então classificar pela
    // direção do movimento devolvia null e a correção nunca era gravada — a
    // perda registrada por engano ficava na tabela para sempre. Por isso o fato
    // da reversão é reconstruído na direção do movimento ORIGINAL (stage →
    // previousStage) e viaja marcado, para a leitura abater o par.
    const learningFromStage = reversalOf ? stage : previousStage;
    const learningToStage = reversalOf ? previousStage : stage;
    const learningOutcome = commercialOutcomeFromStages(learningFromStage, learningToStage);
    const [, learningResult] = await Promise.allSettled([
      recordFunnelLearning({ organizationId: identity.organizationId, leadId, previousStage, stage, occurredAt, description: followUpDescription }),
      learningOutcome
        ? recordCommercialLearningEvent(admin, {
          organizationId: identity.organizationId,
          leadId,
          actorId: identity.userId,
          outcome: learningOutcome,
          fromStage: learningFromStage,
          toStage: learningToStage,
          reasonKey: discardReason?.key ?? null,
          source: typeof updatedRow.source === "string" ? updatedRow.source : null,
          campaignId: updatedRow.campaign_id == null ? null : String(updatedRow.campaign_id),
          // Identidade da movimentação (chave de deduplicação na leitura) e,
          // quando houver, o id da movimentação que esta linha cancela.
          moveId: history.id,
          reversalOf,
          writePath: "pipeline",
        })
        : Promise.resolve(null),
    ]);
    const learningError: unknown = learningResult.status === "rejected" ? learningResult.reason : learningResult.value?.error;
    if (learningError) {
      // Drift de schema (tabela/coluna ausente) não é intermitência: é a
      // garantia de que nenhuma linha será gravada nunca. Sobe como erro para
      // aparecer na observabilidade em vez de morrer como aviso.
      const drift = learningResult.status === "fulfilled" && learningResult.value?.drift === true;
      const payload = {
        organizationId: identity.organizationId,
        leadId,
        outcome: learningOutcome,
        table: "ai_learning_events",
        message: learningError instanceof Error
          ? learningError.message
          : typeof (learningError as { message?: unknown })?.message === "string"
            ? String((learningError as { message: string }).message)
            : String(learningError),
      };
      if (drift) logger.error("pipeline.learning_event_schema_drift", payload);
      else logger.warn("pipeline.learning_event_failed", payload);
    }

    logger.info("pipeline.stage_changed", {
      leadId,
      previousStage,
      stage,
      organizationId: identity.organizationId,
      source,
      humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
      discardReason: discardReason?.key ?? null,
    });
    return NextResponse.json({
      lead: data,
      move: {
        moveId: history.id,
        fromStage: previousStage,
        toStage: stage,
        occurredAt,
        reversalOf,
        source,
        humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
        discardReason: discardReason?.key ?? null,
        auditSource: "pipeline_history",
        writeSafety: "compensating-write",
      },
    });
  } catch (error) {
    logger.warn("pipeline.move_failed", { error: error instanceof Error ? error.message : String(error) });
    return authError(error);
  }
}
