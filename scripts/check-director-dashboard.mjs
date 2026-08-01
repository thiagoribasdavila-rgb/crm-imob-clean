import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("config/director-dashboard.json"));
const endpoint = read(contract.endpoint);
const page = read(contract.page);
const failures = [];
// `ai` é regex de PROPRIEDADE, não substring: `const aiUsage = {` deixava o caso
// passar com o bloco calculado e nunca devolvido — o teste de mutação pegou.
// A forma `aiUsage,` ou `aiUsage:` só existe dentro do objeto de resposta.
const markers = { commercial: "commercial:", financial: "financial:", forecast: "forecastWeighted", campaigns: "campaignRanking", developers: "developerMap", ai: /aiUsage\s*[,:]/, risks: "risks", hierarchy: "superintendents" };
const contem = (fonte, marcador) => marcador instanceof RegExp ? marcador.test(fonte) : fonte.includes(marcador);
for (const area of contract.requiredAreas) if (!contem(endpoint, markers[area])) failures.push(`área ausente: ${area}`);
if (!endpoint.includes('roles: ["admin", "director"]') || !endpoint.includes("exclusivo da diretoria")) failures.push("endpoint não é exclusivo da diretoria");
if (!endpoint.includes('.eq("organization_id", organizationId)')) failures.push("consolidação não está limitada à organização");
// Estes dois casos travavam EXPRESSÕES de uma implementação anterior
// (`money(item.value) *`, `forecastMethod: "crm_probability_weighted"`,
// `money(item.leads_count) >= 30`). O endpoint foi reescrito e ficou mais
// explícito — o método passou a se chamar lead_budget_by_canonical_stage, que
// diz de onde sai o número em vez de descrevê-lo genericamente. O portão
// reprovava a melhoria.
//
// Agora eles verificam o COMPORTAMENTO exigido pela fase: existir um método
// declarado, o forecast ser ponderado por probabilidade de estágio, e a
// comparação de campanha ter piso de amostra. Continua impossível passar com
// forecast bruto ou com ranking sem amostra mínima.
if (!/forecastMethod:\s*"[a-z_]+"/.test(endpoint) || !/\*\s*\(STAGE_PROBABILITY\[[^\]]+\][^)]*\)\s*\/\s*100/.test(endpoint)) failures.push("forecast não é explicável");
if (!/sampleSufficient:\s*[A-Za-z_.]*[Ll]eads\.length\s*>=\s*30/.test(endpoint) || !endpoint.includes("minimumLeadsForDecision: 30") || !endpoint.includes("portfolio.length >= 50")) failures.push("comparações não possuem amostra mínima");
// O que precisa ser proibido é ESCRITA NO BANCO. A regra anterior marcava
// qualquer `.delete(` e reprovava `leadSnapshotCache.delete(key)` — um Map em
// memória, que é o oposto de decisão sensível. Agora: nenhum `.insert(`/
// `.upsert(` em lugar nenhum (não têm uso inocente aqui) e nenhuma cadeia
// from(...).update/delete, que é a forma real de escrever no Supabase.
const escritaDireta = /\.(insert|upsert)\(/.test(endpoint);
const escritaEncadeada = /\.from\(\s*["'][^"']+["']\s*\)[\s\S]{0,300}?\.(update|delete)\(/.test(endpoint);
if (escritaDireta || escritaEncadeada || !endpoint.includes("noAutomaticBudgetChange: true") || !endpoint.includes("noAutomaticPeopleDecision: true")) failures.push("painel pode executar decisão sensível");
if (!page.includes('data-phase="24-director-command-center"')) failures.push("Command Center da fase 24 não está visível");
if (!page.includes("Sem snapshot anterior") || !page.includes("APROVAÇÃO HUMANA")) failures.push("interface não explica confiança e governança");
if (failures.length) { console.error("DIRECTOR DASHBOARD Fase 24: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`DIRECTOR DASHBOARD Fase 24: aprovado — ${contract.requiredAreas.length} áreas; organização isolada; forecast explicável; amostras mínimas; decisão humana.`);
