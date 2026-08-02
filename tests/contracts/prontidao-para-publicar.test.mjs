/**
 * Contrato da PRONTIDÃO PARA PUBLICAR.
 *
 * O que este contrato protege não é a lista de itens — é a regra que dá sentido
 * à tela do dono, e ela tem uma cláusula a mais do que a da prontidão da IA:
 *
 *   1. ausência nunca vira saúde;
 *   2. falha de leitura nunca vira zero;
 *   3. sintoma nunca vira tarefa;
 *   4. **comparar nada nunca vira "nenhuma divergência"**.
 *
 * A quarta é a que existe por causa desta entrega. Medido na produção em
 * 02/08/2026: 21 anúncios ATIVOS publicam numa Página que `meta_lead_sources`
 * não conhece. No dia em que a listagem de anúncios vier vazia — rate limit,
 * token de outra conta, campanha pausada — o número de páginas desconhecidas cai
 * para zero sozinho. Um painel que pintasse esse zero de verde apagaria o item
 * mais caro da lista exatamente quando parasse de enxergá-lo.
 *
 * Cada asserção aqui corresponde a uma forma de mentir que a tela poderia ter.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOGO_DE_PUBLICACAO,
  EXPLICACAO_DO_CRITERIO,
  EXPLICACAO_DO_ESTADO,
  EXPLICACAO_DO_GERAL,
  QUEM_RESOLVE,
  TITULO_DO_GRUPO,
  avaliarProntidaoParaPublicar,
  medirDivergencias,
  medirLista,
  medirVariaveis,
  resumirProntidaoParaPublicar,
} from "../../lib/meta/marketing/prontidao-para-publicar.ts";

/* As mesmas explicações do módulo irmão, e o contrato prova a identidade lá
   embaixo — não é cópia, é reexportação. */
import {
  EXPLICACAO_DO_ESTADO as ESTADO_DA_IA,
  EXPLICACAO_DO_GERAL as GERAL_DA_IA,
  QUEM_RESOLVE as QUEM_RESOLVE_DA_IA,
} from "../../lib/ai/prontidao-para-ligar.ts";

const banco = (valor) => ({ valor, fonte: "banco", comoFoiMedido: "contagem de teste" });
const naoLido = (motivo = "banco não respondeu") => ({
  valor: null,
  fonte: "banco",
  comoFoiMedido: "leitura tentada",
  motivoSemMedida: motivo,
});

/** O valor que deixa CADA item satisfeito, respeitando o critério dele. */
const suficiente = (item) => banco(item.criterio === "sem_divergencia" ? 0 : item.minimoParaPublicar);
const tudoPronto = Object.fromEntries(CATALOGO_DE_PUBLICACAO.map((i) => [i.id, suficiente(i)]));
const item = (v, id) => v.itens.find((i) => i.id === id);

const DIVERGENCIAS = CATALOGO_DE_PUBLICACAO.filter((i) => i.criterio === "sem_divergencia");
const EXISTENCIAS = CATALOGO_DE_PUBLICACAO.filter((i) => i.criterio === "existe");

/* ── O VEREDITO GERAL ──────────────────────────────────────────────────────── */

test("tudo medido e suficiente é `pronta`, e só aí `podePublicar`", () => {
  const v = resumirProntidaoParaPublicar(tudoPronto);
  assert.equal(v.estado, "pronta");
  assert.equal(v.podePublicar, true);
  assert.equal(v.bloqueios, 0);
  assert.equal(v.naoMedidos, 0);
  assert.equal(v.primeiroPasso, null);
});

test("um único item no escuro derruba `podePublicar` — não sei nunca vira sim", () => {
  const v = resumirProntidaoParaPublicar({ ...tudoPronto, midia_na_biblioteca_da_meta: naoLido() });
  assert.equal(v.bloqueios, 0, "não há bloqueio medido");
  assert.equal(v.estado, "incerta");
  assert.equal(v.podePublicar, false, "sem ler a lista inteira ninguém libera o botão");
});

test("sem NENHUMA leitura o geral é `sem_leitura`, e não `bloqueada`", () => {
  const nada = Object.fromEntries(CATALOGO_DE_PUBLICACAO.map((i) => [i.id, naoLido()]));
  const v = resumirProntidaoParaPublicar(nada);
  assert.equal(v.estado, "sem_leitura");
  assert.equal(v.bloqueios, 0, "não li nada, então não posso afirmar bloqueio");
  assert.equal(v.podePublicar, false);
  assert.match(v.frase, /não li nada/i);
});

