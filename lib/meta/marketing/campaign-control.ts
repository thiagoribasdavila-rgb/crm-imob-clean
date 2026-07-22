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
  /**
   * true só quando o objeto foi RELIDO na Meta depois do POST e o estado bate
   * com o pedido. false = não conferimos (ou não conseguimos conferir): "pausei"
   * sem leitura é afirmação sem verificação, e o campo diz isso em vez de omitir.
   */
  verified?: boolean;
  /** Estado lido na verificação (quando houve leitura). */
  observed?: { status?: string; dailyBudgetCents?: number | null };
  /** Por que a verificação não pôde ser feita, quando for o caso. */
  verifyNote?: string;
};

/** Verba diária mínima aceita (centavos) — trilho anti-typo, não política Meta. */
export const MIN_DAILY_BUDGET_CENTS = 500;

/**
 * Teto de verba diária (centavos). NÃO é política da Meta: é trilho anti-typo —
 * um zero a mais digitado atravessava todos os gates até aqui. Default
 * conservador de R$ 1.000/dia; a calibração real é decisão do dono e viaja por
 * parâmetro (limits), nunca lida de dentro deste módulo puro.
 */
export const MAX_DAILY_BUDGET_CENTS = 100_000;

/** Salto máximo sobre a verba diária VIGENTE do objeto (3× = triplicar). */
export const MAX_BUDGET_JUMP_FACTOR = 3;

/** Trilho de verba calibrável pelo chamador — sem I/O dentro do módulo puro. */
export type ControlBudgetLimits = {
  minDailyBudgetCents?: number;
  maxDailyBudgetCents?: number;
  /** Verba diária vigente lida na Meta; null/ausente = não lida (sem salto a checar). */
  currentDailyBudgetCents?: number | null;
  maxJumpFactor?: number;
};

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

/** Fetcher de LEITURA: GET é seguro para repetir, então aceita 1 retry. */
const defaultReadFetch: typeof fetch = async (input, init) => {
  const { resilientFetch } = await loadResilient();
  const url = typeof input === "string" || input instanceof URL ? input : input.url;
  return resilientFetch(url, init, { timeoutMs: 15_000, retries: 1, operation: "Meta Marketing API (leitura de controle)" });
};

export type ControlObjectState = {
  objectId: string;
  readOk: boolean;
  status?: string;
  dailyBudgetCents?: number | null;
  error?: string;
};

/**
 * Lê status e verba diária de um objeto da Meta. LEITURA PURA: nenhum efeito na
 * conta. Serve a duas coisas que não existiam — o "valor antes" da auditoria e a
 * conferência de que o POST de controle realmente aplicou o que prometeu.
 */
