#!/usr/bin/env node
/**
 * DIAGNÓSTICO DAS IAs — qual provedor está VIVO agora.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 *
 * "A IA não funciona" tem causas que exigem pessoas diferentes: chave ausente,
 * chave inválida, conta sem crédito, modelo aposentado, parâmetro incompatível.
 * E com três provedores em cadeia, a pergunta certa nem é "qual é o erro" — é
 * "qual deles ainda atende".
 *
 * Medido em 2026-07-27, este mesmo comando encontrou: OpenAI e Anthropic sem
 * saldo, Perplexity respondendo. Sem isto, o sintoma na tela era o mesmo para
 * os três — e o dono não tinha como saber que faltava crédito, nem em qual.
 *
 * ── O que NUNCA faz ─────────────────────────────────────────────────────────
 *
 * Não imprime chave. Não grava nada. Não manda dado de lead: o texto é "ping".
 * Cada chamada custa fração de centavo (16 tokens de saída).
 *
 *   npm run ia:diagnostico
 */

import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const MAX = 16;

/**
 * Cada provedor sabe se apresentar: como chamar, e como ler a resposta.
 *
 * `personaisPermitido` é a regra de privacidade, não de disponibilidade: a
 * Perplexity é buscador, e mandar nome e telefone de lead para lá é vazar dado
 * pessoal num contexto de busca externa. O roteador já bloqueia isso; aqui o
 * diagnóstico repete a informação para o veredito não induzir a erro.
 */
const PROVEDORES = [
  {
    nome: "openai",
    chave: "OPENAI_API_KEY",
    modelo: () => process.env.ATLAS_AI_FAST_MODEL || "gpt-5.6-luna",
    personaisPermitido: true,
    chamar: (k, modelo) => fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelo, input: "ping", max_output_tokens: MAX, store: false }),
      signal: AbortSignal.timeout(30_000),
    }),
    erro: (b) => b?.error?.code ?? b?.error?.type ?? null,
    mensagem: (b) => b?.error?.message ?? "",
  },
  {
    nome: "anthropic",
    chave: "ANTHROPIC_API_KEY",
    modelo: () => process.env.ATLAS_ANTHROPIC_MODEL || "claude-sonnet-4-5",
    personaisPermitido: true,
    chamar: (k, modelo) => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelo, max_tokens: MAX, messages: [{ role: "user", content: "ping" }] }),
      signal: AbortSignal.timeout(30_000),
    }),
    erro: (b) => b?.error?.type ?? null,
    mensagem: (b) => b?.error?.message ?? "",
  },
  {
    nome: "perplexity",
    chave: "PERPLEXITY_API_KEY",
    modelo: () => process.env.ATLAS_RESEARCH_MODEL || "sonar",
    personaisPermitido: false,
    chamar: (k, modelo) => fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelo, max_tokens: MAX, messages: [{ role: "user", content: "ping" }] }),
      signal: AbortSignal.timeout(30_000),
    }),
    erro: (b) => b?.error?.type ?? null,
    mensagem: (b) => b?.error?.message ?? JSON.stringify(b ?? {}).slice(0, 120),
  },
];

/** Traduz o que a API disse para o que fazer, e para QUEM resolve. */
function diagnosticar(status, codigo, mensagem) {
  if (status === 200) return { vivo: true, causa: "atende", acao: "—", quem: "—" };
  if (status === 401 || status === 403 || /invalid.*api.*key|authentication/i.test(mensagem)) {
    return { vivo: false, causa: "chave recusada", acao: "Gerar chave nova no painel do provedor e substituir no .env.", quem: "quem tem acesso à conta" };
  }
  if (status === 429 || /quota|credit balance|insufficient|billing/i.test(mensagem)) {
    return { vivo: false, causa: "SEM CRÉDITO", acao: "Adicionar saldo no painel de faturamento do provedor. Nenhuma mudança de código resolve.", quem: "quem paga a conta" };
  }
  if (/does not exist|not found|not have access/i.test(mensagem) || codigo === "model_not_found") {
    return { vivo: false, causa: "modelo indisponível", acao: "Conferir a lista de modelos do provedor e ajustar a variável de modelo no .env.", quem: "quem configura o servidor" };
  }
  if (codigo === "unsupported_value") {
    return { vivo: false, causa: "parâmetro incompatível", acao: "O roteador se recupera disso em produção. Se aparecer aqui, avisar o desenvolvimento.", quem: "desenvolvimento" };
  }
  return { vivo: false, causa: `HTTP ${status}${codigo ? ` (${codigo})` : ""}`, acao: "Guardar esta saída e avisar o desenvolvimento.", quem: "desenvolvimento" };
}

