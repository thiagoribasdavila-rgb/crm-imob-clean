/**
 * ORÇAMENTO NÃO É RECEITA — e a venda apurada não pode virar R$ 0.
 *
 * MEDIDO em 2026-08-02, nas DUAS únicas linhas em `status='ganho'` do banco:
 *
 *   Claudia Ferreira ... sale_value_brl = "550000.00" · budget_min/max = NULL
 *   Monique Teles ...... sale_value_brl = NULL        · budget_min = "756000"
 *
 * `leadAsOpportunity` (lib/compat/legacy-v2.ts) resolvia o valor por
 * `first(lead, "value", "budget_max", "budget_min") ?? 0`, e a tabela `leads`
 * não tem coluna `value`. Logo a tela `/sales` exibia as duas INVERTIDAS: a
 * venda de R$ 550.000 como R$ 0, e o orçamento de R$ 756.000 como receita.
 *
 * As linhas abaixo são as de verdade, com os tipos de verdade — `numeric` do
 * Postgres chega como STRING pelo PostgREST, e testar com número puro deixaria
 * passar um `Number()` esquecido.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STATUS_DE_VENDA_FECHADA,
  apurarVgv,
  ehVendaFechada,
  estadoDoFechamento,
  lastroDoVgv,
  reconhecidoComoPendente,
  valorApuradoDaVenda,
  valorVeioDoOrcamento,
} from "../../lib/crm/fechamento-valor-da-venda.ts";

/** A venda apurada de verdade. */
const CLAUDIA = {
  status: "ganho",
  sale_value_brl: "550000.00",
  sale_value_recorded_at: "2026-08-01 18:45:26.118+00",
  budget_min: null,
  budget_max: null,
};
/** A venda fechada que ninguém apurou — e que só tem orçamento declarado. */
const MONIQUE = {
  status: "ganho",
  sale_value_brl: null,
  sale_value_recorded_at: null,
  budget_min: "756000",
  budget_max: null,
};

test("a venda apurada vale o que foi apurado, e chega como string do Postgres", () => {
  assert.equal(valorApuradoDaVenda(CLAUDIA), 550000);
  assert.equal(estadoDoFechamento(CLAUDIA).estado, "apurado");
});

test("REGRESSÃO: a venda de R$ 550.000 não pode ser lida como R$ 0", () => {
  // O defeito literal: `?? 0` transformava a única receita real do produto em
  // zero. Se alguém reintroduzir o fallback, isto abre.
  assert.notEqual(valorApuradoDaVenda(CLAUDIA), 0);
  const apuracao = apurarVgv([CLAUDIA]);
  assert.equal(apuracao.vgv, 550000);
  assert.equal(apuracao.apuradas, 1);
});

test("REGRESSÃO: orçamento declarado NUNCA vira receita", () => {
  // Monique tem R$ 756.000 de orçamento e nenhuma venda apurada.
  assert.equal(valorApuradoDaVenda(MONIQUE), null);
  assert.equal(estadoDoFechamento(MONIQUE).estado, "aguardando");
  // E o VGV não pode encostar nesse número.
  assert.equal(apurarVgv([MONIQUE]).vgv, 0);
  assert.equal(apurarVgv([MONIQUE]).aguardando, 1);
});

test("o VGV das duas linhas reais é 550.000, e NÃO 756.000 nem 1.306.000", () => {
  const apuracao = apurarVgv([CLAUDIA, MONIQUE]);
  assert.equal(apuracao.vgv, 550000);
  assert.equal(apuracao.apuradas, 1);
  assert.equal(apuracao.aguardando, 1);
  assert.equal(apuracao.totalDeVendas, 2);
  assert.equal(apuracao.completo, false);
  // Os dois números errados que a tela podia produzir, nomeados para nunca
  // voltarem: 756.000 (só orçamento) e 1.306.000 (soma dos dois).
  assert.notEqual(apuracao.vgv, 756000);
  assert.notEqual(apuracao.vgv, 1306000);
});

test("o lastro declara a ausência em vez de deixar o total passar por completo", () => {
  const parcial = lastroDoVgv(apurarVgv([CLAUDIA, MONIQUE]));
  assert.match(parcial, /1 de 2/);
  assert.match(parcial, /aguardando/);
  // Ausência declarada NÃO pode ser desenhada como zero nem omitida.
  assert.equal(lastroDoVgv(apurarVgv([])), "Nenhuma venda fechada ainda.");
  assert.match(lastroDoVgv(apurarVgv([CLAUDIA])), /1 venda fechada, com valor informado/);
});

test("valorVeioDoOrcamento nomeia exatamente o defeito antigo", () => {
  // O que a tela fazia ontem: exibir 756000 para Monique.
  assert.equal(valorVeioDoOrcamento(MONIQUE, 756000), true);
  // O que a tela faz agora: não exibir valor nenhum.
  assert.equal(valorVeioDoOrcamento(MONIQUE, null), false);
  // Venda apurada nunca é acusada de vir do orçamento.
  assert.equal(valorVeioDoOrcamento(CLAUDIA, 550000), false);
});

