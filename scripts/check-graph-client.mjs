/**
 * Teste adversarial do cliente Graph resiliente (lib/meta/marketing/graph-client.ts).
 *
 * Standalone, sem framework: executa o CÓDIGO REAL com type-stripping nativo do
 * Node (o módulo é puro e sem imports de valor). Valida a resiliência que separa
 * leitura de brinquedo de leitura de produção: paginação real seguindo
 * cursors.after e concatenando data[], parada em maxPages, backoff SÓ em
 * rate_limit/transient (contando tentativas e ms crescente), falha rápida em
 * auth_expired/permission, classificação de cada família de código/subcode, e
 * sanitização do token em qualquer mensagem de erro.
 *
 * Rodar da raiz do repo: node scripts/check-graph-client.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "lib", "meta", "marketing", "graph-client.ts");
const stripped = stripTypeScriptTypes(fs.readFileSync(sourcePath, "utf8"));
const { classifyGraphError, graphGetAll } = await import(
  `data:text/javascript;base64,${Buffer.from(stripped, "utf8").toString("base64")}`
);

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

// Fábrica de resposta "fetch" fake com json() — cada item da fila é uma página.
function res(body) {
  return { json: async () => body };
}
// data page com cursor opcional
const page = (data, after) => ({ data, paging: after ? { cursors: { after } } : {} });
const errPage = (code, error_subcode, message) => ({ error: { code, error_subcode, message } });

// fetcher sequencial a partir de uma fila de respostas; registra URLs e conta chamadas
function seqFetcher(queue) {
  const urls = [];
  const fn = async (url) => {
    urls.push(url);
    if (queue.length === 0) throw new Error("fila esvaziou inesperadamente");
    const next = queue.shift();
    if (typeof next === "function") return next(url);
    return res(next);
  };
  fn.urls = urls;
  fn.calls = () => urls.length;
  return fn;
}
// sleep fake que registra os ms recebidos e nunca espera de verdade
function recSleep() {
  const ms = [];
  const fn = async (n) => { ms.push(n); };
  fn.ms = ms;
  return fn;
}
const TOKEN = "SECRET-TOKEN-abc123";

// 1. classificação: auth_expired por code 190 e 102
check("caso 1: code 190/102 => auth_expired",
  classifyGraphError({ code: 190 }) === "auth_expired" && classifyGraphError({ code: 102 }) === "auth_expired");

// 2. classificação: subcode 463/467 => auth_expired (mesmo com outro code)
check("caso 2: subcode 463/467 => auth_expired",
  classifyGraphError({ code: 1, error_subcode: 463 }) === "auth_expired" &&
  classifyGraphError({ code: 4, error_subcode: 467 }) === "auth_expired");

// 3. classificação: rate_limit em 4/17/32/613/80004
check("caso 3: família rate_limit",
  [4, 17, 32, 613, 80004].every((c) => classifyGraphError({ code: c }) === "rate_limit"));

// 4. classificação: transient em 1/2/500
check("caso 4: família transient",
  [1, 2, 500].every((c) => classifyGraphError({ code: c }) === "transient"));

// 5. classificação: permission em 10/200/294
check("caso 5: família permission",
  [10, 200, 294].every((c) => classifyGraphError({ code: c }) === "permission"));

// 6. classificação: código desconhecido => other
check("caso 6: desconhecido => other",
  classifyGraphError({ code: 99999 }) === "other" && classifyGraphError({}) === "other");

// 7. segue 3 páginas e concatena todos os data[]
{
  const fetcher = seqFetcher([
    page([1, 2], "c1"),
    page([3, 4], "c2"),
    page([5], undefined),
  ]);
  const out = await graphGetAll("https://g/x?fields=a", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 7: 3 páginas concatenadas => [1..5]",
    Array.isArray(out) && out.join(",") === "1,2,3,4,5" && fetcher.calls() === 3,
    JSON.stringify(out));
}

// 8. cursor after é anexado à URL da próxima página
{
  const fetcher = seqFetcher([page(["a"], "CUR1"), page(["b"], undefined)]);
  await graphGetAll("https://g/x?fields=a", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 8: segunda URL carrega after=CUR1",
    fetcher.urls[1].includes("after=CUR1") && fetcher.urls[1].includes("fields=a"),
    fetcher.urls[1]);
}

// 9. para em maxPages mesmo com cursor disponível (não busca a 3ª página)
{
  const fetcher = seqFetcher([page([1], "c1"), page([2], "c2"), page([3], "c3")]);
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, maxPages: 2, sleep: recSleep() });
  check("caso 9: maxPages=2 para em 2 páginas",
    Array.isArray(out) && out.join(",") === "1,2" && fetcher.calls() === 2, JSON.stringify(out));
}

// 10. backoff em rate_limit: retenta e conta tentativas; ms crescentes
{
  const fetcher = seqFetcher([errPage(17, undefined, "rate"), errPage(17, undefined, "rate"), page(["ok"], undefined)]);
  const sleep = recSleep();
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep });
  check("caso 10: rate_limit retenta 2x e sucede",
    Array.isArray(out) && out.join(",") === "ok" && fetcher.calls() === 3 && sleep.ms.length === 2,
    `calls=${fetcher.calls()} sleeps=${JSON.stringify(sleep.ms)}`);
  check("caso 10b: ms de backoff estritamente crescente",
    sleep.ms.length === 2 && sleep.ms[1] > sleep.ms[0], JSON.stringify(sleep.ms));
}

// 11. backoff em transient também retenta
{
  const fetcher = seqFetcher([errPage(2, undefined, "temp"), page(["ok"], undefined)]);
  const sleep = recSleep();
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep });
  check("caso 11: transient retenta",
    Array.isArray(out) && out.join(",") === "ok" && fetcher.calls() === 2 && sleep.ms.length === 1);
}

// 12. auth_expired NÃO retenta (falha rápida, 1 chamada, 0 sleeps)
{
  const fetcher = seqFetcher([errPage(190, undefined, "token dead"), page(["never"], undefined)]);
  const sleep = recSleep();
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep });
  check("caso 12: auth_expired não retenta",
    !Array.isArray(out) && out.ok === false && out.kind === "auth_expired" &&
    fetcher.calls() === 1 && sleep.ms.length === 0, JSON.stringify(out));
}

// 13. permission NÃO retenta
{
  const fetcher = seqFetcher([errPage(200, undefined, "no perm"), page(["never"], undefined)]);
  const sleep = recSleep();
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep });
  check("caso 13: permission não retenta",
    !Array.isArray(out) && out.kind === "permission" && fetcher.calls() === 1 && sleep.ms.length === 0);
}

// 14. retries esgotados em rate_limit devolve GraphReadError
{
  const fetcher = seqFetcher([
    errPage(4, undefined, "r"), errPage(4, undefined, "r"), errPage(4, undefined, "r"), errPage(4, undefined, "r"),
  ]);
  const sleep = recSleep();
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, retries: 3, sleep });
  check("caso 14: retries=3 esgotados => erro após 4 chamadas e 3 sleeps",
    !Array.isArray(out) && out.kind === "rate_limit" && fetcher.calls() === 4 && sleep.ms.length === 3,
    `calls=${fetcher.calls()} sleeps=${sleep.ms.length}`);
  check("caso 14b: sequência de sleeps crescente",
    sleep.ms[0] < sleep.ms[1] && sleep.ms[1] < sleep.ms[2], JSON.stringify(sleep.ms));
}

// 15. sanitização: token NUNCA aparece na mensagem de erro
{
  const fetcher = seqFetcher([errPage(294, undefined, `falha usando ${TOKEN} no header`)]);
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 15: token sanitizado da mensagem",
    !Array.isArray(out) && !out.message.includes(TOKEN) && out.message.includes("[REDACTED]"),
    JSON.stringify(out));
}

// 16. token vai no header Authorization como Bearer (e só ali)
{
  let seenAuth = "";
  const fetcher = async (_url, init) => { seenAuth = init.headers.Authorization; return res(page(["z"], undefined)); };
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 16: header Authorization Bearer com token",
    Array.isArray(out) && seenAuth === `Bearer ${TOKEN}`, seenAuth);
}

// 17. página única sem paging devolve data direto (sem loop infinito)
{
  const fetcher = seqFetcher([{ data: ["só"] }]);
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 17: sem paging => 1 página", Array.isArray(out) && out.join(",") === "só" && fetcher.calls() === 1);
}

// 18. página vazia (sem data) não quebra e devolve []
{
  const fetcher = seqFetcher([{}]);
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 18: resposta sem data => []", Array.isArray(out) && out.length === 0);
}

// 19. erro de rede (fetch lança) é transitório e retentado; esgota => erro sem token
{
  const boom = () => { throw new Error(`conn reset ${TOKEN}`); };
  const fetcher = seqFetcher([boom, boom, boom, boom]);
  const sleep = recSleep();
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, retries: 3, sleep });
  check("caso 19: rede lança => retenta e erro transient sem token",
    !Array.isArray(out) && out.kind === "transient" && out.code === "network" &&
    !out.message.includes(TOKEN) && sleep.ms.length === 3, JSON.stringify(out));
}

// 20. rede lança e depois recupera na 2ª tentativa
{
  const boom = () => { throw new Error("glitch"); };
  const fetcher = seqFetcher([boom, page(["recuperado"], undefined)]);
  const sleep = recSleep();
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep });
  check("caso 20: rede recupera após 1 retry",
    Array.isArray(out) && out.join(",") === "recuperado" && fetcher.calls() === 2 && sleep.ms.length === 1);
}

// 21. maxPages default = 10: cursor infinito para em 10 páginas
{
  // fetcher que sempre devolve uma página com cursor (infinita)
  let n = 0;
  const fetcher = async () => { n += 1; return res(page([n], `c${n}`)); };
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 21: default maxPages=10 para em 10 páginas",
    Array.isArray(out) && out.length === 10 && n === 10, `len=${Array.isArray(out) ? out.length : "err"} n=${n}`);
}

// 22. HTTP 500 SEM envelope JSON não vira array vazio (falso sucesso) — retransitório
{
  const httpRes = (status) => ({ ok: false, status, json: async () => ({}) });
  let n = 0;
  const fetcher = async () => { n += 1; return httpRes(500); };
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep: recSleep(), retries: 1 });
  check("caso 22: HTTP 500 sem JSON → erro transitório (não array vazio)",
    !Array.isArray(out) && out.kind === "transient" && out.code === "http_500" && n === 2, `n=${n}`);
}
// 23b. HTTP 400 sem envelope → other, não retenta
{
  const fetcher = async () => ({ ok: false, status: 400, json: async () => ({}) });
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 23b: HTTP 400 sem JSON → other, não array vazio",
    !Array.isArray(out) && out.kind === "other");
}
// 24. resposta com ok:true e data segue normal (não afetada pelo guard)
{
  const fetcher = async () => ({ ok: true, status: 200, json: async () => page(["x"]) });
  const out = await graphGetAll("https://g/x", TOKEN, { fetcher, sleep: recSleep() });
  check("caso 24: ok:true segue paginando normal", Array.isArray(out) && out[0] === "x");
}

if (failures.length) {
  console.error(`Graph client: falhou (${passed} ok, ${failures.length} falhas)\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Graph client: aprovado — ${passed} verificações adversariais passaram (paginação real, parada em maxPages, backoff só em rate_limit/transient com ms crescente, falha rápida em auth/permission, classificação por família e sanitização de token).`);
