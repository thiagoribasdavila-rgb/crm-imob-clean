/**
 * Contrato da tabela `activities`: ela NÃO tem coluna `title`.
 *
 * Colunas reais, conferidas em produção (pozbrcsfthnhmnebfoxv) em 2026-08-02:
 *   id, lead_id, type, description, created_at, organization_id,
 *   user_id, metadata, occurred_at
 *
 * Sete escritas e duas leituras do app pediam `title`. O PostgREST devolvia
 * 42703, e TODO chamador descartava o erro — `Promise.allSettled`, `await` sem
 * olhar o retorno, `data ?? []`. Efeito medido: 481 movimentações de funil (416
 * delas descartes) invisíveis na timeline de 444 leads, e 14 qualificações de
 * IA que rodaram, custaram chamada de modelo, mexeram no `score_ia` — e não
 * deixaram uma linha de trilha.
 *
 * Existe um irmão deste contrato para o lado SQL: `migration-vazia-mente`
 * impede que uma migration reintroduza `title` no insert. Este aqui cobre o
 * lado TypeScript, que o `tsc` NÃO cobre — `getSupabaseAdmin()` devolve
 * `SupabaseClient` sem tipos gerados, então `insert({ title })` compila liso.
 * Foi exatamente essa folga que deixou o defeito nascer e envelhecer.
 *
 * LIMITE HONESTO: isto é varredura de texto. Vale porque a checagem verdadeira
 * (bater no PostgREST) não roda em CI sem credencial de produção.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");

const COLUNAS_REAIS = [
  "id",
  "lead_id",
  "type",
  "description",
  "created_at",
  "organization_id",
  "user_id",
  "metadata",
  "occurred_at",
];

function varrer(dir, arquivos = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
    const alvo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) varrer(alvo, arquivos);
    else if (/\.tsx?$/.test(entrada.name)) arquivos.push(alvo);
  }
  return arquivos;
}

const fontes = [...varrer(path.join(raiz, "app")), ...varrer(path.join(raiz, "lib"))];

test("nenhuma chamada a `activities` menciona a coluna `title`", () => {
  // `title` precedida de ponto é acesso a objeto (`property.title`,
  // `release.title`) e não tem nada a ver com a tabela. `titulo` (nosso campo
  // de entrada) também não casa com \btitle\b.
  const titleSolta = /(?<!\.)\btitle\b/;
  const culpados = [];

  for (const arquivo of fontes) {
    const linhas = fs.readFileSync(arquivo, "utf8").split("\n");
    linhas.forEach((linha, indice) => {
      if (!linha.includes('from("activities")')) return;
      if (!titleSolta.test(linha)) return;
      culpados.push(`${path.relative(raiz, arquivo)}:${indice + 1}`);
    });
  }

  assert.deepEqual(
    culpados,
    [],
    `\`activities.title\` NÃO EXISTE — o PostgREST devolve 42703 e o erro morre calado.\n` +
      `Grave a manchete em \`metadata.title\` via \`registrarAtividade\`/\`linhaDeAtividade\`\n` +
      `(lib/crm/registro-de-atividade.ts). Pontos: ${culpados.join(", ")}`,
  );
});

test("o SELECT canônico só pede coluna que existe", () => {
  const helper = fs.readFileSync(path.join(raiz, "lib", "crm", "registro-de-atividade.ts"), "utf8");
  const select = helper.match(/SELECT_DE_ATIVIDADE\s*=\s*"([^"]+)"/);
  assert.ok(select, "SELECT_DE_ATIVIDADE sumiu — a âncora do contrato se perdeu");

  for (const coluna of select[1].split(",").map((c) => c.trim())) {
    assert.ok(
      COLUNAS_REAIS.includes(coluna),
      `SELECT_DE_ATIVIDADE pede "${coluna}", que não é coluna de activities`,
    );
  }
});

test("linhaDeAtividade só emite coluna que existe", () => {
  const helper = fs.readFileSync(path.join(raiz, "lib", "crm", "registro-de-atividade.ts"), "utf8");
  const corpo = helper.match(/export function linhaDeAtividade[\s\S]*?\n}/);
  assert.ok(corpo, "linhaDeAtividade sumiu — a âncora do contrato se perdeu");

  // Chaves no nível do objeto devolvido. Aceita `nome: valor` E o atalho
  // `nome,` — ancorar só no dois-pontos faria o portão reprovar por ESTILO,
  // que é como um portão de forma vira armadilha em vez de proteção.
  const emitidas = [...corpo[0].matchAll(/^\s{4}([a-z_]+)\s*[:,]/gm)].map((m) => m[1]);
  assert.ok(emitidas.length >= 7, `esperava as 7 colunas, achei ${emitidas.length}`);

  for (const coluna of emitidas) {
    assert.ok(
      COLUNAS_REAIS.includes(coluna),
      `linhaDeAtividade grava "${coluna}", que não é coluna de activities — é 42703 na certa`,
    );
  }
});

test("a escrita CONFERE o retorno — foi a escrita muda que apagou 14 qualificações", () => {
  const helper = fs.readFileSync(path.join(raiz, "lib", "crm", "registro-de-atividade.ts"), "utf8");
  const corpo = helper.match(/export async function registrarAtividade[\s\S]*?\n}/);
  assert.ok(corpo, "registrarAtividade sumiu — a âncora do contrato se perdeu");
  assert.match(corpo[0], /const \{ error \}/, "registrarAtividade precisa LER o error do insert");
  assert.match(corpo[0], /logger\.error\(/, "falha de trilha precisa chegar ao log de erro");
});

test("a timeline RECUSA em vez de desenhar histórico vazio", () => {
  const rota = fs.readFileSync(
    path.join(raiz, "app", "api", "v1", "leads", "[id]", "timeline", "route.ts"),
    "utf8",
  );
  // O `?? []` sozinho é o que transformava 42703 em "esta lead não tem
  // histórico". Só é seguro DEPOIS de a falha virar recusa explícita.
  assert.match(
    rota,
    /if \(activityResult\.error\)[\s\S]{0,400}?status: 503/,
    "falha ao ler activities precisa virar 503 — timeline incompleta faz o corretor ligar para cliente já perdido",
  );
});
