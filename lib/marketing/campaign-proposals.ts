/**
 * Propostas de campanha Meta — o elo PURO entre "o diretor decidiu" e a linha
 * que entra na Caixa de Aprovações (`approval_requests`). Espelha exatamente o
 * contrato do repo (mesmo shape do que a rota de propostas de ação insere):
 *
 *   - request_type "meta_campaign" / entity_type "meta_campaign" (text livre,
 *     sem CHECK — não exige migration de schema);
 *   - payload JSONB autoexplicativo { kind, plan, projection, governance } (+
 *     version/title para a pré-visualização direta na Caixa, sem JOIN);
 *   - status "pending" — NADA nasce aprovado; a execução real vive fora daqui,
 *     na rota de decisão/execução, sempre após aprovação humana verificável.
 *
 * Núcleo determinístico: sem rede, sem efeito, `now` injetável. `plan` carrega
 * OU o plano de publicação (saída de planCampaignCreation, kind "create") OU o
 * passo de controle (pause/activate/set_daily_budget sobre objeto existente).
 * `validateProposal` recusa por kind ANTES de qualquer insert (estado honesto:
 * plano vazio, objectId ausente, verba não positiva → problema explícito).
 */

// Tipos compartilhados são importados SÓ como tipo (`import type` é apagado no
// strip de tipos nativo do Node), mantendo este módulo carregável isolado pelos
// checks adversariais sem imports de valor.
import type { ExecutionStep } from "../meta/marketing/campaign-executor";
import type { MoveProjection, PlanProjection } from "../ai/decision-simulator";

export const CAMPAIGN_PROPOSAL_VERSION = 1;
export const CAMPAIGN_PROPOSAL_REQUEST_TYPE = "meta_campaign";
export const CAMPAIGN_PROPOSAL_ENTITY_TYPE = "meta_campaign";
/** Expiração padrão da proposta (horas) — decisão de campanha não fica pendente para sempre. */
export const DEFAULT_EXPIRES_IN_HOURS = 72;

export type CampaignProposalKind = "create" | "pause" | "activate" | "set_daily_budget";

/** Plano de publicação (kind "create") — saída de planCampaignCreation + alvos da conta. */
export type PublishPlan = {
  accountId: string;
  steps: ExecutionStep[];
  pageId?: string | null;
  leadFormId?: string | null;
};

/** Passo de controle sobre objeto Meta existente (pause/activate/set_daily_budget). */
export type ControlStepInput = {
  objectType: "campaign" | "adset" | "ad";
  objectId: string;
  /** Presente APENAS em set_daily_budget — verba diária em BRL (positiva). */
  dailyBudgetBrl?: number | null;
};

/** Projeção do decision-simulator (plano inteiro OU um movimento) — opcional. */
export type ProposalProjection = PlanProjection | MoveProjection;

export type CampaignProposalInput = {
  organizationId: string;
  requestedBy: string;
  kind: CampaignProposalKind;
  title: string;
  /** Plano de publicação (create) OU passo de controle (demais kinds). */
  payload: PublishPlan | ControlStepInput;
  projection?: ProposalProjection | null;
  /** Default 72h; valores <= 0 são ignorados e caem no default. */
  expiresInHours?: number;
};

export type CampaignProposalPayload = {
  version: number;
  kind: CampaignProposalKind;
  title: string;
  plan: PublishPlan | ControlStepInput;
  projection: ProposalProjection | null;
  governance: { requiresApproval: true; source: "deterministic"; note: string };
};

/** Shape EXATO de uma linha de insert em public.approval_requests. */
export type CampaignApprovalRow = {
  organization_id: string;
  request_type: typeof CAMPAIGN_PROPOSAL_REQUEST_TYPE;
  entity_type: typeof CAMPAIGN_PROPOSAL_ENTITY_TYPE;
  entity_id: string | null;
  payload: CampaignProposalPayload;
  status: "pending";
  requested_by: string;
  expires_at: string;
};

