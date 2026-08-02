/**
 * Contrato da JORNADA QUE NASCE COM BRAÇO — e do zero que era consequência.
 *
 * ── O QUE FOI MEDIDO NO BANCO DE PRODUÇÃO EM 02/08/2026 ─────────────────────
 *
 *     ai_sales_journeys ......... 0 linhas
 *     nightly_broker_handoffs ... 0 linhas
 *     message_templates ......... 0 linhas de QUALQUER status
 *     leads ..................... 490, sendo 67 vivas e 53 sem primeiro contato
 *
 * O copiloto noturno e a entrega matinal leem `ai_sales_journeys`. Os dois
 * respondiam 200 com zero todo dia, e o zero era HONESTO — não havia jornada.
 *
 * A causa não é "construído e nunca ligado": o escritor existe
 * (`app/api/v2/ai/nightly-sales/route.ts`) e está ligado. Ele é que estava
 * ACOPLADO AO ENVIO, atrás de duas portas que não são dele:
 *
 *   1. `WHATSAPP_NIGHTLY_APPROACH_TEMPLATE` ausente → 503 antes de ler a
 *      primeira lead (conferido: a variável não existe em `.env.local`);
 *   2. `message_templates` aprovados em zero → `approved_template_missing`
 *      barraria toda lead mesmo com a variável posta.
 *
 * Ou seja: a UNIDADE DO EXPERIMENTO só nascia como efeito colateral de uma
 * mensagem que depende do dono. O braço — que é uma função pura do id da lead —
 * não depende de template nenhum, e é isso que este contrato guarda.
 *
 * ── POR QUE ELE EXECUTA E NÃO RASPA O FONTE ────────────────────────────────
 *
 * `lib/ai/jornada-em-sombra.ts` carrega `server-only` e o cliente do Supabase:
 * nenhum contrato consegue importá-lo. Foi por isso que a linha que vai para o
 * banco foi extraída para o módulo PURO — as três propriedades que impedem esta
 * feature de mentir (não enviou, não vai para a entrega matinal, não passa do
 * teto) são CHAMADAS aqui, não procuradas por regex num arquivo.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BRACOS,
  CONSENTIMENTO_DA_SOMBRA,
  ETAPAS_ATE_O_TETO,
  SEMENTE_DE_RECUO,
  STATUS_TERMINAIS,
  TETO_DA_IA,
  avaliarAbertura,
  bilheteDoSorteio,
  coorteDaLead,
  digestaoFnv1a,
  estadoDoExperimento,
  faixaDaEntrada,
  linhaDaJornadaEmSombra,
  percentualDeclarado,
  planejarJornada,
  politicaDeclarada,
  sortearBraco,
} from "../../lib/ai/braco-do-experimento.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const SEMENTE = "contrato-do-braco";

/** Ids sintéticos estáveis — a mesma lista em toda execução. */
const ids = Array.from({ length: 2000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

const leadViva = (extra = {}) => ({
  id: ids[0],
  organizacaoId: "org-1",
  corretorId: "corretor-1",
  status: "novo",
  entradaEm: "2026-08-02T15:00:00.000Z",
  ...extra,
});

/* ── O SORTEIO ────────────────────────────────────────────────────────────── */

test("o mesmo id devolve SEMPRE o mesmo braço — sem isso, reprocessar move a lead de grupo", () => {
  for (const id of ids.slice(0, 200)) {
    const primeiro = sortearBraco(id, SEMENTE, 20);
    for (let i = 0; i < 5; i += 1) {
      assert.equal(sortearBraco(id, SEMENTE, 20), primeiro, `o braço de ${id} mudou entre chamadas`);
    }
  }
});

test("o hash é o FNV-1a de referência — é o que torna o braço conferível fora deste código", () => {
  // Vetores publicados do FNV-1a de 32 bits. Se `Math.imul`/`>>> 0` sumirem, a
  // multiplicação estoura o inteiro seguro, o hash diverge de qualquer outra
  // implementação e ninguém consegue mais auditar o sorteio.
  assert.equal(digestaoFnv1a(""), 0x811c9dc5);
  assert.equal(digestaoFnv1a("a"), 0xe40c292c);
  assert.equal(digestaoFnv1a("foobar"), 0xbf9cf968);
});

test("o bilhete fica sempre entre 0 e 99", () => {
  for (const id of ids) {
    const bilhete = bilheteDoSorteio(id, SEMENTE);
    assert.ok(Number.isInteger(bilhete) && bilhete >= 0 && bilhete <= 99, `bilhete fora da faixa: ${bilhete}`);
  }
});

test("OS DOIS LADOS: a 20% existe lead no braço ia E lead no braço humano", () => {
  // Provar só um lado deixaria passar a regressão mais provável — "tudo humano"
  // (o experimento nunca começa) ou "tudo ia" (a operação inteira vai para a
  // máquina sem ninguém decidir). Nenhuma das duas dá erro.
  const contagem = { ia: 0, humano: 0 };
  for (const id of ids) contagem[sortearBraco(id, SEMENTE, 20)] += 1;
  assert.ok(contagem.ia > 0, "nenhuma lead foi para a IA a 20% — o experimento nunca começaria");
  assert.ok(contagem.humano > 0, "todas foram para a IA a 20%");
  // Tolerância larga de propósito: o que se cobra é que o percentual GOVERNE a
  // divisão, não que o hash tenha distribuição perfeita.
  const proporcao = contagem.ia / ids.length;
  assert.ok(proporcao > 0.12 && proporcao < 0.28, `20% declarados produziram ${(proporcao * 100).toFixed(1)}%`);
});

test("o BOTÃO DE PARADA: 0% manda toda lead para o humano, e 100% manda todas para a IA", () => {
  for (const id of ids.slice(0, 300)) {
    assert.equal(sortearBraco(id, SEMENTE, 0), "humano", "0% deixou uma lead ir para a IA");
    assert.equal(sortearBraco(id, SEMENTE, 100), "ia", "100% deixou uma lead fora da IA");
  }
});

test("percentual ILEGÍVEL vale ZERO — falhar aberto aqui mandaria cliente para a IA por erro de digitação", () => {
  for (const torto of [undefined, null, "20", "vinte", NaN, Infinity, {}, [], true]) {
    assert.equal(percentualDeclarado(torto), 0, `${JSON.stringify(torto)} não caiu em zero`);
  }
  assert.equal(percentualDeclarado(-5), 0, "negativo tem de ser aparado em 0");
  assert.equal(percentualDeclarado(150), 100, "acima de 100 tem de ser aparado em 100");
  assert.equal(percentualDeclarado(20.9), 20, "fração tem de ser truncada, não arredondada para cima");
});

test("trocar a semente reembaralha a base — senão só existiria um experimento, o primeiro", () => {
  const comA = ids.map((id) => sortearBraco(id, "semente-a", 50)).join("");
  const comB = ids.map((id) => sortearBraco(id, "semente-b", 50)).join("");
  assert.notEqual(comA, comB, "duas sementes diferentes produziram exatamente a mesma divisão");
});

/* ── A FAIXA ──────────────────────────────────────────────────────────────── */

test("a faixa separa noite, expediente e negociação aberta", () => {
  // 23h e 3h em São Paulo (UTC-3 o ano inteiro desde 2019).
  assert.equal(faixaDaEntrada({ status: "novo", entradaEm: "2026-08-02T02:00:00.000Z", coorte: "entrada" }), "fora_do_expediente");
  assert.equal(faixaDaEntrada({ status: "novo", entradaEm: "2026-08-02T06:00:00.000Z", coorte: "entrada" }), "fora_do_expediente");
  // 12h em São Paulo.
  assert.equal(faixaDaEntrada({ status: "novo", entradaEm: "2026-08-02T15:00:00.000Z", coorte: "entrada" }), "expediente_lead_nova");
  // Acima do teto da IA: 0% por construção — e o status vence a coorte.
  assert.equal(faixaDaEntrada({ status: "proposta", entradaEm: "2026-08-02T02:00:00.000Z", coorte: "entrada" }), "negociacao_aberta");
  assert.equal(faixaDaEntrada({ status: "proposta", entradaEm: "2026-08-02T02:00:00.000Z", coorte: "acervo" }), "negociacao_aberta");
});

test("data ILEGÍVEL nunca compra a faixa de 100% — ausência de dado não é autorização", () => {
  for (const torta of [null, undefined, "", "ontem", "2026-13-45"]) {
    assert.equal(
      faixaDaEntrada({ status: "novo", entradaEm: torta, coorte: "entrada" }),
      "expediente_lead_nova",
      `data ${JSON.stringify(torta)} caiu numa faixa que não é a conservadora`,
    );
  }
});

test("ACERVO não compra a faixa noturna — o carimbo dele pode ser a hora da IMPORTAÇÃO", () => {
  // Medido no ensaio a seco contra a produção em 02/08/2026: 22 leads com
  // `created_at` idêntico em 2026-07-28T22:06:08.208Z — 19h06 em São Paulo, o
  // instante de uma importação de planilha. Sem esta guarda, a base legada
  // inteira compraria a faixa de 100% por causa do horário de quem clicou em
  // "importar", e o sorteio deixaria de ser cego.
  const carimboDaImportacao = "2026-07-28T22:06:08.208Z";
  assert.equal(faixaDaEntrada({ status: "novo", entradaEm: carimboDaImportacao, coorte: "entrada" }), "fora_do_expediente");
  assert.equal(faixaDaEntrada({ status: "novo", entradaEm: carimboDaImportacao, coorte: "acervo" }), "expediente_lead_nova");
});

/* ── A COORTE ─────────────────────────────────────────────────────────────── */

test("a coorte separa quem pode entrar na comparação de quem já estava na base", () => {
  const inicio = "2026-08-02T00:00:00.000Z";
  assert.equal(coorteDaLead("2026-08-03T10:00:00.000Z", inicio), "entrada");
  assert.equal(coorteDaLead("2026-08-02T00:00:00.000Z", inicio), "entrada", "a fronteira é inclusiva");
  assert.equal(coorteDaLead("2026-07-30T10:00:00.000Z", inicio), "acervo");
});

test("na dúvida a coorte é ACERVO — deixar entrar por omissão contaminaria o único número que o volume sustenta", () => {
  assert.equal(coorteDaLead(null, "2026-08-02T00:00:00.000Z"), "acervo");
  assert.equal(coorteDaLead("2026-08-03T10:00:00.000Z", null), "acervo");
  assert.equal(coorteDaLead("nao-e-data", "2026-08-02T00:00:00.000Z"), "acervo");
  assert.equal(coorteDaLead("2026-08-03T10:00:00.000Z", "nao-e-data"), "acervo");
});

/* ── A ABERTURA ───────────────────────────────────────────────────────────── */

test("lead TERMINAL não abre jornada — em nenhuma das grafias que o banco guarda", () => {
  for (const status of [...STATUS_TERMINAIS, "GANHO", "PERDIDO", "vendido", "venda", "won", "lost", "archived"]) {
    const veredicto = avaliarAbertura(leadViva({ status }));
    assert.equal(veredicto.pode, false, `status "${status}" abriu jornada`);
    assert.equal(veredicto.impedimento, "lead_terminal", `status "${status}" foi recusado pelo motivo errado`);
  }
});

test("lead VIVA abre — provar só a recusa deixaria passar um módulo que recusa tudo", () => {
  for (const status of ["novo", "contato", "qualificacao", "NOVO", "em_atendimento", "qualificado"]) {
    const veredicto = avaliarAbertura(leadViva({ status }));
    assert.equal(veredicto.pode, true, `status "${status}" foi recusado e é uma lead viva`);
    assert.equal(veredicto.impedimento, null);
  }
});

test("cada recusa DESTRAVÁVEL diz quem resolve — e a recusa correta não inventa um culpado", () => {
  const semCorretor = avaliarAbertura(leadViva({ corretorId: null }));
  assert.equal(semCorretor.impedimento, "sem_corretor");
  assert.ok(semCorretor.quemResolve && semCorretor.quemResolve.length > 10, "recusa destravável sem dono vira número que ninguém aciona");

  const semId = avaliarAbertura(leadViva({ id: "   " }));
  assert.equal(semId.impedimento, "sem_id");
  assert.ok(semId.quemResolve);

  const semOrg = avaliarAbertura(leadViva({ organizacaoId: null }));
  assert.equal(semOrg.impedimento, "sem_organizacao");

  // Lead terminal é uma recusa CERTA: não há o que destravar, e apontar um
  // responsável seria mandar alguém "consertar" o comportamento correto.
  assert.equal(avaliarAbertura(leadViva({ status: "ganho" })).quemResolve, null);
});

/* ── A POLÍTICA ───────────────────────────────────────────────────────────── */

test("política ILEGÍVEL cai em 0% nas três faixas — e ainda assim com semente estável", () => {
  for (const torta of [null, undefined, "", 42, [], { fatiaDaIa: "nao-e-objeto" }, { fatiaDaIa: { expediente_lead_nova: "20" } }]) {
    const politica = politicaDeclarada(torta);
    for (const [faixa, valor] of Object.entries(politica.percentualPorFaixa)) {
      assert.equal(valor, 0, `faixa ${faixa} não caiu em zero com declaração ${JSON.stringify(torta)}`);
    }
    assert.ok(politica.semente.length > 0, "sorteio sem semente estável não é sorteio, é ruído");
  }
  assert.equal(politicaDeclarada(null).semente, SEMENTE_DE_RECUO);
  assert.equal(politicaDeclarada({ iniciadoEm: "amanha" }).iniciadoEm, null, "fronteira ilegível tem de virar null");
});

test("o arquivo REAL da fatia declara as três faixas e uma semente", () => {
  // Sem isto, apagar `config/experimento-ia-x-humano.json` deixaria o produto
  // sorteando 0% para sempre — em silêncio, com todos os testes acima verdes.
  const bruto = JSON.parse(fs.readFileSync(path.join(raiz, "config", "experimento-ia-x-humano.json"), "utf8"));
  const politica = politicaDeclarada(bruto);
  assert.notEqual(politica.semente, SEMENTE_DE_RECUO, "o arquivo real não declarou semente");
  assert.ok(politica.iniciadoEm, "sem `iniciadoEm` toda lead vira acervo e a comparação nunca acumula caso");
  assert.equal(politica.percentualPorFaixa.negociacao_aberta, 0, "acima do teto da IA a fatia tem de ser zero");
  assert.ok(politica.percentualPorFaixa.fora_do_expediente > 0, "a faixa noturna zerada devolveria a operação ao vazio de 92,8h");
  const expediente = politica.percentualPorFaixa.expediente_lead_nova;
  assert.ok(expediente > 0 && expediente < 100, `expediente a ${expediente}% não deixa grupo de controle`);
});

/* ── O PLANO E A LINHA QUE VAI PARA O BANCO ───────────────────────────────── */

const politicaDeProva = politicaDeclarada({
  semente: SEMENTE,
  iniciadoEm: "2026-08-02T00:00:00.000Z",
  fatiaDaIa: { fora_do_expediente: 100, expediente_lead_nova: 20, negociacao_aberta: 0 },
});

test("a jornada NUNCA nasce acima do teto da IA", () => {
  for (const id of ids.slice(0, 100)) {
    const plano = planejarJornada(leadViva({ id }), politicaDeProva);
    assert.ok(ETAPAS_ATE_O_TETO.includes(plano.etapa), `etapa "${plano.etapa}" está fora do teto`);
    assert.equal(plano.tetoDaIa, "qualification");
  }
});

test("o braço é calculado mesmo quando a abertura é recusada — dá para auditar sem criar a linha", () => {
  const plano = planejarJornada(leadViva({ status: "perdido" }), politicaDeProva);
  assert.equal(plano.abertura.pode, false);
  assert.ok(BRACOS.includes(plano.braco), "recusa apagou o braço e a auditoria fica cega");
});

test("a linha que vai para o banco declara: NÃO enviou, NÃO vai para a entrega matinal, NÃO passa do teto", () => {
  const plano = planejarJornada(leadViva({ entradaEm: "2026-08-02T02:00:00.000Z" }), politicaDeProva);
  const linha = linhaDaJornadaEmSombra({
    organizacaoId: "org-1",
    leadId: ids[0],
    corretorId: "corretor-1",
    plano,
    semente: politicaDeProva.semente,
  });

  // 1. Não enviou. `/api/ia-autonoma-estado` separa execução de preparação por
  //    este campo: com ele diferente de zero, a primeira lead que entrasse faria
  //    o painel afirmar "executei N ações, todas com aprovação nomeada" sobre um
  //    banco em que nada saiu.
  assert.equal(linha.outbound_count, 0);

  // 2. Não vai para a entrega matinal. `/api/v2/ai/nightly-handoff` filtra por
  //    `morning_handoff_required = true` E por status na lista de jornadas
  //    ativas. `eligible` está FORA dessa lista, de propósito: nada foi enviado
  //    ao cliente, então não há atendimento noturno para o corretor assumir.
  assert.equal(linha.morning_handoff_required, false);
  assert.equal(linha.status, "eligible");

  // 3. Não passa do teto.
  assert.equal(linha.maximum_automated_stage, TETO_DA_IA);
  assert.ok(ETAPAS_ATE_O_TETO.includes(linha.stage));

  // 4. Não pede consentimento porque não fala com ninguém — e é por esta marca
  //    que o enviador reconhece a jornada como ADOTÁVEL em vez de bloqueio.
  assert.equal(linha.consent_basis, CONSENTIMENTO_DA_SOMBRA);

  // 5. O braço fica gravado e conferível.
  assert.ok(BRACOS.includes(linha.context_snapshot.braco));
  assert.equal(linha.context_snapshot.bilhete, plano.bilhete);
  assert.equal(linha.context_snapshot.semente, politicaDeProva.semente);
  assert.equal(linha.context_snapshot.envio, "retido_pelo_modo_sombra");
});

test("a jornada em sombra NÃO é lida pela entrega matinal — os dois lados do filtro", () => {
  // A rota lê `.in("status", [...]).eq("morning_handoff_required", true)`. O
  // contrato repete o predicado dela contra a linha que o outro módulo produz:
  // é o único jeito de pegar o dia em que um dos dois mudar sozinho.
  const STATUS_DA_ENTREGA = ["pending_approval", "active", "waiting_customer", "waiting_broker", "paused"];
  const plano = planejarJornada(leadViva(), politicaDeProva);
  const emSombra = linhaDaJornadaEmSombra({ organizacaoId: "org-1", leadId: ids[0], corretorId: "corretor-1", plano, semente: SEMENTE });
  assert.equal(STATUS_DA_ENTREGA.includes(emSombra.status) && emSombra.morning_handoff_required, false);

  // E o outro lado: uma jornada que REALMENTE enviou passa. Sem provar isto, um
  // filtro que recusasse tudo passaria neste teste — e a entrega matinal ficaria
  // permanentemente vazia com todos os contratos verdes.
  const jornadaQueEnviou = { ...emSombra, status: "pending_approval", morning_handoff_required: true };
  assert.equal(STATUS_DA_ENTREGA.includes(jornadaQueEnviou.status) && jornadaQueEnviou.morning_handoff_required, true);
});

/* ── O ESTADO DO EXPERIMENTO ──────────────────────────────────────────────── */

test("com a sombra retendo envio, o experimento NÃO está ativo — e a frase diz por quê", () => {
  const estado = estadoDoExperimento({ sombraRetemEnvio: true, templatesAprovados: 0, envioConfigurado: false });
  assert.equal(estado.ativo, false);
  assert.equal(estado.degrau, 1);
  assert.ok(estado.bloqueios.length >= 3);
  for (const bloqueio of estado.bloqueios) {
    assert.ok(bloqueio.motivo.length > 20, `bloqueio "${bloqueio.id}" sem motivo escrito`);
    assert.ok(bloqueio.quemResolve.length > 10, `bloqueio "${bloqueio.id}" não diz quem resolve`);
  }
});

test("NÃO MEDIDO é diferente de ZERO na contagem de templates", () => {
  const naoLido = estadoDoExperimento({ sombraRetemEnvio: false, templatesAprovados: null, envioConfigurado: true });
  const zero = estadoDoExperimento({ sombraRetemEnvio: false, templatesAprovados: 0, envioConfigurado: true });
  assert.equal(naoLido.bloqueios[0].id, "templates_nao_medidos");
  assert.equal(zero.bloqueios[0].id, "sem_template");
  assert.notEqual(naoLido.bloqueios[0].motivo, zero.bloqueios[0].motivo);
});

test("sem bloqueio nenhum o experimento fica ATIVO — senão a função só saberia dizer não", () => {
  const estado = estadoDoExperimento({ sombraRetemEnvio: false, templatesAprovados: 3, envioConfigurado: true });
  assert.equal(estado.ativo, true);
  assert.equal(estado.degrau, 2);
  assert.deepEqual(estado.bloqueios, []);
});

/* ── A MIGRATION ESCRITA E NÃO APLICADA ───────────────────────────────────── */

test("a coluna do braço está versionada, e o código NÃO depende dela", () => {
  const arquivo = path.join(raiz, "supabase", "migrations", "20260802210000_braco_do_experimento.sql");
  const sql = fs.readFileSync(arquivo, "utf8");
  assert.match(sql, /add column if not exists braco text/i);
  assert.match(sql, /check \(braco is null or braco in \('ia', 'humano'\)\)/i);

  // A prova de que o código não depende dela é EXECUTADA, não lida: a linha que
  // vai para o banco hoje não pode mencionar a coluna, senão a escrita quebraria
  // com 42703 em toda produção onde a migration ainda não entrou — que é o
  // estado atual, porque aplicar migration é decisão do dono.
  const plano = planejarJornada(leadViva(), politicaDeProva);
  const linha = linhaDaJornadaEmSombra({ organizacaoId: "org-1", leadId: ids[0], corretorId: "corretor-1", plano, semente: SEMENTE });
  assert.equal(Object.hasOwn(linha, "braco"), false, "a linha usa uma coluna que o banco vivo não tem");
  assert.equal(Object.hasOwn(linha, "coorte"), false, "a linha usa uma coluna que o banco vivo não tem");
  assert.ok(linha.context_snapshot.braco, "e o braço tem de continuar gravado onde o banco de hoje aceita");
});
