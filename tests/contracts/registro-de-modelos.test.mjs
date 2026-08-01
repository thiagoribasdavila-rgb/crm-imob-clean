/**
 * Contrato do REGISTRO DE MODELOS.
 *
 * ── O defeito que isto impede ───────────────────────────────────────────────
 *
 * "Probabilidade de conversão: 78%" é uma frase que o corretor acredita. Se ela
 * sai de um modelo sem baseline, é um chute com vocabulário estatístico — e o
 * corretor não tem como saber a diferença.
 *
 * Medido no banco canônico em 2026-07-30: UM desfecho de ganho, ZERO de perda,
 * ZERO venda com valor apurado. Nessas condições nenhum modelo estatístico pode
 * responder, e o que impede é a função de admissão.
 *
 * Este contrato EXECUTA a função — não procura palavras no arquivo. É proposital:
 * asserção que casa texto sobrevive ao código morto, e este repositório já se
 * queimou com isso três vezes numa única rodada de mutação.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  REGISTRO_DE_MODELOS,
  MINIMO_DE_EXEMPLOS,
  MINIMO_DE_POSITIVOS,
  MINIMO_DE_NEGATIVOS,
  admitirEmProducao,
  estadoDoRegistro,
  estadoDeDrift,
  desligarModelo,
  modeloRegistrado,
} from "../../lib/ai/registro-de-modelos.ts";

/** Modelo estatístico COMPLETO, com baseline acima de todos os pisos. */
const estatisticoValido = () => ({
  id: "teste_estatistico",
  nome: "Teste",
  pergunta: "?",
  natureza: "estatistica",
  versao: "v1",
  dataset: "leads + desfechos",
  baseline: {
    origem: "desfechos apurados",
    exemplos: MINIMO_DE_EXEMPLOS,
    positivos: MINIMO_DE_POSITIVOS,
    negativos: MINIMO_DE_NEGATIVOS,
    metrica: "taxa base",
    valor: 12.5,
    apuradoEm: "2026-07-01",
  },
  aritmetica: null,
  metricas: ["Brier"],
  explicabilidade: "fatores por lead",
  driftMonitorado: "PSI + delta de Brier",
  revisaoEm: "2026-12-01",
  limiteDeUso: "priorização apenas",
  fallback: "score declarado",
  ativo: true,
  medidoEm: "2026-07-30",
});

/** Modelo aritmético COMPLETO, com insumo medido e não vazio. */
const aritmeticoValido = () => ({
  id: "teste_aritmetico",
  nome: "Teste",
  pergunta: "?",
  natureza: "aritmetica",
  versao: "conta-v1",
  dataset: "leads.assigned_to",
  baseline: null,
  aritmetica: { formula: "a ÷ b", insumos: ["leads.assigned_to"], linhasMedidas: 10 },
  metricas: ["conferência à mão"],
  explicabilidade: "a contagem é a explicação",
  driftMonitorado: null,
  revisaoEm: "2026-12-01",
  limiteDeUso: "diagnóstico apenas",
  fallback: "não há",
  ativo: true,
  medidoEm: "2026-07-30",
});

/* ── OS DOIS LADOS DA REGRA CENTRAL ─────────────────────────────────────── */

test("LADO A: modelo estatístico COM baseline suficiente é admitido", () => {
  const veredito = admitirEmProducao(estatisticoValido());
  assert.equal(veredito.admitido, true, `recusado por: ${veredito.motivos.join("; ")}`);
  assert.deepEqual(veredito.motivos, []);
});

test("LADO B: modelo estatístico SEM baseline é RECUSADO", () => {
  const semBaseline = { ...estatisticoValido(), baseline: null };
  const veredito = admitirEmProducao(semBaseline);
  assert.equal(veredito.admitido, false, "modelo sem baseline não pode entrar em produção");
  assert.ok(
    veredito.motivos.some((m) => m.includes("sem baseline")),
    `o motivo tem de nomear a ausência de baseline; veio: ${veredito.motivos.join("; ")}`,
  );
});

