/**
 * Contrato: FUNÇÃO DO BANCO NÃO ESCREVE EM COLUNA QUE NÃO EXISTE.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `activities-sem-title` cobre o lado TypeScript. Mas metade das escritas do
 * CRM mora em plpgsql, e o plpgsql NÃO valida o corpo na criação: uma função
 * pode inserir em `activities(title)` por um ano inteiro e só falhar na
 * primeira chamada real, com 42703, derrubando a transação inteira.
 *
 * Medido em produção (pozbrcsfthnhmnebfoxv) em 02/08/2026:
 *
 *   select type, count(*) from activities group by type;
 *   → pipeline_stage_changed | 481
 *
 * Uma única linha de `type`. `move_pipeline_lead` é a única função que já tinha
 * sido corrigida — e é a única que gravou. As outras somavam ZERO, e a razão
 * nunca foi desuso:
 *
 *   · `transfer_single_lead`  → a rota /transfer devolvia 403 "Transferência
 *     não permitida" para TODA chamada. `lead_transfer_batches` tem 1 linha, de
 *     uma redistribuição manual; transferência individual nunca criou lote.
 *   · `accept_lead_assignment` → o corretor não conseguia assumir lead (409).
 *   · `transition_commercial_proposal` → enviar/aceitar/recusar/vencer proposta,
 *     os quatro desfechos do ciclo comercial, todos abortando.
 *
 * Cada um desses respondia com uma mensagem de REGRA DE NEGÓCIO para um erro de
 * ESQUEMA — mandando a pessoa conferir permissão, etapa ou prazo. Beco: está
 * tudo certo e continua recusando.
 *
 * ── POR QUE O DETECTOR É CHAMADO, E NÃO LIDO ────────────────────────────────
 *
 * Asserção que procura a palavra `title` no fonte sobrevive à mutação (o
 * identificador continua na linha do import) e quebra no primeiro reflow. Aqui
 * o detector roda contra entradas sintéticas e os DOIS lados são exigidos: que
 * ele ACUSE a função que inventa coluna E que DEIXE PASSAR a que não inventa.
 * Detector que acusa tudo passaria num teste de vazamento e reprovaria as 170
 * migrations do repositório.
 *
 * ── A CATRACA ───────────────────────────────────────────────────────────────
 *
 * PISO zero para as RPCs que o Lead 360 chama: essas foram consertadas e provadas.
 * TETO para o resto do repositório, que SÓ DESCE. Fechar o portão em zero hoje
 * exigiria reescrever 6 funções de outras frentes numa auditoria de leitura —
 * e portão fechado com dívida escondida esconde mais do que protege.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  colunasEscritas,
  definicoesDeFuncao,
  violacoesEfetivas,
} from "../../scripts/lib/colunas-que-a-rpc-inventa.mjs";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const dirMigrations = path.join(raiz, "supabase", "migrations");

/**
 * Colunas REAIS, conferidas em produção via information_schema em 02/08/2026.
 * Só as duas tabelas onde a divergência foi MEDIDA — o detector ignora tabela
 * fora deste mapa de propósito: sobre o que ele não sabe, ele não acusa.
 */
const COLUNAS_REAIS = {
  activities: [
    "id",
    "lead_id",
    "type",
    "description",
    "created_at",
    "organization_id",
    "user_id",
    "metadata",
    "occurred_at",
  ],
  tasks: [
    "id",
    "title",
    "description",
    "status",
    "user_id",
    "lead_id",
    "created_at",
    "organization_id",
    "priority",
    "due_date",
    "recurrence_id",
    "recurrence_occurrence",
    "metadata",
  ],
};

/** As RPCs que uma rota do Lead 360 chama. Aqui o piso é ZERO. */
const RPCS_DO_LEAD_360 = [
  "accept_lead_assignment",
  "transfer_single_lead",
  "transition_commercial_proposal",
  "record_structured_qualification",
  "record_structured_visit_result",
  "record_lead_attribution_touch",
  "record_lead_behavior_event",
  "set_lead_contact_preference",
  "check_lead_contact_eligibility",
  "reset_structured_copilot_memory",
  "build_lead_prediction_explanation",
  "request_commercial_proposal_review",
  "complete_first_contact_sla",
  "complete_follow_up_sla",
  "move_pipeline_lead",
];

/**
 * Dívida do RESTO do repositório, medida em 02/08/2026. SÓ DESCE.
 * Subir este número é reintroduzir a classe de defeito que custou 481 linhas de
 * trilha e três rotas inteiras — se um conserto novo precisa dele maior, o
 * conserto está errado.
 */
const TETO_DE_DIVIDA = 13;

function migrations() {
  return fs
    .readdirSync(dirMigrations)
    .filter((nome) => nome.endsWith(".sql"))
    .sort()
    .map((arquivo) => ({ arquivo, sql: fs.readFileSync(path.join(dirMigrations, arquivo), "utf8") }));
}

test("o detector ACUSA a função que escreve em coluna inexistente", () => {
  const sintetica = [
    {
      arquivo: "sintetica.sql",
      sql: `create or replace function public.f_ruim(p uuid) returns void language plpgsql as $$
begin
  insert into public.activities(organization_id,lead_id,title,description) values(p,p,'x','y');
end $$;`,
    },
  ];
  const v = violacoesEfetivas(sintetica, COLUNAS_REAIS);
  assert.deepEqual(
    v.map((x) => `${x.funcao}:${x.tabela}.${x.coluna}`),
    ["f_ruim:activities.title"],
  );
});

