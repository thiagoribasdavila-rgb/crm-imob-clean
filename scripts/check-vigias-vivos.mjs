#!/usr/bin/env node
/**
 * PORTÃO: os 13 vigias estão VIVOS — cada um deixou rastro dentro da sua cadência.
 *
 * ── O que foi medido em 01/08/2026, no banco de produção ───────────────────
 *
 *   atlas_agent_runs .............. 0 registros · nunca rodou
 *   meta_executions ............... 0 registros · nunca rodou
 *   integration_health_snapshots .. 0 registros · nunca rodou
 *   nightly_broker_handoffs ....... 0 registros · nunca rodou
 *   meta_daily_reports ............ 0 registros · nunca rodou
 *   follow_up_sla_events .......... 10 · último há 15h43
 *   ai_usage_events ............... 47 · último há 18h
 *
 * Cinco sinais em ZERO ABSOLUTO. A automação inteira do produto — relatório
 * diário da Meta, entrega noturna ao corretor, vigia de saúde das integrações —
 * nunca aconteceu uma vez sequer.
 *
 * ── Por que ninguém viu ────────────────────────────────────────────────────
 *
 * `check-integration-operational-health.mjs` estava VERDE o tempo todo. Ele
 * confere se ARQUIVOS contêm certas strings: `integration_health_snapshots`
 * aparece numa migration, `ready_to_test` aparece num .ts. Tudo verdade, e
 * nenhuma delas diz se a saúde operacional foi medida uma vez.
 *
 * É a doença que este repositório mais paga, agora na dimensão que mais dói:
 * **a asserção que só verifica a si mesma sempre concorda consigo mesma**. Um
 * portão assim não aprova um defeito — ele NÃO SABERIA.
 *
 * ── O que este portão faz de diferente ─────────────────────────────────────
 *
 * Ele não lê arquivo nenhum do produto. Ele pergunta ao BANCO: qual foi a
 * última vez que este vigia deixou rastro? E compara com a cadência declarada
 * em `config/workers-schedule.json`, com folga de 3 ciclos.
 *
 * Sem credencial, sai com código 2 e a palavra NÃO EXECUTADO. Nunca verde por
 * ausência — essa é a diferença entre "não sei" e "está tudo bem".
 *
 * Rodar:
 *   node scripts/check-vigias-vivos.mjs
 *   node scripts/check-vigias-vivos.mjs --dados '{"tasks":"2026-08-01T10:00:00Z"}'
 *     (o segundo modo existe para provar a LÓGICA sem banco — os carimbos vêm
 *      de fora, medidos à mão. Ele não substitui a execução real.)
 */
import fs from "node:fs";

const AGENDA = JSON.parse(fs.readFileSync("config/workers-schedule.json", "utf8"));
const FOLGA_EM_CICLOS = 3;

/** Intervalo aproximado de um cron, em minutos. Só as formas que a agenda usa. */
export function intervaloEmMinutos(cadencia) {
  const [min, hora, , , semana] = cadencia.trim().split(/\s+/);
  if (min.startsWith("*/")) return Number(min.slice(2));
  if (hora.startsWith("*/")) return Number(hora.slice(2)) * 60;
  if (semana !== "*") return 7 * 24 * 60;
  if (hora === "*") return 60;
  return 24 * 60;
}

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i === -1 ? null : process.argv[i + 1];
}

/* ── Leitura do banco, quando há credencial ─────────────────────────────── */
async function ultimoRastro(tabela, coluna) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return undefined;
  const alvo = `${url}/rest/v1/${tabela}?select=${coluna}&order=${coluna}.desc&limit=1`;
  const r = await fetch(alvo, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
  if (!r.ok) return null;
  const linhas = await r.json();
  return linhas?.[0]?.[coluna] ?? null;
}

const simulado = argumento("--dados");
const carimbos = simulado ? JSON.parse(simulado) : null;

if (!carimbos && !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("  NÃO EXECUTADO — sem credencial do banco nesta máquina.");
  console.error("  Este portão pergunta ao banco se cada vigia deixou rastro; sem banco ele");
  console.error("  não tem o que medir. Sair verde aqui seria dizer 'tudo bem' quando o que");
  console.error("  existe é 'não sei'. Roda no deploy, onde a credencial existe.");
  process.exit(2);
}

const agora = Date.now();
const mortos = [];
const atrasados = [];
const vivos = [];

for (const w of AGENDA.workers) {
  const ev = w.evidencia;
  if (!ev?.tabela) {
    mortos.push(`${w.nome}: sem evidência declarada — impossível saber se rodou`);
    continue;
  }
  const carimbo = carimbos ? carimbos[ev.tabela] ?? null : await ultimoRastro(ev.tabela, ev.coluna);
  const limite = intervaloEmMinutos(w.cadencia) * FOLGA_EM_CICLOS;

  if (carimbo === null || carimbo === undefined) {
    mortos.push(`${w.nome}: NUNCA rodou (${ev.tabela} vazia)${ev.inferida ? " · evidência inferida, confirme a tabela" : ""}`);
    continue;
  }
  const minutos = Math.round((agora - new Date(carimbo).getTime()) / 60000);
  if (minutos > limite) {
    atrasados.push(`${w.nome}: último rastro há ${minutos} min, cadência ${w.cadencia} tolera ${limite} min`);
  } else {
    vivos.push(`${w.nome}: rastro de ${minutos} min atrás (tolerância ${limite})`);
  }
}

for (const v of vivos) console.log(`  ok   ${v}`);
for (const a of atrasados) console.error(`  ATRASADO ${a}`);
for (const m of mortos) console.error(`  MORTO ${m}`);

const total = AGENDA.workers.length;
console.log(`\n  vivos ${vivos.length}/${total} · atrasados ${atrasados.length} · nunca rodaram ${mortos.length}`);

if (mortos.length || atrasados.length) {
  console.error(
    "\n✗ vigias-vivos: a automação não está de pé.\n" +
      "  Um vigia que nunca rodou não é um alerta que não disparou — é um alerta que\n" +
      "  NÃO EXISTE. O corretor não recebe a fila da manhã, o SLA não é cobrado e o\n" +
      "  relatório da Meta não sai, e nada disso aparece como erro em lugar nenhum.\n" +
      "\n  Primeira coisa a conferir: o crontab foi instalado no deploy?",
  );
  process.exit(1);
}
console.log(`\n✓ vigias-vivos: os ${total} vigias deixaram rastro dentro da cadência.`);
