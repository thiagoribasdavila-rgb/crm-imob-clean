/**
 * CONTRATO: a ficha da lead LÊ o `metadata` que a qualificação GRAVA.
 *
 * ── O DEFEITO QUE ISTO GUARDA ───────────────────────────────────────────────
 *
 * `POST /api/v1/leads/[id]/qualify` grava as respostas em
 * `metadata.qualificationAnswers` — e tem select próprio, com a coluna.
 * `GET /api/v1/leads/[id]` monta a ficha com `LIVE_LEAD_SELECT_WITH_SLA`, que
 * NÃO pede `metadata`. `mapLegacyLead` resolve chave ausente para `{}`, então a
 * ficha recebia `{}` sempre — sem erro, sem log, sem tela vazia.
 *
 * `assessLeadCompleteness` tira dois dos onze campos de `metadata`:
 * `prazo de compra` (peso 12) e `forma de pagamento` (peso 10). Somados, 22 de
 * 100. Medido em 02/08/2026 na base viva: 14 leads responderam AS DUAS perguntas
 * em /qualify, e a ficha continuava mandando perguntar. Nenhuma das 490 conseguia
 * passar de 78.
 *
 * É a família de defeito que este repositório mais paga — a rota que escreve e a
 * que lê escolheram fontes diferentes para o mesmo fato — e a mais difícil de
 * ver: o valor não fica errado, ele fica AUSENTE, e ausência se parece com
 * "o cliente não respondeu".
 *
 * ── POR QUE O CONTRATO TEM AS DUAS METADES ──────────────────────────────────
 *
 * A metade de COMPORTAMENTO prova que os 22 pontos dependem mesmo do metadata —
 * sem ela, a metade estrutural seria uma asserção que só verifica a si mesma.
 * A metade ESTRUTURAL guarda as duas escadas do select, que é onde a regressão
 * entraria: a degradação por 42703 troca o select INTEIRO, então uma coluna
 * esquecida na segunda escada some junto com o SLA.
 *
 * E o caso NEGATIVO existe para impedir a correção preguiçosa: quem não
 * respondeu tem de continuar valendo 78. Marcar os dois campos como completos
 * "para fechar 100" transformaria o painel de qualidade em enfeite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapLegacyLead } from "../../lib/compat/legacy-v2.ts";
import { assessLeadCompleteness } from "../../lib/ai/data-completeness.ts";

/** Uma lead com TODAS as colunas preenchidas. O que faltar vem do metadata. */
const linhaCompleta = {
  id: "lead-1",
  name: "Fulano de Tal",
  phone: "11999999999",
  purpose: "moradia",
  budget_min: 500000,
  budget_max: 800000,
  bedrooms: 2,
  preferred_regions: ["Perdizes"],
  development_id: "dev-1",
  next_action_at: "2026-08-05T12:00:00Z",
};

const notaDe = (row) => assessLeadCompleteness(mapLegacyLead(row), true);

/* ── COMPORTAMENTO ───────────────────────────────────────────────────────── */

test("lead que respondeu prazo e pagamento fecha 100 e não é interrogada de novo", () => {
  const r = notaDe({
    ...linhaCompleta,
    metadata: { qualificationAnswers: { timeline: "ate_3_meses", financing: "financiamento" } },
  });
  assert.equal(r.completeness, 100, "com tudo preenchido e as duas respostas, não falta nada");
  assert.equal(r.nextQuestion, null, "perguntar de novo o que a pessoa já respondeu queima a confiança dela");
});

test("sem o metadata, a MESMA lead completa vale 78 — é o teto que o defeito criava", () => {
  const r = notaDe(linhaCompleta);
  assert.equal(r.completeness, 78, "22 pontos (12 do prazo + 10 do pagamento) vinham do metadata");
  const incompletos = r.fields.filter((f) => !f.complete).map((f) => f.key);
  assert.deepEqual(incompletos, ["timeline", "financing"], "e são exatamente os dois que leem metadata");
});

test("quem NÃO respondeu continua valendo 78 — a correção não pode inflar a nota", () => {
  const r = notaDe({ ...linhaCompleta, metadata: { meta: { origem: "formulario_meta" } } });
  assert.equal(r.completeness, 78, "metadata presente e sem resposta é AUSÊNCIA de verdade");
  assert.match(r.nextQuestion?.question ?? "", /Quando pretende comprar/i);
});

test("as duas respostas valem 22 pontos JUNTAS, e cada uma sozinha vale a sua", () => {
  const soPrazo = notaDe({ ...linhaCompleta, metadata: { qualificationAnswers: { timeline: "ate_3_meses" } } });
  const soPagamento = notaDe({ ...linhaCompleta, metadata: { qualificationAnswers: { financing: "permuta" } } });
  assert.equal(soPrazo.completeness, 90, "78 + 12 do prazo");
  assert.equal(soPagamento.completeness, 88, "78 + 10 do pagamento");
});

/* ── ESTRUTURA: as duas escadas do select carregam a coluna ──────────────── */

const fonteDaFicha = readFileSync(new URL("../../app/api/v1/leads/[id]/route.ts", import.meta.url), "utf8");

test("as DUAS escadas do select da ficha pedem `metadata`", () => {
  for (const constante of ["COLUNAS_DA_FICHA", "COLUNAS_DA_FICHA_SEM_SLA"]) {
    const linha = fonteDaFicha
      .split("\n")
      .find((l) => l.trimStart().startsWith(`const ${constante} =`));
    assert.ok(linha, `${constante} sumiu — a ficha voltou a usar o select compartilhado`);
    assert.match(linha, /metadata/, `${constante} parou de pedir metadata: a ficha volta a receber {}`);
  }
});

test("a leitura da ficha usa as constantes locais, não o select compartilhado", () => {
  // `LIVE_LEAD_SELECT*` continua importado — as constantes são derivadas dele.
  // O que não pode voltar é `lerLead` recebendo o select compartilhado direto.
  assert.doesNotMatch(
    fonteDaFicha,
    /lerLead\(LIVE_LEAD_SELECT/,
    "voltar a ler pelo select compartilhado devolve a ficha ao metadata vazio",
  );
  assert.match(fonteDaFicha, /lerLead\(COLUNAS_DA_FICHA\)/);
  assert.match(fonteDaFicha, /lerLead\(COLUNAS_DA_FICHA_SEM_SLA\)/);
});

test("`metadata` continua FORA do select compartilhado — 20.000 leads não podem carregá-la", () => {
  const compat = readFileSync(new URL("../../lib/compat/legacy-v2.ts", import.meta.url), "utf8");
  const bloco = compat.slice(compat.indexOf("LIVE_LEAD_SELECT = ["), compat.indexOf("].join(\",\")"));
  assert.doesNotMatch(
    bloco,
    /^\s*"metadata",/m,
    "distribution e director-daily buscam até 20.000 leads; a 509 B por lead isso são ~10 MB por chamada",
  );
});