/* ── OS DOIS CRITÉRIOS: O MESMO ZERO, DOIS SIGNIFICADOS ────────────────────── */

test("em item de EXISTÊNCIA, zero BLOQUEIA", () => {
  for (const alvo of EXISTENCIAS) {
    const v = resumirProntidaoParaPublicar({ ...tudoPronto, [alvo.id]: banco(0) });
    assert.equal(item(v, alvo.id).estado === "pronto", false, `${alvo.id} ficou verde com zero`);
  }
});

test("em item de DIVERGÊNCIA, zero é PRONTO — e um já bloqueia", () => {
  for (const alvo of DIVERGENCIAS) {
    const bom = resumirProntidaoParaPublicar({ ...tudoPronto, [alvo.id]: banco(0) });
    assert.equal(item(bom, alvo.id).estado, "pronto", `${alvo.id} deveria estar bom com zero desacordo`);

    const ruim = resumirProntidaoParaPublicar({ ...tudoPronto, [alvo.id]: banco(1) });
    assert.notEqual(item(ruim, alvo.id).estado, "pronto", `${alvo.id} ficou verde com uma divergência`);
  }
});

test("uma divergência no meio de uma maioria que confere ainda é bloqueio", () => {
  // A tentação seria medir ACERTOS e comparar com um mínimo: "20 de 21 anúncios
  // usam página conhecida" passaria em qualquer régua de mínimo, e o único
  // anúncio restante é o que manda a lead paga para lugar nenhum.
  const v = resumirProntidaoParaPublicar({ ...tudoPronto, pagina_dos_anuncios_reconhecida: banco(1) });
  assert.equal(item(v, "pagina_dos_anuncios_reconhecida").estado, "bloqueia");
  assert.equal(v.podePublicar, false);
});

test("a frase de divergência PRONTA não se lê como bloqueio invertido", () => {
  const v = resumirProntidaoParaPublicar(tudoPronto);
  for (const alvo of DIVERGENCIAS) {
    const frase = item(v, alvo.id).frase;
    assert.match(frase, /confere/, `${alvo.id}: frase de acordo ilegível — ${frase}`);
    assert.doesNotMatch(frase, /BLOQUEIA|DIVERGE/, `${alvo.id}: acordo escrito com palavra de falha`);
  }
});

test("a frase de divergência QUEBRADA diz DIVERGE, não `bloqueia com 3`", () => {
  const v = resumirProntidaoParaPublicar({ ...tudoPronto, proposta_aponta_para_conta_alcancavel: banco(3) });
  const frase = item(v, "proposta_aponta_para_conta_alcancavel").frase;
  assert.match(frase, /DIVERGE/);
  assert.match(frase, /Resolve:/, "bloqueio sem cadeira é bloqueio que ninguém pega");
});

/* ── A CLÁUSULA NOVA: COMPARAR NADA NÃO É CONCORDAR ────────────────────────── */

test("amostra VAZIA não produz `sem divergência` — produz `não medido`", () => {
  // O caso exato: a Graph devolve zero anúncios ativos. Sem esta regra, o item
  // mais perigoso da lista fica verde justamente quando ninguém está olhando.
  const m = medirDivergencias([], 0, "como", "anúncios ativos");
  assert.equal(m.valor, null);
  assert.notEqual(m.valor, 0, "amostra vazia virou acordo");
  assert.match(m.motivoSemMedida, /amostra vazia não é acordo/i);

  const v = resumirProntidaoParaPublicar({ ...tudoPronto, pagina_dos_anuncios_reconhecida: m });
  assert.equal(item(v, "pagina_dos_anuncios_reconhecida").estado, "nao_medido");
  assert.equal(v.podePublicar, false);
});

test("amostra NÃO LIDA também vira `null`, com motivo que nega o acordo", () => {
  assert.equal(medirDivergencias([], null, "como", "anúncios ativos").valor, null);
  assert.equal(medirDivergencias(null, 21, "como", "anúncios ativos").valor, null);
  assert.equal(medirDivergencias(undefined, 21, "como", "x").valor, null);
  assert.match(
    medirDivergencias(null, 21, "como", "anúncios ativos").motivoSemMedida,
    /não é "sem divergência"/i,
  );
});

