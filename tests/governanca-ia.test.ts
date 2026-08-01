/**
 * O PRIMEIRO teste automatizado do repositório.
 *
 * Contexto de por que ele existe, e por que começa exatamente aqui: até hoje o projeto
 * tinha 224 scripts `check-*.mjs` e ZERO testes. Aqueles scripts leem TEXTO-FONTE e
 * nunca executam o produto — e um verificador que procura substring aprova por AUSÊNCIA.
 * O caso real: o check da fase 089 passa justamente porque o código NÃO tem `observedAt`
 * nem `content_hash`; ele certifica a lacuna como se fosse conformidade.
 *
 * Este arquivo é o oposto disso: EXECUTA a função e afirma sobre o valor devolvido.
 *
 * Roda com o test runner embutido do Node — zero dependência nova, zero custo:
 *     node --test tests/
 *
 * O alvo é `planCommercialAI`, o núcleo de governança que decide, a cada chamada de IA,
 * qual provedor usar, quanto token gastar e se um humano precisa revisar. É o lugar onde
 * a doutrina do produto deixa de ser texto em documento e vira comportamento — por isso
 * é o que mais merece um teste que quebre em vermelho quando alguém a afrouxar.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planCommercialAI, type OrchestratedTask, type RoutedProvider } from "../lib/ai/commercial-orchestrator.ts";

const TAREFAS: OrchestratedTask[] = ["fast", "commercial", "reasoning", "research"];
const ECONOMICOS: RoutedProvider[] = ["deepseek", "qwen", "kimi", "glm"];

describe("governança da IA — as garantias que não podem regredir", () => {
  test("ação externa NUNCA é autorizada, em nenhuma combinação", () => {
    // A doutrina inteira do produto depende disto: a IA propõe, o humano aprova.
    // Varremos o espaço de combinações em vez de testar um caso feliz — se alguém
    // abrir uma exceção "só para este fluxo", o teste encontra.
    for (const task of TAREFAS) {
      for (const containsPersonalData of [true, false]) {
        for (const feature of ["lead-summary", "proposal-draft", "campaign-decision", "qualquer-coisa"]) {
          const plano = planCommercialAI({ task, containsPersonalData, feature });
          assert.equal(
            plano.externalActionAllowed,
            false,
            `externalActionAllowed virou true em task=${task} pessoal=${containsPersonalData} feature=${feature}`,
          );
        }
      }
    }
  });

  test("dado pessoal jamais vai para provedor econômico", () => {
    // Os provedores baratos são de terceiros fora do contrato de dados do produto.
    // Barganhar privacidade por custo é exatamente o tipo de decisão que se toma sem
    // querer, numa linha de configuração.
    for (const task of TAREFAS) {
      const plano = planCommercialAI({ task, containsPersonalData: true, feature: "lead-360" });
      for (const economico of ECONOMICOS) {
        assert.ok(
          !plano.providerOrder.includes(economico),
          `provedor econômico ${economico} apareceu na rota de dado pessoal (task=${task})`,
        );
      }
      assert.equal(plano.dataClass, "personal");
      assert.equal(plano.costPolicy, "trusted_personal_data_only");
    }
  });

  test("dado pessoal sempre exige revisão humana", () => {
    for (const task of TAREFAS) {
      const plano = planCommercialAI({ task, containsPersonalData: true, feature: "lead-360" });
      assert.equal(plano.humanReviewRequired, true, `revisão humana caiu para task=${task} com dado pessoal`);
    }
  });

  test("features de dinheiro e contrato são sempre risco alto com revisão humana", () => {
    // A lista vem do próprio orquestrador. Se alguém renomear uma feature e ela sair do
    // padrão sem querer, o risco despenca em silêncio — e é justamente o dinheiro do dono.
    const sensiveis = [
      "proposal-draft",
      "contract-review",
      "credit-analysis",
      "financial-projection",
      "commission-split",
      "campaign-decision",
      "lead-transfer",
    ];
    for (const feature of sensiveis) {
      const plano = planCommercialAI({ task: "fast", feature });
      assert.equal(plano.riskLevel, "high", `feature sensível "${feature}" não foi classificada como risco alto`);
      assert.equal(plano.humanReviewRequired, true, `feature sensível "${feature}" dispensou revisão humana`);
    }
  });

  test("o fallback local está sempre presente e é o último recurso", () => {
    // Sem isto, uma indisponibilidade de provedor vira indisponibilidade do produto.
    // A IA não pode ser ponto único de falha do atendimento comercial.
    for (const task of TAREFAS) {
      for (const containsPersonalData of [true, false]) {
        const plano = planCommercialAI({ task, containsPersonalData, feature: "x" });
        assert.ok(plano.providerOrder.includes("local"), `rota sem fallback local (task=${task})`);
        assert.equal(plano.fallbackProvider, "local");
      }
    }
  });

  test("provedor indisponível é removido da rota, mas o local sobrevive", () => {
    const plano = planCommercialAI({
      task: "fast",
      feature: "x",
      available: { qwen: false, deepseek: false, openai: false },
    });
    assert.ok(!plano.providerOrder.includes("qwen"));
    assert.ok(!plano.providerOrder.includes("deepseek"));
    assert.ok(!plano.providerOrder.includes("openai"));
    assert.ok(plano.providerOrder.includes("local"), "todos indisponíveis e o local sumiu: o produto ficaria sem saída");
  });

  test("pesquisa exige provedor com citação — não se responde ao mercado de memória", () => {
    const plano = planCommercialAI({ task: "research", feature: "market-study" });
    assert.equal(plano.costPolicy, "research_with_sources");
    assert.ok(plano.providerOrder.includes("perplexity"));
    assert.ok(plano.routingReasons.includes("citations_required"));
  });

  test("a rota nunca repete provedor", () => {
    // Ordem com duplicata faz o failover tentar duas vezes o mesmo destino morto,
    // dobrando a latência que o corretor sente antes de cair no fallback.
    for (const task of TAREFAS) {
      const plano = planCommercialAI({ task, feature: "x", configuredOrder: ["openai", "openai", "local"] });
      assert.equal(
        new Set(plano.providerOrder).size,
        plano.providerOrder.length,
        `rota com provedor repetido (task=${task}): ${plano.providerOrder.join(", ")}`,
      );
    }
  });

  test("todo plano declara orçamento de token positivo e finito", () => {
    // Orçamento ausente ou zero é como o custo chegou a 0.00 com selo de medido:
    // o número existe, não significa nada, e ninguém percebe.
    for (const task of TAREFAS) {
      const plano = planCommercialAI({ task, feature: "x" });
      assert.ok(Number.isFinite(plano.tokenBudget), `orçamento não finito em task=${task}`);
      assert.ok(plano.tokenBudget > 0, `orçamento não positivo em task=${task}`);
    }
  });

  test("o plano explica a si mesmo — sempre há motivo de roteamento registrado", () => {
    // Auditoria depende disto: sem razão registrada, não há como explicar depois por que
    // aquela chamada foi para aquele provedor.
    for (const task of TAREFAS) {
      const plano = planCommercialAI({ task, feature: "x" });
      assert.ok(plano.routingReasons.length >= 3, `plano sem justificativa suficiente (task=${task})`);
      assert.ok(plano.routingReasons.includes(`task_${task}`));
    }
  });
});
