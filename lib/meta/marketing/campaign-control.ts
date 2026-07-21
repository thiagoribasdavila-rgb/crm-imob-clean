/**
 * Controle governado de campanhas EXISTENTES — pausar, ativar e ajustar verba
 * pela plataforma (complementa o campaign-executor, que cria estruturas novas).
 *
 * Invariantes de governança (em código, não em promessa):
 * - dryRun é o DEFAULT — execução real é decisão explícita do chamador.
 * - ATIVAR exige registro de aprovação humana (approvalId + approvedBy) no
 *   próprio passo; sem isso o plano não valida e a execução recusa.
 * - Verba tem trilho mínimo (evita zerar/typo destruir a entrega).
 * - Token nunca aparece em erro/log; idempotency-key em todo POST.
 */

export type ControlKind = "pause" | "activate" | "set_daily_budget";
export type ControlObjectType = "campaign" | "adset" | "ad";

export type ControlStep = {
  kind: ControlKind;
  objectType: ControlObjectType;
  objectId: string;
  payload: Record<string, unknown>;
  /** Presente APENAS em ativação: o rastro da decisão humana. */
  approval?: { approvalId: string; approvedBy: string };
};

export type ControlResult = {
  kind: ControlKind;
  objectId: string;
  ok: boolean;
  dryRun: boolean;
  error?: string;
};

/** Verba diária mínima aceita (centavos) — trilho anti-typo, não política Meta. */
export const MIN_DAILY_BUDGET_CENTS = 500;

const GRAPH = "https://graph.facebook.com";

function sanitize(message: string, token: string): string {
  return token ? message.split(token).join("<token>") : message;
}

/**
 * Import DINÂMICO de resilientFetch — mantém o módulo sem import de VALOR no
 * topo (puro/testável) e só carrega a casca server-only quando um POST real
 * de controle acontece. Cacheado.
 */
let resilientMod: Promise<typeof import("../../http/resilient-fetch")> | null = null;
function loadResilient(): Promise<typeof import("../../http/resilient-fetch")> {
  return (resilientMod ??= import("../../http/resilient-fetch"));
}

/**
 * Fetcher DEFAULT do controle: timeout de 30s e ZERO retries — pausar/ativar/
 * ajustar verba é POST; um reenvio poderia reaplicar em duplicidade, então não
 * reexecuta. Injetável: opts.fetcher tem prioridade.
 */
const defaultWriteFetch: typeof fetch = async (input, init) => {
  const { resilientFetch } = await loadResilient();
  const url = typeof input === "string" || input instanceof URL ? input : input.url;
  return resilientFetch(url, init, { timeoutMs: 30_000, retries: 0, operation: "Meta Marketing API (controle)" });
};

export function planPause(objectType: ControlObjectType, objectId: string): ControlStep {
  return { kind: "pause", objectType, objectId, payload: { status: "PAUSED" } };
}

/** Ativar é SEMPRE decisão humana — o rastro da aprovação viaja no passo. */
export function planActivation(
  objectType: ControlObjectType,
  objectId: string,
  approval: { approvalId: string; approvedBy: string },
): ControlStep {
  return { kind: "activate", objectType, objectId, payload: { status: "ACTIVE" }, approval };
}

export function planDailyBudget(
  objectType: "campaign" | "adset",
  objectId: string,
  dailyBudgetCents: number,
): ControlStep {
  return {
    kind: "set_daily_budget", objectType, objectId,
    payload: { daily_budget: Math.round(dailyBudgetCents) },
  };
}

/** Acusa: ativação sem aprovação, verba abaixo do trilho, id não numérico. */
export function validateControlPlan(steps: ControlStep[]): string[] {
  const problems: string[] = [];
  steps.forEach((s, i) => {
    if (!/^\d{5,}$/.test(s.objectId)) {
      problems.push(`passo ${i} (${s.kind}): objectId "${s.objectId}" não parece um id da Meta`);
    }
    if (s.kind === "activate" && (!s.approval?.approvalId || !s.approval?.approvedBy)) {
      problems.push(`passo ${i}: ATIVAR exige approvalId e approvedBy — ativação é decisão humana registrada`);
    }
    if (s.kind === "set_daily_budget") {
      const v = Number(s.payload.daily_budget);
      if (!Number.isFinite(v) || v < MIN_DAILY_BUDGET_CENTS) {
        problems.push(`passo ${i}: verba diária ${v} abaixo do trilho mínimo de ${MIN_DAILY_BUDGET_CENTS} centavos`);
      }
    }
  });
  return problems;
}

export type ControlOptions = {
  token: string;
  graphVersion?: string;
  dryRun?: boolean;              // DEFAULT TRUE
  idempotencyKey: string;
  fetcher?: typeof fetch;
  onAudit?: (r: ControlResult) => void;
};

/**
 * Executa os passos de controle. dryRun default TRUE (zero rede). Execução
 * real recusa o plano inteiro se a validação acusar qualquer problema.
 */
export async function executeControl(steps: ControlStep[], opts: ControlOptions): Promise<ControlResult[]> {
  const dryRun = opts.dryRun !== false;
  const problems = validateControlPlan(steps);
  if (problems.length) {
    throw new Error(`Plano de controle inválido: ${problems.join(" | ")}`);
  }
  const version = opts.graphVersion || process.env.META_GRAPH_API_VERSION || "v23.0";
  const fetcher = opts.fetcher ?? defaultWriteFetch;
  const results: ControlResult[] = [];

  for (const step of steps) {
    if (dryRun) {
      const r: ControlResult = { kind: step.kind, objectId: step.objectId, ok: true, dryRun: true };
      results.push(r); opts.onAudit?.(r);
      continue;
    }
    try {
      const res = await fetcher(`${GRAPH}/${version}/${step.objectId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.token}`,
          "Content-Type": "application/json",
          "X-Atlas-Idempotency-Key": `${opts.idempotencyKey}:${step.kind}:${step.objectId}`,
        },
        body: JSON.stringify(step.payload),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string; code?: number } };
      if (json.error) {
        const r: ControlResult = {
          kind: step.kind, objectId: step.objectId, ok: false, dryRun: false,
          error: sanitize(`Graph ${json.error.code ?? "?"}: ${json.error.message ?? "erro"}`, opts.token),
        };
        results.push(r); opts.onAudit?.(r);
        break; // para na primeira falha — nada de estado meio aplicado em silêncio
      }
      const r: ControlResult = { kind: step.kind, objectId: step.objectId, ok: true, dryRun: false };
      results.push(r); opts.onAudit?.(r);
    } catch (err) {
      const r: ControlResult = {
        kind: step.kind, objectId: step.objectId, ok: false, dryRun: false,
        error: sanitize(err instanceof Error ? err.message : String(err), opts.token),
      };
      results.push(r); opts.onAudit?.(r);
      break;
    }
  }
  return results;
}
