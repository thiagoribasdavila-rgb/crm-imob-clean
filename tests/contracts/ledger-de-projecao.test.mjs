/**
 * Contrato do LEDGER DE PROJEÇÃO.
 *
 * ── O defeito que isto fecha ────────────────────────────────────────────────
 *
 * `ai_projection_ledger` existia no banco canônico com ZERO linhas e ZERO
 * chamadores (medido em 2026-07-30: nenhum arquivo do repositório escrevia nela,
 * nenhum lia). O simulador projetava "+X leads/semana", a decisão era tomada, a
 * semana passava — e a comparação nunca acontecia.
 *
 * O sintoma não é um número errado. É a IA errando para mais indefinidamente com
 * a MESMA confiança, porque não existe o mecanismo que a corrigiria.
 *
 * Este contrato EXECUTA as funções do ledger e prova os dois lados: a linha
 * fecha, e a linha já fechada NÃO reabre.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  semanaIso,
  linhaDeProjecao,
  fecharComRealizado,
  comparacaoDoLedger,
} from "../../lib/ai/ledger-de-projecao.ts";

const projecao = (over = {}) => ({
  moveKind: "aumentar_verba",
  target: "Arvo",
  weeklyLeadsDelta: { pessimista: 8, esperado: 10, otimista: 12 },
  confidence: "media",
  basis: { measured: true, sample: 40, minimumSample: 20 },
  ...over,
});

/* ── A SEMANA ISO ──────────────────────────────────────────────────────── */