test("amostra de verdade com desacordo de verdade vira contagem", () => {
  const m = medirDivergencias(["1115087091694606"], 21, "21 anúncios ativos", "anúncios ativos");
  assert.equal(m.valor, 1);
  assert.equal(m.fonte, "banco");
});

test("amostra de verdade SEM desacordo vira zero de verdade", () => {
  const m = medirDivergencias([], 21, "21 anúncios ativos", "anúncios ativos");
  assert.equal(m.valor, 0);
  assert.equal(m.motivoSemMedida, undefined);
});

/* ── FALHA DE LEITURA NUNCA É ZERO ─────────────────────────────────────────── */

test("lista ausente vira `null` — o `?? 0` que transformaria falha em vazio", () => {
  // `lista?.length ?? 0` é a escrita natural e afirma "a biblioteca da conta
  // está vazia" quando a Graph nem respondeu.
  assert.equal(medirLista(null, "como", "as peças").valor, null);
  assert.equal(medirLista(undefined, "como", "as peças").valor, null);
  assert.match(medirLista(null, "como", "as peças").motivoSemMedida, /não é zero/i);
});

test("lista vazia lida COM sucesso é zero de verdade", () => {
  const m = medirLista([], "adimages da conta", "as peças");
  assert.equal(m.valor, 0);
  assert.equal(m.motivoSemMedida, undefined);
});

test("item que a rota ESQUECEU de reportar não nasce pronto", () => {
  const sem = { ...tudoPronto };
  delete sem.conta_alcancavel;
  const v = resumirProntidaoParaPublicar(sem);
  assert.ok(item(v, "conta_alcancavel"), "o item sumiu da lista");
  assert.equal(item(v, "conta_alcancavel").estado, "nao_medido");
  assert.equal(v.podePublicar, false);
});

test("`nao_medido` nunca é `pronto` nem `bloqueia`, em item de qualquer critério", () => {
  for (const alvo of CATALOGO_DE_PUBLICACAO) {
    const v = resumirProntidaoParaPublicar({ ...tudoPronto, [alvo.id]: naoLido() });
    assert.equal(item(v, alvo.id).estado, "nao_medido", `${alvo.id} decidiu sem medida`);
  }
});

test("ambiente: só conta 1 quando TODAS as variáveis estão preenchidas", () => {
  assert.equal(medirVariaveis(["A", "B"], { A: "x", B: "y" }, "presença").valor, 1);
  assert.equal(medirVariaveis(["A", "B"], { A: "x" }, "presença").valor, 0);
  assert.equal(medirVariaveis(["A"], { A: "   " }, "presença").valor, 0, "espaço em branco não é configuração");
});

test("ambiente: o VALOR da variável nunca aparece na medida", () => {
  const segredo = "EAAise-token-secreto-123";
  const m = medirVariaveis(["META_ADS_ACCESS_TOKEN"], { META_ADS_ACCESS_TOKEN: segredo }, "presença");
  assert.equal(JSON.stringify(m).includes(segredo), false, "token vazou na medida");
});

/* ── CAUSA × SINTOMA ───────────────────────────────────────────────────────── */

test("conta inalcançável explica a divergência da lead — sintoma, não tarefa", () => {
  const v = resumirProntidaoParaPublicar({
    ...tudoPronto,
    conta_alcancavel: banco(0),
    conta_da_lead_confere: banco(1),
  });
  const sintoma = item(v, "conta_da_lead_confere");
  assert.equal(sintoma.estado, "consequencia");
  assert.deepEqual(sintoma.bloqueadoPor, ["conta_alcancavel"]);
  assert.match(sintoma.frase, /consequência/i);
});

test("SINTOMA NÃO ENTRA NA FILA DE NINGUÉM", () => {
  const v = resumirProntidaoParaPublicar({
    ...tudoPronto,
    conta_alcancavel: banco(0),
    conta_da_lead_confere: banco(1),
    pagina_dos_anuncios_reconhecida: banco(1),
    proposta_aponta_para_conta_alcancavel: banco(3),
  });
  assert.equal(v.bloqueios, 1, "só a causa conta como bloqueio");
  assert.equal(v.consequencias, 3);
  const soma = Object.values(v.porQuemResolve).reduce((a, b) => a + b, 0);
  assert.equal(soma, 1, "a soma das filas conta causas, nunca sintomas");
});