test("baseline SEM valor apurado é recusado, mesmo com contagem alta", () => {
  // O caso perverso: alguém preenche exemplos/positivos/negativos mas nunca
  // apurou a métrica. Sem `valor`, não existe número contra o qual comparar.
  const semValor = estatisticoValido();
  semValor.baseline = { ...semValor.baseline, valor: null, apuradoEm: null };
  const veredito = admitirEmProducao(semValor);
  assert.equal(veredito.admitido, false);
  assert.ok(veredito.motivos.some((m) => m.includes("sem valor apurado")));
});

test("os pisos são os MESMOS números da RPC viva, em literal", () => {
  // Sem esta asserção literal, a mutação que baixa MINIMO_DE_EXEMPLOS de 100
  // para 1 SOBREVIVE — foi medido: o teste de piso abaixo importa a constante e
  // compara contra ela mesma, então acompanha qualquer valor. Tautologia.
  //
  // O literal não é preferência de estilo: é o valor que a RPC
  // `build_conversion_calibration_candidate` aplica no banco
  // (`examples>=100 and positives>=20 and negatives>=20`, migration da Fase 77).
  // Duas verdades sobre "elegível" é um defeito que este repositório já pagou.
  assert.equal(MINIMO_DE_EXEMPLOS, 100);
  assert.equal(MINIMO_DE_POSITIVOS, 20);
  assert.equal(MINIMO_DE_NEGATIVOS, 20);

  // E o comportamento, em números absolutos — independente das constantes.
  const com99 = estatisticoValido();
  com99.baseline = { ...com99.baseline, exemplos: 99, positivos: 50, negativos: 49 };
  assert.equal(admitirEmProducao(com99).admitido, false, "99 exemplos não podem passar");
  const com19 = estatisticoValido();
  com19.baseline = { ...com19.baseline, exemplos: 500, positivos: 19, negativos: 481 };
  assert.equal(admitirEmProducao(com19).admitido, false, "19 positivos não podem passar");
  const com19neg = estatisticoValido();
  com19neg.baseline = { ...com19neg.baseline, exemplos: 500, positivos: 481, negativos: 19 };
  assert.equal(admitirEmProducao(com19neg).admitido, false, "19 negativos não podem passar");
});

test("cada piso de amostra recusa por conta própria", () => {
  for (const [campo, piso] of [
    ["exemplos", MINIMO_DE_EXEMPLOS],
    ["positivos", MINIMO_DE_POSITIVOS],
    ["negativos", MINIMO_DE_NEGATIVOS],
  ]) {
    const abaixo = estatisticoValido();
    abaixo.baseline = { ...abaixo.baseline, [campo]: piso - 1 };
    const veredito = admitirEmProducao(abaixo);
    assert.equal(veredito.admitido, false, `${campo} = ${piso - 1} deveria recusar`);
    assert.ok(
      veredito.motivos.some((m) => m.includes(String(piso))),
      `o motivo de ${campo} tem de citar o piso ${piso}; veio: ${veredito.motivos.join("; ")}`,
    );
    // E exatamente no piso, passa — senão o limite estaria deslocado em um.
    const noPiso = estatisticoValido();
    noPiso.baseline = { ...noPiso.baseline, [campo]: piso };
    assert.equal(admitirEmProducao(noPiso).admitido, true, `${campo} = ${piso} deveria passar`);
  }
});

test("estatístico com baseline mas SEM monitor de drift é recusado", () => {
  const semMonitor = { ...estatisticoValido(), driftMonitorado: null };
  assert.equal(admitirEmProducao(semMonitor).admitido, false);
});

/* ── ARITMÉTICA: passa sem baseline, MAS não sem insumo ─────────────────── */

test("LADO A: aritmética é admitida SEM baseline nenhum", () => {
  const veredito = admitirEmProducao(aritmeticoValido());
  assert.equal(veredito.admitido, true, `recusado por: ${veredito.motivos.join("; ")}`);
});

