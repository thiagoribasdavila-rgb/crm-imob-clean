/**
 * Contrato da ESCRITA da regra de comissão e prêmio.
 *
 * O lado da LEITURA já existia (`lib/crm/commission-rules.ts`, migration
 * 20260727040000) e a tabela tinha ZERO linhas: nunca houve por onde o diretor
 * dizer quanto cada projeto paga. Este contrato cobre o lado que foi construído.
 *
 * As duas propriedades que ele existe para segurar:
 *
 *   1. PRÊMIO NÃO DISPUTA OS 100%. Ele vem da incorporadora, por unidade, em
 *      outro extrato. Uma regra que fecha 100% de rateio E paga R$ 3.000 de
 *      prêmio é válida — se o prêmio entrasse na soma, toda regra completa com
 *      prêmio seria recusada.
 *
 *   2. FECHAR ANTES DE INSERIR. `regraQueVale` filtra por `ativo = true` e usa
 *      `find()`; ele não olha `vigente_desde`. Duas regras ativas fazem o rateio
 *      depender da ordem que o banco devolveu as linhas — em R$ 470.000, 40%
 *      contra 30% é R$ 4.700 na mão de alguém, sem nenhuma tela acusar.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  linhaParaGravar,
  validarRegra,
  vesperaDe,
} from "../../lib/crm/escrita-de-regra-de-comissao.ts";

const CONTEXTO = {
  organizationId: "org-1",
  developmentId: "dev-1",
  autorId: "autor-1",
  hoje: "2026-07-30",
};

const COMPLETA = {
  pctCorretor: 40,
  pctGerente: 10,
  pctDiretor: 5,
  pctImobiliaria: 45,
  premioValor: 0,
};

test("a regra que fecha 100% é aceita, e o não rateado é zero", () => {
  const v = validarRegra(COMPLETA);
  assert.equal(v.ok, true, v.problemas.map((p) => p.motivo).join(" · "));
  assert.equal(v.naoRateado, 0);
});

test("o PRÊMIO não disputa os 100% da comissão", () => {
  /**
   * Se o prêmio entrasse na soma dos percentuais, esta regra — que é o caso
   * comum, rateio fechado mais prêmio da incorporadora — seria recusada, e o
   * diretor teria de mentir num dos dois campos para conseguir gravar.
   */
  const v = validarRegra({ ...COMPLETA, premioValor: 3000 });
  assert.equal(v.ok, true);
  assert.equal(v.naoRateado, 0, "o prêmio não pode mexer no que sobra da comissão");
});

test("soma acima de 100 é recusada dizendo QUANTO passou", () => {
  // "violates check constraint soma_ate_cem", que é o que o Postgres devolveria,
  // não diz quanto tirar nem de quem.
  const v = validarRegra({ ...COMPLETA, pctImobiliaria: 55 });
  assert.equal(v.ok, false);
  const soma = v.problemas.find((p) => p.campo === "soma");
  assert.ok(soma, "precisa apontar a soma, não um percentual individual");
  assert.match(soma.motivo, /110/, "diz quanto os quatro somam");
  assert.match(soma.motivo, /10/, "e quanto precisa sair");
});

test("percentual negativo é recusado, nomeando de quem é", () => {
  const v = validarRegra({ ...COMPLETA, pctGerente: -1 });
  assert.equal(v.ok, false);
  assert.ok(v.problemas.some((p) => p.campo === "pctGerente" && /gerente/i.test(p.motivo)));
});

test("prêmio negativo é recusado; prêmio zero é legítimo", () => {
  assert.equal(validarRegra({ ...COMPLETA, premioValor: -1 }).ok, false);
  assert.equal(validarRegra({ ...COMPLETA, premioValor: 0 }).ok, true, "zero é 'não há prêmio', não é ausência");
});

test("campo faltando não vira zero silencioso", () => {
  /**
   * `Number(undefined)` é NaN, e um NaN que virasse 0 gravaria "o corretor ganha
   * 0%" como se alguém tivesse decidido isso. A recusa é explícita.
   */
  const v = validarRegra({ ...COMPLETA, pctCorretor: Number.NaN });
  assert.equal(v.ok, false);
  assert.ok(v.problemas.some((p) => p.campo === "pctCorretor"));
});

test("o não rateado é devolvido mesmo quando a regra é VÁLIDA", () => {
  // Rateio que não fecha 100 pode ser intencional (retenção, imposto). Não é
  // erro — mas tem de aparecer, senão vira dinheiro que ninguém sabe de quem é.
  const v = validarRegra({ ...COMPLETA, pctImobiliaria: 35 });
  assert.equal(v.ok, true);
  assert.equal(v.naoRateado, 10);
});

