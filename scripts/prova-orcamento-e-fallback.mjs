#!/usr/bin/env node
/**
 * PROVA EXECUTADA do orçamento de IA e do fallback sem IA.
 *
 * ── Por que este script existe ────────────────────────────────────────────
 *
 * `lib/ai/provider-router.ts` e `lib/ai/limitador-de-ia.ts` têm
 * `import "server-only"`: nenhum script consegue carregá-los. Então a prova de
 * ponta a ponta é montada com as peças que SÃO importáveis (a decisão pura e o
 * plano de roteamento) alimentadas por DADO REAL — consumo lido do banco
 * canônico e provedores chamados de verdade.
 *
 * Isto não substitui o contrato; ele prova a regra. Isto prova que a regra,
 * alimentada com a realidade de hoje, decide o que se espera.
 *
 *   node scripts/prova-orcamento-e-fallback.mjs
 *
 * Precisa de: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * e as chaves de IA. Rode com `set -a && . ./.env.local && set +a` antes.
 */

import { decidirSobreOTeto, orcamentoEmVigor, consumoNaoMedido } from "../lib/ai/orcamento-de-ia.ts";
import { planCommercialAI } from "../lib/ai/commercial-orchestrator.ts";
import { prepararEmSombra } from "../lib/ai/modo-sombra.ts";

const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG = process.env.PROVA_ORG_ID || "7c8c71c1-e963-464c-be5c-ff8c7936f51a";

const linha = (c = "─") => console.log(c.repeat(74));
const titulo = (t) => { console.log(); linha("═"); console.log(t); linha("═"); };

