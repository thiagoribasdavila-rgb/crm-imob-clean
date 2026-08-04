/**
 * CONTRATO: a fila de aprovação só mostra o que espera uma PESSOA.
 *
 * ── O DEFEITO, ACHADO POR UM CÉTICO EM 02/08/2026 ───────────────────────────
 *
 * `ai_shadow_decisions` ganhou um SEGUNDO escritor no mesmo dia — o vigia
 * `sombra-do-atendimento` — e ele grava exatamente a forma que a fila de
 * decisões pendentes procura: `retido = true`, `decisao_humana = null`.
 *
 * A semântica é oposta. O SLA registra uma PROPOSTA: existe para alguém decidir,
 * e a decisão muda o que acontece com a lead. A sombra registra um ENSAIO:
 * prepara o que faria e retém POR DESENHO, para sempre — nada será enviado, e
 * nenhuma decisão humana muda aquilo.
 *
 * Sem separar, as linhas do ensaio entram na fila de aprovação. E como a
 * consulta ordena por `created_at desc` com teto de 50, elas não apenas
 * aparecem: sendo as mais novas, EXPULSAM as decisões reais. O gestor abre a
 * fila e vê trabalho que ninguém pediu para aprovar, enquanto o que esperava
 * por ele some por baixo do corte.
 *
 * O agente que construiu a sombra tinha visto que a tabela é compartilhada — ele
 * ajustou o PORTÃO `check-vigias-vivos` por causa disso. Consertou a
 * consequência na verificação e não olhou a consequência no PRODUTO.
 *
 * ── POR QUE LISTA DECLARADA, E NÃO "TUDO MENOS A SOMBRA" ────────────────────
 *
 * Excluir pelo nome resolve hoje e falha no próximo: um terceiro agente de
 * ensaio inunda a fila do mesmo jeito, em silêncio. A lista inverte o ônus —
 * quem soma um escritor precisa dizer de qual lado ele está, e o último caso
 * abaixo reprova o agente que não estiver em nenhuma das duas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AGENTES_QUE_ESPERAM_PESSOA,
  AGENTES_DE_ENSAIO,
  esperaUmaPessoa,
  ehEnsaio,
  naoFoiClassificado,
} from "../../lib/ai/quem-espera-uma-pessoa.ts";

/* ── COMPORTAMENTO ───────────────────────────────────────────────────────── */

test("a proposta do SLA espera uma pessoa", () => {
  assert.equal(esperaUmaPessoa("sla-primeiro-contato"), true);
  assert.equal(ehEnsaio("sla-primeiro-contato"), false);
});

test("o ensaio da sombra NÃO entra na fila de ninguém", () => {
  assert.equal(ehEnsaio("sombra-do-atendimento"), true);
  assert.equal(
    esperaUmaPessoa("sombra-do-atendimento"),
    false,
    "o ensaio retém por desenho: não há o que aprovar, e ele expulsaria as decisões reais pelo corte de 50",
  );
});

test("as duas listas são DISJUNTAS — nenhum agente pode ser as duas coisas", () => {
  const nos_dois = AGENTES_QUE_ESPERAM_PESSOA.filter((a) => AGENTES_DE_ENSAIO.includes(a));
  assert.deepEqual(nos_dois, [], "um agente em ambas as listas torna o critério indecidível");
});

test("agente NÃO classificado é reprovado — a omissão fica barulhenta", () => {
  assert.equal(naoFoiClassificado("um-agente-novo-qualquer"), true);
  assert.equal(naoFoiClassificado("sla-primeiro-contato"), false);
  assert.equal(naoFoiClassificado("sombra-do-atendimento"), false);
});

/* ── ESTRUTURA: todo escritor da tabela está classificado ─────────────────── */

const fonteDaFila = readFileSync(
  new URL("../../app/api/v1/crm/decisoes-pendentes/route.ts", import.meta.url),
  "utf8",
);

test("a fila FILTRA por agente — sem isso o ensaio entra junto", () => {
  assert.match(
    fonteDaFila.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
    /\.in\(\s*["'`]agent["'`]\s*,\s*\[\s*\.\.\.AGENTES_QUE_ESPERAM_PESSOA\s*\]\s*\)/,
    "a consulta voltou a ler TODOS os agentes com retido=true",
  );
});

test("todo agente que ESCREVE na tabela está numa das duas listas", () => {
  // O escritor se declara por `agente:` na chamada de `registrarEmSombra`. Um
  // escritor novo que não apareça em nenhuma lista cairia silenciosamente fora
  // da fila — que é o defeito OPOSTO e igualmente mudo: a proposta que ninguém
  // vê nunca é decidida.
  const arquivos = [
    "../../app/api/v2/crm/first-contact-sla/process/route.ts",
    "../../app/api/v2/ai/sombra-do-atendimento/process/route.ts",
  ];
  const encontrados = new Set();
  for (const caminho of arquivos) {
    const src = readFileSync(new URL(caminho, import.meta.url), "utf8");
    for (const m of src.matchAll(/agente:\s*["'`]([a-z0-9-]+)["'`]/g)) encontrados.add(m[1]);
    // o da sombra usa a constante AGENTE do módulo dela
    if (/agente:\s*AGENTE\b/.test(src)) encontrados.add("sombra-do-atendimento");
  }
  assert.ok(encontrados.size >= 2, `esperava achar os dois escritores, achei ${[...encontrados].join(", ")}`);
  for (const agente of encontrados) {
    assert.equal(
      naoFoiClassificado(agente),
      false,
      `"${agente}" escreve em ai_shadow_decisions e não está em AGENTES_QUE_ESPERAM_PESSOA nem em AGENTES_DE_ENSAIO. ` +
        "Diga de qual lado ele está: proposta que espera decisão, ou ensaio que retém por desenho.",
    );
  }
});
