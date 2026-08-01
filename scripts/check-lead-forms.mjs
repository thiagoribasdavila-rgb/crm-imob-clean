/**
 * Teste adversarial da listagem de formulários de lead da Página.
 *
 * Standalone, sem framework: executa o CÓDIGO REAL de
 * lib/meta/marketing/lead-forms.ts (strip de tipos nativo do Node — o único
 * import é de tipo, apagado no strip) com fetcher MOCK e valida:
 * mapeamento id/nome/status/questionCount, questions ausente => 0, paginação
 * multi-página seguindo o cursor `after`, parada dura em 5 páginas, erro
 * estruturado da Graph, classificação TOKEN_EXPIRADO (190/463), higienização
 * do token na mensagem, token NUNCA na URL (vai no header), pageId vazio sem
 * tocar a rede, graphVersion custom na URL e falha de rede.
 *
 * Rodar da raiz do repo: node scripts/check-lead-forms.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "lib", "meta", "marketing", "lead-forms.ts");
const stripped = stripTypeScriptTypes(fs.readFileSync(sourcePath, "utf8"));
const { fetchLeadForms } = await import(`data:text/javascript;base64,${Buffer.from(stripped, "utf8").toString("base64")}`);

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

const TOKEN = "EAAB-super-secreto-token-de-leads-42";
const isErr = (x) => x && typeof x === "object" && x.ok === false;

/**
 * Fetcher mock: `pages` é um array de respostas JSON (uma por página). Grava
 * cada chamada (url + headers) para inspeção. Se um item for Error, lança
 * (simula falha de rede).
 */
function mockFetcher(pages) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = pages[Math.min(i, pages.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return { ok: true, status: 200, json: async () => r };
  };
  fn.calls = calls;
  return fn;
}

const form = (over = {}) => ({ id: "f1", name: "Form 1", status: "ACTIVE", questions: [{}, {}, {}], ...over });
const page = (data, after) => ({ data, paging: after ? { cursors: { after }, next: `https://x/next?after=${after}` } : { cursors: {} } });

// 1. mapeamento: id/nome/status/questionCount de uma página única
{
  const fetcher = mockFetcher([page([form({ id: "10", name: "Contato", status: "ACTIVE" })])]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 1: mapeia campos",
    Array.isArray(out) && out.length === 1 && out[0].id === "10" && out[0].name === "Contato" &&
    out[0].status === "ACTIVE" && out[0].questionCount === 3, JSON.stringify(out));
}

// 2. questions ausente => questionCount 0 (e questions não-array também)
{
  const fetcher = mockFetcher([page([{ id: "1", name: "A", status: "ACTIVE" }, { id: "2", name: "B", status: "PAUSED", questions: "x" }])]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 2: questions ausente/inválida => 0",
    Array.isArray(out) && out[0].questionCount === 0 && out[1].questionCount === 0, JSON.stringify(out));
}

// 3. paginação multi-página: segue `after` e acumula, parando quando não há next
{
  const fetcher = mockFetcher([
    page([form({ id: "a" })], "CUR1"),
    page([form({ id: "b" })], "CUR2"),
    page([form({ id: "c" })]), // sem next => para
  ]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 3: acumula 3 páginas e para",
    Array.isArray(out) && out.map((f) => f.id).join(",") === "a,b,c" && fetcher.calls.length === 3,
    `ids=${Array.isArray(out) ? out.map((f) => f.id) : out} calls=${fetcher.calls.length}`);
  // 3b: o cursor `after` da página anterior entra na querystring da seguinte
  check("caso 3b: cursor after propagado", fetcher.calls[1].url.includes("after=CUR1") && fetcher.calls[2].url.includes("after=CUR2"),
    fetcher.calls.map((c) => c.url).join(" | "));
}

// 4. parada dura em 5 páginas mesmo com next infinito
{
  const fetcher = mockFetcher([page([form()], "SEMPRE")]); // sempre devolve next
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 4: teto de 5 páginas", Array.isArray(out) && out.length === 5 && fetcher.calls.length === 5,
    `len=${Array.isArray(out) ? out.length : out} calls=${fetcher.calls.length}`);
}

