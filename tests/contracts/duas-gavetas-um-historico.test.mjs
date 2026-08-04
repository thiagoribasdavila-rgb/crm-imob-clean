/**
 * CONTRATO: o histórico de uma lead é lido num lugar só.
 *
 * ── O DEFEITO QUE ISTO GUARDA ───────────────────────────────────────────────
 *
 * O mesmo fato — "aconteceu alguma coisa com este cliente" — mora em três
 * tabelas, e cada leitor abria uma. Medido no banco vivo (pozbrcsfthnhmnebfoxv)
 * em 2026-08-02:
 *
 *   pipeline_stage_moves ..... 478 linhas · 444 leads
 *   activities ............... 481 linhas · 444 leads · TODAS com metadata.moveId
 *   lead_events .............. 109 linhas ·  42 leads · 39 call + 16 whatsapp
 *
 *   GET /api/v1/leads/[id] .... lia SÓ lead_events
 *   POST .../qualify .......... contava SÓ activities
 *
 * Efeito medido, rodando as funções REAIS do produto sobre as 490 leads:
 *
 *   fichas dizendo "Ainda não há interação registrada com este cliente"
 *      ANTES 447 · DEPOIS 32
 *   campo "interação registrada" incompleto na nota de completude
 *      ANTES 447 · DEPOIS 32
 *   pontuação de qualificação: 25 leads sobem, 0 caem
 *   lead b2432542: activityCount 1 → 9, score 37 → 41, e a frase de engajamento
 *      sai de "1 interação(ões) registrada(s)" para "9"
 *
 * O valor não ficava errado. Ficava AUSENTE — e ausência se parece com "o
 * cliente não respondeu".
 *
 * ── POR QUE O ESPELHO NÃO PODE ENTRAR NA CONTA ──────────────────────────────
 *
 * `move_pipeline_lead` grava, na MESMA transação, a linha canônica em
 * `pipeline_stage_moves` E uma cópia em `activities` com `metadata.moveId`
 * apontando para ela. A linha do tempo da ficha já desenha a movimentação a
 * partir da canônica. Somar o espelho às interações faria cada mudança de etapa
 * aparecer duas vezes na tela e o contador "N interações" contar movimentação.
 * Trocar "falta metade" por "conta duas vezes" não é conserto — por isso metade
 * deste contrato guarda o corte, não a união.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CHAVE_DO_ESPELHO,
  SELECT_DE_ATIVIDADE_NO_HISTORICO,
  SELECT_DE_EVENTO_DE_LEAD,
  SELECT_DE_MOVIMENTO_DO_LEDGER,
  ehEspelhoDoLedger,
  fraseDoMovimento,
  lerHistoricoDoLead,
  normalizarMovimento,
  tituloDaAtividade,
  ultimoFatoDoHistorico,
  unirInteracoes,
} from "../../lib/crm/historico-do-lead.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...partes) => fs.readFileSync(path.join(raiz, ...partes), "utf8");

/** Colunas REAIS, conferidas em produção em 2026-08-02 via information_schema. */
const COLUNAS = {
  activities: ["id", "lead_id", "type", "description", "created_at", "organization_id", "user_id", "metadata", "occurred_at"],
  lead_events: ["id", "lead_id", "event_type", "metadata", "created_at", "organization_id", "type", "description", "created_by"],
  pipeline_stage_moves: ["id", "organization_id", "lead_id", "actor_id", "from_stage", "to_stage", "reason", "reversal_of", "occurred_at", "discard_reason_key", "discard_notes"],
};

/* ── COMPORTAMENTO: a união ───────────────────────────────────────────────── */

test("as duas gavetas de interação entram na mesma lista, em ordem decrescente", () => {
  const itens = unirInteracoes(
    [{ id: "a1", type: "ai_qualification", description: "Recalibrada", metadata: {}, occurred_at: "2026-08-01T10:00:00Z" }],
    [{ id: "e1", event_type: "call", description: "Ligação atendida", metadata: { title: "Novo contato registrado" }, created_by: "u1", created_at: "2026-08-02T10:00:00Z" }],
  );
  assert.deepEqual(itens.map((i) => i.id), ["e1", "a1"], "o mais recente primeiro, venha da gaveta que vier");
  assert.deepEqual(itens.map((i) => i.fonte), ["lead_events", "activities"]);
  assert.equal(itens[0].user_id, "u1", "`created_by` de lead_events é o autor da linha");
  assert.equal(itens[0].title, "Novo contato registrado");
  assert.equal(itens[1].title, "Qualificação recalibrada pela IA", "sem metadata.title, vale o rótulo do tipo");
});