test("com a causa resolvida, a mesma divergência volta a ser causa própria", () => {
  // `consequencia` não pode virar desculpa permanente: com a conta alcançável e
  // a campanha da lead ainda fora dela, existe defeito próprio a resolver.
  const v = resumirProntidaoParaPublicar({ ...tudoPronto, conta_da_lead_confere: banco(1) });
  assert.equal(item(v, "conta_da_lead_confere").estado, "bloqueia");
  assert.deepEqual(item(v, "conta_da_lead_confere").bloqueadoPor, []);
});

test("`nao_medido` nunca é rebaixado a consequência", () => {
  const v = resumirProntidaoParaPublicar({
    ...tudoPronto,
    conta_alcancavel: banco(0),
    conta_da_lead_confere: naoLido(),
  });
  assert.equal(item(v, "conta_da_lead_confere").estado, "nao_medido");
  assert.deepEqual(item(v, "conta_da_lead_confere").bloqueadoPor, []);
});

test("mídia na Meta e mídia no CRM são itens SEPARADOS, e o de cima explica o de baixo", () => {
  // O caso medido: 25 imagens ACTIVE na biblioteca da conta e 0 linhas em
  // `creative_assets`. Um item só leria "0 mídias" e mandaria o dono produzir
  // uma peça que está pronta há semanas. Com dois itens, a biblioteca fica
  // verde e o bloqueio aponta para o que falta acontecer do lado do CRM.
  const v = resumirProntidaoParaPublicar({
    ...tudoPronto,
    midia_na_biblioteca_da_meta: banco(25),
    midia_referenciavel_pelo_crm: banco(0),
  });
  assert.equal(item(v, "midia_na_biblioteca_da_meta").estado, "pronto");
  const crm = item(v, "midia_referenciavel_pelo_crm");
  assert.equal(crm.estado, "bloqueia", "com a peça existindo lá fora, o buraco é próprio");
  // A cadeira era `codigo` enquanto a importação não existia. Ela existe desde
  // 02/08/2026 (`/api/v1/marketing/biblioteca-de-midia`), e a asserção foi
  // REAPONTADA em vez de removida: uma linha congelada em "codigo" mandaria a
  // liderança pedir a alguém o que ela resolve com um clique — e o portão
  // continuaria verde defendendo a instrução velha.
  assert.equal(crm.quemResolve, "operacao");
  assert.match(crm.oQueFazer, /Importar da biblioteca/);

  // E o inverso: biblioteca vazia explica o CRM vazio.
  const vazio = resumirProntidaoParaPublicar({
    ...tudoPronto,
    midia_na_biblioteca_da_meta: banco(0),
    midia_referenciavel_pelo_crm: banco(0),
  });
  assert.equal(item(vazio, "midia_referenciavel_pelo_crm").estado, "consequencia");
});

/* ── O QUE AINDA DÁ PARA FAZER ─────────────────────────────────────────────── */

test("todo item do catálogo diz o que fazer e o que ainda dá para fazer sem ele", () => {
  for (const alvo of CATALOGO_DE_PUBLICACAO) {
    assert.ok(alvo.semEleDaPara?.length > 20, `${alvo.id} sem saída declarada`);
    assert.ok(alvo.oQueFazer?.length > 20, `${alvo.id} sem ação declarada`);
    assert.ok(QUEM_RESOLVE[alvo.quemResolve], `${alvo.id} sem responsável conhecido`);
    assert.ok(TITULO_DO_GRUPO[alvo.grupo], `${alvo.id} num grupo que a tela não sabe nomear`);
  }
});

test("havendo bloqueio, a tela SEMPRE tem o que oferecer", () => {
  for (const alvo of CATALOGO_DE_PUBLICACAO) {
    const v = resumirProntidaoParaPublicar({
      ...tudoPronto,
      [alvo.id]: banco(alvo.criterio === "sem_divergencia" ? 1 : 0),
    });
    if (!v.bloqueios) continue;
    assert.ok(v.oQueDaParaFazerHoje.length > 0, `${alvo.id}: bloqueio sem saída ensina a fechar a aba`);
  }
});

