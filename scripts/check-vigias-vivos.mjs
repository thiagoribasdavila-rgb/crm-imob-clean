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
 * ── CORREÇÃO DE 02/08/2026: A FRASE ACIMA AFIRMA MAIS DO QUE OS DADOS DIZEM ──
 *
 * "Nunca aconteceu" é uma conclusão sobre EXECUÇÃO, tirada de uma medição de
 * ESCRITA. Lendo as 13 rotas em 02/08/2026, nenhuma delas grava
 * incondicionalmente: toda escrita acontece dentro de um laço sobre uma fila,
 * ou dentro de uma RPC que só age quando há item elegível.
 *
 * Então tabela vazia é AMBÍGUA. Pode ser "nunca rodou" — e há outras evidências
 * fortes de que é esse o caso aqui, porque o `schedule` do GitHub nunca disparou
 * e o crontab nunca foi instalado. Mas pode também ser "rodou e corretamente não
 * fez nada", e este portão sozinho não separa os dois.
 *
 * O número que este arquivo publicava — "4 vivos de 13, 9 que nunca rodaram" —
 * misturava as duas coisas. Agora vigia condicional sem rastro sai como NÃO
 * MEDIDO (código 2), e não como MORTO.
 *
 * O que ficaria REALMENTE provado com uma linha por invocação, independente de
 * ter havido trabalho — um livro de execuções. `atlas_agent_runs` existe, tem
 * zero linhas e ninguém escreve nela; seria o lugar natural. Exige migration, e
 * por isso está declarado como pendência em config/workers-schedule.json em vez
 * de fingido aqui.
 *
 * O portão NÃO perdeu os dentes: ele continua saindo VERMELHO para `atrasado`,
 * que é o caso que ele consegue julgar — worker que já escreveu e parou.
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
/**
 * ── "NÃO CONSEGUI PERGUNTAR" NÃO É "A RESPOSTA É ZERO" ──────────────────────
 *
 * Até 02/08/2026 esta função devolvia `null` para QUALQUER falha de requisição,
 * e quem chama traduzia `null` numa frase confiante e específica:
 * "NUNCA rodou (<tabela> vazia)".
 *
 * Três causas diferentes colapsavam nessa mesma sentença:
 *   1. a tabela está mesmo vazia          → o vigia realmente nunca rodou
 *   2. a COLUNA declarada não existe      → eu perguntei errado
 *   3. a requisição falhou (401/500/rede) → eu não perguntei
 *
 * Só a primeira justifica a frase. E a segunda não era hipótese: medido no banco
 * de produção em 02/08/2026, `lead-reservations` declarava evidência em
 * `lead_assignment_reservations.updated_at`, e essa coluna NÃO EXISTE — a tabela
 * guarda `released_at`, que é o que o worker de expiração realmente grava.
 * O portão diria "nunca rodou" sobre um vigia que ele nunca conseguiu medir.
 *
 * É exatamente a doença que este arquivo foi escrito para detectar, morando
 * dentro dele. Agora a função devolve o ESTADO junto com o carimbo, e quem
 * chama não pode mais confundir os três.
 */
