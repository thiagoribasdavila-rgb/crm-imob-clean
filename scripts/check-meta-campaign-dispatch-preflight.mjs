/**
 * Gate do pré-voo de disparo Meta.
 *
 * Valida o núcleo real (type-stripped) e inspeciona a rota:
 * - sem token/conta, não toca a rede e bloqueia honestamente;
 * - com token/conta/página/formulário, usa apenas GET read-only;
 * - erro da Meta nunca vaza token;
 * - a rota é protegida por liderança e não executa criação/ativação.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "meta-dispatch-preflight-"));
const fail = [];
const expect = (condition, message) => { if (!condition) fail.push(message); };
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

fs.writeFileSync(
  path.join(tmp, "graph.mjs"),
  `export function metaGraphVersion(){ return "vTEST"; }
export function describeMetaGraphFailure(status, payload){
  const e = payload && payload.error ? payload.error : {};
  return "Meta Graph HTTP " + status + ": " + (e.message || "erro");
}
`,
  "utf8",
);

let source = stripTypeScriptTypes(read("lib/meta/marketing/campaign-dispatch-preflight.ts"))
  .replace('from "@/lib/meta/graph"', 'from "./graph.mjs"');
fs.writeFileSync(path.join(tmp, "preflight.mjs"), source, "utf8");
const { runMetaCampaignDispatchPreflight } = await import(pathToFileURL(path.join(tmp, "preflight.mjs")).href);

// 1) Sem env: bloqueia e não chama rede.
let networkCalls = [];
const noEnv = await runMetaCampaignDispatchPreflight({
  fetcher: async () => {
    networkCalls.push("network");
    throw new Error("rede proibida no caso sem env");
  },
});
expect(noEnv.status === "blocked", "sem token/conta deve bloquear");
expect(networkCalls.length === 0, "sem token/conta não pode tocar rede");
expect(noEnv.readiness.externalMutationExecuted === false, "pré-voo nunca executa mutação externa");
expect(noEnv.readiness.canActivateWithSpend === false, "pré-voo nunca autoriza gasto direto");

// 2) Com env completo: apenas GETs read-only.
networkCalls = [];
const ok = await runMetaCampaignDispatchPreflight({
  adsToken: "TOKEN_SUPER_SECRETO",
  leadToken: "LEAD_TOKEN",
  adAccountId: "act_123456789",
  pageId: "987654321",
  leadFormId: "555666777",
  graphVersion: "v99.0",
  fetcher: async (input, init = {}) => {
    networkCalls.push({ url: String(input), method: init.method || "GET", body: init.body, auth: init.headers?.Authorization });
    return new Response(JSON.stringify({ id: "ok", name: "Atlas" }), { status: 200, headers: { "content-type": "application/json" } });
  },
});
expect(ok.status === "warning" || ok.status === "ok", "env completo deve passar sem bloqueio");
expect(ok.readiness.canReadMetaAccount === true, "conta deve ser lida");
expect(ok.readiness.canReadCampaigns === true, "campanhas devem ser lidas");
expect(networkCalls.length >= 4, "deve ler conta, campanhas, página e formulário");
expect(networkCalls.every((call) => call.method === "GET"), "pré-voo deve usar somente GET");
expect(networkCalls.every((call) => call.body == null), "pré-voo não pode enviar corpo/mutação");
expect(networkCalls.some((call) => call.url.includes("/v99.0/act_123456789?fields=")), "deve respeitar versão e conta configuradas");
expect(JSON.stringify(ok).includes("TOKEN_SUPER_SECRETO") === false, "resposta não pode vazar token");

// 3) Erro da Meta com token na mensagem: precisa sair sanitizado.
const graphError = await runMetaCampaignDispatchPreflight({
  adsToken: "TOKEN_SUPER_SECRETO",
  adAccountId: "123456789",
  fetcher: async () => new Response(
    JSON.stringify({ error: { code: 190, message: "token TOKEN_SUPER_SECRETO expirou", fbtrace_id: "abc" } }),
    { status: 400, headers: { "content-type": "application/json" } },
  ),
});
const asText = JSON.stringify(graphError);
expect(graphError.status === "blocked", "erro Meta deve bloquear pré-voo");
expect(!asText.includes("TOKEN_SUPER_SECRETO"), "erro sanitizado não pode conter token");
expect(asText.includes("<token>"), "erro sanitizado deve marcar token removido");

// 4) Rota protegida e sem criação.
const route = read("app/api/v1/integrations/meta/campaign-dispatch-test/route.ts");
for (const marker of [
  "requireAccessContext",
  "LEADERSHIP",
  "runMetaCampaignDispatchPreflight",
  "META_ADS_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_PAGE_ID",
  "META_LEAD_FORM_ID",
]) {
  expect(route.includes(marker), `rota incompleta: ${marker}`);
}
for (const forbidden of ["executeSteps", "executeControl", "method: \"POST\"", "status: \"ACTIVE\"", "dryRun: false"]) {
  expect(!route.includes(forbidden), `rota de teste não pode executar criação/ativação: ${forbidden}`);
}

if (fail.length) {
  console.error("META CAMPAIGN DISPATCH PREFLIGHT: REPROVADO");
  fail.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("META CAMPAIGN DISPATCH PREFLIGHT: aprovado — teste read-only, seguro e sem vazamento de token.");
