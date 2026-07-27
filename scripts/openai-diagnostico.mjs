#!/usr/bin/env node
/**
 * DIAGNÓSTICO DA OPENAI — uma chamada real, mínima, e um veredito claro.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 *
 * "A IA não funciona" tem pelo menos cinco causas que exigem ações diferentes e
 * pessoas diferentes: chave ausente, chave inválida, conta sem crédito, modelo
 * aposentado, e parâmetro incompatível com o modelo. As telas mostravam todas
 * como a mesma coisa — e o dono não tinha como saber qual delas era a sua.
 *
 * Isto separa. Uma chamada de 16 tokens de saída (fração de centavo) e uma
 * frase dizendo o que fazer.
 *
 * ── O que NUNCA faz ─────────────────────────────────────────────────────────
 *
 * Não imprime a chave, nem parte dela além do prefixo público `sk-proj`. Não
 * grava nada. Não manda dado de lead nenhum: o texto enviado é "ping".
 *
 *   npm run openai:diagnostico
 */

import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const chave = process.env.OPENAI_API_KEY;
const modelo = process.env.ATLAS_AI_FAST_MODEL || "gpt-5.6-luna";

function veredito(titulo, oQueFazer, quem) {
  console.log(`\n${"─".repeat(66)}`);
  console.log(titulo);
  console.log(`\nO que fazer: ${oQueFazer}`);
  console.log(`Quem resolve: ${quem}`);
  console.log(`${"─".repeat(66)}\n`);
}

if (!chave) {
  veredito(
    "✘ OPENAI_API_KEY não está configurada.",
    "Preencha OPENAI_API_KEY no .env do servidor e reinicie o PM2.",
    "quem administra o servidor",
  );
  process.exit(1);
}

console.log(`Chave presente (${chave.length} caracteres, prefixo ${chave.slice(0, 7)}…)`);
console.log(`Modelo do tier rápido: ${modelo}`);
console.log("Chamando a API com 16 tokens de saída...");

const inicio = Date.now();
let r, corpo;
try {
  r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, input: "ping", max_output_tokens: 16, store: false }),
    signal: AbortSignal.timeout(30_000),
  });
  corpo = await r.json().catch(() => ({}));
} catch (e) {
  veredito(
    `✘ A chamada não completou: ${e.message}`,
    "Confira se o servidor tem saída para api.openai.com (firewall, proxy).",
    "quem administra o servidor",
  );
  process.exit(1);
}

const ms = Date.now() - inicio;
const codigo = corpo?.error?.code ?? corpo?.error?.type ?? null;
const mensagem = String(corpo?.error?.message ?? "");

if (r.ok) {
  const tokens = corpo?.usage;
  veredito(
    `✔ A OpenAI respondeu em ${ms}ms. A integração está operando.`,
    `Nada. Consumo desta chamada: ${tokens?.input_tokens ?? "?"} de entrada, ${tokens?.output_tokens ?? "?"} de saída.`,
    "—",
  );
  console.log("Confira se ATLAS_AI_PRICE_TABLE cobre este modelo, senão o custo será gravado como zero:");
  console.log(`  npm run ai:pricing:check\n`);
  process.exit(0);
}

// As causas que exigem ação diferente, separadas.
if (r.status === 401) {
  veredito(
    "✘ A chave foi recusada (HTTP 401).",
    "Gere uma chave nova em platform.openai.com/api-keys e substitua no .env.",
    "quem tem acesso à conta da OpenAI",
  );
} else if (codigo === "insufficient_quota" || r.status === 429) {
  veredito(
    `✘ A chave é VÁLIDA, mas a conta está sem crédito (HTTP ${r.status}, ${codigo}).`,
    "Adicione crédito em platform.openai.com/settings/organization/billing. Nenhuma mudança no código resolve isto — o CRM já está pronto, falta saldo.",
    "quem paga a conta da OpenAI",
  );
} else if (codigo === "model_not_found" || /does not exist|not have access/i.test(mensagem)) {
  veredito(
    `✘ O modelo "${modelo}" não existe ou a conta não tem acesso a ele.`,
    "Confira a lista em developers.openai.com/api/docs/models e ajuste ATLAS_AI_FAST_MODEL. Modelos são aposentados com data marcada.",
    "quem configura o servidor",
  );
} else if (codigo === "unsupported_value") {
  veredito(
    `✘ Parâmetro incompatível com "${modelo}": ${mensagem.slice(0, 200)}`,
    "O roteador já se recupera disso sozinho em produção (repete com um valor aceito). Se aparecer aqui, avise o desenvolvimento.",
    "desenvolvimento",
  );
} else {
  veredito(
    `✘ HTTP ${r.status}${codigo ? ` (${codigo})` : ""}: ${mensagem.slice(0, 200)}`,
    "Guarde esta saída e avise o desenvolvimento.",
    "desenvolvimento",
  );
}
process.exit(1);
