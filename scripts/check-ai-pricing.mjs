/**
 * Confere se TODO modelo em uso tem tarifa cadastrada em ATLAS_AI_PRICE_TABLE.
 *
 * Por que este portão existe: o roteador se recusa — corretamente — a inferir
 * preço. Sem tarifa, `estimated_cost_usd` fica NULO e o consumo é registrado
 * sem custo. O resultado é pior que um número errado: é um painel de FinOps que
 * mostra zero e parece saudável.
 *
 * Aconteceu de verdade em 2026-07-26: o Creative Studio gastou 2.368 tokens em
 * perplexity/sonar e gravou custo nulo, porque não havia tarifa dessa dupla.
 * Nada avisou.
 *
 * Uso: node scripts/check-ai-pricing.mjs
 *      node --env-file=.env.local scripts/check-ai-pricing.mjs
 */
import { readFileSync } from "node:fs";

const roteador = readFileSync("lib/ai/provider-router.ts", "utf8");

/** Extrai os modelos padrão de cada tier direto do roteador — fonte única. */
function modelosDoRoteador() {
  const encontrados = new Set();
  // Formas usadas no roteador: "openai/gpt-5.2", ATLAS_*_MODEL || "modelo", etc.
  for (const m of roteador.matchAll(/"(openai|anthropic|perplexity)\/([\w.\-]+)"/g)) {
    encontrados.add(`${m[1]}/${m[2]}`);
  }
  for (const m of roteador.matchAll(/\|\|\s*"(gpt-[\w.\-]+|claude-[\w.\-]+|sonar[\w.\-]*)"/g)) {
    const modelo = m[1];
    const provedor = modelo.startsWith("gpt") ? "openai" : modelo.startsWith("claude") ? "anthropic" : "perplexity";
    encontrados.add(`${provedor}/${modelo}`);
  }
  return [...encontrados].sort();
}

/** Modelos escolhidos por variável de ambiente — o que roda de fato em produção. */
function modelosDoAmbiente() {
  const pares = [
    ["openai", process.env.ATLAS_OPENAI_MODEL || process.env.OPENAI_MODEL],
    ["anthropic", process.env.ATLAS_ANTHROPIC_MODEL || process.env.ATLAS_CLAUDE_MODEL],
    ["perplexity", process.env.ATLAS_PERPLEXITY_MODEL],
  ];
  return pares.filter(([, m]) => m).map(([p, m]) => `${p}/${m}`);
}

function tabela() {
  const bruto = process.env.ATLAS_AI_PRICE_TABLE || "";
  if (!bruto.trim()) return { chaves: new Set(), vazia: true, invalida: false };
  try {
    const parsed = JSON.parse(bruto);
    return { chaves: new Set(Object.keys(parsed).map((k) => k.trim().toLowerCase())), vazia: false, invalida: false };
  } catch {
    return { chaves: new Set(), vazia: false, invalida: true };
  }
}

const { chaves, vazia, invalida } = tabela();
const emUso = [...new Set([...modelosDoRoteador(), ...modelosDoAmbiente()])].sort();

/** Uma tarifa cobre o modelo se houver chave exata ou curinga do provedor. */
const temTarifa = (par) => chaves.has(par.toLowerCase()) || chaves.has(`${par.split("/")[0]}/*`);

const semTarifa = emUso.filter((par) => !temTarifa(par));

console.log("ATLAS AI PRICING");
console.log(`  modelos referenciados: ${emUso.length}`);
console.log(`  tarifas cadastradas:   ${chaves.size}`);

if (invalida) {
  console.error("\n❌ ATLAS_AI_PRICE_TABLE não é JSON válido — nenhuma tarifa é aplicada.");
  console.error("   Formato: {\"perplexity/sonar\":{\"input\":1,\"output\":1}}  (US$ por milhão de tokens)");
  process.exit(1);
}

if (vazia) {
  console.error("\n❌ ATLAS_AI_PRICE_TABLE ausente. Todo consumo de IA será gravado com custo NULO.");
  console.error("   O painel de custos mostrará zero e parecerá saudável — não é.");
  console.error(`\n   Modelos que precisam de tarifa: ${emUso.join(", ")}`);
  console.error("\n   Consulte a página de preços de cada provedor e preencha em US$ por milhão de tokens.");
  console.error("   NÃO estime de cabeça: preço errado é pior que preço ausente, porque parece confiável.");
  process.exit(1);
}

if (semTarifa.length) {
  console.error(`\n❌ ${semTarifa.length} modelo(s) em uso SEM tarifa — o consumo deles fica com custo nulo:`);
  for (const par of semTarifa) console.error(`   - ${par}`);
  console.error("\n   Acrescente em ATLAS_AI_PRICE_TABLE, ou use o curinga \"provedor/*\" como tarifa padrão.");
  process.exit(1);
}

console.log(`\n✅ Todos os ${emUso.length} modelos em uso têm tarifa cadastrada.`);