test("LADO B: aritmética com insumo medido VAZIO é recusada", () => {
  // É o caso real do estoque: `inventory_units` tem 0 linhas. A conta rodaria e
  // devolveria um resultado com aparência de resposta.
  const vazio = aritmeticoValido();
  vazio.aritmetica = { ...vazio.aritmetica, linhasMedidas: 0 };
  const veredito = admitirEmProducao(vazio);
  assert.equal(veredito.admitido, false);
  assert.ok(veredito.motivos.some((m) => m.includes("VAZIO")));
});

test("aritmética com insumo NÃO MEDIDO é recusada — diferente de vazio", () => {
  const naoMedido = aritmeticoValido();
  naoMedido.aritmetica = { ...naoMedido.aritmetica, linhasMedidas: null };
  const veredito = admitirEmProducao(naoMedido);
  assert.equal(veredito.admitido, false);
  assert.ok(veredito.motivos.some((m) => m.includes("não medido")));
  // "não medido" e "vazio" não podem virar a mesma frase: o primeiro é falta de
  // instrumentação, o segundo é falta de dado. Confundir esconde um dos dois.
  assert.ok(!veredito.motivos.some((m) => m.includes("VAZIO")));
});

test("aritmética sem fórmula conferível é recusada", () => {
  const semFormula = aritmeticoValido();
  semFormula.aritmetica = { ...semFormula.aritmetica, formula: "   " };
  assert.equal(admitirEmProducao(semFormula).admitido, false);
});

/* ── OS CAMPOS DE GOVERNANÇA QUE O DONO EXIGIU ─────────────────────────── */

test("falta de QUALQUER campo de governança recusa, e o motivo diz qual", () => {
  const obrigatorios = [
    ["versao", "versão"],
    ["dataset", "dataset"],
    ["explicabilidade", "explicabilidade"],
    ["limiteDeUso", "limite de uso"],
    ["fallback", "fallback"],
  ];
  for (const [campo, palavra] of obrigatorios) {
    const veredito = admitirEmProducao({ ...estatisticoValido(), [campo]: null });
    assert.equal(veredito.admitido, false, `${campo} ausente deveria recusar`);
    assert.ok(
      veredito.motivos.some((m) => m.includes(palavra)),
      `o motivo de ${campo} tem de citar "${palavra}"; veio: ${veredito.motivos.join("; ")}`,
    );
  }
  // Revisão precisa ser data VÁLIDA, não só string preenchida.
  assert.equal(admitirEmProducao({ ...estatisticoValido(), revisaoEm: "logo" }).admitido, false);
  assert.equal(admitirEmProducao({ ...estatisticoValido(), revisaoEm: null }).admitido, false);
  // Métrica é lista: vazia recusa.
  assert.equal(admitirEmProducao({ ...estatisticoValido(), metricas: [] }).admitido, false);
});

test("a recusa lista TODOS os motivos de uma vez, não só o primeiro", () => {
  const quebrado = {
    ...estatisticoValido(),
    baseline: null,
    fallback: null,
    limiteDeUso: null,
    revisaoEm: null,
  };
  const veredito = admitirEmProducao(quebrado);
  assert.equal(veredito.admitido, false);
  assert.ok(
    veredito.motivos.length >= 4,
    `quatro defeitos deveriam render quatro motivos; veio ${veredito.motivos.length}`,
  );
});

/* ── O DESLIGAR ────────────────────────────────────────────────────────── */

test("DESLIGAR: modelo marcado inativo é sempre recusado, mesmo perfeito", () => {
  const perfeito = estatisticoValido();
  assert.equal(admitirEmProducao(perfeito).admitido, true);
  const desligado = desligarModelo(perfeito);
  const veredito = admitirEmProducao(desligado);
  assert.equal(veredito.admitido, false, "o desligar tem de ser suficiente por si só");
  assert.ok(veredito.motivos.some((m) => m.includes("desligado")));
  // E não muta o original — desligar um não pode desligar o catálogo.
  assert.equal(perfeito.ativo, true);
});

/* ── O CATÁLOGO REAL, CONTRA O ESTADO MEDIDO DO BANCO ──────────────────── */