test("a véspera atravessa mês, ano e ano bissexto", () => {
  /**
   * Fechar a regra anterior no MESMO dia em que a nova começa cria um dia com
   * duas regras vigentes — o defeito que a ordem existe para impedir, disfarçado
   * de intervalo. Por isso é a véspera, e por isso ela é testada nas bordas.
   */
  assert.equal(vesperaDe("2026-07-30"), "2026-07-29");
  assert.equal(vesperaDe("2026-08-01"), "2026-07-31", "primeiro dia do mês volta para o último do anterior");
  assert.equal(vesperaDe("2026-01-01"), "2025-12-31", "primeiro dia do ano volta para o último do anterior");
  assert.equal(vesperaDe("2026-03-01"), "2026-02-28", "2026 não é bissexto");
  assert.equal(vesperaDe("2024-03-01"), "2024-02-29", "2024 é bissexto");
});

test("a linha gravada NUNCA tem empreendimento e incorporadora juntos", () => {
  // A tabela tem `check (development_id is null or developer_id is null)`. Mandar
  // os dois faria o insert falhar DEPOIS de a regra anterior já ter sido fechada.
  const linha = linhaParaGravar(COMPLETA, CONTEXTO);
  assert.equal(linha.development_id, "dev-1");
  assert.equal(linha.developer_id, null);
});

test("os números são arredondados à precisão de cada coluna", () => {
  // pct é numeric(6,3) e premio é numeric(14,2). Mandar mais casas faz o Postgres
  // arredondar sozinho — e aí o que o diretor vê na tela não é o que foi gravado.
  const linha = linhaParaGravar(
    { ...COMPLETA, pctCorretor: 40.00049, premioValor: 3000.005 },
    CONTEXTO,
  );
  assert.equal(linha.pct_corretor, 40, "3 casas");
  assert.equal(linha.premio_valor, 3000.01, "2 casas");
});

test("observação em branco vira null, não string vazia", () => {
  const linha = linhaParaGravar({ ...COMPLETA, premioObservacao: "   " }, CONTEXTO);
  assert.equal(linha.premio_observacao, null, "string vazia faria a tela mostrar um campo preenchido e vazio");
});

test("A ROTA FECHA A ANTERIOR ANTES DE INSERIR A NOVA", () => {
  /**
   * Esta asserção é sobre a ORDEM de duas escritas, e ordem não se exercita sem
   * banco — então ela é lida do arquivo. É uma asserção estrutural, e este
   * repositório já pagou caro por confiar nelas; por isso ela não conta palavras,
   * ela compara POSIÇÕES, que é o que a propriedade realmente é.
   *
   * Por que a ordem importa, medido no leitor: `regraQueVale` filtra por
   * `ativo = true` e usa `find()`. Se a inserção viesse primeiro e o fechamento
   * falhasse, duas regras ficariam ativas e o rateio passaria a depender da ordem
   * que o Postgres devolveu as linhas. Do jeito certo, a falha deixa NENHUMA
   * ativa — e `regraQueVale` devolve null, que o leitor documenta como "não sei",
   * nunca como zero.
   */
  const rota = fs.readFileSync(
    path.join(process.cwd(), "app/api/v1/developments/[id]/commission/route.ts"),
    "utf8",
  );
  // Só o corpo do PUT: o GET também menciona `ativo`, e medir o arquivo inteiro
  // deixaria a asserção passar por causa de uma linha de leitura.
  const put = rota.slice(rota.indexOf("export async function PUT"));

  const fechamento = put.indexOf("ativo: false");
  const insercao = put.indexOf(".insert(");
  assert.ok(fechamento > 0, "o PUT precisa encerrar a regra vigente");
  assert.ok(insercao > 0, "o PUT precisa inserir a nova regra");
  assert.ok(
    fechamento < insercao,
    "inserir antes de fechar deixa DUAS regras ativas quando o fechamento falha, e o rateio vira sorteio",
  );

  // E a falha do passo 2 não pode ser silenciosa.
  assert.match(put, /anteriorReaberta/, "a resposta precisa dizer se a regra anterior foi reaberta");
  assert.match(
    put,
    /SEM regra de comissão ativa/,
    "quando não dá para reabrir, a mensagem tem de declarar o estado, não terminar em erro genérico",
  );
});

test("a rota exige papel de direção — comissão não se define de dentro da venda", () => {
  const rota = fs.readFileSync(
    path.join(process.cwd(), "app/api/v1/developments/[id]/commission/route.ts"),
    "utf8",
  );
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(semComentarios, /PAPEIS\s*=\s*\["admin",\s*"director"\]/);
  assert.doesNotMatch(
    semComentarios,
    /roles:\s*\[[^\]]*"broker"/,
    "quem vende não define quanto ganha",
  );
});
