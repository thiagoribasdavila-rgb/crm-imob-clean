/**
 * CONTRATO DOS NÍVEIS DE AUTONOMIA (§7).
 *
 * ── A pergunta que estes testes respondem ──────────────────────────────────
 *
 * "O nível 5 é proibido" escrito num documento é uma sugestão. A pergunta real
 * é: existe algum caminho — nível alto, aprovação válida, agente do catálogo,
 * os três juntos — que consiga executar uma ação do nível 5?
 *
 * O teste central deste arquivo tenta TODOS esses caminhos e exige recusa em
 * cada um. Se um dia um deles passar, o teste fica vermelho.
 *
 * Tudo aqui EXECUTA `avaliarAcaoDeAgente`. Nada raspa fonte procurando palavra.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  avaliarAcaoDeAgente,
  validarCatalogo,
  catalogoDeAgentes,
  problemasDoCatalogo,
  nivelDoAgente,
  nivelExigidoPor,
  ehAcaoProibidaAutonomamente,
  aprovacaoValida,
  ACOES_PROIBIDAS_AUTONOMAMENTE,
  NIVEL_PROIBIDO,
  NIVEIS,
} from "../../lib/ai/niveis-de-autonomia.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");

/** Uma aprovação impecável: quem, quando e por quê. */
const APROVACAO_BOA = {
  approvedBy: "diretor@imobiliaria.com.br",
  approvedAt: "2026-07-30T12:00:00.000Z",
  reason: "Campanha de lançamento aprovada na reunião comercial.",
};

// ─────────────────────────────────────────────────────────────────────────────
// O NÍVEL 5 É INAPLICÁVEL — não apenas proibido por escrito
// ─────────────────────────────────────────────────────────────────────────────

test("NENHUM caminho executa uma ação do nível 5 — nem nível 4 com aprovação válida", () => {
  // Este é o teste que decide se a proibição do dono é real ou decorativa.
  // Se a checagem da classe proibida ficasse DEPOIS da checagem de nível e
  // aprovação, um agente nível 4 aprovado passaria — e "proibido" seria só
  // "difícil", sem ninguém violar regra nenhuma.
  for (const { acao } of ACOES_PROIBIDAS_AUTONOMAMENTE) {
    for (const nivel of [0, 1, 2, 3, 4]) {
      for (const aprovacao of [null, APROVACAO_BOA]) {
        const veredicto = avaliarAcaoDeAgente({ agente: "meta-campaign-executor", acao, nivel, aprovacao });
        assert.equal(veredicto.permitido, false,
          `"${acao}" foi PERMITIDA com nível ${nivel} e aprovação ${aprovacao ? "válida" : "ausente"} — a proibição do nível 5 é contornável.`);
        assert.equal(veredicto.proibidaAutonomamente, true,
          `"${acao}" precisa ser marcada como proibida autonomamente, não como falta de nível`);
        assert.equal(veredicto.nivelExigido, NIVEL_PROIBIDO);
        assert.match(veredicto.motivo, /não libera|proibido/i,
          "a recusa precisa explicar que aprovação não resolve");
      }
    }
  }
});

test("as sete ações do nível 5 do dono estão todas declaradas, com o porquê", () => {
  // A lista do §7: apagar dado, mudar permissão, retirar RLS, disparo em massa,
  // prometer financiamento, garantir preço/estoque, ação irreversível.
  const esperadas = [
    "apagar_dado", "mudar_permissao", "retirar_rls", "disparo_em_massa",
    "prometer_financiamento", "garantir_preco_ou_estoque", "acao_irreversivel",
  ];
  const declaradas = ACOES_PROIBIDAS_AUTONOMAMENTE.map((item) => item.acao);
  for (const acao of esperadas) {
    assert.ok(declaradas.includes(acao), `a ação "${acao}" do §7 não está na classe proibida`);
    assert.ok(ehAcaoProibidaAutonomamente(acao), `ehAcaoProibidaAutonomamente("${acao}") devolveu falso`);
  }
  for (const item of ACOES_PROIBIDAS_AUTONOMAMENTE) {
    assert.ok(item.porque && item.porque.length > 20,
      `"${item.acao}" precisa de um porquê que o operador entenda ao ser recusado`);
  }
});

