/**
 * RELATÓRIO DO INCORPORADOR — os portões da distinção entre "zero" e "não sei".
 *
 * Esta suíte não existe para provar que a conta soma. Ela existe para travar a
 * única regra que, se cair, transforma o relatório em mentira educada: célula
 * vazia lê-se como zero, e zero lê-se como "essa campanha não trouxe ninguém".
 *
 * O caso é real e foi medido na produção em 02/08/2026: 7 campanhas gastaram
 * R$ 3.845,19 e nenhuma lead do CRM aponta para elas; a única campanha com
 * leads (24) não tem uma linha de gasto sequer. Os dois conjuntos são
 * DISJUNTOS. Se alguém "consertar" isso devolvendo 0 no lugar de null, o
 * relatório passa a afirmar que o dinheiro foi jogado fora — uma acusação que
 * o dado não sustenta.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  apurarFunil,
  AMOSTRA_MINIMA_PARA_MEDIANA,
  classificarAtribuicao,
  custoPorClique,
  custoPorLead,
  custoPorMil,
  duracao,
  lerSerie,
  medianaEmMinutos,
  resumirAtribuicao,
  taxa,
  taxaDeClique,
  TRACO,
  type DiaDaSerie,
  type Gasto,
  type LeadParaFunil,
  type LinhaDeCampanha,
} from "../lib/relatorio-incorporador/apuracao.ts";

const MINUTO = 60_000;
const gastoDe = (valor: number, linhas = 1): Gasto => ({ valor, linhas });
const semGasto: Gasto = { valor: null, linhas: 0 };

describe("gasto: ausência de linha não é gasto zero", () => {
  test("campanha sem linha em marketing_spend fica sem atribuição de custo, não com custo zero", () => {
    const cpl = custoPorLead(semGasto, 24);
    assert.equal(cpl.valor, null);
    assert.match(cpl.motivo ?? "", /não medido/);
  });

  test("gasto medido igual a zero é diferente de gasto não medido", () => {
    const medidoZero = custoPorLead(gastoDe(0, 5), 24);
    assert.equal(medidoZero.valor, null);
    assert.match(medidoZero.motivo ?? "", /zero/);
    // As duas ausências devolvem null, e é por isso que o motivo precisa
    // distingui-las: quem lê a tela precisa saber qual das duas aconteceu.
    assert.notEqual(medidoZero.motivo, custoPorLead(semGasto, 24).motivo);
  });

  test("custo por lead exige as DUAS pontas — é o caso da produção", () => {
    // 7 campanhas: gasto sim, lead não.
    assert.equal(custoPorLead(gastoDe(922.02, 21), 0).valor, null);
    // 1 campanha: lead sim, gasto não.
    assert.equal(custoPorLead(semGasto, 24).valor, null);
    // Com as duas, e só com as duas, o número existe.
    assert.equal(custoPorLead(gastoDe(1000, 10), 25).valor, 40);
  });

  test("CPC e CPM não inventam denominador", () => {
    assert.equal(custoPorClique(gastoDe(100), 0).valor, null);
    assert.equal(custoPorMil(gastoDe(100), 0).valor, null);
    assert.equal(custoPorClique(semGasto, 155).valor, null);
    assert.equal(custoPorClique(gastoDe(922.02), 155).valor, 922.02 / 155);
    assert.equal(custoPorMil(gastoDe(922.02), 9232).valor, (922.02 / 9232) * 1000);
  });

  test("taxa sem denominador é null, nunca 0%", () => {
    assert.equal(taxa(0, 0), null);
    assert.equal(taxaDeClique(0, 0), null);
    assert.equal(taxa(0, 10), 0, "zero MEDIDO continua sendo zero");
  });
});

describe("estado da atribuição — os quatro casos, e o nome de cada um", () => {
  test("gasto sem lead é 'sem atribuição', não 'campanha ruim'", () => {
    assert.equal(classificarAtribuicao(gastoDe(922.02, 21), 0), "gasto_sem_atribuicao");
  });
  test("lead sem gasto tem nome próprio", () => {
    assert.equal(classificarAtribuicao(semGasto, 24), "lead_sem_gasto");
  });
  test("as duas pontas juntas, e só elas, valem 'completa'", () => {
    assert.equal(classificarAtribuicao(gastoDe(100, 3), 5), "completa");
  });
  test("nem gasto nem lead não é notícia", () => {
    assert.equal(classificarAtribuicao(semGasto, 0), "sem_dado");
  });
  test("gasto medido em ZERO com lead não vira 'completa' — não há custo para dividir", () => {
    assert.equal(classificarAtribuicao(gastoDe(0, 4), 5), "lead_sem_gasto");
  });
});

describe("o número que decide a tela", () => {
  const campanha = (
    id: string,
    gasto: Gasto,
    leadsAtribuidas: number,
  ): LinhaDeCampanha => ({
    id,
    nome: id,
    plataforma: "META",
    status: "ACTIVE",
    idExterno: null,
    gasto,
    diasComGasto: gasto.linhas,
    primeiroDiaDeGasto: null,
    ultimoDiaDeGasto: null,
    impressoes: 0,
    cliques: 0,
    leadsDaPlataforma: null,
    leadsAtribuidas,
    leadsContatadas: 0,
    atribuicao: classificarAtribuicao(gasto, leadsAtribuidas),
    cpl: custoPorLead(gasto, leadsAtribuidas),
    cpc: custoPorClique(gasto, 0),
    cpm: custoPorMil(gasto, 0),
    ctr: null,
    funil: { contato: 0, qualificacao: 0, visita: 0, proposta: 0, contrato: 0, ganho: 0 },
    saidas: 0,
    empreendimentos: [],
  });

  test("reproduz a produção de 02/08/2026: R$ 3.845,19 e 100% sem atribuição", () => {
    const resumo = resumirAtribuicao([
      campanha("imob-v2", gastoDe(922.02, 21), 0),
      campanha("investidor-adv", gastoDe(843.01, 21), 0),
      campanha("investidor-v2", gastoDe(617.05, 16), 0),
      campanha("imob-adv", gastoDe(508.28, 14), 0),
      campanha("imob-v3", gastoDe(341.68, 10), 0),
      campanha("imob-jul", gastoDe(309.11, 8), 0),
      campanha("cargos-jul", gastoDe(304.04, 8), 0),
      campanha("auto-atribuicao", semGasto, 24),
    ]);
    assert.equal(Math.round(resumo.gastoTotal! * 100) / 100, 3845.19);
    assert.equal(Math.round(resumo.gastoSemAtribuicao * 100) / 100, 3845.19);
    assert.equal(resumo.parcelaSemAtribuicao, 100);
    assert.equal(resumo.campanhasComGasto, 7);
    assert.equal(resumo.campanhasSemAtribuicao, 7);
    assert.equal(
      resumo.campanhasComAtribuicaoCompleta,
      0,
      "nenhuma campanha tem gasto E lead — é o que torna o CPL incomputável nesta base",
    );
    assert.equal(resumo.leadsAtribuidas, 24);
  });

  test("sem nenhuma campanha com gasto, o total é null e não R$ 0,00", () => {
    const resumo = resumirAtribuicao([campanha("so-lead", semGasto, 3)]);
    assert.equal(resumo.gastoTotal, null);
    assert.equal(resumo.parcelaSemAtribuicao, null);
  });
});

describe("mediana: amostra pequena não vira número de aparência sólida", () => {
  test(`abaixo de ${AMOSTRA_MINIMA_PARA_MEDIANA} observações não sai valor, mas sai o tamanho`, () => {
    const duas = medianaEmMinutos([10 * MINUTO, 90 * MINUTO]);
    assert.equal(duas.valor, null);
    assert.equal(duas.amostra, 2);
    assert.equal(duas.suficiente, false);
  });

  test("com amostra suficiente devolve a mediana em minutos", () => {
    const tres = medianaEmMinutos([10 * MINUTO, 30 * MINUTO, 90 * MINUTO]);
    assert.equal(tres.valor, 30);
    assert.equal(tres.suficiente, true);
  });

  test("intervalo negativo é sujeira de dado e sai da conta, sem puxar a mediana", () => {
    const m = medianaEmMinutos([-500 * MINUTO, 10 * MINUTO, 30 * MINUTO, 90 * MINUTO]);
    assert.equal(m.amostra, 3);
    assert.equal(m.valor, 30);
  });

  test("amostra vazia devolve traço na formatação, nunca '0 min'", () => {
    assert.equal(duracao(medianaEmMinutos([]).valor), TRACO);
  });
});

describe("funil", () => {
  const lead = (
    id: string,
    criadaEm: number,
    chegouEm: LeadParaFunil["chegouEm"],
    saiu = false,
  ): LeadParaFunil => ({ id, criadaEm, chegouEm, saiu, temMovimento: Object.keys(chegouEm).length > 0 || saiu });

  test("etapa com mais leads que a anterior é PULO declarado, não erro de conta", () => {
    // Espelha a produção: 2 leads em visita, 3 em proposta.
    const leads = [
      lead("a", 0, { contato: 1, qualificacao: 2, visita: 3, proposta: 4 }),
      lead("b", 0, { contato: 1, qualificacao: 2, visita: 3 }),
      lead("c", 0, { contato: 1, qualificacao: 2, proposta: 4 }),
      lead("d", 0, { contato: 1, qualificacao: 2, proposta: 4 }),
    ];
    const funil = apurarFunil(leads, null);
    const proposta = funil.etapas.find((e) => e.chave === "proposta")!;
    assert.equal(proposta.leads, 3);
    assert.equal(proposta.passagem, 150);
    assert.equal(proposta.puloDeEtapa, true, "sem este sinal, '150%' parece a tela quebrada");
  });

  test("lead nascida antes do livro de movimentação fica fora do TEMPO e dentro da CONTAGEM", () => {
    const livroComecaEm = 1_000_000;
    const leads = [
      lead("velha", 0, { contato: livroComecaEm + 10 * MINUTO }),
      lead("nova1", livroComecaEm, { contato: livroComecaEm + 10 * MINUTO }),
      lead("nova2", livroComecaEm, { contato: livroComecaEm + 20 * MINUTO }),
      lead("nova3", livroComecaEm, { contato: livroComecaEm + 30 * MINUTO }),
    ];
    const funil = apurarFunil(leads, livroComecaEm);
    const contato = funil.etapas.find((e) => e.chave === "contato")!;
    assert.equal(contato.leads, 4, "a lead velha CONTA na etapa que alcançou");
    assert.equal(contato.tempoAteChegar.amostra, 3, "e NÃO conta no tempo");
    assert.equal(contato.tempoAteChegar.valor, 20);
    assert.equal(funil.anterioresAoRegistro, 1);
    assert.equal(funil.elegiveisParaTempo, 3);
  });

  test("lead sem movimento nenhum é contada à parte — muda é diferente de parada", () => {
    const funil = apurarFunil(
      [lead("muda", 0, {}), lead("andou", 0, { contato: 10 })],
      null,
    );
    assert.equal(funil.semMovimento, 1);
    assert.equal(funil.entraram, 2);
  });
});

describe("série diária: fora da cobertura do feed não é gasto zero", () => {
  const dia = (
    d: string,
    gasto: number | null,
    gastoMedido: boolean,
    leadsDeMidia = 0,
    leadsImportadas = 0,
  ): DiaDaSerie => ({
    dia: d, gasto, gastoMedido, impressoes: 0, cliques: 0,
    leadsDeMidia, leadsImportadas, leadsOutras: 0,
  });

  test("dia fora da cobertura com lead não conta como 'entrou gente e não gastamos'", () => {
    const leitura = lerSerie([
      dia("2026-06-01", null, false, 5),          // fora da cobertura
      dia("2026-07-01", 100, true, 3),            // gastou e entrou gente
      dia("2026-07-02", 50, true, 0),             // gastou, ninguém entrou
      dia("2026-07-03", 0, true, 4),              // entrou gente, gasto zero MEDIDO
    ]);
    assert.equal(leitura.diasMedidos, 3);
    assert.equal(leitura.diasComGastoESemLead, 1);
    assert.equal(leitura.gastoEmDiasSemLead, 50);
    assert.equal(
      leitura.diasComLeadESemGasto,
      1,
      "só o dia MEDIDO entra: afirmar que não houve gasto exige ter medido",
    );
    assert.equal(leitura.leadsEmDiasSemGasto, 4);
    assert.equal(leitura.diasForaDaCoberturaComLead, 1);
    assert.equal(leitura.leadsForaDaCobertura, 5);
    assert.deepEqual(leitura.coberturaDoGasto, { de: "2026-07-01", ate: "2026-07-03" });
  });

  test("sem nenhum dia medido, o total da série é null", () => {
    const leitura = lerSerie([dia("2026-06-01", null, false, 5)]);
    assert.equal(leitura.gastoTotal, null);
    assert.equal(leitura.coberturaDoGasto, null);
    assert.equal(leitura.leadsDeMidiaTotal, 5);
  });

  test("importação de planilha não entra na contagem de mídia", () => {
    const leitura = lerSerie([dia("2026-07-28", 0, true, 0, 270)]);
    assert.equal(leitura.leadsDeMidiaTotal, 0);
    assert.deepEqual(leitura.maiorDiaDeImportacao, { dia: "2026-07-28", leads: 270 });
    assert.equal(
      leitura.diasComLeadESemGasto,
      0,
      "270 linhas de planilha não são 270 leads de mídia num dia sem gasto",
    );
  });
});

describe("formatação em pt-BR", () => {
  test("duração usa vírgula decimal, como o resto dos números da tela", () => {
    assert.equal(duracao(45), "45 min");
    assert.match(duracao(200), /^3,3 h$/);
    assert.match(duracao(20754), /^14,4 d$/);
  });
});