test("semanaIso devolve a chave que a coluna decided_at_week espera", () => {
  // 2026-01-01 é uma quinta-feira: pertence à semana 1 de 2026.
  assert.equal(semanaIso(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  // 2026-07-30 (a data da medição) cai na semana 31.
  assert.equal(semanaIso(new Date("2026-07-30T00:00:00Z")), "2026-W31");
  // Domingo pertence à semana que TERMINA nele, não à seguinte — o erro clássico
  // de quem usa getUTCDay() cru, em que domingo vale 0.
  assert.equal(semanaIso(new Date("2026-01-04T00:00:00Z")), "2026-W01");
  assert.equal(semanaIso(new Date("2026-01-05T00:00:00Z")), "2026-W02");
  // Todo resultado casa o formato aceito pelas funções de gravação.
  for (const dia of ["2026-02-15", "2026-12-31", "2027-01-03"]) {
    assert.match(semanaIso(new Date(`${dia}T00:00:00Z`)), /^\d{4}-W\d{2}$/);
  }
});

/* ── A GRAVAÇÃO NA DECISÃO ─────────────────────────────────────────────── */

test("LADO A: a projeção vira linha com as colunas vivas da tabela", () => {
  const linha = linhaDeProjecao("org-1", projecao(), "2026-W31");
  assert.ok(linha, "a projeção válida tem de virar linha");
  assert.deepEqual(Object.keys(linha).sort(), [
    "confidence_at_decision",
    "decided_at_week",
    "move_kind",
    "organization_id",
    "projected",
    "realized_at_week",
    "realized_leads_delta",
    "target",
  ]);
  assert.equal(linha.organization_id, "org-1");
  assert.equal(linha.decided_at_week, "2026-W31");
  assert.equal(linha.confidence_at_decision, "media");
  assert.equal(linha.projected.esperado, 10);
  // Nasce ABERTA: o realizado só existe uma semana depois.
  assert.equal(linha.realized_leads_delta, null);
  assert.equal(linha.realized_at_week, null);
});

test("o lastro viaja dentro de projected — e a ausência dele também", () => {
  const comLastro = linhaDeProjecao("org-1", projecao(), "2026-W31");
  assert.equal(comLastro.projected.basis.measured, true);
  assert.equal(comLastro.projected.basis.sample, 40);
  // Sem basis, o campo é null EXPLÍCITO. Omitir deixaria a projeção sem amostra
  // indistinguível de uma com 200 observações na hora de calcular o viés.
  const semLastro = linhaDeProjecao("org-1", projecao({ basis: undefined }), "2026-W31");
  assert.equal(semLastro.projected.basis, null);
});

test("LADO B: projeção malformada NÃO vira linha", () => {
  const casos = [
    ["sem organização", () => linhaDeProjecao("", projecao(), "2026-W31")],
    ["sem tipo de movimento", () => linhaDeProjecao("org-1", projecao({ moveKind: "  " }), "2026-W31")],
    ["sem alvo", () => linhaDeProjecao("org-1", projecao({ target: "" }), "2026-W31")],
    [
      "faixa não numérica",
      () =>
        linhaDeProjecao(
          "org-1",
          projecao({ weeklyLeadsDelta: { pessimista: 1, esperado: NaN, otimista: 3 } }),
          "2026-W31",
        ),
    ],
    ["faixa ausente", () => linhaDeProjecao("org-1", projecao({ weeklyLeadsDelta: null }), "2026-W31")],
    ["semana fora do formato", () => linhaDeProjecao("org-1", projecao(), "julho")],
  ];
  for (const [nome, executa] of casos) {
    assert.equal(executa(), null, `${nome} deveria devolver null, não uma linha meia-boca`);
  }
});

/* ── O FECHAMENTO COM O REALIZADO ──────────────────────────────────────── */

test("LADO A: a linha aberta fecha e produz veredito", () => {
  const linha = linhaDeProjecao("org-1", projecao(), "2026-W31");
  const fechamento = fecharComRealizado(linha, 10, "2026-W32");
  assert.ok(fechamento, "linha aberta tem de fechar");
  assert.deepEqual(fechamento.patch, {
    realized_leads_delta: 10,
    realized_at_week: "2026-W32",
  });
  assert.equal(fechamento.desfecho.projectedEsperado, 10);
  assert.equal(fechamento.desfecho.realized, 10);
  assert.equal(fechamento.desfecho.withinBand, true);
  assert.equal(fechamento.desfecho.verdict, "calibrado");
  assert.equal(fechamento.desfecho.errorPct, 0);
});

test("LADO B: a linha JÁ fechada não reabre", () => {
  const linha = linhaDeProjecao("org-1", projecao(), "2026-W31");
  const fechada = { ...linha, realized_leads_delta: 10, realized_at_week: "2026-W32" };
  assert.equal(
    fecharComRealizado(fechada, 3, "2026-W33"),
    null,
    "reabrir sobrescreveria um desfecho auditado sem deixar rastro",
  );
  // Meio-fechada também é recusada: uma coluna preenchida já é sinal de que
  // alguém escreveu ali.
  assert.equal(fecharComRealizado({ ...linha, realized_at_week: "2026-W32" }, 3, "2026-W33"), null);
  assert.equal(fecharComRealizado({ ...linha, realized_leads_delta: 10 }, 3, "2026-W33"), null);
});

test("realizado inválido não fecha", () => {
  const linha = linhaDeProjecao("org-1", projecao(), "2026-W31");
  assert.equal(fecharComRealizado(linha, NaN, "2026-W32"), null);
  assert.equal(fecharComRealizado(linha, 10, "semana que vem"), null);
});

test("o veredito distingue otimista demais de pessimista demais", () => {
  const linha = linhaDeProjecao("org-1", projecao(), "2026-W31");
  // Projetou 10 (faixa 8–12), veio 4: a IA prometeu mais do que entregou.
  const otimista = fecharComRealizado(linha, 4, "2026-W32");
  assert.equal(otimista.desfecho.verdict, "otimista_demais");
  assert.equal(otimista.desfecho.withinBand, false);
  assert.ok(otimista.desfecho.errorPct > 0, "erro assinado positivo = projetou mais do que veio");
  // Projetou 10, veio 25: errou para menos.
  const pessimista = fecharComRealizado(linha, 25, "2026-W32");
  assert.equal(pessimista.desfecho.verdict, "pessimista_demais");
  assert.ok(pessimista.desfecho.errorPct < 0);
  // Dentro da faixa, mesmo fora do esperado exato, é calibrado.
  assert.equal(fecharComRealizado(linha, 12, "2026-W32").desfecho.verdict, "calibrado");
  assert.equal(fecharComRealizado(linha, 8, "2026-W32").desfecho.verdict, "calibrado");
});

/* ── A COMPARAÇÃO EXPOSTA ──────────────────────────────────────────────── */

const fechada = (over = {}) => {
  const linha = linhaDeProjecao("org-1", projecao(over.projecao ?? {}), over.semana ?? "2026-W31");
  return { ...linha, realized_leads_delta: over.realizado ?? 10, realized_at_week: "2026-W32" };
};

test("a comparação separa fechadas de abertas", () => {
  const aberta = linhaDeProjecao("org-1", projecao(), "2026-W31");
  const comparacao = comparacaoDoLedger([aberta, fechada(), fechada({ semana: "2026-W30" })]);
  assert.equal(comparacao.abertas, 1);
  assert.equal(comparacao.fechadas, 2);
  assert.equal(comparacao.desfechos.length, 2);
});

test("ledger vazio não inventa aprendizado", () => {
  const comparacao = comparacaoDoLedger([]);
  assert.equal(comparacao.fechadas, 0);
  assert.equal(comparacao.abertas, 0);
  assert.deepEqual(comparacao.confiancaPorMovimento, []);
  assert.equal(comparacao.resumo.length, 1);
  assert.ok(comparacao.resumo[0].includes("Ainda sem histórico"));
});

test("só a linha COM lastro medido entra na confiança", () => {
  // Quatro linhas fechadas, todas acertando: com lastro, a confiança sobe.
  const comLastro = [0, 1, 2, 3].map((i) => fechada({ semana: `2026-W2${i}` }));
  const forte = comparacaoDoLedger(comLastro);
  assert.equal(forte.fechadas, 4);
  assert.equal(forte.fechadasComLastro, 4);
  assert.equal(forte.confiancaPorMovimento.length, 1);
  assert.equal(forte.confiancaPorMovimento[0].samples, 4);
  assert.equal(forte.confiancaPorMovimento[0].recommendedConfidence, "alta");

  // As MESMAS quatro linhas, agora sem lastro declarado: continuam contadas como
  // fechadas, mas não sustentam confiança nenhuma. Projeção sem amostra que por
  // sorte acertou não é evidência de calibração.
  const semLastro = [0, 1, 2, 3].map((i) =>
    fechada({ semana: `2026-W2${i}`, projecao: { basis: undefined } }),
  );
  const fraca = comparacaoDoLedger(semLastro);
  assert.equal(fraca.fechadas, 4);
  assert.equal(fraca.fechadasComLastro, 0);
  assert.deepEqual(fraca.confiancaPorMovimento, []);
  assert.ok(fraca.resumo[0].includes("Ainda sem histórico"));
});

test("lastro declarado NÃO medido também é descartado da confiança", () => {
  const naoMedido = [0, 1, 2, 3].map((i) =>
    fechada({
      semana: `2026-W2${i}`,
      projecao: { basis: { measured: false, sample: 0, minimumSample: 20, reason: "sem amostra" } },
    }),
  );
  const comparacao = comparacaoDoLedger(naoMedido);
  assert.equal(comparacao.fechadas, 4);
  assert.equal(comparacao.fechadasComLastro, 0);
  assert.deepEqual(comparacao.confiancaPorMovimento, []);
});

test("viés otimista consistente encolhe a projeção futura", () => {
  // Quatro decisões que projetaram 10 e entregaram 5: viés +50%.
  const linhas = [0, 1, 2, 3].map((i) => fechada({ semana: `2026-W2${i}`, realizado: 5 }));
  const comparacao = comparacaoDoLedger(linhas);
  const confianca = comparacao.confiancaPorMovimento[0];
  assert.equal(confianca.samples, 4);
  assert.equal(confianca.hitRate, 0);
  assert.equal(confianca.meanBiasPct, 50);
  assert.ok(
    confianca.correctionFactor < 1,
    "quem promete mais do que entrega tem de ver a projeção futura encolher",
  );
  assert.equal(confianca.recommendedConfidence, "baixa");
  assert.ok(comparacao.resumo[0].includes("otimista"));
});
