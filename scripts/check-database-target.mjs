/**
 * Confere se o banco APONTADO PELO AMBIENTE é o que este código espera.
 *
 * Existe por um motivo concreto e verificado em 2026-07-24: o projeto tem dois
 * bancos Supabase, com schemas muito diferentes —
 *
 *   atlas-v3-homologacao : 176 tabelas, todas as RPCs governadas
 *   atlas-ai-crm-v1      : 24 tabelas, schema legado, nenhuma RPC da fase 34+
 *
 * ...e `.env.local` apontava para um enquanto `.env.hostinger` apontava para o
 * outro. Subir contra o banco errado não dá erro na hora: a aplicação inicia,
 * o login funciona, e só depois as telas vão falhando uma a uma em runtime.
 *
 * Este check troca essa falha silenciosa e tardia por uma falha alta e imediata.
 *
 * Uso:
 *   node --env-file=.env.local scripts/check-database-target.mjs
 *   node --env-file=.env.hostinger scripts/check-database-target.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("ALVO DE BANCO: NÃO EXECUTADO — configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  /* Sai 2, não 1. O portão SABE que não pôde medir e já dizia isso na tela — mas
     sinalizava com o código de REPROVADO. No CI (que não tem .env.local) isso
     virava falso vermelho: em 01/08/2026 o job `validate` do PR #9 reprovou por
     este motivo, com o código intacto. 2 é o código que `portoes-todos` lê como
     NÃO EXECUTADO, e ele nunca conta isso como aprovação — é a diferença entre
     "não sei" e "está errado". Mesmo tratamento de `cobertura-schema:check`. */
  process.exit(2);
}

const client = createClient(url, key, { auth: { persistSession: false } });
const ref = url.replace(/^https:\/\//, "").split(".")[0];

/** Sem estas, o CRM não opera: são o núcleo lido em quase toda tela. */
const ESSENCIAIS = ["leads", "profiles", "organizations", "tasks", "lead_events", "opportunities"];

/** Sem estas, a funcionalidade correspondente fica desligada — mas com recusa honesta. */
const POR_CAPACIDADE = [
  ["task_recurrences", "recorrência de tarefas"],
  ["follow_up_sla_events", "SLA de follow-up medido"],
  ["commercial_proposals", "SLA de proposta"],
  ["lead_assignment_reservations", "reserva de lead na distribuição"],
  ["broker_capacity_limits", "limite de carteira por corretor"],
  ["lead_distribution_priority_rules", "prioridade explicável na distribuição"],
  ["broker_absence_events", "redistribuição por ausência"],
  ["first_contact_sla_policies", "política de SLA de primeiro contato"],
];

async function tabelaExiste(nome) {
  // ATENÇÃO ao formato da consulta: `head: true` faz o PostgREST responder 204
  // SEM erro mesmo para tabela inexistente — foi assim que a primeira versão
  // deste check aprovou um banco que não tinha metade dos objetos. Um select
  // de verdade é o que revela a ausência.
  const { error } = await client.from(nome).select("*").limit(1);
  if (!error) return true;
  // 42P01 = relação inexistente; PGRST205 = ausente no cache de schema do PostgREST.
  if (error.code === "42P01" || error.code === "PGRST205") return false;
  // Qualquer outro erro (permissão, rede) não é prova de ausência — não mente sobre isso.
  return null;
}

const faltamEssenciais = [];
const capacidadesDesligadas = [];
const indeterminados = [];

for (const tabela of ESSENCIAIS) {
  const existe = await tabelaExiste(tabela);
  if (existe === false) faltamEssenciais.push(tabela);
  if (existe === null) indeterminados.push(tabela);
}

for (const [tabela, capacidade] of POR_CAPACIDADE) {
  const existe = await tabelaExiste(tabela);
  if (existe === false) capacidadesDesligadas.push(`${capacidade} (falta ${tabela})`);
  if (existe === null) indeterminados.push(tabela);
}

console.log(`ALVO DE BANCO: projeto ${ref}`);

if (indeterminados.length) {
  console.log(`\n⚠️  Não foi possível determinar ${indeterminados.length} objeto(s): ${indeterminados.join(", ")}`);
  console.log("   Pode ser permissão ou rede — não é prova de ausência.");
}

if (capacidadesDesligadas.length) {
  console.log(`\n○ ${capacidadesDesligadas.length} capacidade(s) indisponível(is) neste banco:`);
  for (const item of capacidadesDesligadas) console.log(`   - ${item}`);
  console.log("   A aplicação sobe e recusa essas ações com mensagem explícita — não quebra.");
}

if (faltamEssenciais.length) {
  console.error(`\n❌ ALVO DE BANCO REPROVADO: faltam ${faltamEssenciais.length} tabela(s) do núcleo: ${faltamEssenciais.join(", ")}`);
  console.error("   Este banco NÃO sustenta a aplicação. Confira para onde o ambiente está apontando");
  console.error("   antes de buildar ou subir — ver docs/continuity/KNOWN_RISKS.md (R-01).");
  process.exit(1);
}

const total = ESSENCIAIS.length + POR_CAPACIDADE.length;
const presentes = total - capacidadesDesligadas.length - faltamEssenciais.length - indeterminados.length;
console.log(`\n✅ ALVO DE BANCO APROVADO: núcleo completo; ${presentes} de ${total} objetos verificados presentes.`);