// 5. erro estruturado da Graph => MetaReadError com a mensagem
{
  const fetcher = mockFetcher([{ error: { code: 100, message: "Unknown path components", fbtrace_id: "T1" } }]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 5: erro estruturado", isErr(out) && out.code === 100 && out.message.includes("Unknown path") && out.fbtrace === "T1",
    JSON.stringify(out));
}

// 6. token expirado por code 190 => TOKEN_EXPIRADO na mensagem
{
  const fetcher = mockFetcher([{ error: { code: 190, message: "Session has expired" } }]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 6: code 190 => TOKEN_EXPIRADO", isErr(out) && out.message.startsWith("TOKEN_EXPIRADO:"), JSON.stringify(out));
}

// 7. token expirado por subcode 463 => TOKEN_EXPIRADO
{
  const fetcher = mockFetcher([{ error: { code: 102, error_subcode: 463, message: "Error validating access token" } }]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 7: subcode 463 => TOKEN_EXPIRADO", isErr(out) && out.message.startsWith("TOKEN_EXPIRADO:") && out.subcode === 463,
    JSON.stringify(out));
}

// 8. sanitização: token que apareça na mensagem de erro é apagado
{
  const fetcher = mockFetcher([{ error: { code: 190, message: `token ${TOKEN} inválido` } }]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 8: token higienizado da mensagem", isErr(out) && !out.message.includes(TOKEN) && out.message.includes("[token]"),
    JSON.stringify(out));
}

// 9. token NUNCA na URL — vai no header Authorization: Bearer
{
  const fetcher = mockFetcher([page([form()])]);
  await fetchLeadForms("PAGE", TOKEN, { fetcher });
  const c = fetcher.calls[0];
  check("caso 9: token no header, não na URL",
    !c.url.includes(TOKEN) && c.init && c.init.headers && c.init.headers.Authorization === `Bearer ${TOKEN}`,
    `url=${c.url}`);
}

// 10. pageId vazio => MetaReadError sem tocar a rede
{
  const fetcher = mockFetcher([page([form()])]);
  const out = await fetchLeadForms("   ", TOKEN, { fetcher });
  check("caso 10: pageId vazio não chama a rede", isErr(out) && out.code === "invalid_request" && fetcher.calls.length === 0,
    JSON.stringify(out));
}

// 11. graphVersion custom aparece na URL; pageId é URL-encodado
{
  const fetcher = mockFetcher([page([form()])]);
  await fetchLeadForms("123/abc", TOKEN, { fetcher, graphVersion: "v99.0" });
  check("caso 11: versão custom + pageId encodado",
    fetcher.calls[0].url.includes("/v99.0/") && fetcher.calls[0].url.includes("123%2Fabc") && fetcher.calls[0].url.includes("leadgen_forms"),
    fetcher.calls[0].url);
}

// 12. falha de rede => code network, sem vazar token
{
  const fetcher = mockFetcher([new Error(`falha contatando graph com ${TOKEN}`)]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 12: falha de rede estruturada e sem token", isErr(out) && out.code === "network" && !out.message.includes(TOKEN),
    JSON.stringify(out));
}

// 13. página vazia => lista vazia (sem quebrar)
{
  const fetcher = mockFetcher([{ data: [], paging: { cursors: {} } }]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 13: data vazia => []", Array.isArray(out) && out.length === 0, JSON.stringify(out));
}

// 14. next presente mas cursor after ausente => para (não faz loop infinito)
{
  const fetcher = mockFetcher([{ data: [form()], paging: { next: "https://x/next" } }]);
  const out = await fetchLeadForms("PAGE", TOKEN, { fetcher });
  check("caso 14: next sem cursor after => para em 1 página", Array.isArray(out) && out.length === 1 && fetcher.calls.length === 1,
    `len=${Array.isArray(out) ? out.length : out} calls=${fetcher.calls.length}`);
}

if (failures.length) {
  console.error(`Lead forms: falhou (${passed} ok, ${failures.length} falhas)\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Lead forms: aprovado — ${passed} verificações adversariais passaram (mapeamento, paginação por cursor, teto de 5 páginas, erro estruturado, TOKEN_EXPIRADO 190/463, sanitização, token fora da URL, pageId vazio e falha de rede).`);