test("interação de `activities` NÃO some — era ela que a ficha nunca abria", () => {
  // Zero linhas assim existiam em 02/08/2026 porque as sete escritas morriam
  // caladas no 42703 de `title`. Consertadas hoje, elas passam a cair aqui — e
  // sem este caso a ficha as ignoraria de novo, sem ninguém notar.
  const itens = unirInteracoes(
    [{ id: "a1", type: "whatsapp_insight", description: "IA leu a conversa", metadata: {}, occurred_at: "2026-08-02T09:00:00Z" }],
    [],
  );
  assert.equal(itens.length, 1);
  assert.equal(itens[0].fonte, "activities");
});

/* ── COMPORTAMENTO: o corte do espelho ────────────────────────────────────── */

test("o espelho do ledger fica FORA das interações — o fato é um só", () => {
  const espelho = {
    id: "a-espelho",
    type: "pipeline_stage_changed",
    description: "Etapa alterada: novo → perdido",
    metadata: { [CHAVE_DO_ESPELHO]: "11111111-1111-1111-1111-111111111111", fromStage: "novo", toStage: "perdido" },
    occurred_at: "2026-08-02T12:00:00Z",
  };
  assert.equal(ehEspelhoDoLedger(espelho), true, "o ponteiro `moveId` é o que marca a cópia");
  assert.deepEqual(unirInteracoes([espelho], []), [], "a movimentação vem da canônica, não daqui");
});

test("o corte é pelo PONTEIRO, não pelo nome do tipo", () => {
  // `pipeline_stage_changed` também nasce em `lead_events` pelo caminho
  // compensatório de `app/api/v1/pipeline/route.ts` — e ali NÃO existe linha no
  // ledger para pareá-la. Cortar por tipo apagaria esse fato do histórico.
  const compensatorio = {
    id: "e-compensatorio",
    event_type: "pipeline_stage_changed",
    description: "novo → contato",
    metadata: { title: "Etapa comercial atualizada" },
    created_at: "2026-08-02T12:00:00Z",
  };
  assert.equal(ehEspelhoDoLedger(compensatorio), false, "sem `moveId` não há linha canônica para duplicar");
  assert.equal(unirInteracoes([], [compensatorio]).length, 1);

  const semPonteiro = { id: "a2", type: "pipeline_stage_changed", metadata: {}, occurred_at: "2026-08-02T12:00:00Z" };
  assert.equal(unirInteracoes([semPonteiro], []).length, 1, "tipo de movimentação sem ponteiro continua sendo história");
});

/* ── COMPORTAMENTO: a frase que a ficha mostra ────────────────────────────── */

test("sem interação, o fato mais recente é a movimentação — e ela tem frase", () => {
  const movimentos = [normalizarMovimento({ id: "m1", from_stage: "novo", to_stage: "perdido", reason: "Sem resposta após tentativas", occurred_at: "2026-08-01T15:00:00Z" })];
  const fato = ultimoFatoDoHistorico([], movimentos);
  assert.equal(fato.quando, "2026-08-01T15:00:00Z");
  assert.equal(fato.resumo, "Etapa alterada: novo → perdido · Sem resposta após tentativas");
  assert.equal(fraseDoMovimento({ from_stage: "novo", to_stage: "contato" }), "Etapa alterada: novo → contato");
});

test("interação mais nova vence a movimentação mais velha, e vice-versa", () => {
  const interacao = unirInteracoes([], [{ id: "e1", event_type: "call", description: "Cliente atendeu", metadata: {}, created_at: "2026-08-02T10:00:00Z" }]);
  const velho = [normalizarMovimento({ id: "m1", from_stage: "novo", to_stage: "contato", occurred_at: "2026-07-30T10:00:00Z" })];
  const novo = [normalizarMovimento({ id: "m2", from_stage: "contato", to_stage: "perdido", occurred_at: "2026-08-03T10:00:00Z" })];
  assert.equal(ultimoFatoDoHistorico(interacao, velho).resumo, "Cliente atendeu");
  assert.equal(ultimoFatoDoHistorico(interacao, novo).resumo, "Etapa alterada: contato → perdido");
});

