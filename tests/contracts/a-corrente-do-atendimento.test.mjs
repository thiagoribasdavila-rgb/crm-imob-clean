/**
 * CONTRATO: a corrente do atendimento fecha ponta a ponta.
 *
 * A promessa do Lead 360 não é um conjunto de peças — é uma CORRENTE:
 *
 *   registrar contato → o SLA de primeiro contato fecha → o evento aparece na
 *   linha do tempo → a nota de completude sobe → o funil registra a transição
 *
 * Cada peça funcionava sozinha. Dois elos estavam PARTIDOS, e os dois do mesmo
 * jeito: HTTP 200, tela desenhada, dado ausente.
 *
 * ── ELO 3 · O CONTATO NÃO CHEGAVA NA LINHA DO TEMPO ─────────────────────────
 *
 * `POST /api/v1/leads/[id]/first-contact` grava em `lead_events`.
 * `GET /api/v1/leads/[id]/timeline` lia `activities` e SÓ ela.
 *
 * Medido em produção (pozbrcsfthnhmnebfoxv) em 02/08/2026, chamando os
 * handlers REAIS: das 481 linhas de `activities`, 481 são o espelho de
 * `move_pipeline_lead` — ZERO contatos. Os 56 contatos registrados (40 `call` +
 * 16 `whatsapp`) estavam todos em `lead_events`.
 *
 * Na lead e036dc63, com 4 contatos registrados, a rota devolvia
 * `counts.contact = 0` e dois eventos: "Lead criado no CRM" e uma mudança de
 * etapa. O corretor tinha ligado quatro vezes e a linha do tempo dizia que
 * ninguém tinha falado com o cliente.
 *
 * E `whatsapp` não estava no vocabulário de contato: nenhum ramo casava e
 * `activityCategoryForType` caía no `return "change"` do fim — o WhatsApp era
 * desenhado como MOVIMENTAÇÃO e sumia do filtro "Contato".
 *
 * ── ELO 6 · A MUDANÇA DE ETAPA NÃO CHEGAVA NO LEDGER ────────────────────────
 *
 * `pipeline_stage_moves` é a fonte canônica da movimentação. `PATCH
 * /api/v1/leads/[id]` fazia `update leads set status = …` direto, e nenhum
 * gatilho do banco supre isso (conferido em `pg_trigger`).
 *
 * Medido cruzando os eventos `lead_updated` desta rota com o ledger: 5 mudanças
 * de etapa feitas por aqui, 5 AUSENTES do ledger — inclusive
 * `41297361 · contrato → ganho`, que é a VENDA.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { activityCategoryForType } from "../../lib/atlas/activity-timeline.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...partes) => fs.readFileSync(path.join(raiz, ...partes), "utf8");

const ROTA_DA_TIMELINE = ["app", "api", "v1", "leads", "[id]", "timeline", "route.ts"];
const ROTA_DA_FICHA = ["app", "api", "v1", "leads", "[id]", "route.ts"];
const ROTA_DO_CONTATO = ["app", "api", "v1", "leads", "[id]", "first-contact", "route.ts"];

/**
 * O portão EXECUTA o classificador — não confere a forma dele.
 *
 * A lista de canais vem da fonte da rota que os aceita, então inventar um canal
 * novo sem ensinar a linha do tempo a categorizá-lo reprova aqui. E o veredito
 * é a função REAL rodando: trocar `Set` por `includes` continua passando, mas
 * esquecer um canal, não.
 */
test("todo canal que o corretor pode registrar é categorizado como CONTATO", () => {
  const fonte = ler(...ROTA_DO_CONTATO);
  const declaracao = fonte.match(/const CANAIS = new Set\(\[([^\]]+)\]\)/);
  assert.ok(declaracao, "a lista CANAIS sumiu de first-contact — a âncora do contrato se perdeu");

  const canais = [...declaracao[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(canais.length >= 7, `esperava os 7 canais, achei ${canais.length}`);

  const desviados = canais.filter((canal) => activityCategoryForType(canal) !== "contact");
  assert.deepEqual(
    desviados,
    [],
    `estes canais o corretor registra e a linha do tempo NÃO chama de contato: ${desviados.join(", ")}.\n` +
      `Sem a chave em contactTypes (lib/atlas/activity-timeline.ts) a função cai no "change" do fim,\n` +
      `o evento vira "Movimentação" e some do filtro "Contato" — sem erro nenhum.`,
  );
});

test("a linha do tempo abre a gaveta onde o contato do corretor cai", () => {
  const fonte = ler(...ROTA_DA_TIMELINE);
  assert.match(
    fonte,
    /from\("lead_events"\)/,
    "GET /leads/[id]/timeline precisa ler `lead_events` — é onde first-contact grava. " +
      "Sem isso a tela devolve counts.contact = 0 para lead com contato registrado.",
  );
  assert.match(
    fonte,
    /from\("activities"\)/,
    "a movimentação de funil continua vindo de `activities`; ler só uma gaveta é o defeito, nos dois sentidos",
  );
});

test("gaveta que FALHOU não vira linha do tempo curta", () => {
  const fonte = ler(...ROTA_DA_TIMELINE);
  // As duas gavetas de peso recusam explicitamente. `?? []` sobre leitura que
  // falhou é como a timeline desenhou "nunca houve contato" durante meses.
  for (const codigo of ["TIMELINE_ACTIVITIES_UNAVAILABLE", "TIMELINE_LEAD_EVENTS_UNAVAILABLE"]) {
    assert.match(fonte, new RegExp(codigo), `a recusa ${codigo} sumiu — leitura falha voltou a virar lista vazia`);
  }
  assert.match(fonte, /if \(eventResult\.error\)/, "o erro de `lead_events` precisa ser LIDO, não descartado");
});

test("mudar de etapa pela ficha passa pelo ledger — o Kanban nunca foi o único caminho", () => {
  const fonte = ler(...ROTA_DA_FICHA);
  const patch = fonte.match(/export async function PATCH[\s\S]*?\n}\n\nexport async function POST/);
  assert.ok(patch, "o PATCH da ficha sumiu — a âncora do contrato se perdeu");

  assert.match(
    patch[0],
    /rpc\("move_pipeline_lead"/,
    "o PATCH escreve `leads.status`. Sem `move_pipeline_lead`, `pipeline_stage_moves` não recebe linha nenhuma\n" +
      "e a movimentação some da auditoria do funil — foi assim que `contrato → ganho` sumiu do ledger.",
  );

  // A ordem importa: a RPC é atômica (ledger + status na mesma transação).
  // Chamá-la DEPOIS do update de campos seria mover a etapa duas vezes.
  const posicaoDaRpc = patch[0].indexOf('rpc("move_pipeline_lead"');
  const posicaoDoUpdate = patch[0].indexOf('.from("leads")\n      .update(update)');
  assert.ok(posicaoDoUpdate > 0, "o update guardado do PATCH sumiu — a âncora do contrato se perdeu");
  assert.ok(
    posicaoDaRpc < posicaoDoUpdate,
    "a RPC do ledger tem que vir ANTES do update de campos: ela já grava a etapa nova na transação dela",
  );

  // Falha desconhecida do ledger não pode degradar para "grava e segue" — seria
  // recriar o defeito por dentro do conserto.
  assert.match(
    patch[0],
    /LEAD_STAGE_LEDGER_UNAVAILABLE/,
    "ledger indisponível por erro desconhecido precisa RECUSAR; só função ausente (42883/PGRST202) degrada",
  );
});