let falhas = 0;
function confere(afirmacao, ok, detalhe = "") {
  console.log(`  ${ok ? "✔" : "✘"} ${afirmacao}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

// ─────────────────────────────────────────────────────────────────────────────
titulo("1. O CONSUMO REAL, LIDO DO BANCO CANÔNICO");
// ─────────────────────────────────────────────────────────────────────────────

let consumo = consumoNaoMedido();
let consumoLido = false;

if (!URL_BASE || !CHAVE) {
  console.log("  ⚠ Sem credenciais do Supabase — o consumo fica NÃO MEDIDO.");
  console.log("    O teto absoluto embutido continua valendo. Rode com:");
  console.log("      set -a && . ./.env.local && set +a && node scripts/prova-orcamento-e-fallback.mjs");
} else {
  const resposta = await fetch(`${URL_BASE}/rest/v1/rpc/consumo_de_ia_do_dia`, {
    method: "POST",
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_organization_id: ORG, p_user_id: null, p_agent: "copilot" }),
  });
  if (!resposta.ok) {
    console.log(`  ⚠ RPC consumo_de_ia_do_dia respondeu HTTP ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`);
    console.log("    A migration 20260730050000 pode não estar aplicada neste ambiente.");
  } else {
    const linhaDoBanco = (await resposta.json())?.[0];
    if (linhaDoBanco) {
      consumo = {
        chamadasDoDia: Number(linhaDoBanco.chamadas_do_dia) || 0,
        tokensDoDia: Number(linhaDoBanco.tokens_do_dia) || 0,
        usdDoDia: linhaDoBanco.usd_do_dia === null ? null : Number(linhaDoBanco.usd_do_dia),
        cobraveisSemCustoMedido: Number(linhaDoBanco.cobraveis_sem_custo_medido) || 0,
        chamadasDoUsuario: Number(linhaDoBanco.chamadas_do_usuario) || 0,
        tokensDoUsuario: Number(linhaDoBanco.tokens_do_usuario) || 0,
        chamadasDoAgente: Number(linhaDoBanco.chamadas_do_agente) || 0,
        tokensDoAgente: Number(linhaDoBanco.tokens_do_agente) || 0,
      };
      consumoLido = true;
      console.log("  Consumo de HOJE (dia civil America/Sao_Paulo), medido agora:");
      console.log(`    chamadas do dia .............. ${consumo.chamadasDoDia}`);
      console.log(`    tokens do dia ............... ${consumo.tokensDoDia}`);
      console.log(`    US$ do dia .................. ${consumo.usdDoDia === null ? "NÃO MEDIDO (nenhuma tarifa cadastrada)" : consumo.usdDoDia}`);
      console.log(`    cobráveis sem custo medido .. ${consumo.cobraveisSemCustoMedido}`);
      console.log(`    balde sem atribuição ........ ${consumo.chamadasDoUsuario} chamada(s)`);
      console.log(`    agente copilot .............. ${consumo.chamadasDoAgente} chamada(s)`);
    }
  }
}

const orcamento = orcamentoEmVigor();
console.log(`\n  Orçamento em vigor (origem: ${orcamento.origem}, freio ${orcamento.desligado ? "DESLIGADO" : "ligado"}):`);
for (const [chave, valor] of Object.entries(orcamento.tetos)) console.log(`    ${chave.padEnd(28)} ${valor}`);
if (orcamento.aparos.length) {
  console.log("\n  APAROS (o número escrito não é o que está valendo):");
  for (const aparo of orcamento.aparos) console.log(`    · ${aparo}`);
} else {
  console.log("  Nenhum aparo: todo teto declarado está dentro do absoluto.");
}

// ─────────────────────────────────────────────────────────────────────────────
titulo("2. A DECISÃO, COM O CONSUMO REAL DE HOJE");
// ─────────────────────────────────────────────────────────────────────────────

const hoje = decidirSobreOTeto({ feature: "copilot", agente: "copilot", usuarioId: null }, consumo, orcamento);
console.log(`  copilot (essencial) agora: permitido=${hoje.permitido} acao=${hoje.acao} degraus=[${hoje.degraus}]`);
confere("com o consumo real de hoje a IA essencial está liberada", hoje.permitido === true,
  `${consumo.chamadasDoDia}/${orcamento.tetos.chamadasPorDia} chamadas`);
confere("o veredicto admite quando o custo em dólar não foi medido",
  typeof hoje.custoNaoMedido === "boolean", `custoNaoMedido=${hoje.custoNaoMedido}`);

// ─────────────────────────────────────────────────────────────────────────────
titulo("3. OS DOIS LADOS: o mesmo pedido, o teto estourado");
// ─────────────────────────────────────────────────────────────────────────────

const estourado = { ...consumo, chamadasDoDia: orcamento.tetos.chamadasPorDia + 1 };
const naoEssencial = decidirSobreOTeto({ feature: "campaign-analyst", agente: "campaign-analyst", usuarioId: "u1" }, estourado, orcamento);
const essencial = decidirSobreOTeto({ feature: "copilot", agente: "copilot", usuarioId: "u1" }, estourado, orcamento);

confere("tarefa NÃO essencial é RECUSADA com o teto estourado", naoEssencial.permitido === false, naoEssencial.acao);
confere("tarefa ESSENCIAL segue, degradada", essencial.permitido === true, `degraus=[${essencial.degraus}]`);
confere("a essencial degradada de fato tem degrau acionado", essencial.degraus.length > 0);

const absoluto = { ...consumo, chamadasDoDia: orcamento.absoluto.chamadasPorDia };
const noAbsoluto = decidirSobreOTeto({ feature: "copilot", agente: "copilot", usuarioId: "u1" }, absoluto, orcamento);
confere("no teto ABSOLUTO nem a essencial roda", noAbsoluto.permitido === false, noAbsoluto.acao);

// ─────────────────────────────────────────────────────────────────────────────
titulo("4. O ESTADO REAL DOS PROVEDORES — chamada de verdade, agora");
// ─────────────────────────────────────────────────────────────────────────────

const provedores = [
  {
    nome: "openai",
    presente: Boolean(process.env.OPENAI_API_KEY),
    chamar: () => fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.ATLAS_AI_FAST_MODEL || "gpt-5.6-luna", input: "responda OK", max_output_tokens: 16 }),
      signal: AbortSignal.timeout(40_000),
    }),
  },
  {
    nome: "anthropic",
    presente: Boolean(process.env.ANTHROPIC_API_KEY),
    chamar: () => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.ATLAS_ANTHROPIC_MODEL || "claude-sonnet-4-5", max_tokens: 16, messages: [{ role: "user", content: "responda OK" }] }),
      signal: AbortSignal.timeout(40_000),
    }),
  },
  {
    nome: "perplexity",
    presente: Boolean(process.env.PERPLEXITY_API_KEY),
    chamar: () => fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.ATLAS_RESEARCH_MODEL || "sonar", messages: [{ role: "user", content: "responda OK" }] }),
      signal: AbortSignal.timeout(60_000),
    }),
  },
];

const vivos = {};
for (const provedor of provedores) {
  if (!provedor.presente) { console.log(`  ${provedor.nome.padEnd(11)} chave AUSENTE`); vivos[provedor.nome] = false; continue; }
  try {
    const resposta = await provedor.chamar();
    const corpo = await resposta.json().catch(() => ({}));
    vivos[provedor.nome] = resposta.ok;
    const motivo = resposta.ok
      ? `OK${corpo?.usage?.cost?.total_cost !== undefined ? ` · o provedor informou custo US$ ${corpo.usage.cost.total_cost}` : ""}`
      : `${corpo?.error?.message || corpo?.error?.type || "sem detalhe"}`.slice(0, 90);
    console.log(`  ${provedor.nome.padEnd(11)} HTTP ${resposta.status} — ${motivo}`);
  } catch (erro) {
    vivos[provedor.nome] = false;
    console.log(`  ${provedor.nome.padEnd(11)} FALHOU — ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
titulo("5. FALLBACK SEM IA — a ordem real, com os provedores realmente derrubados");
// ─────────────────────────────────────────────────────────────────────────────

// `aiProviderReadiness()` do roteador só verifica se a CHAVE existe, não se ela
// funciona — as três chaves estão presentes e duas não respondem. Aqui a
// disponibilidade usada é a MEDIDA acima, que é a realidade.
for (const tier of ["fast", "commercial", "reasoning", "research"]) {
  const ordemDoEnv = String(process.env[`ATLAS_AI_${tier.toUpperCase()}_PROVIDER_ORDER`] || "")
    .split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const plano = planCommercialAI({ task: tier, feature: "prova-de-fallback", configuredOrder: ordemDoEnv, available: vivos });
  const primeiroVivo = plano.providerOrder.find((p) => p === "local" || vivos[p]);
  console.log(`  ${tier.padEnd(11)} ordem=[${plano.providerOrder}] → atenderia: ${primeiroVivo}`);
  confere(`o tier ${tier} sempre termina em 'local'`, plano.providerOrder.includes("local"));
}

// O caso que importa: TODOS derrubados.
const tudoMorto = { openai: false, anthropic: false, perplexity: false };
const planoMorto = planCommercialAI({ task: "commercial", feature: "prova-de-fallback", configuredOrder: ["perplexity", "openai", "anthropic"], available: tudoMorto });
console.log(`\n  Com os TRÊS derrubados: ordem=[${planoMorto.providerOrder}]`);
confere("sem nenhum provedor vivo a ordem colapsa para SÓ 'local'",
  planoMorto.providerOrder.length === 1 && planoMorto.providerOrder[0] === "local",
  `veio [${planoMorto.providerOrder}]`);
confere("o plano nunca autoriza ação externa", planoMorto.externalActionAllowed === false);
confere("o fallback declarado é sempre 'local'", planoMorto.fallbackProvider === "local");

// E o caminho de dado pessoal, que ignora a ordem configurada.
const planoPessoal = planCommercialAI({ task: "commercial", feature: "prova-de-fallback", containsPersonalData: true, configuredOrder: ["perplexity"], available: tudoMorto });
console.log(`  Com dado pessoal e tudo derrubado: ordem=[${planoPessoal.providerOrder}]`);
confere("dado pessoal nunca vai para provedor de pesquisa, nem no fallback",
  !planoPessoal.providerOrder.includes("perplexity"), `veio [${planoPessoal.providerOrder}]`);
confere("dado pessoal ainda cai em 'local' quando não há provedor confiável vivo",
  planoPessoal.providerOrder.includes("local"));

// ─────────────────────────────────────────────────────────────────────────────
titulo("6. MODO SOMBRA — com os provedores mortos, nada sai de qualquer forma");
// ─────────────────────────────────────────────────────────────────────────────

const sombra = prepararEmSombra({
  agente: "meta-campaign-executor",
  acao: "iniciar_campanha",
  preparado: { objetivo: "LEADS", verba_diaria_centavos: 5000 },
  recomendacao: "Prova: campanha preparada e não executada.",
  aprovacao: { approvedBy: "prova@atlas", approvedAt: new Date().toISOString(), reason: "prova executada" },
});
confere("ação externa é RETIDA mesmo com aprovação válida", sombra.retido === true);
confere("nada é executado em sombra", sombra.executado === false);
confere("o payload preparado sobrevive para o humano conferir",
  Object.keys(sombra.registro.preparado).length > 0, JSON.stringify(sombra.registro.preparado));

const proibida = prepararEmSombra({
  agente: "meta-campaign-executor", acao: "apagar_dado", preparado: {}, recomendacao: "prova",
  aprovacao: { approvedBy: "prova@atlas", approvedAt: new Date().toISOString(), reason: "prova" },
});
confere("ação do nível 5 é recusada mesmo com aprovação válida",
  proibida.autonomia.permitido === false && proibida.autonomia.proibidaAutonomamente === true);

// ─────────────────────────────────────────────────────────────────────────────
linha("═");
console.log(`RESULTADO: ${falhas === 0 ? "todas as afirmações se sustentaram" : `${falhas} afirmação(ões) FALHARAM`}`);
console.log(`Consumo lido do banco: ${consumoLido ? "sim" : "NÃO — o número acima é 'não medido'"}`);
linha("═");
process.exit(falhas === 0 ? 0 : 1);