test("zero, vazio e ilegível contam como NÃO apurado", () => {
  for (const bruto of [0, "0", "", null, undefined, "abc", NaN, -1]) {
    assert.equal(valorApuradoDaVenda({ status: "ganho", sale_value_brl: bruto }), null, `valor: ${String(bruto)}`);
  }
});

test("lead que não é venda não entra na apuração", () => {
  for (const status of ["novo", "contato", "proposta", "perdido", "arquivado"]) {
    assert.equal(ehVendaFechada({ status }), false);
    assert.equal(valorApuradoDaVenda({ status, sale_value_brl: "900000" }), null);
    assert.equal(estadoDoFechamento({ status }).estado, "nao_e_venda");
  }
  assert.equal(apurarVgv([{ status: "proposta", sale_value_brl: "900000" }]).vgv, 0);
});

test("as variantes vivas de status contam, com espaço e caixa alta", () => {
  for (const status of STATUS_DE_VENDA_FECHADA) {
    assert.equal(ehVendaFechada({ status }), true);
    assert.equal(ehVendaFechada({ status: status.toUpperCase() }), true);
    assert.equal(ehVendaFechada({ status: ` ${status} ` }), true);
  }
});

/**
 * A TRAVA CONTRA "CAMINHOS DIVERGENTES".
 *
 * Este módulo e `lib/crm/venda-sem-valor.ts` mantêm o mesmo vocabulário de
 * status. Dois lugares que concordam hoje e divergem na próxima edição é a
 * classe de defeito que esta base já pagou. Aqui os dois ficam amarrados: se
 * alguém acrescentar um status num e não no outro, este contrato abre.
 */
test("o vocabulário de status casa com venda-sem-valor.ts", () => {
  for (const status of STATUS_DE_VENDA_FECHADA) {
    assert.equal(reconhecidoComoPendente(status), true, `venda-sem-valor não reconhece "${status}"`);
  }
  assert.equal(reconhecidoComoPendente("proposta"), false);
});

/**
 * O defeito vivia no MAPEAMENTO, não na tela. `lib/compat/legacy-v2.ts` não é
 * arquivo desta entrega (outro agente edita a árvore agora), então a correção
 * foi aplicada na fronteira que é minha: `app/(crm)/sales/page.tsx` deixa de
 * usar o `value` de `leadAsOpportunity` para venda fechada.
 *
 * Esta asserção lê a PROPRIEDADE que importa — a tela chama o módulo puro — em
 * vez de conferir a linha de import, que viraria trava contra qualquer
 * refatoração honesta.
 */