const HOUR_MS = 3_600_000;
const KINDS: readonly CampaignProposalKind[] = ["create", "pause", "activate", "set_daily_budget"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPublishPlan(payload: PublishPlan | ControlStepInput): PublishPlan | null {
  return isRecord(payload) && "steps" in payload ? (payload as PublishPlan) : null;
}

function asControlStep(payload: PublishPlan | ControlStepInput): ControlStepInput | null {
  return isRecord(payload) && "objectId" in payload ? (payload as ControlStepInput) : null;
}

/** Nota humana de governança por kind — o aprovador entende o efeito em segundos. */
function governanceNote(kind: CampaignProposalKind): string {
  switch (kind) {
    case "create":
      return "Estrutura nasce PAUSED; ativar é decisão humana posterior, fora deste passo.";
    case "pause":
      return "Pausar interrompe a entrega imediatamente.";
    case "activate":
      return "Ativar coloca a campanha no ar — exige aprovação registrada.";
    case "set_daily_budget":
      return "Ajuste de verba diária sobre objeto existente.";
    default:
      return "Decisão de campanha sob revisão humana.";
  }
}

/**
 * Acusa tudo que impediria a proposta de ser registrada/executada com segurança,
 * ANTES de qualquer insert. Vazio = proposta pronta para a Caixa.
 * Regras por kind:
 *   - create: plan de publicação com accountId e steps NÃO vazio;
 *   - activate/pause: passo de controle com objectId (id numérico da Meta);
 *   - set_daily_budget: objectId + verba diária positiva.
 */
export function validateProposal(input: CampaignProposalInput): string[] {
  const problems: string[] = [];
  if (!input.organizationId?.trim()) problems.push("organizationId ausente.");
  if (!input.requestedBy?.trim()) problems.push("requestedBy ausente — toda proposta tem autor.");
  if (!input.title?.trim()) problems.push("title ausente — a Caixa mostra o título ao aprovador.");
  if (!KINDS.includes(input.kind)) {
    problems.push(`kind "${String(input.kind)}" inválido — use create | pause | activate | set_daily_budget.`);
    return problems; // sem kind válido não há como validar o payload
  }
  if (input.expiresInHours != null && !(Number.isFinite(input.expiresInHours) && input.expiresInHours > 0)) {
    problems.push("expiresInHours deve ser um número positivo (ou omitido para o default de 72h).");
  }

  if (input.kind === "create") {
    const plan = asPublishPlan(input.payload);
    if (!plan) {
      problems.push("create exige plano de publicação (com steps) — recebido passo de controle.");
    } else {
      if (!plan.accountId?.trim()) problems.push("create: accountId da conta de anúncios ausente.");
      if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
        problems.push("create: plano vazio — steps deve conter ao menos a campanha.");
      }
    }
    return problems;
  }

  // pause | activate | set_daily_budget — passo de controle sobre objeto existente
  const control = asControlStep(input.payload);
  if (!control) {
    problems.push(`${input.kind} exige passo de controle com objectId — recebido plano de publicação.`);
    return problems;
  }
  if (!/^\d{5,}$/.test(String(control.objectId ?? "").trim())) {
    problems.push(`${input.kind}: objectId "${String(control.objectId ?? "")}" não parece um id da Meta (numérico).`);
  }
  if (input.kind === "set_daily_budget") {
    const brl = Number(control.dailyBudgetBrl);
    if (!Number.isFinite(brl) || brl <= 0) {
      problems.push("set_daily_budget: dailyBudgetBrl deve ser um valor positivo em BRL.");
    }
  }
  return problems;
}

/**
 * Monta a linha de approval_requests (pendente) para uma proposta de campanha.
 * PURA e determinística: `now` injetável, sem validação silenciosa — quem chama
 * roda validateProposal antes e decide o que fazer com os problemas. Nada aqui
 * escreve no banco nem executa: é só o material que a rota insere.
 */
export function buildCampaignProposal(
  input: CampaignProposalInput,
  now: Date = new Date(),
): CampaignApprovalRow {
  const hours =
    input.expiresInHours != null && Number.isFinite(input.expiresInHours) && input.expiresInHours > 0
      ? input.expiresInHours
      : DEFAULT_EXPIRES_IN_HOURS;
  const expiresAt = new Date(now.getTime() + hours * HOUR_MS).toISOString();

  const payload: CampaignProposalPayload = {
    version: CAMPAIGN_PROPOSAL_VERSION,
    kind: input.kind,
    title: input.title,
    plan: input.payload,
    projection: input.projection ?? null,
    governance: { requiresApproval: true, source: "deterministic", note: governanceNote(input.kind) },
  };

  return {
    organization_id: input.organizationId,
    request_type: CAMPAIGN_PROPOSAL_REQUEST_TYPE,
    entity_type: CAMPAIGN_PROPOSAL_ENTITY_TYPE,
    entity_id: null, // campanha não tem entidade CRM — é objeto da plataforma
    payload,
    status: "pending",
    requested_by: input.requestedBy,
    expires_at: expiresAt,
  };
}