test("nenhum agente consegue DECLARAR nível 5 — o catálogo inteiro é recusado", () => {
  // O tipo TypeScript vai de 0 a 4, mas o valor vem de JSON, onde o tipo não
  // protege nada. A trava tem de existir em tempo de execução.
  const { agentes, problemas } = validarCatalogo([
    { agente: "bom", nivel: 1, porque: "sugere apenas" },
    { agente: "ambicioso", nivel: 5, porque: "quer apagar dado" },
  ]);
  assert.ok(problemas.some((p) => p.agente === "ambicioso"), "nível 5 tinha de ser recusado na validação");
  assert.ok(!agentes.some((a) => a.agente === "ambicioso"), "o agente com nível 5 não pode entrar no catálogo");

  // ── Por que a MENSAGEM é exigida, e não só a recusa ─────────────────────
  //
  // O nível 5 é recusado por DUAS travas independentes: a checagem específica e
  // a faixa 0..4. Isso é bom — defesa em profundidade —, mas fez a mutação que
  // apaga a checagem específica SOBREVIVER: a faixa ainda recusava, só com a
  // mensagem genérica "nível inválido (5)".
  //
  // A mensagem não é cosmética. Quem lê "nível inválido" tenta corrigir o
  // número; quem lê "aprovação não libera, leve para um humano executar fora do
  // agente" entende que o caminho é outro. Proteger a explicação é proteger a
  // única parte que muda o que a pessoa vai fazer depois.
  const problema = problemas.find((p) => p.agente === "ambicioso").problema;
  assert.match(problema, /5/, "o problema precisa nomear o nível recusado");
  assert.match(problema, /proibido/i, "a recusa precisa dizer que o nível 5 é a classe do proibido");
  assert.match(problema, /0\.\.4|0 a 4|declare 0/i, "a recusa precisa dizer o que fazer: declarar 0..4");
});

test("nível fora de 0..4 é recusado, inclusive os quase-válidos", () => {
  for (const nivel of [5, 6, -1, 4.5, "4", null, undefined, true, NaN, Infinity]) {
    const { problemas } = validarCatalogo([{ agente: "x", nivel, porque: "motivo qualquer suficiente" }]);
    assert.ok(problemas.length > 0, `nível ${JSON.stringify(nivel)} passou pela validação`);
  }
  // O outro lado: 0 a 4 passam mesmo.
  for (const nivel of [0, 1, 2, 3, 4]) {
    const { agentes, problemas } = validarCatalogo([{ agente: "x", nivel, porque: "motivo qualquer suficiente" }]);
    assert.equal(problemas.length, 0, `nível ${nivel} é declarável e foi recusado`);
    assert.equal(agentes[0].nivel, nivel);
  }
});

test("nível sem `porque` é recusado", () => {
  // Mesma doutrina de config/workers-schedule.json: sem justificativa, ninguém
  // revisou o nível — e nível não revisado é nível que cresce sozinho.
  const { problemas } = validarCatalogo([{ agente: "x", nivel: 4, porque: "  " }]);
  assert.ok(problemas.some((p) => /porque/i.test(p.problema)), "nível sem porquê tinha de ser recusado");
});

// ─────────────────────────────────────────────────────────────────────────────
// OS DOIS LADOS DE CADA NÍVEL
// ─────────────────────────────────────────────────────────────────────────────

test("cada nível ENTREGA o que lhe cabe e RECUSA o que está acima", () => {
  const casos = [
    { nivel: 0, pode: "observar", naoPode: "recomendar" },
    { nivel: 1, pode: "recomendar", naoPode: "preparar_rascunho" },
    { nivel: 2, pode: "preparar_mensagem", naoPode: "mover_etapa" },
    { nivel: 3, pode: "mover_etapa", naoPode: "enviar_mensagem" },
  ];
  for (const caso of casos) {
    const permitido = avaliarAcaoDeAgente({ agente: "teste", acao: caso.pode, nivel: caso.nivel });
    assert.equal(permitido.permitido, true,
      `nível ${caso.nivel} (${NIVEIS[caso.nivel].nome}) tinha de poder "${caso.pode}": ${permitido.motivo}`);

    const recusado = avaliarAcaoDeAgente({ agente: "teste", acao: caso.naoPode, nivel: caso.nivel });
    assert.equal(recusado.permitido, false,
      `nível ${caso.nivel} conseguiu "${caso.naoPode}", que exige nível ${nivelExigidoPor(caso.naoPode)}`);
  }
});

test("nível 4 exige aprovação REGISTRADA: sem ela recusa, com ela entrega", () => {
  const acoesExternas = ["enviar_mensagem", "redistribuir_lead", "iniciar_campanha", "alterar_condicao_comercial"];
  for (const acao of acoesExternas) {
    assert.equal(nivelExigidoPor(acao), 4, `"${acao}" age para fora e tem de exigir nível 4`);

    const sem = avaliarAcaoDeAgente({ agente: "meta-campaign-executor", acao, nivel: 4, aprovacao: null });
    assert.equal(sem.permitido, false, `"${acao}" passou sem aprovação nenhuma`);
    assert.equal(sem.exigeAprovacao, true);

    const com = avaliarAcaoDeAgente({ agente: "meta-campaign-executor", acao, nivel: 4, aprovacao: APROVACAO_BOA });
    assert.equal(com.permitido, true, `"${acao}" foi recusada mesmo com aprovação válida: ${com.motivo}`);
    assert.equal(com.aprovacaoRecebida, true);
  }
});