async function ultimoRastro(tabela, coluna) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return { estado: "sem-credencial" };
  const alvo = `${url}/rest/v1/${tabela}?select=${coluna}&order=${coluna}.desc&limit=1`;
  let r;
  try {
    r = await fetch(alvo, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
  } catch (erro) {
    return { estado: "nao-consegui", motivo: `rede: ${erro?.message ?? erro}` };
  }
  if (!r.ok) {
    // O corpo do PostgREST nomeia a coluna quando ela não existe (42703). Vale
    // repassar: é a diferença entre "conserte o banco" e "conserte a declaração".
    const corpo = await r.text().catch(() => "");
    const detalhe = /column .* does not exist|42703/i.test(corpo)
      ? `a coluna "${coluna}" não existe em "${tabela}" — a declaração de evidência é que está errada, não o vigia`
      : `HTTP ${r.status}`;
    return { estado: "nao-consegui", motivo: detalhe };
  }
  const linhas = await r.json();
  const carimbo = linhas?.[0]?.[coluna] ?? null;
  return { estado: "medido", carimbo };
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
// "não consegui medir" é uma quarta caixa, e ela não pode cair em nenhuma das
// outras três: cair em `vivos` esconde, cair em `mortos` mente.
const naoMedidos = [];

for (const w of AGENDA.workers) {
  const ev = w.evidencia;
  if (!ev?.tabela) {
    mortos.push(`${w.nome}: sem evidência declarada — impossível saber se rodou`);
    continue;
  }
  const leitura = carimbos
    ? { estado: "medido", carimbo: carimbos[ev.tabela] ?? null }
    : await ultimoRastro(ev.tabela, ev.coluna);
  const limite = intervaloEmMinutos(w.cadencia) * FOLGA_EM_CICLOS;

  if (leitura.estado !== "medido") {
    naoMedidos.push(`${w.nome}: não consegui medir (${leitura.motivo ?? "sem credencial do banco"})`);
    continue;
  }
  const carimbo = leitura.carimbo;
  if (carimbo === null) {
    // ── SEM RASTRO NÃO É O MESMO QUE SEM EXECUÇÃO ────────────────────────────
    //
    // Medido em 02/08/2026, lendo as 13 rotas: NENHUMA grava incondicionalmente.
    // Toda escrita acontece dentro de um laço sobre uma fila, ou dentro de uma
    // RPC que só age quando há item elegível.
    //
    // Então, para um vigia condicional, tabela vazia é o desfecho CORRETO de um
    // sistema quieto: ele acordou, olhou a fila, não achou nada e foi dormir.
    // Dizer "NUNCA rodou" ali é uma afirmação confiante sobre algo que este
    // portão não tem como saber.
    //
    // O número que este arquivo publicava — "4 vivos de 13, 9 que nunca
    // rodaram" — misturava duas coisas muito diferentes. Alguns daqueles 9
    // podem ter rodado certinho e corretamente não feito nada.
    //
    // Rastro condicional prova VIDA quando existe; a ausência dele não prova
    // nada. Provar o contrário exigiria uma linha por invocação, independente de
    // ter havido trabalho — um livro de execuções. Isso é tabela nova, e está
    // declarado em config/workers-schedule.json como o que falta.
    if (ev.condicional) {
      naoMedidos.push(
        `${w.nome}: ${ev.tabela} sem rastro — e este vigia SÓ grava quando há trabalho. ` +
          "Não dá para afirmar que ele parou, nem que ele rodou.",
      );
      continue;
    }
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
for (const n of naoMedidos) console.error(`  NÃO MEDIDO ${n}`);
for (const a of atrasados) console.error(`  ATRASADO ${a}`);
for (const m of mortos) console.error(`  MORTO ${m}`);

const total = AGENDA.workers.length;
console.log(`\n  vivos ${vivos.length}/${total} · atrasados ${atrasados.length} · nunca rodaram ${mortos.length} · não medidos ${naoMedidos.length}`);

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

// ── A ORDEM IMPORTA, E EU ERREI ELA PRIMEIRO ───────────────────────────────
//
// Este bloco estava ANTES do de cima. Com 3 vigias comprovadamente ATRASADOS e
// 10 não medidos, o portão saía 2 ("não consegui olhar") — mascarando três
// paradas que ele TINHA conseguido medir.
//
// Fato confirmado é mais forte que fato ausente. Parada comprovada sai 1
// primeiro; o 2 fica para quando não há NENHUM problema confirmado e ainda
// resta algo que não deu para medir.
if (naoMedidos.length) {
  console.error(
    "\n⚠ vigias-vivos: NÃO EXECUTADO para " + naoMedidos.length + " vigia(s).\n" +
      "  Não é 'a automação está parada' nem 'está tudo bem' — é 'não consegui olhar'.\n" +
      "  Dizer qualquer uma das duas seria inventar uma medição que não aconteceu.",
  );
  process.exit(2);
}

console.log(`\n✓ vigias-vivos: os ${total} vigias deixaram rastro dentro da cadência.`);
