/**
 * Teste adversarial do Track A — resiliência de ESCRITA + rastro de órfãos.
 *
 * Standalone, sem framework. Executa o CÓDIGO REAL de:
 * - lib/meta/marketing/execution-log.ts  (coletores puros buildOrphanRecord/cleanupPlan)
 * - lib/meta/marketing/campaign-executor.ts
 * - lib/meta/marketing/campaign-control.ts
 * - lib/meta/marketing/media-upload.ts
 *
 * Os três módulos de rede carregam resilientFetch por import DINÂMICO. Aqui o
 * loader redireciona esse import para um STUB que REGISTRA (input, init, options)
 * e delega a uma impl controlada — assim PROVAMOS que o fetcher DEFAULT das
 * escritas é resilientFetch com timeout ~30s e retries=0, sem tocar a rede real
 * (resilient-fetch.ts é server-only e nem está instalado sob node).
 *
 * Rodar da raiz: node scripts/check-execution-log.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

// ---------------------------------------------------------------------------
// Loader: transforma o source e importa como data: URL
// ---------------------------------------------------------------------------
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const dataUrl = (src) => `data:text/javascript;base64,${b64(src)}`;

// Stub que substitui ../../http/resilient-fetch: registra as chamadas em
// globalThis.__RC__ e delega para globalThis.__RESILIENT_IMPL__.
const STUB_SRC = `
export function resilientFetch(input, init, options) {
  (globalThis.__RC__ ||= []).push({ url: String(input), init, options });
  const impl = globalThis.__RESILIENT_IMPL__;
  if (!impl) throw new Error("stub: __RESILIENT_IMPL__ não definido");
  return impl(input, init, options);
}
`;
const STUB_URL = dataUrl(STUB_SRC);
const SPECIFIER = '"../../http/resilient-fetch"';

async function loadLibRaw() {
  // execution-log.ts: só import type (some no strip) → carrega direto.
  const src = fs.readFileSync(path.join(root, "lib", "meta", "marketing", "execution-log.ts"), "utf8");
  return import(dataUrl(stripTypeScriptTypes(src)));
}

async function loadNet(fileBase) {
  const raw = fs.readFileSync(path.join(root, "lib", "meta", "marketing", `${fileBase}.ts`), "utf8");
  if (!raw.includes(SPECIFIER)) throw new Error(`${fileBase}: especificador resilient-fetch não encontrado — mudou o path?`);
  const redirected = raw.split(SPECIFIER).join(JSON.stringify(STUB_URL));
  return import(dataUrl(stripTypeScriptTypes(redirected)));
}

// Response-like mínima para a impl.
function resp(json, { ok = true, status = 200, bytes = [1, 2, 3] } = {}) {
  return {
    ok,
    status,
    json: async () => json,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    headers: new Map(),
  };
}

const TOKEN = "EAAB-super-secreto-token-meta-XYZ";

const log = await loadLibRaw();
const executor = await loadNet("campaign-executor");
const control = await loadNet("campaign-control");
const media = await loadNet("media-upload");

// ===========================================================================
// A) COLETORES PUROS — buildOrphanRecord / cleanupPlan
// ===========================================================================
const { buildOrphanRecord, cleanupPlan } = log;
const sr = (index, kind, ok, id, dryRun = false) => ({ index, kind, ok, id, dryRun });

// 1. lista vazia → nada completo, nada órfão
{
  const r = buildOrphanRecord([]);
  check("1 vazio → complete=false, orphaned=false, createdIds=[]",
    r.complete === false && r.orphaned === false && r.createdIds.length === 0);
}

// 2. tudo ok com ids reais → completo, sem órfão, coleta todos
{
  const r = buildOrphanRecord([
    sr(0, "create_campaign", true, "C1"),
    sr(1, "create_adset", true, "A1"),
  ]);
  check("2 tudo ok → complete=true, orphaned=false, createdIds=2",
    r.complete === true && r.orphaned === false && r.createdIds.length === 2 &&
    r.createdIds[0].kind === "create_campaign" && r.createdIds[0].id === "C1");
}

// 3. FALHA NO MEIO: 2 criados, 3º falha → órfãos coletados
{
  const r = buildOrphanRecord([
    sr(0, "create_campaign", true, "C9"),
    sr(1, "create_adset", true, "A9"),
    { index: 2, kind: "create_creative", ok: false, error: "boom", dryRun: false },
  ]);
  check("3 falha no meio → orphaned=true, complete=false, 2 órfãos coletados",
    r.orphaned === true && r.complete === false && r.createdIds.length === 2 &&
    r.createdIds[1].id === "A9");
}

// 4. primeira falha, nada criado → sem órfão a limpar
{
  const r = buildOrphanRecord([{ index: 0, kind: "create_campaign", ok: false, error: "x", dryRun: false }]);
  check("4 falha na 1ª → createdIds=[], orphaned=false",
    r.createdIds.length === 0 && r.orphaned === false && r.complete === false);
}

// 5. dry-run (ids sintéticos) NÃO conta como criado real
{
  const r = buildOrphanRecord([
    sr(0, "create_campaign", true, "DRYRUN_STEP0_ID", true),
    sr(1, "create_adset", true, "DRYRUN_STEP1_ID", true),
  ]);
  check("5 dry-run → createdIds=[] e orphaned=false (nada real tocado)",
    r.createdIds.length === 0 && r.orphaned === false);
}

// 6. ok sem id → ignorado (creative pode não devolver, mas aqui defensivo)
{
  const r = buildOrphanRecord([sr(0, "create_creative", true, undefined)]);
  check("6 ok sem id → não coletado", r.createdIds.length === 0);
}

// 7. cleanupPlan em ORDEM INVERSA (filho antes do pai)
{
  const created = [
    { kind: "create_campaign", id: "C1" },
    { kind: "create_adset", id: "A1" },
    { kind: "create_creative", id: "CR1" },
    { kind: "create_ad", id: "AD1" },
  ];
  const plan = cleanupPlan(created);
  check("7 cleanupPlan reverso: ad → creative → adset → campaign",
    plan.map((p) => p.id).join(",") === "AD1,CR1,A1,C1");
}

// 8. cada passo é DELETE e path = id
{
  const plan = cleanupPlan([{ kind: "create_ad", id: "AD1" }]);
  check("8 cleanupPlan: method=DELETE, path=id",
    plan.length === 1 && plan[0].method === "DELETE" && plan[0].path === "AD1");
}

// 9. cleanupPlan de lista vazia → []
check("9 cleanupPlan([]) → []", cleanupPlan([]).length === 0);

// 10. cleanupPlan é PURO — não muta a entrada
{
  const input = [{ kind: "create_campaign", id: "C1" }, { kind: "create_ad", id: "AD1" }];
  const snapshot = input.map((x) => x.id).join(",");
  cleanupPlan(input);
  check("10 cleanupPlan não muta a entrada", input.map((x) => x.id).join(",") === snapshot);
}

// ===========================================================================
// B) FETCHER DEFAULT = resilientFetch (timeout ~30s, retries=0) — EXECUTOR
// ===========================================================================
const { planCampaignCreation, executeSteps } = executor;

function skeleton() {
  return {
    campaign: { name: "Camp", objective: "OUTCOME_LEADS", special_ad_categories: ["HOUSING"] },
    adSets: [{ name: "Broad" }],
  };
}

// 11. path DEFAULT usa resilientFetch com timeout 30s (SEM fetcher injetado)
{
  globalThis.__RC__ = [];
  let n = 0;
  globalThis.__RESILIENT_IMPL__ = async () => resp({ id: `ID_${++n}` });
  const plan = planCampaignCreation({ accountId: "act_123", skeleton: skeleton() });
  const results = await executeSteps(plan, { token: TOKEN, idempotencyKey: "k-exec", dryRun: false });
  const calls = globalThis.__RC__;
  check("11 executor default → resilientFetch chamado com timeoutMs=30000",
    calls.length === plan.length && calls.every((c) => c.options?.timeoutMs === 30000),
    JSON.stringify({ calls: calls.length, steps: plan.length, opt: calls[0]?.options }));
  check("11b executor real completou (ids reais)", results.every((r) => r.ok && !r.dryRun));
}

// 12. retries === 0 nas escritas (não reexecutar POST que pode ter criado)
{
  const calls = globalThis.__RC__;
  check("12 executor default → retries=0 em todo POST",
    calls.length > 0 && calls.every((c) => c.options?.retries === 0));
}

// 13. o path DEFAULT propaga método/URL/headers/body reais
{
  globalThis.__RC__ = [];
  let n = 0;
  globalThis.__RESILIENT_IMPL__ = async () => resp({ id: `ID_${++n}` });
  const plan = planCampaignCreation({ accountId: "act_999", skeleton: skeleton() });
  await executeSteps(plan, { token: TOKEN, idempotencyKey: "k-flow", dryRun: false });
  const first = globalThis.__RC__[0];
  const auth = first?.init?.headers?.Authorization ?? "";
  const idem = first?.init?.headers?.["X-Atlas-Idempotency-Key"] ?? "";
  check("13 URL/método/headers fluem pelo default",
    first?.init?.method === "POST" &&
    /graph\.facebook\.com\/.+\/act_999\/campaigns$/.test(first?.url) &&
    auth === `Bearer ${TOKEN}` &&
    idem.startsWith("k-flow:step"));
}

// 14. TOKEN SANITIZADO no erro do path default (Graph devolve erro)
{
  globalThis.__RC__ = [];
  globalThis.__RESILIENT_IMPL__ = async () =>
    resp({ error: { code: 190, message: `token inválido: ${TOKEN}` } }, { ok: false, status: 400 });
  const plan = planCampaignCreation({ accountId: "act_1", skeleton: skeleton() });
  const results = await executeSteps(plan, { token: TOKEN, idempotencyKey: "k-san", dryRun: false });
  const failed = results.find((r) => !r.ok);
  const dump = JSON.stringify(results);
  check("14 token nunca vaza no erro (default path)",
    !!failed && failed.error.includes("[token]") && !dump.includes(TOKEN),
    failed?.error);
}

// 15. fetcher INJETADO tem prioridade — resilientFetch NÃO é chamado
{
  globalThis.__RC__ = [];
  globalThis.__RESILIENT_IMPL__ = async () => resp({ id: "X" });
  let injected = 0;
  const mock = async () => { injected += 1; return resp({ id: `M_${injected}` }); };
  const plan = planCampaignCreation({ accountId: "act_2", skeleton: skeleton() });
  await executeSteps(plan, { token: TOKEN, idempotencyKey: "k-inj", dryRun: false, fetcher: mock });
  check("15 fetcher injetado vence o default (resilientFetch não chamado)",
    injected === plan.length && globalThis.__RC__.length === 0);
}

// ===========================================================================
// C) FETCHER DEFAULT = resilientFetch — CONTROL
// ===========================================================================
const { planPause, executeControl } = control;

// 16. control default → resilientFetch com timeout 30s / retries 0
{
  globalThis.__RC__ = [];
  globalThis.__RESILIENT_IMPL__ = async () => resp({ success: true });
  const steps = [planPause("campaign", "123456")];
  await executeControl(steps, { token: TOKEN, idempotencyKey: "k-ctl", dryRun: false });
  const c = globalThis.__RC__[0];
  check("16 control default → resilientFetch timeout=30000 retries=0",
    globalThis.__RC__.length === 1 && c.options?.timeoutMs === 30000 && c.options?.retries === 0 &&
    /graph\.facebook\.com\/.+\/123456$/.test(c.url));
}

// 17. control: token sanitizado no erro
{
  globalThis.__RC__ = [];
  globalThis.__RESILIENT_IMPL__ = async () =>
    resp({ error: { code: 200, message: `sem permissão ${TOKEN}` } });
  const steps = [planPause("campaign", "123456")];
  const results = await executeControl(steps, { token: TOKEN, idempotencyKey: "k-ctl2", dryRun: false });
  check("17 control: token nunca vaza no erro",
    results[0] && !results[0].ok && results[0].error.includes("<token>") && !JSON.stringify(results).includes(TOKEN));
}

// ===========================================================================
// D) FETCHER DEFAULT = resilientFetch — MEDIA UPLOAD
// ===========================================================================
const { uploadImageFromUrl, uploadVideoFromUrl, isUploadError } = media;

// 18. upload de imagem: download (GET) E POST passam pelo resilientFetch default
{
  globalThis.__RC__ = [];
  globalThis.__RESILIENT_IMPL__ = async (input, init) => {
    if (init?.method === "POST") return resp({ images: { "a.jpg": { hash: "HASH_OK" } } });
    return resp({}); // download GET
  };
  const r = await uploadImageFromUrl("act_5", TOKEN, "https://cdn.x.com/a.jpg", { dryRun: false, idempotencyKey: "u1" });
  const calls = globalThis.__RC__;
  check("18 media imagem: 2 chamadas (GET+POST) via resilientFetch, timeout 30s",
    !isUploadError(r) && r.hash === "HASH_OK" &&
    calls.length === 2 && calls.every((c) => c.options?.timeoutMs === 30000),
    JSON.stringify({ n: calls.length, r }));
}

// 19. media: retries=0 no default (não reexecuta POST de upload)
{
  check("19 media default → retries=0",
    globalThis.__RC__.length === 2 && globalThis.__RC__.every((c) => c.options?.retries === 0));
}

// 20. media vídeo: token sanitizado no erro do default path
{
  globalThis.__RC__ = [];
  globalThis.__RESILIENT_IMPL__ = async () =>
    resp({ error: { code: 100, message: `falhou com ${TOKEN}` } }, { ok: false, status: 400 });
  const r = await uploadVideoFromUrl("act_7", TOKEN, "https://cdn.x.com/v.mp4", { dryRun: false, idempotencyKey: "u2" });
  check("20 media vídeo: token sanitizado no erro (default path)",
    isUploadError(r) && r.message.includes("[token]") && !JSON.stringify(r).includes(TOKEN),
    JSON.stringify(r));
}

// 21. media: fetcher injetado vence o default (resilientFetch não chamado)
{
  globalThis.__RC__ = [];
  globalThis.__RESILIENT_IMPL__ = async () => resp({ id: "SHOULD_NOT" });
  const mock = async (input, init) =>
    init?.method === "POST" ? resp({ id: "VID_REAL" }) : resp({});
  const r = await uploadVideoFromUrl("act_9", TOKEN, "https://cdn.x.com/v.mp4", { dryRun: false, idempotencyKey: "u3", fetcher: mock });
  check("21 media: fetcher injetado vence (resilientFetch não chamado)",
    !isUploadError(r) && r.videoId === "VID_REAL" && globalThis.__RC__.length === 0);
}

// ---------------------------------------------------------------------------
console.log(`check-execution-log: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error("  ❌ " + f);
  process.exit(1);
}