test("o primeiro passo é a primeira CAUSA na ordem em que a publicação tropeça", () => {
  // Quem começa pela mídia sobe imagem para uma conta que o token não alcança.
  const v = resumirProntidaoParaPublicar({
    ...tudoPronto,
    conta_alcancavel: banco(0),
    midia_referenciavel_pelo_crm: banco(0),
  });
  assert.equal(v.primeiroPasso.id, "conta_alcancavel");
  const ordem = CATALOGO_DE_PUBLICACAO.map((i) => i.id);
  assert.ok(
    ordem.indexOf("conta_alcancavel") < ordem.indexOf("midia_referenciavel_pelo_crm"),
    "a ordem do catálogo precisa seguir a ordem real das portas",
  );
});

/* ── COERÊNCIA DO CATÁLOGO ─────────────────────────────────────────────────── */

test("todo antecedente declarado existe e vem ANTES", () => {
  const posicao = new Map(CATALOGO_DE_PUBLICACAO.map((i, n) => [i.id, n]));
  for (const alvo of CATALOGO_DE_PUBLICACAO) {
    for (const antes of alvo.decorreDe) {
      assert.ok(posicao.has(antes), `${alvo.id} depende de ${antes}, que não existe`);
      assert.ok(posicao.get(antes) < posicao.get(alvo.id), `${alvo.id} depende de ${antes}, que vem depois`);
    }
    assert.ok(!alvo.decorreDe.includes(alvo.id), `${alvo.id} depende de si mesmo`);
  }
});

test("a avaliação devolve a lista INTEIRA, na ordem do catálogo, mesmo sem medida nenhuma", () => {
  // O modo de falha mais silencioso de um painel de pendências é uma pendência
  // que some. Sem medida alguma, os quinze itens continuam lá — todos em
  // `nao_medido`, nenhum omitido, nenhum reordenado.
  const itens = avaliarProntidaoParaPublicar({});
  assert.deepEqual(itens.map((i) => i.id), CATALOGO_DE_PUBLICACAO.map((i) => i.id));
  assert.ok(itens.every((i) => i.estado === "nao_medido"));
});

