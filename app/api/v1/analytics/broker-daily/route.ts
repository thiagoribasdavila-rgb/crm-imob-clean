import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { filtroDaCarteiraDaPessoa } from "@/lib/crm/escopo-de-leitura";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  LIVE_LEAD_SELECT,
  LIVE_LEAD_SELECT_WITH_SLA,
  isMissingColumn,
  mapLegacyLead,
  mapLegacyTask,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import {
  computeAttentionSignals,
  groupAttentionSignalsByLead,
  severityRank,
  HIGH_SCORE_NO_CONTACT_BUSINESS_DAYS,
  HOT_SCORE_THRESHOLD,
  NEVER_CONTACTED_CRITICAL_HOURS,
  STAGE_STALE_THRESHOLD_DAYS,
} from "@/lib/atlas/attention-signals";

export const dynamic = "force-dynamic";

const CLOSED = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const DONE = new Set([
  "done",
  "concluido",
  "concluida",
  "completed",
  "cancelado",
  "cancelada",
]);
const DAY = 86_400_000;
const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const timestamp = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

// Probabilidade de conversão — mesma fórmula base do preditor de produção
// (build_lead_prediction_explanation): inclui o peso da ETAPA, que o antigo
// priorityScore ignorava, empurrando para o topo os leads mais perto da venda.
const STAGE_WEIGHT: Record<string, number> = {
  contato: 4,
  qualificacao: 12,
  visita: 20,
  proposta: 30,
  contrato: 42,
};
const conversionProbabilityPct = (score: number, status: unknown) =>
  Math.round(
    Math.max(1, Math.min(95, 10 + score * 0.55 + (STAGE_WEIGHT[normalize(status)] ?? 0))),
  );

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    scope: "broker.daily-dashboard",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: ["broker"] });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const brokerId = identity.access.profile.id;
  const now = Date.now();
  const [leadResultInicial, taskResult] = await Promise.all([
    // Com SLA: sem first_contacted_at esta rota não tem como saber quem nunca
    // foi contatado — e era exatamente por ler o select base que a carteira
    // 99% intocada aparecia como "Operação em dia".
    identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT_WITH_SLA)
      .eq("organization_id", organizationId)
      // As DUAS colunas de posse, pelo módulo compartilhado. Filtrar só por
      // `assigned_user_id` escondia do dia da pessoa os leads que estão na
      // carteira dela pela coluna legada — medido: 3 abertos, 1 nunca
      // contatado. O painel dizia menos trabalho do que existe.
      .or(filtroDaCarteiraDaPessoa(brokerId))
      .limit(1000),
    identity.supabase
      .from("tasks")
      .select(
        "id,title,description,status,user_id,lead_id,created_at,organization_id,priority,due_date",
      )
      .eq("organization_id", organizationId)
      .eq("user_id", brokerId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1000),
  ]);

  // Base legada sem as colunas do SLA: cai para o select base e DECLARA que
  // não mediu. O que não pode acontecer é o número virar zero silencioso.
  let primeiroContatoMensuravel = true;
  let leadResult = leadResultInicial;
  if (leadResult.error && isMissingColumn(leadResult.error)) {
    primeiroContatoMensuravel = false;
    leadResult = await identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("organization_id", organizationId)
      // O MESMO filtro do caminho principal. Divergir aqui faria a base legada
      // esconder leads que a base atual mostra — dois caminhos para a mesma
      // verdade é a classe de defeito mais cara deste repositório.
      .or(filtroDaCarteiraDaPessoa(brokerId))
      .limit(1000);
  }

  if (leadResult.error || taskResult.error) {
    return apiError(
      "BROKER_DAILY_LOAD_FAILED",
      "Não foi possível preparar sua operação diária.",
      identity.meta,
      { status: 503 },
    );
  }

  const activeLeads = ((leadResult.data ?? []) as unknown as CompatRow[])
    .map(mapLegacyLead)
    .filter((lead) => !CLOSED.has(normalize(lead.status)));
  const activeIds = new Set(activeLeads.map((lead) => String(lead.id)));
  const openTasks = ((taskResult.data ?? []) as unknown as CompatRow[])
    .map(mapLegacyTask)
    .filter(
      (task) =>
        !DONE.has(normalize(task.status)) &&
        (!task.lead_id || activeIds.has(String(task.lead_id))),
    );
  const overdueByLead = new Set(
    openTasks
      .filter(
        (task) =>
          task.lead_id &&
          (timestamp(task.due_at) ?? Number.MAX_SAFE_INTEGER) < now,
      )
      .map((task) => String(task.lead_id)),
  );

  // Fase 100 · Sinais de atenção proativos: estende a mesma carteira já
  // carregada acima (activeLeads) com sinais determinísticos de
  // pipeline_history, followups e lead_events — sem duplicar a leitura de leads.
  const attentionSignals = await computeAttentionSignals(
    identity.supabase,
    organizationId,
    activeLeads.map((lead) => ({
      id: String(lead.id),
      status: String(lead.status || "novo"),
      score: Number(lead.score || 0),
      temperature: typeof lead.temperature === "string" ? lead.temperature : null,
      createdAt: typeof lead.created_at === "string" ? lead.created_at : null,
      firstContactedAt: typeof lead.first_contacted_at === "string" ? lead.first_contacted_at : null,
      firstContactDueAt: typeof lead.first_contact_due_at === "string" ? lead.first_contact_due_at : null,
    })),
    { now, primeiroContatoMensuravel },
  );
  const attentionByLead = groupAttentionSignalsByLead(attentionSignals);
  const attentionQueueCompleta = activeLeads
    .map((lead) => {
      const bucket = attentionByLead.get(String(lead.id));
      if (!bucket) return null;
      return {
        leadId: String(lead.id),
        leadName: String(lead.name || "Lead sem nome"),
        status: String(lead.status || "novo"),
        score: Number(lead.score || 0),
        topSeverity: bucket.topSeverity,
        topReason: bucket.topReason,
        signals: bucket.signals.map((signal) => ({
          kind: signal.kind,
          severity: signal.severity,
          reason: signal.reason,
          detail: signal.detail,
          since: signal.since,
          metric: signal.metric,
        })),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => severityRank(right.topSeverity) - severityRank(left.topSeverity) || right.signals.length - left.signals.length);

  // O TOTAL é contado antes do corte de exibição. Publicar
  // `attentionQueue.length` (o valor cortado) fazia o anel "Fila atendida" da
  // central usar um teto de paginação como nota de saúde: com o corte em 20,
  // uma carteira de 500 leads inteiramente travada ainda desenhava 96%. A
  // fórmula era matematicamente incapaz de dar nota ruim.
  const LIMITE_DA_FILA = 20;
  const attentionQueue = attentionQueueCompleta.slice(0, LIMITE_DA_FILA);

  const prioritiesCompletas = activeLeads
    .map((lead) => {
      const score = Number(lead.score || 0);
      const hot = normalize(lead.temperature) === "quente" || score >= 70;
      const createdAt = timestamp(lead.created_at);
      const nextActionAt = timestamp(lead.next_action_at);
      const firstContactOverdue =
        normalize(lead.status) === "novo" &&
        createdAt !== null &&
        createdAt < now - 15 * 60_000;
      const followUpOverdue = nextActionAt !== null && nextActionAt < now;
      const taskOverdue = overdueByLead.has(String(lead.id));
      const noNextAction = nextActionAt === null;
      const conversionProbability = conversionProbabilityPct(score, lead.status);
      const priorityScore =
        conversionProbability +
        (firstContactOverdue ? 120 : 0) +
        (followUpOverdue ? 90 : 0) +
        (taskOverdue ? 50 : 0) +
        (hot ? 30 : 0) +
        (noNextAction ? 15 : 0);
      const reason = firstContactOverdue
        ? "Lead novo aguardando primeiro contato"
        : followUpOverdue
          ? "Follow-up vencido"
          : taskOverdue
            ? "Tarefa vinculada atrasada"
            : hot
              ? "Lead quente com alta intenção"
              : noNextAction
                ? "Sem próxima ação definida"
                : "Maior potencial da carteira";
      const nextBestAction = firstContactOverdue
        ? "Entrar em contato agora e registrar o resultado"
        : followUpOverdue
          ? "Retomar a conversa e combinar uma nova data"
          : taskOverdue
            ? "Concluir a tarefa pendente antes de avançar"
            : hot
              ? "Confirmar interesse, projeto e próximo compromisso"
              : noNextAction
                ? "Definir uma próxima ação com data"
                : "Revisar o histórico e executar a ação programada";
      const attentionBucket = attentionByLead.get(String(lead.id));
      return {
        leadId: String(lead.id),
        leadName: String(lead.name || "Lead sem nome"),
        status: String(lead.status || "novo"),
        score,
        priorityScore,
        conversionProbability,
        probabilityBasis: "raw" as const,
        reason,
        nextBestAction,
        dueAt: lead.next_action_at ? String(lead.next_action_at) : null,
        hot,
        source: lead.source ? String(lead.source) : null,
        developmentId: lead.development_id
          ? String(lead.development_id)
          : null,
        // Fase 100 · sinais adicionais de atenção proativa para este lead
        // (etapa parada, follow-up vencido, quente sem contato). Não altera
        // `reason`/`priorityScore` acima para não mudar o comportamento
        // já existente da fila explicável.
        attentionSignals: (attentionBucket?.signals ?? []).map((signal) => ({
          kind: signal.kind,
          severity: signal.severity,
          reason: signal.reason,
          detail: signal.detail,
          since: signal.since,
          metric: signal.metric,
        })),
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore);
  const priorities = prioritiesCompletas.slice(0, 7);

  const agenda = openTasks
    .filter((task) => {
      const due = timestamp(task.due_at);
      return due !== null && due <= now + 7 * DAY;
    })
    .slice(0, 8)
    .map((task) => ({
      id: String(task.id),
      title: String(task.title || "Tarefa"),
      dueAt: String(task.due_at),
      priority: String(task.priority || "normal"),
      leadId: task.lead_id ? String(task.lead_id) : null,
      overdue: (timestamp(task.due_at) ?? now) < now,
    }));
  // Predicado por COLUNA (first_contacted_at nulo), não por etapa. O antigo
  // — status "novo" há mais de 15 min — erra dos dois lados: nesta base perde
  // 19 leads que avançaram para "contato"/"qualificação" sem ninguém ter
  // registrado uma ligação, e conta 5 que já foram contatados e seguem em
  // "novo". `null` quando as colunas não existem: não medido nunca é zero.
  const firstContactOverdue = primeiroContatoMensuravel
    ? activeLeads.filter((lead) => !lead.first_contacted_at).length
    : null;
  const followUpOverdue = activeLeads.filter(
    (lead) =>
      (timestamp(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now,
  ).length;

  return apiSuccess(
    {
      scope: { role: "broker", ownPortfolioOnly: true, brokerId },
      summary: {
        activeLeads: activeLeads.length,
        hotLeads: activeLeads.filter(
          (lead) =>
            normalize(lead.temperature) === "quente" || Number(lead.score || 0) >= 70,
        ).length,
        openTasks: openTasks.length,
        overdueTasks: openTasks.filter(
          (task) =>
            (timestamp(task.due_at) ?? Number.MAX_SAFE_INTEGER) < now,
        ).length,
        firstContactOverdue,
        primeiroContatoMensuravel,
        followUpOverdue,
        agendaNext7Days: agenda.length,
        // O total real, não o tamanho da página. Ver LIMITE_DA_FILA acima.
        leadsNeedingAttention: attentionQueueCompleta.length,
        leadsNeedingAttentionExibidos: attentionQueue.length,
      },
      priorities,
      // "7 de 448" em vez de "7": o crachá da central dizia só o tamanho da
      // página, o que faz uma carteira inteira parada parecer sete pendências.
      prioritiesTotal: prioritiesCompletas.length,
      agenda,
      // Fase 100 · Sinais de atenção proativos: fila própria (não limitada a 7
      // itens como `priorities`) só com leads que dispararam pelo menos um dos
      // três sinais determinísticos abaixo. Reaproveita activeLeads já lido
      // nesta rota; nenhuma tabela nova, nenhuma migration.
      attention: {
        explainable: true,
        humanApprovalRequired: true,
        rules: {
          staleStage: `Sem mudança de etapa em pipeline_history além do limite por etapa (${Object.entries(STAGE_STALE_THRESHOLD_DAYS).map(([stage, days]) => `${stage}: ${days}d`).join(", ")}); usa leads.created_at quando o lead nunca mudou de etapa.`,
          followUpOverdue: "followups.scheduled_at no passado com completed=false.",
          highScoreNoContact: `score_ia >= ${HOT_SCORE_THRESHOLD} ou temperatura "quente" sem nenhuma linha em lead_events nos últimos ${HIGH_SCORE_NO_CONTACT_BUSINESS_DAYS} dias úteis.`,
          neverContacted: primeiroContatoMensuravel
            ? `leads.first_contacted_at nulo com first_contact_due_at vencido (crítico a partir de ${NEVER_CONTACTED_CRITICAL_HOURS}h de atraso); sem prazo gravado, conta desde a criação.`
            : "Não medido: as colunas de SLA de primeiro contato não existem nesta base.",
        },
        queue: attentionQueue,
        // O corte é declarado para que ninguém leia o tamanho da lista como
        // se fosse o tamanho do problema.
        total: attentionQueueCompleta.length,
        truncated: attentionQueueCompleta.length > attentionQueue.length,
      },
      ranking: {
        explainable: true,
        driver: "conversion_probability",
        probabilityModel: {
          basis: "raw",
          formula: "clamp(1,95, 10 + score*0.55 + stage_weight)",
          calibrationApplied: false,
          note: "A calibração ativa aprovada é aplicada na visão de previsão por lead; a fila em lote usa a probabilidade base (idêntica quando não há modelo aprovado).",
        },
        signals: [
          "conversion_probability",
          "score_ia",
          "new_lead_age",
          "next_contact",
          "overdue_task",
          "temperature",
          "missing_next_action",
        ],
        humanApprovalRequired: true,
      },
      compatibility: "live-schema-safe",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: rate.headers },
  );
}
