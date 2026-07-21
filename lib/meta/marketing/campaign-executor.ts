/**
 * Executor GOVERNADO de campanha — o elo entre proposta aprovada e execução
 * real na Marketing API da Meta (campanha → ad set → creative → ad).
 *
 * Divisão rígida:
 * - planCampaignCreation é PURA: recebe o esqueleto (leadCampaignSkeleton) e o
 *   asset_feed_spec (toAssetFeedSpec) já aprovados e monta a sequência de
 *   passos com placeholders {{stepN.id}} para ids dependentes. FORÇA status
 *   PAUSED em campanha/ad set/ad (se vier ACTIVE, sobrescreve e anota) e
 *   garante special_ad_categories — obrigatório em imobiliário.
 * - executeSteps é a casca efetful: dry-run por DEFAULT (só simula e devolve
 *   os payloads resolvidos); com dryRun:false faz POST real via fetcher
 *   INJETÁVEL, resolve placeholders com ids reais, PARA na primeira falha
 *   reportando o que já foi criado (nada fica órfão sem registro), nunca
 *   imprime o token e devolve o erro estruturado da Graph.
 *
 * GOVERNANÇA EM CÓDIGO: executeSteps se RECUSA a rodar (throw) se qualquer
 * payload contiver status ACTIVE — ativar campanha é SEMPRE decisão humana
 * posterior, fora deste módulo. Tudo nasce PAUSED, sem exceção.
 *
 * Chaves internas prefixadas com "__" (ex.: __atlas_notes, as anotações de
 * override do planejador) são removidas antes de qualquer POST — existem só
 * para inspeção humana na Caixa de Aprovações.
 */

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export type ExecutionStep = {
  kind: "create_campaign" | "create_adset" | "create_creative" | "create_ad";
  path: string;
  payload: Record<string, unknown>;
  dependsOn?: number[];
};

export type StepResult = {
  index: number;
  kind: string;
  ok: boolean;
  id?: string;
  error?: string;
  dryRun: boolean;
  /** Payload com placeholders resolvidos — presente no dry-run para inspeção. */
  payload?: Record<string, unknown>;
};

export type PlanInput = {
  accountId: string;
  /** Esqueleto vindo de leadCampaignSkeleton (campaign + adSets). */
  skeleton: Record<string, unknown>;
  /** Saída de toAssetFeedSpec (object_story_spec embutido é separado aqui). */
  assetFeedSpec?: Record<string, unknown> | null;
  pageId?: string;
  leadFormId?: string;
};

const GRAPH = "https://graph.facebook.com";
const PLACEHOLDER_RE = /\{\{step(\d+)\.id\}\}/g;

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function accPath(accountId: string): string {
  return `act_${String(accountId).replace(/^act_/, "")}`;
}

/** Todos os valores string sob chaves `key` (varredura profunda). */
function collectValues(value: unknown, key: string, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectValues(item, key, out);
    return out;
  }
  const rec = asRecord(value);
  if (!rec) return out;
  for (const [k, v] of Object.entries(rec)) {
    if (k === key && typeof v === "string") out.push(v);
    collectValues(v, key, out);
  }
  return out;
}

/** Índices de step referenciados por placeholders {{stepN.id}} (profundo). */
function collectPlaceholders(value: unknown, out: number[] = []): number[] {
  if (typeof value === "string") {
    for (const m of value.matchAll(PLACEHOLDER_RE)) out.push(Number(m[1]));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, out);
    return out;
  }
  const rec = asRecord(value);
  if (rec) for (const v of Object.values(rec)) collectPlaceholders(v, out);
  return out;
}

/** Clona removendo chaves internas (prefixo "__") — nunca vão à Meta. */
function stripInternal(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternal);
  const rec = asRecord(value);
  if (!rec) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k.startsWith("__")) continue;
    out[k] = stripInternal(v);
  }
  return out;
}