export async function readControlObject(
  objectId: string,
  opts: { token: string; graphVersion?: string; fetcher?: typeof fetch },
): Promise<ControlObjectState> {
  const version = opts.graphVersion || process.env.META_GRAPH_API_VERSION || "v23.0";
  const fetcher = opts.fetcher ?? defaultReadFetch;
  try {
    const res = await fetcher(`${GRAPH}/${version}/${objectId}?fields=status,daily_budget`, {
      method: "GET",
      headers: { Authorization: `Bearer ${opts.token}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: unknown;
      daily_budget?: unknown;
      error?: { message?: string; code?: number };
    };
    if (json.error || !res.ok) {
      return {
        objectId, readOk: false,
        error: sanitize(`Graph ${json.error?.code ?? res.status}: ${json.error?.message ?? `HTTP ${res.status}`}`, opts.token),
      };
    }
    const raw = Number(json.daily_budget);
    return {
      objectId, readOk: true,
      status: typeof json.status === "string" ? json.status : undefined,
      dailyBudgetCents: Number.isFinite(raw) ? raw : null,
    };
  } catch (err) {
    return { objectId, readOk: false, error: sanitize(err instanceof Error ? err.message : String(err), opts.token) };
  }
}

/** O estado que cada tipo de passo promete deixar no objeto. */
function expectedAfter(step: ControlStep): { status?: string; dailyBudgetCents?: number } {
  if (step.kind === "pause") return { status: "PAUSED" };
  if (step.kind === "activate") return { status: "ACTIVE" };
  const v = Number(step.payload.daily_budget);
  return Number.isFinite(v) ? { dailyBudgetCents: v } : {};
}

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

/**
 * Acusa: ativação sem aprovação, verba fora do trilho (piso E TETO), salto de
 * verba acima do fator sobre a vigente, id não numérico.
 *
 * O teto mora AQUI e não em planDailyBudget porque validateControlPlan roda
 * dentro de executeControl, cujo throw já é capturado pela rota e vira um 422
 * com mensagem honesta — recusar dentro do planejador puro produziria um 500
 * genérico, sem envelope e sem rastro para o diretor.
 */
export function validateControlPlan(steps: ControlStep[], limits?: ControlBudgetLimits): string[] {
  const problems: string[] = [];
  const min = Number.isFinite(limits?.minDailyBudgetCents) ? Number(limits?.minDailyBudgetCents) : MIN_DAILY_BUDGET_CENTS;
  const max = Number.isFinite(limits?.maxDailyBudgetCents) ? Number(limits?.maxDailyBudgetCents) : MAX_DAILY_BUDGET_CENTS;
  const jumpFactor = Number.isFinite(limits?.maxJumpFactor) ? Number(limits?.maxJumpFactor) : MAX_BUDGET_JUMP_FACTOR;
  const current = Number(limits?.currentDailyBudgetCents);

  steps.forEach((s, i) => {
    if (!/^\d{5,}$/.test(s.objectId)) {
      problems.push(`passo ${i} (${s.kind}): objectId "${s.objectId}" não parece um id da Meta`);
    }
    if (s.kind === "activate" && (!s.approval?.approvalId || !s.approval?.approvedBy)) {
      problems.push(`passo ${i}: ATIVAR exige approvalId e approvedBy — ativação é decisão humana registrada`);
    }
    if (s.kind === "set_daily_budget") {
      const v = Number(s.payload.daily_budget);
      if (!Number.isFinite(v) || v < min) {
        problems.push(`passo ${i}: verba diária ${v} abaixo do trilho mínimo de ${min} centavos`);
      } else if (v > max) {
        problems.push(
          `passo ${i}: verba diária ${v} centavos acima do teto de ${max} centavos ` +
            `(R$ ${(max / 100).toFixed(2)}/dia) — confirme o valor ou calibre o teto da organização`,
        );
      } else if (Number.isFinite(current) && current > 0 && v > current * jumpFactor) {
        problems.push(
          `passo ${i}: verba diária ${v} centavos é mais de ${jumpFactor}× a vigente ` +
            `(${current} centavos) — salto exige nova proposta explícita`,
        );
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
  /** Trilho de verba do chamador (teto/salto) — sem isto valem os defaults. */
  limits?: ControlBudgetLimits;
  /**
   * Relê o objeto depois do POST e só marca ok quando o estado bater com o
   * pedido. Explícito (não default) porque dobra a leitura; sem ele o resultado
   * sai com verified:false e ninguém pode afirmar mais do que foi conferido.
   */
  verify?: boolean;
};

/**
 * Executa os passos de controle. dryRun default TRUE (zero rede). Execução
 * real recusa o plano inteiro se a validação acusar qualquer problema.
 */
export async function executeControl(steps: ControlStep[], opts: ControlOptions): Promise<ControlResult[]> {
  const dryRun = opts.dryRun !== false;
  const problems = validateControlPlan(steps, opts.limits);
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
      // `!res.ok` junto do envelope: resposta não-2xx sem corpo JSON parseável
      // (HTML de borda, 502/503, throttle sem envelope) virava {} e era relatada
      // como sucesso — "pausei" sobre uma campanha que seguia gastando.
      if (json.error || !res.ok) {
        const r: ControlResult = {
          kind: step.kind, objectId: step.objectId, ok: false, dryRun: false, verified: false,
          error: sanitize(`Graph ${json.error?.code ?? res.status}: ${json.error?.message ?? `HTTP ${res.status}`}`, opts.token),
        };
        results.push(r); opts.onAudit?.(r);
        break; // para na primeira falha — nada de estado meio aplicado em silêncio
      }
      const r: ControlResult = { kind: step.kind, objectId: step.objectId, ok: true, dryRun: false, verified: false };
      if (opts.verify) {
        const state = await readControlObject(step.objectId, { token: opts.token, graphVersion: version, fetcher: opts.fetcher });
        const want = expectedAfter(step);
        if (!state.readOk) {
          r.verifyNote = `POST aceito, mas não foi possível reler o objeto para confirmar: ${state.error ?? "leitura falhou"}`;
        } else {
          r.observed = { status: state.status, dailyBudgetCents: state.dailyBudgetCents };
          const statusOk = want.status == null || state.status === want.status;
          const budgetOk = want.dailyBudgetCents == null || Number(state.dailyBudgetCents) === want.dailyBudgetCents;
          if (statusOk && budgetOk) {
            r.verified = true;
          } else {
            r.ok = false;
            r.error = `a Meta aceitou o POST mas o objeto não ficou como pedido — pedido ${JSON.stringify(want)}, lido ${JSON.stringify(r.observed)}`;
          }
        }
      }
      results.push(r); opts.onAudit?.(r);
      if (!r.ok) break;
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