test("id de item nunca se repete", () => {
  const ids = CATALOGO_DE_PUBLICACAO.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("os cinco itens que o dono pediu estão todos cobertos", () => {
  // A lista de conferência do pedido, atada ao catálogo para nenhum sumir numa
  // refatoração: conta, página+formulário, mídia, pixel, verba+objetivo.
  for (const grupo of ["conta", "destino", "midia", "conversao", "decisao"]) {
    assert.ok(
      CATALOGO_DE_PUBLICACAO.some((i) => i.grupo === grupo),
      `nenhum item cobre "${grupo}"`,
    );
  }
});

test("item de divergência declara mínimo zero — mínimo positivo ali seria letra morta", () => {
  for (const alvo of DIVERGENCIAS) {
    assert.equal(alvo.minimoParaPublicar, 0, `${alvo.id} declara um mínimo que o critério ignora`);
  }
});

/* ── O VOCABULÁRIO É UM SÓ ─────────────────────────────────────────────────── */

test("os estados são LITERALMENTE os do painel da IA, não uma segunda cópia", () => {
  // Duas telas com a mesma palavra e sentidos diferentes é como "não medido"
  // vira "zero" numa delas. A identidade de referência prova que não há cópia
  // para divergir — e quebra na hora em que alguém escrever a segunda.
  assert.equal(EXPLICACAO_DO_ESTADO, ESTADO_DA_IA);
  assert.equal(EXPLICACAO_DO_GERAL, GERAL_DA_IA);
  assert.equal(QUEM_RESOLVE, QUEM_RESOLVE_DA_IA);
});

test("todo estado e todo critério têm explicação escrita para a tela", () => {
  for (const estado of ["pronto", "bloqueia", "consequencia", "nao_medido"]) {
    assert.ok(EXPLICACAO_DO_ESTADO[estado]?.length > 20, `${estado} sem explicação utilizável`);
  }
  for (const estado of ["sem_leitura", "bloqueada", "incerta", "pronta"]) {
    assert.ok(EXPLICACAO_DO_GERAL[estado]?.length > 20, `${estado} sem explicação utilizável`);
  }
  for (const criterio of ["existe", "sem_divergencia"]) {
    assert.ok(EXPLICACAO_DO_CRITERIO[criterio]?.length > 20, `${criterio} sem explicação utilizável`);
  }
});

test("a explicação de `sem_divergencia` avisa que zero só vale depois de comparar", () => {
  assert.match(EXPLICACAO_DO_CRITERIO.sem_divergencia, /depois de ter comparado/i);
});

/* ── NENHUMA FRASE VAZA SEGREDO ────────────────────────────────────────────── */

test("nenhuma frase do painel carrega valor de credencial", () => {
  const casos = [
    tudoPronto,
    { ...tudoPronto, conta_alcancavel: banco(0) },
    { ...tudoPronto, dataset_recebendo: banco(0), dataset_sem_evento_morto: banco(10) },
    Object.fromEntries(CATALOGO_DE_PUBLICACAO.map((i) => [i.id, naoLido()])),
  ];
  for (const caso of casos) {
    const v = resumirProntidaoParaPublicar(caso);
    const texto = [v.frase, ...v.itens.map((i) => i.frase), ...v.oQueDaParaFazerHoje].join(" ");
    assert.doesNotMatch(texto, /Bearer |eyJ|sk-[A-Za-z0-9]|EAA[A-Za-z0-9]{6}/, `frase suspeita: ${texto}`);
  }
});

/* ── O RETRATO MEDIDO EM PRODUÇÃO ──────────────────────────────────────────── */

test("o retrato de 02/08/2026 não produz um painel verde", () => {
  // Não é um teste do mundo — é um teste da TRADUÇÃO. Estes números foram lidos
  // na Graph e no banco de produção naquele dia, e a asserção é que o motor
  // recusa o botão diante deles, nomeando as causas certas.
  const v = resumirProntidaoParaPublicar({
    conta_configurada: { valor: 1, fonte: "ambiente", comoFoiMedido: "META_AD_ACCOUNT_ID" },
    conta_alcancavel: banco(1), // act_2169318190556460 responde
    conta_da_lead_confere: banco(1), // a campanha das 47 leads não está em nenhuma das 4 contas
    pagina_configurada: { valor: 1, fonte: "ambiente", comoFoiMedido: "META_PAGE_ID" },
    pagina_dos_anuncios_reconhecida: banco(1), // 21 anúncios ativos numa Página que o CRM não conhece
    formulario_configurado: { valor: 1, fonte: "ambiente", comoFoiMedido: "META_LEAD_FORM_ID" },
    formulario_ligado_ao_crm: banco(1),
    midia_na_biblioteca_da_meta: banco(25),
    midia_referenciavel_pelo_crm: banco(0), // creative_assets = 0
    dataset_configurado: banco(1),
    dataset_recebendo: banco(1),
    dataset_sem_evento_morto: banco(10), // 10 dead_letter na janela
    dataset_fora_do_modo_de_teste: banco(1), // mode = 'test'
    verba_e_objetivo_aprovados: banco(0), // 3 pendentes, 0 aprovadas
    proposta_aponta_para_conta_alcancavel: banco(3), // as 3 apontam para act_893242765778454
  });

  assert.equal(v.podePublicar, false);
  assert.equal(v.estado, "bloqueada");
  assert.equal(v.naoMedidos, 0, "tudo foi medido — o vermelho é medido, não é escuridão");

  // A conta responde, então nenhuma das divergências é sintoma dela: todas são
  // causa própria e todas têm dono.
  for (const id of ["conta_da_lead_confere", "pagina_dos_anuncios_reconhecida", "proposta_aponta_para_conta_alcancavel"]) {
    assert.equal(item(v, id).estado, "bloqueia", `${id} deveria ser causa própria`);
  }
  assert.equal(item(v, "midia_na_biblioteca_da_meta").estado, "pronto", "a peça existe na Meta");
  assert.equal(item(v, "midia_referenciavel_pelo_crm").estado, "bloqueia", "e o CRM não a alcança");
  assert.ok(v.porQuemResolve.dono >= 1, "o dono tem pelo menos uma causa na mão");
  assert.ok(v.oQueDaParaFazerHoje.length > 0);
});