test("o catálogo cobre os nove modelos que o dono pediu", () => {
  const esperados = [
    "conversao",
    "previsao_de_vendas",
    "vgv",
    "risco_de_perda",
    "tempo_ate_fechamento",
    "demanda_regiao_tipologia",
    "carga_da_equipe",
    "estoque_baixa_saida",
    "campanhas_potenciais",
  ];
  for (const id of esperados) {
    assert.ok(modeloRegistrado(id), `o modelo pedido "${id}" não está no registro`);
  }
});

test("NENHUM modelo estatístico do catálogo é admitido hoje", () => {
  // Esta é a asserção que documenta o estado real. Se algum dia um estatístico
  // passar aqui, é porque houve desfecho apurado — e este teste tem de ser
  // reescrito junto com o baseline, deliberadamente, não por acidente.
  for (const modelo of REGISTRO_DE_MODELOS) {
    if (modelo.natureza !== "estatistica") continue;
    const veredito = admitirEmProducao(modelo);
    assert.equal(
      veredito.admitido,
      false,
      `${modelo.id} foi admitido sem desfecho apurado no banco`,
    );
  }
});

test("os únicos admitidos são as duas contas aritméticas com insumo medido", () => {
  const estado = estadoDoRegistro();
  assert.deepEqual(
    [...estado.admitidos].sort(),
    ["carga_da_equipe", "tempo_ate_esgotar_fila"],
    "só carga da equipe e tempo até esgotar a fila têm dado para responder hoje",
  );
  assert.equal(estado.total, REGISTRO_DE_MODELOS.length);
  assert.equal(estado.recusados.length, estado.total - estado.admitidos.length);
});

test("o estoque é aritmético e MESMO ASSIM recusado — insumo vazio", () => {
  const estoque = modeloRegistrado("estoque_baixa_saida");
  assert.equal(estoque.natureza, "aritmetica");
  const veredito = admitirEmProducao(estoque);
  assert.equal(veredito.admitido, false, "0 unidades cadastradas não sustentam a conta");
});

test("nenhum modelo do catálogo declara valor de baseline inventado", () => {
  // A regra do dono: número não medido é "não medido", nunca um valor plausível.
  for (const modelo of REGISTRO_DE_MODELOS) {
    if (!modelo.baseline) continue;
    const b = modelo.baseline;
    const temAmostra = b.exemplos >= MINIMO_DE_EXEMPLOS;
    if (!temAmostra) {
      assert.equal(
        b.valor,
        null,
        `${modelo.id} declara valor de baseline com ${b.exemplos} exemplo(s) — número sem lastro`,
      );
    }
  }
});

/* ── DRIFT: "insufficient" não é "estável" ─────────────────────────────── */

test("sem baseline, o estado de drift é sem_baseline — não 'estável'", () => {
  const leitura = estadoDeDrift(modeloRegistrado("previsao_de_vendas"), null);
  assert.equal(leitura.estado, "sem_baseline");
  assert.equal(leitura.elegivel, false);
  assert.ok(leitura.explicacao.includes("não elegível a produção"));
});

test("relatório com amostra ZERO é amostra_insuficiente, e nunca monitorado", () => {
  // O caso real: 8 relatórios em prediction_drift_reports, todos com
  // current_sample = 0. Traduzir isso como "sem problemas" seria mentir.
  const comBaseline = estatisticoValido();
  assert.equal(estadoDeDrift(comBaseline, 0).estado, "amostra_insuficiente");
  assert.equal(estadoDeDrift(comBaseline, null).estado, "amostra_insuficiente");
  // E o lado positivo: com amostra, monitora.
  assert.equal(estadoDeDrift(comBaseline, 250).estado, "monitorado");
});

test("aritmética não finge monitorar drift", () => {
  const leitura = estadoDeDrift(modeloRegistrado("carga_da_equipe"), null);
  assert.equal(leitura.estado, "nao_aplicavel");
  assert.equal(leitura.elegivel, true);
});