test("o detector ACUSA `update tabela set coluna=` inexistente", () => {
  const sintetica = [
    {
      arquivo: "sintetica.sql",
      sql: `create or replace function public.f_update(p uuid) returns void language plpgsql as $$
begin
  update public.tasks set assigned_to=p where lead_id=p;
end $$;`,
    },
  ];
  const v = violacoesEfetivas(sintetica, COLUNAS_REAIS);
  assert.deepEqual(
    v.map((x) => `${x.funcao}:${x.tabela}.${x.coluna}:${x.forma}`),
    ["f_update:tasks.assigned_to:update"],
  );
});

test("o detector DEIXA PASSAR a função que só usa coluna real", () => {
  const sintetica = [
    {
      arquivo: "sintetica.sql",
      sql: `create or replace function public.f_boa(p uuid) returns void language plpgsql as $$
begin
  insert into public.activities(organization_id,lead_id,type,description,metadata,occurred_at)
  values(p,p,'system','texto',jsonb_build_object('title','Manchete'),now());
  update public.tasks set user_id=p where lead_id=p;
end $$;`,
    },
  ];
  assert.deepEqual(violacoesEfetivas(sintetica, COLUNAS_REAIS), []);
});

test("a definição EFETIVA é a última, não a primeira", () => {
  // Sem isto, um conserto legítimo continuaria reprovando por causa da versão
  // antiga que ele mesmo substituiu — e o portão viraria motivo para não
  // consertar nada.
  const arquivos = [
    {
      arquivo: "20260101000000_nasce_torta.sql",
      sql: `create or replace function public.f_x(p uuid) returns void language plpgsql as $$
begin insert into public.activities(organization_id,title) values(p,'x'); end $$;`,
    },
    {
      arquivo: "20260202000000_conserta.sql",
      sql: `create or replace function public.f_x(p uuid) returns void language plpgsql as $$
begin insert into public.activities(organization_id,metadata) values(p,jsonb_build_object('title','x')); end $$;`,
    },
  ];
  assert.deepEqual(violacoesEfetivas(arquivos, COLUNAS_REAIS), []);
  // e a ordem inversa continua acusando — o detector não é indiferente à ordem
  assert.equal(violacoesEfetivas([...arquivos].reverse(), COLUNAS_REAIS).length, 1);
});

test("tabela fora do mapa de colunas não é acusada", () => {
  const sintetica = [
    {
      arquivo: "sintetica.sql",
      sql: `create or replace function public.f_outra(p uuid) returns void language plpgsql as $$
begin insert into public.tabela_desconhecida(coluna_qualquer) values(p); end $$;`,
    },
  ];
  assert.deepEqual(violacoesEfetivas(sintetica, COLUNAS_REAIS), []);
});

test("o extrator enxerga insert e update no mesmo corpo", () => {
  const [def] = definicoesDeFuncao(
    `create or replace function public.f(p uuid) returns void language plpgsql as $$
begin
  insert into public.activities(organization_id,type) values(p,'system');
  update public.leads set status='novo' where id=p;
end $$;`,
  );
  const escritas = colunasEscritas(def.corpo).map((e) => `${e.tabela}.${e.coluna}:${e.forma}`);
  assert.ok(escritas.includes("activities.organization_id:insert"));
  assert.ok(escritas.includes("activities.type:insert"));
  assert.ok(escritas.includes("leads.status:update"));
});

test("NENHUMA RPC do Lead 360 escreve em coluna que não existe", () => {
  const violacoes = violacoesEfetivas(migrations(), COLUNAS_REAIS).filter((v) =>
    RPCS_DO_LEAD_360.includes(v.funcao),
  );
  assert.deepEqual(
    violacoes,
    [],
    `Rota do Lead 360 vai estourar 42703 e devolver erro de REGRA para defeito de ESQUEMA:\n` +
      violacoes
        .map((v) => `  ${v.funcao} → ${v.tabela}.${v.coluna} (${v.forma}) em ${v.arquivo}`)
        .join("\n") +
      `\nA manchete vai em metadata.title; o dono da tarefa é tasks.user_id.`,
  );
});

test("a dívida do resto do repositório não cresce", () => {
  const violacoes = violacoesEfetivas(migrations(), COLUNAS_REAIS).filter(
    (v) => !RPCS_DO_LEAD_360.includes(v.funcao),
  );
  assert.ok(
    violacoes.length <= TETO_DE_DIVIDA,
    `TETO_DE_DIVIDA é ${TETO_DE_DIVIDA} e há ${violacoes.length} violações. ` +
      `Este número só desce.\n` +
      violacoes.map((v) => `  ${v.funcao} → ${v.tabela}.${v.coluna} (${v.forma}) em ${v.arquivo}`).join("\n"),
  );
  assert.ok(
    violacoes.length >= 1,
    `A dívida chegou a ZERO — baixe TETO_DE_DIVIDA para 0 e apague este teste, ` +
      `senão o teto vira permissão para a classe voltar.`,
  );
});