test("lead sem NADA continua sem fato — a correção não pode inventar história", () => {
  // As 32 leads que sobraram em 02/08/2026 não têm linha em gaveta nenhuma.
  // Para elas a ficha deve continuar dizendo "Ainda não há interação
  // registrada": encher a frase com qualquer coisa seria trocar um silêncio
  // honesto por uma afirmação falsa.
  assert.equal(ultimoFatoDoHistorico([], []), null);
});

test("título sem metadata.title cai no rótulo do tipo, nunca em branco", () => {
  assert.equal(tituloDaAtividade({ type: "lead_assigned", metadata: {} }), "Lead distribuída");
  assert.equal(tituloDaAtividade({ type: "tipo_inventado", metadata: {} }), "tipo inventado");
  assert.equal(tituloDaAtividade({ metadata: {} }), "Atividade registrada");
  assert.equal(tituloDaAtividade({ type: "call", metadata: { title: "  Primeiro contato  " } }), "Primeiro contato");
});

/* ── COMPORTAMENTO: a leitura inteira, sem banco ──────────────────────────── */

const ESPELHO = { id: "a-espelho", type: "pipeline_stage_changed", description: "Etapa alterada: novo → perdido", metadata: { [CHAVE_DO_ESPELHO]: "m1" }, occurred_at: "2026-08-01T15:00:00Z" };
const TRILHA = { id: "a-ia", type: "ai_qualification", description: "Qualificação recalibrada: 62/100", metadata: {}, occurred_at: "2026-08-02T08:00:00Z" };
const CONTATO = { id: "e-call", event_type: "call", description: "Cliente atendeu", metadata: { title: "Novo contato registrado" }, created_by: "u1", created_at: "2026-08-02T09:00:00Z" };
const MOVIMENTO = { id: "m1", from_stage: "novo", to_stage: "perdido", reason: null, occurred_at: "2026-08-01T15:00:00Z" };

/**
 * Banco de mentira com a MESMA forma que o supabase-js expõe: a cadeia termina
 * sempre em `.limit()`, e é ela que devolve a promessa.
 */
function bancoDeMentira({ recusaCorteNoBanco = false, quebra = null } = {}) {
  const linhasPor = { activities: [ESPELHO, TRILHA], lead_events: [CONTATO], pipeline_stage_moves: [MOVIMENTO] };
  return {
    from(tabela) {
      const estado = { cortou: false };
      const construtor = {
        select: () => construtor,
        is: (coluna) => { if (String(coluna).includes(CHAVE_DO_ESPELHO)) estado.cortou = true; return construtor; },
        eq: () => construtor,
        order: () => construtor,
        limit: () => {
          if (quebra === tabela) return Promise.resolve({ data: null, error: { code: "42P01", message: "relation does not exist" }, count: null });
          if (tabela === "activities" && estado.cortou && recusaCorteNoBanco) {
            return Promise.resolve({ data: null, error: { code: "42883", message: "operator does not exist" }, count: null });
          }
          const linhas = tabela === "activities" && estado.cortou
            ? linhasPor[tabela].filter((l) => !ehEspelhoDoLedger(l))
            : linhasPor[tabela];
          return Promise.resolve({ data: linhas, error: null, count: linhas.length });
        },
      };
      return construtor;
    },
  };
}

test("a leitura devolve UMA resposta com as três gavetas somadas uma vez só", async () => {
  const h = await lerHistoricoDoLead(bancoDeMentira(), { organizationId: "org", leadId: "lead" });
  assert.deepEqual(h.interacoes.map((i) => i.id), ["e-call", "a-ia"], "o espelho não é interação");
  assert.equal(h.interacoesTotal, 2);
  assert.equal(h.movimentosTotal, 1);
  assert.equal(h.total, 3, "3 fatos: contato, qualificação e a movimentação — a movimentação UMA vez");
  assert.equal(h.ultimoFato.resumo, "Cliente atendeu");
  assert.deepEqual(h.mensuravel, { eventos: true, atividades: true, movimentos: true });
  assert.deepEqual(h.falhas, []);
});

test("banco que recusa o corte no banco NÃO custa a trilha — o corte é refeito em memória", async () => {
  const h = await lerHistoricoDoLead(bancoDeMentira({ recusaCorteNoBanco: true }), { organizationId: "org", leadId: "lead" });
  assert.deepEqual(h.interacoes.map((i) => i.id), ["e-call", "a-ia"], "a qualificação de IA continua na lista");
  assert.equal(h.total, 3, "e o espelho continua contando UMA vez, pelo ledger");
  assert.equal(h.mensuravel.atividades, true, "houve resposta: o que falhou foi o filtro, não a gaveta");
  assert.equal(h.falhas.length, 1);
  assert.match(h.falhas[0].message, /refeito em memória/, "a volta precisa ficar registrada, não ser invisível");
});