/** Substitui {{stepN.id}} pelos ids resolvidos; placeholder sem id = throw. */
function resolvePlaceholders(value: unknown, ids: ReadonlyMap<number, string>): unknown {
  if (typeof value === "string") {
    return value.replace(PLACEHOLDER_RE, (_all, n: string) => {
      const id = ids.get(Number(n));
      if (!id) throw new Error(`placeholder {{step${n}.id}} sem id resolvido — step ${n} não executou ou falhou antes`);
      return id;
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolvePlaceholders(item, ids));
  const rec = asRecord(value);
  if (!rec) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = resolvePlaceholders(v, ids);
  return out;
}

/** Remove o token de qualquer mensagem que possa vazar para log/resultado. */
function sanitize(message: string, token: string): string {
  return token ? message.split(token).join("[token]") : message;
}

// ---------------------------------------------------------------------------
// Planejamento (puro)
// ---------------------------------------------------------------------------

/**
 * Monta a sequência campanha → ad set → creative → ad a partir do esqueleto
 * aprovado. Nunca produz nada ACTIVE: status é sobrescrito para PAUSED com
 * anotação em __atlas_notes. special_ad_categories ausente vira ["HOUSING"]
 * (o esqueleto é imobiliário por construção) — também anotado.
 */
export function planCampaignCreation(input: PlanInput): ExecutionStep[] {
  const acc = accPath(input.accountId);
  const steps: ExecutionStep[] = [];

  // --- step 0: campanha -----------------------------------------------------
  const campaignIn = asRecord(input.skeleton.campaign) ?? {};
  const campaignNotes: string[] = [];
  const campaign: Record<string, unknown> = { ...campaignIn };
  if (campaign.status !== "PAUSED") {
    if (typeof campaign.status === "string" && campaign.status.toUpperCase() === "ACTIVE") {
      campaignNotes.push("status veio ACTIVE no input — sobrescrito para PAUSED (ativar é decisão humana posterior, fora do executor).");
    }
    campaign.status = "PAUSED";
  }
  const cats = campaign.special_ad_categories;
  if (!Array.isArray(cats) || cats.length === 0) {
    campaign.special_ad_categories = ["HOUSING"];
    campaignNotes.push('special_ad_categories ausente — forçado ["HOUSING"] (obrigatório em campanha imobiliária).');
  }
  if (campaignNotes.length) campaign.__atlas_notes = campaignNotes;
  steps.push({ kind: "create_campaign", path: `${acc}/campaigns`, payload: campaign });

  const campaignName = typeof campaign.name === "string" ? campaign.name : "campanha";

  // --- asset_feed_spec: separa o object_story_spec (na API são irmãos) ------
  const feedIn = asRecord(input.assetFeedSpec ?? null);
  const feed: Record<string, unknown> | null = feedIn ? { ...feedIn } : null;
  let storySpec: Record<string, unknown> = { ...(asRecord(feed?.object_story_spec) ?? {}) };
  if (feed) delete feed.object_story_spec;
  if (input.pageId) storySpec = { ...storySpec, page_id: input.pageId };
  if (input.leadFormId) {
    const ctas = Array.isArray(feed?.call_to_action_types) ? feed.call_to_action_types : [];
    const ctaType = typeof ctas[0] === "string" ? ctas[0] : "LEARN_MORE";
    storySpec = {
      ...storySpec,
      link_data: {
        ...(asRecord(storySpec.link_data) ?? {}),
        call_to_action: { type: ctaType, value: { lead_gen_form_id: input.leadFormId } },
      },
    };
  }

  // --- por ad set: ad set → creative → ad -----------------------------------
  const adSetsIn = Array.isArray(input.skeleton.adSets) ? input.skeleton.adSets : [];
  const adSetRecords = adSetsIn.map((a) => asRecord(a) ?? {});
  if (adSetRecords.length === 0) adSetRecords.push({ name: "Broad" });

  adSetRecords.forEach((adSetIn, i) => {
    const adSetIdx = 1 + i * 3;
    const creativeIdx = adSetIdx + 1;

    const adSetNotes: string[] = [];
    const adSet: Record<string, unknown> = { ...adSetIn };
    delete adSet.targetingNotes; // documentação humana do esqueleto, não é campo da API
    if (adSet.status !== "PAUSED") {
      if (typeof adSet.status === "string" && adSet.status.toUpperCase() === "ACTIVE") {
        adSetNotes.push("status veio ACTIVE no input — sobrescrito para PAUSED.");
      }
      adSet.status = "PAUSED";
    }
    adSet.campaign_id = "{{step0.id}}";
    if (adSetNotes.length) adSet.__atlas_notes = adSetNotes;
    steps.push({ kind: "create_adset", path: `${acc}/adsets`, payload: adSet, dependsOn: [0] });

    const adSetName = typeof adSet.name === "string" ? adSet.name : `ad set ${i + 1}`;

    const creative: Record<string, unknown> = { name: `[Atlas] Creative — ${campaignName}` };
    if (Object.keys(storySpec).length) creative.object_story_spec = storySpec;
    if (feed) creative.asset_feed_spec = feed;
    steps.push({ kind: "create_creative", path: `${acc}/adcreatives`, payload: creative });

    const ad: Record<string, unknown> = {
      name: `[Atlas] Ad — ${adSetName}`,
      adset_id: `{{step${adSetIdx}.id}}`,
      creative: { creative_id: `{{step${creativeIdx}.id}}` },
      status: "PAUSED",
    };
    steps.push({ kind: "create_ad", path: `${acc}/ads`, payload: ad, dependsOn: [adSetIdx, creativeIdx] });
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Validação do plano (pura)
// ---------------------------------------------------------------------------

/**
 * Acusa tudo que tornaria o plano inseguro ou inexecutável:
 * - qualquer status !== "PAUSED" (ou ausência de status em campanha/ad set/ad);
 * - ausência de special_ad_categories na campanha;
 * - placeholder {{stepN.id}} órfão (step inexistente ou não-anterior);
 * - path fora do padrão act_<id>/<edge>.
 * Vazio = plano aprovado para executeSteps.
 */
export function validateExecutionPlan(steps: ExecutionStep[]): string[] {
  const problems: string[] = [];
  steps.forEach((step, i) => {
    if (!/^act_\d+\/(campaigns|adsets|adcreatives|ads)$/.test(step.path)) {
      problems.push(`step ${i} (${step.kind}): path "${step.path}" fora do padrão act_<id>/{campaigns|adsets|adcreatives|ads}`);
    }

    const clean = stripInternal(step.payload);
    for (const status of collectValues(clean, "status")) {
      if (status !== "PAUSED") {
        problems.push(`step ${i} (${step.kind}): status "${status}" — só PAUSED é aceito; ativação é decisão humana fora do executor`);
      }
    }
    if (step.kind !== "create_creative" && typeof (asRecord(clean)?.status) !== "string") {
      problems.push(`step ${i} (${step.kind}): payload sem status explícito — deve nascer PAUSED`);
    }

    if (step.kind === "create_campaign") {
      const cats = asRecord(clean)?.special_ad_categories;
      if (!Array.isArray(cats) || cats.length === 0) {
        problems.push(`step ${i} (create_campaign): special_ad_categories ausente — obrigatório (imobiliário = ["HOUSING"])`);
      }
    }

    for (const n of collectPlaceholders(clean)) {
      if (n >= i || !steps[n]) {
        problems.push(`step ${i} (${step.kind}): placeholder {{step${n}.id}} órfão — referencia step inexistente ou não-anterior`);
      }
    }
  });
  return problems;
}

// ---------------------------------------------------------------------------
// Execução (casca efetful, fetcher injetável)
// ---------------------------------------------------------------------------

export type ExecuteOptions = {
  token: string;
  graphVersion?: string;
  /** DEFAULT TRUE: simula, resolve placeholders com ids sintéticos e devolve os payloads. */
  dryRun?: boolean;
  /** Chave de idempotência da execução — vai em TODOS os POSTs (header). */
  idempotencyKey: string;
  fetcher?: typeof fetch;
  onAudit?: (r: StepResult) => void;
};

/**
 * Executa o plano em ordem. Dry-run (default) não toca a rede: devolve cada
 * payload resolvido com ids sintéticos DRYRUN_STEPn_ID para inspeção. Com
 * dryRun:false, POST real por step; a primeira falha PARA a execução e o
 * resultado final reporta o erro estruturado da Graph e os ids já criados
 * (órfãos em PAUSED — nada fica sem registro). O token nunca aparece em
 * resultado, erro ou log.
 */
export async function executeSteps(steps: ExecutionStep[], opts: ExecuteOptions): Promise<StepResult[]> {
  if (!opts.idempotencyKey || !opts.idempotencyKey.trim()) {
    throw new Error("executeSteps: idempotencyKey obrigatória — toda execução real precisa ser rastreável e re-segura.");
  }

  // GOVERNANÇA: recusa qualquer payload ACTIVE antes de tocar em qualquer coisa.
  steps.forEach((step, i) => {
    for (const status of collectValues(step.payload, "status")) {
      if (status.toUpperCase() === "ACTIVE") {
        throw new Error(
          `executeSteps: recusado — step ${i} (${step.kind}) tem status ACTIVE. ` +
            "Este módulo só cria estruturas PAUSED; ativar campanha é SEMPRE decisão humana posterior, fora do executor. " +
            "Corrija o plano (planCampaignCreation já força PAUSED) e rode de novo.",
        );
      }
    }
  });

  const dryRun = opts.dryRun !== false;
  const fetcher = opts.fetcher ?? fetch;
  const version = opts.graphVersion || process.env.META_GRAPH_API_VERSION || "v23.0";
  const ids = new Map<number, string>();
  const results: StepResult[] = [];

  const emit = (r: StepResult): StepResult => {
    results.push(r);
    opts.onAudit?.(r);
    return r;
  };
  const createdSoFar = (): string =>
    ids.size ? ` | já criados antes da falha (órfãos, em PAUSED): ${[...ids.entries()].map(([n, id]) => `step${n}=${id}`).join(", ")}` : "";

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];

    let resolved: Record<string, unknown>;
    if (dryRun) ids.set(i, `DRYRUN_STEP${i}_ID`); // ids sintéticos permitem inspecionar a cadeia inteira
    try {
      resolved = resolvePlaceholders(stripInternal(step.payload), ids) as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ index: i, kind: step.kind, ok: false, error: sanitize(`${message}${createdSoFar()}`, opts.token), dryRun });
      return results; // para na primeira falha
    }

    if (dryRun) {
      emit({ index: i, kind: step.kind, ok: true, id: ids.get(i), dryRun: true, payload: resolved });
      continue;
    }

    try {
      const res = await fetcher(`${GRAPH}/${version}/${step.path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.token}`,
          "Content-Type": "application/json",
          "X-Atlas-Idempotency-Key": `${opts.idempotencyKey}:step${i}`,
        },
        body: JSON.stringify(resolved),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: unknown;
        error?: { code?: number; error_subcode?: number; message?: string; fbtrace_id?: string };
      };
      if (json.error || !res.ok) {
        const e = json.error ?? {};
        const message =
          `Meta code=${e.code ?? res.status}` +
          (e.error_subcode != null ? ` subcode=${e.error_subcode}` : "") +
          ` — ${e.message ?? `HTTP ${res.status}`}` +
          (e.fbtrace_id ? ` (fbtrace ${e.fbtrace_id})` : "");
        emit({ index: i, kind: step.kind, ok: false, error: sanitize(`${message}${createdSoFar()}`, opts.token), dryRun: false });
        return results; // para na primeira falha — quem chama decide limpar/retomar
      }
      const id = typeof json.id === "string" || typeof json.id === "number" ? String(json.id) : "";
      if (!id) {
        emit({ index: i, kind: step.kind, ok: false, error: sanitize(`resposta da Graph sem id no step ${i}${createdSoFar()}`, opts.token), dryRun: false });
        return results;
      }
      ids.set(i, id);
      emit({ index: i, kind: step.kind, ok: true, id, dryRun: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ index: i, kind: step.kind, ok: false, error: sanitize(`network: ${message}${createdSoFar()}`, opts.token), dryRun: false });
      return results;
    }
  }

  return results;
}
