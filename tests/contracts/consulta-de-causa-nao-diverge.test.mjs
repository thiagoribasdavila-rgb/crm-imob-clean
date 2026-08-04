import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * AS DUAS CONSULTAS DA ORQUESTRAÇÃO NÃO PODEM DIVERGIR.
 *
 * ── Por que este portão existe ─────────────────────────────────────────────
 *
 * `app/api/v1/ai/orchestration/route.ts` faz a MESMA leitura duas vezes: uma
 * pedindo as colunas de causa da falha, outra sem elas, para sobreviver a um
 * banco anterior à migration `causa_da_falha_de_ia`. As listas de coluna são
 * literais duplicados porque o supabase-js só infere a forma da linha a partir
 * de uma string literal — uma variável apaga a inferência e o build acusa
 * `GenericStringError[]`.
 *
 * O risco que isso cria é específico e difícil de testar de outro jeito: quem
 * acrescentar uma coluna à consulta COM causa e esquecer a de reserva quebra a
 * tela só no ambiente sem a migration — o caminho que ninguém exercita no dia a
 * dia, e que só aparece em produção nova.
 *
 * ── Por que ler o ARQUIVO, e não executar ──────────────────────────────────
 *
 * As listas são argumentos literais dentro de uma arrow function que só existe
 * durante a consulta; não há valor exportado para importar. Este é o caso em
 * que ler o texto é a única forma de conferir — e não um atalho para não
 * executar o que dava para executar.
 */

const ORIGEM = new URL("../../app/api/v1/ai/orchestration/route.ts", import.meta.url);
const CODIGO = readFileSync(ORIGEM, "utf8");

/** As quatro colunas que a migration da causa acrescentou. */
const COLUNAS_DE_CAUSA = ["error_class", "error_code", "error_message", "who_resolves"];

function listasDeSelect() {
  const encontradas = [...CODIGO.matchAll(/\.select\('([^']+)'\)/g)].map((m) =>
    m[1].split(",").map((c) => c.trim()).filter(Boolean),
  );
  return encontradas;
}

test("a rota faz exatamente duas consultas de decisão, com e sem causa", () => {
  const listas = listasDeSelect();
  assert.equal(
    listas.length,
    2,
    `esperava 2 chamadas .select() literais na rota; encontrei ${listas.length}. ` +
      "Se a rota passou a montar o select por variável, a inferência do supabase-js " +
      "se perde e este portão deixa de proteger o par — reveja os dois lados.",
  );
});

test("a lista com causa contém as quatro colunas de causa", () => {
  const [comCausa] = listasDeSelect().sort((a, b) => b.length - a.length);
  for (const coluna of COLUNAS_DE_CAUSA) {
    assert.ok(
      comCausa.includes(coluna),
      `a consulta com causa não pede \`${coluna}\`. A causa volta a ser gravada e ` +
        "nunca lida — que é exatamente o defeito que este arquivo existe para impedir.",
    );
  }
});

test("as duas listas diferem SÓ pelas colunas de causa", () => {
  const [comCausa, semCausa] = listasDeSelect().sort((a, b) => b.length - a.length);

  const sobrandoNaCompleta = comCausa.filter(
    (c) => !semCausa.includes(c) && !COLUNAS_DE_CAUSA.includes(c),
  );
  assert.deepEqual(
    sobrandoNaCompleta,
    [],
    `estas colunas existem só na consulta COM causa: ${sobrandoNaCompleta.join(", ")}. ` +
      "No banco sem a migration a tela perderia esses campos sem nenhum aviso. " +
      "Acrescente-as também na consulta de reserva.",
  );

  const faltandoNaCompleta = semCausa.filter((c) => !comCausa.includes(c));
  assert.deepEqual(
    faltandoNaCompleta,
    [],
    `estas colunas existem só na consulta de reserva: ${faltandoNaCompleta.join(", ")}. ` +
      "O caminho normal (banco com a migration) é que ficaria sem elas.",
  );
});

test("a reserva é acionada por erro de ESQUEMA, e não por qualquer erro", () => {
  // Repetir sem as colunas diante de uma falha transitória transformaria
  // "não deu para ler" em "não há causa" — trocaria um cego por outro.
  assert.match(
    CODIGO,
    /ehErroDeEsquema\(error\)/,
    "a repetição sem as colunas de causa precisa estar condicionada a erro de esquema.",
  );
  assert.match(
    CODIGO,
    /column\|schema cache\|PGRST204/,
    "o reconhecedor de erro de esquema sumiu ou mudou de forma — confira `ehErroDeEsquema`.",
  );
});