test("aprovação pela metade não é aprovação", () => {
  // Assinatura em branco não é o que o dono pediu: quem, quando e por quê.
  const incompletas = [
    { approvedBy: "", approvedAt: "2026-07-30T12:00:00Z", reason: "ok" },
    { approvedBy: "diretor", approvedAt: "", reason: "ok" },
    { approvedBy: "diretor", approvedAt: "2026-07-30T12:00:00Z", reason: "   " },
    { approvedBy: "diretor", approvedAt: "ontem à tarde", reason: "ok" },
    { approvedBy: "diretor", approvedAt: "2026-07-30T12:00:00Z" },
    null,
    undefined,
    {},
  ];
  for (const aprovacao of incompletas) {
    assert.equal(aprovacaoValida(aprovacao), false, `aprovação inválida foi aceita: ${JSON.stringify(aprovacao)}`);
    const veredicto = avaliarAcaoDeAgente({ agente: "meta-campaign-executor", acao: "iniciar_campanha", nivel: 4, aprovacao });
    assert.equal(veredicto.permitido, false, `ação externa passou com aprovação inválida: ${JSON.stringify(aprovacao)}`);
  }
  assert.equal(aprovacaoValida(APROVACAO_BOA), true, "a aprovação completa tinha de ser aceita");
});

test("ação DESCONHECIDA exige nível 4 — presumir 'inofensiva' é o erro caro", () => {
  // Um verbo que ninguém classificou pode muito bem ser externo. Presumir
  // "interno e reversível" para o que não se conhece é o erro que só aparece
  // depois de a mensagem ter saído.
  assert.equal(nivelExigidoPor("fazer_algo_que_ninguem_classificou"), 4);
  const veredicto = avaliarAcaoDeAgente({ agente: "copilot", acao: "verbo_novo_qualquer" });
  assert.equal(veredicto.permitido, false, "ação desconhecida não pode passar por omissão de catálogo");
});

test("AGENTE NÃO DECLARADO nasce no nível 0", () => {
  // Falha fechada de verdade. Se um agente novo herdasse nível permissivo, a
  // declaração de nível seria opcional na prática — e todo agente novo poderia
  // agir para fora antes de qualquer revisão.
  const inexistente = "agente-que-ninguem-cadastrou-" + Date.now();
  assert.equal(nivelDoAgente(inexistente), 0, "agente fora do catálogo tem de ser nível 0");
  const veredicto = avaliarAcaoDeAgente({ agente: inexistente, acao: "recomendar" });
  assert.equal(veredicto.permitido, false, "agente não declarado conseguiu recomendar");
  assert.match(veredicto.motivo, /não está no catálogo/i, "a recusa precisa dizer que falta declarar o agente");
});

// ─────────────────────────────────────────────────────────────────────────────
// O CATÁLOGO REAL DESTE PRODUTO
// ─────────────────────────────────────────────────────────────────────────────

test("o catálogo declarado é válido e cobre os agentes que de fato consomem IA", () => {
  assert.deepEqual(problemasDoCatalogo(), [], "o catálogo declarado tem problema");
  const catalogo = catalogoDeAgentes();
  assert.ok(catalogo.length >= 8, `catálogo com ${catalogo.length} agentes parece incompleto`);

  // Os agentes medidos em ai_usage_events no banco canônico em 2026-07-30. Um
  // agente que consome IA e não está declarado roda como nível 0 — o que é
  // seguro, mas silencioso. Aqui a ausência fica explícita.
  const medidosEmProducao = ["copilot", "campaign-analyst", "andromeda-pipeline-advisor", "creative-studio"];
  for (const agente of medidosEmProducao) {
    assert.ok(catalogo.some((item) => item.agente === agente),
      `"${agente}" tem consumo medido em ai_usage_events e não está no catálogo de níveis`);
  }
});

test("só o agente que age para fora está no nível 4", () => {
  // Nível 4 é o que gasta dinheiro do dono e fala com o cliente. Se a lista
  // crescer, é decisão consciente e este teste obriga a atualizá-la.
  const quatros = catalogoDeAgentes().filter((item) => item.nivel === 4).map((item) => item.agente).sort();
  assert.deepEqual(quatros, ["meta-campaign-executor"],
    `agentes em nível 4 mudaram para [${quatros}] — nível 4 age para fora; confirme que é intencional`);
});

test("o catálogo do JSON declara `porque` em todas as linhas", () => {
  const declarado = JSON.parse(fs.readFileSync(path.join(raiz, "config", "orcamento-e-autonomia-da-ia.json"), "utf8"));
  for (const linha of declarado.agentes.catalogo) {
    assert.ok(String(linha.porque || "").trim().length > 15,
      `agente "${linha.agente}" tem nível ${linha.nivel} sem justificativa utilizável`);
  }
});