test("a tela de Vendas apura o valor pelo módulo, não pelo mapa de compatibilidade", () => {
  const tela = readFileSync(new URL("../../app/(crm)/sales/page.tsx", import.meta.url), "utf8");
  assert.match(tela, /valorApuradoDaVenda\(/, "a tela precisa apurar o valor pelo módulo puro");
  assert.match(tela, /apurarVgv\(/, "o VGV da tela precisa sair da apuração");
});

/**
 * ── ESTA ASSERÇÃO EXISTE PORQUE A DE CIMA NÃO SEGURA NADA ───────────────────
 *
 * MEDIDO na auditoria desta entrega: revertendo a correção da TELA — trocando
 * `value: ganha ? valorApurado : valorEmAberto` por `value: item.value` e
 * `won: apuracao.vgv` pela soma antiga — o defeito volta INTEIRO (o card
 * "vendas ganhas" exibe de novo os R$ 756.000 de orçamento como receita) e o
 * contrato continuava 14/14 VERDE. As duas asserções acima só perguntam se o
 * NOME do módulo aparece no arquivo; chamar e ignorar passa igual.
 *
 * Aqui a asserção aponta para a PROPRIEDADE que decide — o campo `value` da
 * linha e o campo `won` do card —, não para a linha de import. Se o nome da
 * variável mudar numa refatoração honesta, reaponte a asserção para o novo
 * nome; não a remova, porque o que ela guarda é o único número real do produto.
 */
test("REGRESSÃO DE FIAÇÃO: o valor da linha e o card saem da apuração, e não do `value` do mapa", () => {
  const tela = readFileSync(new URL("../../app/(crm)/sales/page.tsx", import.meta.url), "utf8");
  assert.match(
    tela,
    /value:\s*ganha\s*\?\s*valorApurado/,
    "o `value` da venda fechada tem de vir de valorApuradoDaVenda, não do `first(value, budget_max, budget_min) ?? 0`",
  );
  assert.match(
    tela,
    /won:\s*apuracao\.vgv/,
    "o card 'vendas ganhas' tem de somar a apuração, não `item.value` (que carrega orçamento)",
  );
});

/**
 * "COBRA E DESTRÓI" — o outro lado da prova.
 *
 * A rota do pipeline RECUSA fechar em `ganho` sem valor (`SALE_VALUE_REQUIRED`),
 * ou seja, o corretor é OBRIGADO a digitar o número. Até aqui a ficha da lead
 * não mostrava esse número em lugar nenhum, embora `sale_value_brl` já viesse
 * no `LIVE_LEAD_SELECT` da rota `/api/v1/leads/[id]`. Exigir e não devolver é a
 * classe que já jogou fora 102 motivos de descarte nesta base.
 */
test("a ficha da lead devolve o valor que o fechamento exigiu", () => {
  const ficha = readFileSync(new URL("../../app/(crm)/leads/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(ficha, /sale_value_brl/, "a ficha precisa declarar o campo que a API já devolve");
  assert.match(ficha, /estadoDoFechamento\(/, "a ficha decide pelo módulo puro, não por regra local");
  assert.match(ficha, /brl\.format\(fechamento\.valor\)/, "o valor apurado precisa ser EXIBIDO");
});

/**
 * A rota `POST /api/v1/crm/vendas-sem-valor` existia, tinha contrato e nenhuma
 * tela do CORRETOR a chamava — só o painel de liderança. Quem fecha a venda é
 * quem sabe o número. Este é o oitavo caso de "construído e nunca ligado" desta
 * base, e a asserção existe para ele não voltar a ficar órfão.
 */
test("a ficha da lead liga a rota que registra o valor depois do fechamento", () => {
  const ficha = readFileSync(new URL("../../app/(crm)/leads/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(ficha, /"\/api\/v1\/crm\/vendas-sem-valor"/, "a ficha precisa chamar a rota que já existia");
  /* ── A ASSERÇÃO LÊ O CORPO DO HANDLER, NÃO O ARQUIVO ─────────────────────
     A versão anterior desta linha era `assert.match(ficha, /await load\(\);/)`.
     MEDIDO: `await load();` aparece 8 vezes neste arquivo, 7 delas escritas
     ANTES desta entrega — apagando o `await load()` de dentro de
     `informarValorDaVenda` o contrato seguia 14/14 VERDE. Uma asserção que as
     linhas de outra pessoa já satisfazem não é asserção: é decoração.
     Agora o recorte é o corpo da função, e só ele. */
  const corpo = ficha.match(/async function informarValorDaVenda\(\)[\s\S]*?\n {2}\}/);
  assert.ok(corpo, "o handler `informarValorDaVenda` precisa existir na ficha");
  assert.match(corpo[0], /vendas-sem-valor/, "é este handler que chama a rota");
  // Gravar e não reler deixaria o corretor sem confirmação — o defeito de novo.
  assert.match(corpo[0], /await load\(\)/, "depois de gravar, a ficha relê para o valor VOLTAR à tela");
  // Escrita que falha em silêncio envenena a base de medição desta rodada.
  assert.match(corpo[0], /catch \(/, "a falha da rota precisa ser capturada");
  assert.match(corpo[0], /setErroDoValor\(/, "e precisa virar mensagem na tela, não console");
});

/**
 * O degrau tipográfico precisa EXISTIR.
 *
 * `app/globals.css` define a escala `--text-micro/rotulo/corpo/numero/heroi`.
 * A primeira versão desta entrega escreveu `text-titulo`, que não existe em
 * lugar nenhum do tema: a classe entraria no HTML e não pintaria nada —
 * exatamente a armadilha de regra que não vale, já paga por esta base.
 */
test("a ficha só usa degraus de texto que o tema define", () => {
  const ficha = readFileSync(new URL("../../app/(crm)/leads/[id]/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  /* Lê os degraus dentro de `className`, e NÃO o arquivo inteiro: a primeira
     versão desta asserção varria o texto cru e reprovava por causa do próprio
     comentário que explica o defeito. Portão que conta ocorrências no arquivo
     mede a prosa; o que decide é a classe que chega ao HTML. */
  const degraus = [...ficha.matchAll(/className="[^"]*?\btext-([a-z]+)\b/g)].map((m) => m[1]);
  const nativosDoTailwind = ["xs", "sm", "base", "lg", "xl", "left", "right", "center", "white", "black", "transparent"];
  const escala = ["micro", "rotulo", "corpo", "numero", "heroi"];
  const usados = [...new Set(degraus)].filter((d) => !nativosDoTailwind.includes(d));
  assert.ok(usados.length > 0, "a ficha precisa usar a escala tipográfica do tema");
  for (const degrau of usados) {
    assert.ok(escala.includes(degrau), `text-${degrau} não pertence à escala do tema`);
    assert.match(css, new RegExp(`--text-${degrau}:`), `o degrau text-${degrau} não existe no tema`);
  }
});
