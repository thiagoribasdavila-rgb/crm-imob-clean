/**
 * PORTÃO: worker declarado tem de ser DISPARADO por alguém.
 *
 * ── O defeito que este portão existe para tornar impossível ───────────────
 *
 * Em 03/08/2026 declarei uma cadência nova em `config/workers-schedule.json`
 * para o backfill da Meta — a única entrada de leads de uma Página que não
 * aceita webhook. O portão `check-workers-schedule` passou 46/46 e eu dei a
 * entrega por feita.
 *
 * O worker nunca dispararia. Quem executa é `.github/workflows/atlas-vigias.yml`,
 * que tem a PRÓPRIA lista de `on.schedule` e o PRÓPRIO `case` mapeando cron para
 * rota. Duas listas independentes, e o portão só olhava para uma.
 *
 * Classe "construído e nunca ligado" na forma mais cara: tudo verde, tudo
 * declarado, e a lead não entra.
 *
 * ── A PRIMEIRA VERSÃO DESTE PORTÃO ESTAVA ERRADA, E VALE REGISTRAR ───────
 *
 * Ela exigia que a expressão cron fosse IDÊNTICA nos dois arquivos e acusou 26
 * problemas — dos quais 24 eram falso alarme. Os dois arquivos servem a
 * agendadores diferentes:
 *
 *   · `config/workers-schedule.json` gera o crontab do VPS, em horário de
 *     SÃO PAULO (é o que `npm run workers:crontab` imprime);
 *   · `.github/workflows/atlas-vigias.yml` é o GitHub Actions, que só aceita UTC.
 *
 * `0 3 * * *` no JSON e `0 6 * * *` no YAML são A MESMA execução. Um portão que
 * não sabe disso reprova o certo — e portão que reprova o certo é desligado na
 * primeira semana, virando o pior dos mundos.
 *
 * Também não dá para exigir frequência igual: o GitHub Actions tem piso de 5
 * minutos, então o outbox — que no VPS roda a cada 2 minutos — entra no grupo
 * de 5 minutos lá. A frequência legitimamente difere por plataforma.
 *
 * (E sim: escrever a expressão cron de 2 em 2 minutos aqui dentro FECHARIA este
 * comentário de bloco, porque ela contém a sequência que o encerra. Foi o que
 * aconteceu na primeira tentativa, e o arquivo virou erro de sintaxe.)
 *
 * ── O QUE ESTE PORTÃO CONFERE, ENTÃO ─────────────────────────────────────
 *
 * O invariante que sobra é o que realmente importa, e é exatamente o que meu
 * defeito violou: **toda rota com cadência declarada precisa aparecer em ALGUM
 * `ROTAS=` do agendador.** Se ela não aparece, ninguém a chama — e nenhum outro
 * portão percebe.
 *
 * Diferença de horário vira AVISO, com a conversão feita, para quem lê poder
 * conferir a intenção sem ser bloqueado por ela.
 */
import fs from "node:fs";

const JSON_DAS_CADENCIAS = "config/workers-schedule.json";
const YAML_DO_AGENDADOR = ".github/workflows/atlas-vigias.yml";
/** São Paulo é UTC-3: o mesmo instante tem hora +3 no cron do GitHub. */
const HORAS_ATE_UTC = 3;

const agenda = JSON.parse(fs.readFileSync(JSON_DAS_CADENCIAS, "utf8"));
const yaml = fs.readFileSync(YAML_DO_AGENDADOR, "utf8");

/** Toda rota citada em qualquer `ROTAS="..."`, incluindo os grupos manuais. */
const rotasDespachadas = new Set();
/** cron do `case` → rotas, para conferir a intenção de horário. */
const rotasPorCron = new Map();
for (const m of yaml.matchAll(/ROTAS="([^"]+)"/g)) {
  for (const rota of m[1].trim().split(/\s+/)) rotasDespachadas.add(rota);
}
for (const m of yaml.matchAll(/^\s*'([^']+)'\)\s*ROTAS="([^"]+)"/gm)) {
  rotasPorCron.set(m[1].trim(), m[2].trim().split(/\s+/));
}

/** `/api/v2/marketing/x/process` → `marketing/x/process`, como o case escreve. */
const encurtar = (rota) => String(rota).replace(/^\/api\/v2\//, "");

/** Converte a hora fixa de São Paulo para UTC. Hora `*` ou com passo não muda. */
function paraUtc(cron) {
  const partes = String(cron).trim().split(/\s+/);
  if (partes.length !== 5) return cron;
  const hora = partes[1];
  if (!/^\d+$/.test(hora)) return cron;
  partes[1] = String((Number(hora) + HORAS_ATE_UTC) % 24);
  return partes.join(" ");
}

const falhas = [];
const avisos = [];
const workers = (agenda.workers ?? []).filter((w) => w.cadencia);

if (!workers.length) falhas.push("nenhum worker com cadência em " + JSON_DAS_CADENCIAS);

for (const { nome, rota, cadencia } of workers) {
  const curta = encurtar(rota);

  // ── A ASSERÇÃO QUE PEGA O DEFEITO ────────────────────────────────────────
  if (!rotasDespachadas.has(curta)) {
    falhas.push(
      `${nome}: '${curta}' tem cadência '${cadencia}' declarada e NÃO aparece em nenhum ROTAS= de ` +
        `${YAML_DO_AGENDADOR} — ninguém chama este vigia, e todo portão continua verde`,
    );
    continue;
  }

  // ── O horário, como aviso ────────────────────────────────────────────────
  const esperadoEmUtc = paraUtc(cadencia);
  const cronsQueChamam = [...rotasPorCron.entries()].filter(([, rotas]) => rotas.includes(curta)).map(([cron]) => cron);
  if (cronsQueChamam.length && !cronsQueChamam.includes(esperadoEmUtc)) {
    avisos.push(
      `${nome}: JSON pede '${cadencia}' (São Paulo → '${esperadoEmUtc}' UTC); o agendador chama em ` +
        `[${cronsQueChamam.join(", ")}]. Diferença legítima se for piso de plataforma — confira a intenção.`,
    );
  }
}

if (avisos.length) {
  console.log(`⚠ check-agendador-dispara: ${avisos.length} diferença(s) de horário (não bloqueiam):`);
  for (const a of avisos) console.log(`   · ${a}`);
}

if (falhas.length) {
  console.error(`\n✘ check-agendador-dispara: ${falhas.length} vigia(s) declarado(s) e NÃO despachado(s).\n`);
  for (const f of falhas) console.error(`  · ${f}`);
  console.error(
    "\nTrês desfechos legítimos: ligar a rota no agendador (on.schedule + case + grupo do " +
      "workflow_dispatch); remover a cadência do JSON dizendo por quê; ou mover para `sobDemanda` com o motivo.",
  );
  process.exit(1);
}

console.log(`✔ check-agendador-dispara: as ${workers.length} rotas com cadência são despachadas de verdade.`);