console.log(`\nTestando os provedores de IA com uma chamada de ${MAX} tokens cada.\n`);
console.log(`${"PROVEDOR".padEnd(12)} ${"MODELO".padEnd(22)} ${"ESTADO".padEnd(22)} DADO PESSOAL`);
console.log("─".repeat(78));

const resultados = [];
for (const p of PROVEDORES) {
  const chave = process.env[p.chave];
  const modelo = p.modelo();
  if (!chave) {
    resultados.push({ ...p, modelo, vivo: false, causa: "sem chave", acao: `Preencher ${p.chave} no .env.`, quem: "quem administra o servidor" });
    console.log(`${p.nome.padEnd(12)} ${modelo.padEnd(22)} ${"sem chave".padEnd(22)} ${p.personaisPermitido ? "sim" : "NÃO"}`);
    continue;
  }
  let d;
  try {
    const r = await p.chamar(chave, modelo);
    const b = await r.json().catch(() => ({}));
    d = diagnosticar(r.status, p.erro(b), String(p.mensagem(b)));
  } catch (e) {
    d = { vivo: false, causa: "não completou", acao: `Conferir saída de rede do servidor: ${e.message}`, quem: "quem administra o servidor" };
  }
  resultados.push({ ...p, modelo, ...d });
  console.log(`${p.nome.padEnd(12)} ${modelo.padEnd(22)} ${(d.vivo ? "✔ atende" : `✘ ${d.causa}`).padEnd(22)} ${p.personaisPermitido ? "sim" : "NÃO"}`);
}

const vivos = resultados.filter((r) => r.vivo);
const vivosComPessoais = vivos.filter((r) => r.personaisPermitido);

console.log(`\n${"═".repeat(78)}`);
if (!vivos.length) {
  console.log("NENHUM provedor atende. Toda função de IA do CRM está parada.\n");
} else if (!vivosComPessoais.length) {
  console.log(`${vivos.length} provedor(es) atendendo: ${vivos.map((v) => v.nome).join(", ")}.`);
  console.log("\nMAS nenhum deles pode receber dado pessoal. Consequência prática:");
  console.log("  · funcionam: copiloto, briefing do diretor, qualificação, análise de funil;");
  console.log("  · NÃO funcionam: redigir mensagem para a lead, apresentação de imóvel,");
  console.log("    e a leitura das conversas de WhatsApp.");
  console.log("\n  Isso não é defeito: mandar nome e telefone de cliente para um buscador");
  console.log("  externo é vazamento de dado pessoal. A trava é proposital.\n");
} else {
  console.log(`Tudo certo: ${vivosComPessoais.map((v) => v.nome).join(", ")} atende(m) inclusive com dado pessoal.\n`);
}

const parados = resultados.filter((r) => !r.vivo);
if (parados.length) {
  console.log("O QUE FAZER:\n");
  for (const p of parados) {
    console.log(`  ${p.nome} — ${p.causa}`);
    console.log(`    ${p.acao}`);
    console.log(`    Quem resolve: ${p.quem}\n`);
  }
}

console.log("Confira também se a tabela de tarifas cobre os modelos em uso:");
console.log("  npm run ai:pricing:check\n");

process.exit(vivos.length ? 0 : 1);