test("gaveta ilegível vira `mensuravel: false` com motivo — nunca um zero calado", async () => {
  const h = await lerHistoricoDoLead(bancoDeMentira({ quebra: "pipeline_stage_moves" }), { organizationId: "org", leadId: "lead" });
  assert.equal(h.mensuravel.movimentos, false);
  assert.equal(h.movimentosTotal, 0);
  assert.equal(h.total, 2, "o que deu para ler continua contando");
  assert.deepEqual(h.falhas.map((f) => [f.fonte, f.code]), [["pipeline_stage_moves", "42P01"]], "o chamador precisa do motivo para logar");
});

/* ── ESTRUTURA: os selects só pedem coluna que EXISTE ─────────────────────── */

test("os três selects do histórico só pedem coluna real", () => {
  const conferir = (tabela, select) => {
    for (const coluna of select.split(",").map((c) => c.trim())) {
      assert.ok(COLUNAS[tabela].includes(coluna), `${tabela} não tem a coluna "${coluna}" — é 42703, e o 42703 desta família morre calado`);
    }
  };
  conferir("activities", SELECT_DE_ATIVIDADE_NO_HISTORICO);
  conferir("lead_events", SELECT_DE_EVENTO_DE_LEAD);
  conferir("pipeline_stage_moves", SELECT_DE_MOVIMENTO_DO_LEDGER);
  assert.ok(
    !SELECT_DE_MOVIMENTO_DO_LEDGER.split(",").includes("created_at"),
    "`pipeline_stage_moves` não tem `created_at`: pedi-la faz a leitura falhar e a movimentação sumir",
  );
});

test("o select de activities do histórico é IDÊNTICO ao canônico de registro-de-atividade", () => {
  // Não dá para importar de lá (aquele módulo usa `@/` e some do `node --test`),
  // então a igualdade vira contrato: duas strings de colunas que podem divergir
  // são, literalmente, duas verdades sobre a mesma tabela.
  const helper = ler("lib", "crm", "registro-de-atividade.ts");
  const canonico = helper.match(/SELECT_DE_ATIVIDADE\s*=\s*"([^"]+)"/);
  assert.ok(canonico, "SELECT_DE_ATIVIDADE sumiu de registro-de-atividade.ts");
  assert.equal(SELECT_DE_ATIVIDADE_NO_HISTORICO, canonico[1]);
});

/* ── ESTRUTURA: os dois leitores usam o MESMO módulo ──────────────────────── */

test("a ficha não lê `lead_events` na mão — ela chama o módulo do histórico", () => {
  const ficha = ler("app", "api", "v1", "leads", "[id]", "route.ts");
  const leituraDireta = ficha
    .split("\n")
    .map((linha, i) => [i + 1, linha])
    .filter(([, linha]) => /\.from\("lead_events"\)/.test(linha));
  assert.deepEqual(
    leituraDireta.map(([i]) => i),
    [],
    "ler uma gaveta direto aqui é como as 415 fichas passaram a dizer que não havia interação",
  );
  assert.match(ficha, /lerHistoricoDoLead\(admin, \{/);
  assert.match(ficha, /historico\.total > 0/, "a nota de completude pergunta se há HISTÓRIA, não se há lead_event");
  assert.match(ficha, /historico\.ultimoFato\?\.resumo/, "a frase do briefing vem do fato mais recente de qualquer gaveta");
});

test("a pontuação não conta `activities` na mão — ela usa o mesmo total", () => {
  const qualify = ler("app", "api", "v1", "leads", "[id]", "qualify", "route.ts");
  assert.doesNotMatch(
    qualify,
    /from\("activities"\)\s*\.select\([^)]*count/,
    "contar só o espelho da movimentação é o que deixava 56 contatos reais fora do engajamento",
  );
  assert.match(qualify, /activityCount: historico\.total/);
});

test("quem falha ao ler uma gaveta LOGA — total menor não pode virar silêncio", () => {
  for (const rota of [["app", "api", "v1", "leads", "[id]", "route.ts"], ["app", "api", "v1", "leads", "[id]", "qualify", "route.ts"]]) {
    assert.match(ler(...rota), /historico\.falhas[\s\S]{0,200}?logger\.warn\(/, `${rota.join("/")} precisa registrar a gaveta ilegível`);
  }
});
