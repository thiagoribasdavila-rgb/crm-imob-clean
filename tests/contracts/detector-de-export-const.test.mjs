import { strict as assert } from "node:assert";
import test from "node:test";

/**
 * O DETECTOR DE "REGRA SEM CHAMADOR" PRECISA ENXERGAR CONSTANTE, NÃO SÓ FUNÇÃO.
 *
 * ── O defeito que este arquivo impede de voltar ────────────────────────────
 *
 * `scripts/check-regra-sem-chamador.mjs` reconhecia só duas formas de export:
 *
 *   export function nome(...)
 *   export const nome = (...) / export const nome = async ...
 *
 * `export const AGENTES_QUE_ESPERAM_PESSOA = ["sla-primeiro-contato"] as const`
 * não casa com nenhuma das duas — não é chamada de função, é atribuição de
 * dado. O efeito medido em 04/08/2026: `lib/ai/quem-espera-uma-pessoa.ts`
 * entrou na linha de base como "sem chamador" enquanto DUAS rotas de produção
 * (`app/api/v1/crm/decisoes-pendentes/route.ts` e
 * `app/api/v1/atlas/sala/cartoes/route.ts`) importavam exatamente essa
 * constante — o recorte que impede o ensaio da sombra de expulsar as decisões
 * reais da fila do gestor.
 *
 * Um portão que acusa quem está certo é pior que nenhum portão: a próxima
 * pessoa que ler a lista de base aprende a desconfiar dela, e o dia em que a
 * quinta ocorrência REAL nascer, ninguém mais vai investigar a sexta linha.
 *
 * ── Por que ler o regex do ARQUIVO, e não reimplementá-lo aqui ─────────────
 *
 * Reimplementar o regex neste teste criaria dois lugares para a mesma regra
 * divergirem sem nenhum aviso — exatamente a classe de defeito que este
 * trabalho persegue o tempo todo. Este teste aplica o regex do PRÓPRIO
 * arquivo contra amostras conhecidas, então uma mudança no script já é testada
 * pelo comportamento real, não por uma cópia que pode ter ficado para trás.
 */
import { readFileSync } from "node:fs";

const SCRIPT = new URL("../../scripts/check-regra-sem-chamador.mjs", import.meta.url);
const CODIGO = readFileSync(SCRIPT, "utf8");

/**
 * Extrai o padrão de export usado pelo script — a MESMA fonte de verdade que
 * `check-regra-sem-chamador.mjs` usa, não uma reescrita paralela.
 */
function extrairExportados(fonteDeAmostra) {
  // O padrão de extração para no primeiro `/gm)` — os literais do script têm
  // `)` DENTRO deles (grupo não-capturante `(?:async\s+)?`), então um
  // `[^)]+?` ingênuo corta cedo demais. Ancorar em `/gm)` (a flag encerrando o
  // literal, seguida do parêntese que fecha `matchAll(...)`) é específico o
  // bastante para não confundir com os parênteses internos do padrão.
  const padroes = [...CODIGO.matchAll(/fonte\.matchAll\((\/.+?\/gm)\)/g)].map((m) => m[1]);
  assert.ok(
    padroes.length >= 2,
    "esperava pelo menos 2 padrões de export no script (função + const/let); " +
      "encontrei " + padroes.length + ". A extração de padrões deste teste ficou para trás.",
  );
  const nomes = [];
  for (const literal of padroes) {
    const corpo = literal.slice(1, literal.lastIndexOf("/"));
    const flags = literal.slice(literal.lastIndexOf("/") + 1);
    const regex = new RegExp(corpo, flags);
    for (const m of fonteDeAmostra.matchAll(regex)) nomes.push(m[1]);
  }
  return nomes;
}

test("export const de LISTA de dados é reconhecido (o caso real que falhava)", () => {
  const amostra = `export const AGENTES_QUE_ESPERAM_PESSOA = ["sla-primeiro-contato"] as const;\n`;
  const nomes = extrairExportados(amostra);
  assert.ok(
    nomes.includes("AGENTES_QUE_ESPERAM_PESSOA"),
    "uma constante exportada como lista de dados não foi reconhecida — o falso " +
      "positivo de 04/08/2026 voltou.",
  );
});

test("export function continua reconhecido (não regrediu ao consertar o const)", () => {
  const amostra = `export function esperaUmaPessoa(agente) {\n  return true;\n}\n`;
  const nomes = extrairExportados(amostra);
  assert.ok(nomes.includes("esperaUmaPessoa"), "export de função parou de ser reconhecido.");
});

test("export const de FUNÇÃO continua reconhecido nas duas formas", () => {
  const amostra =
    `export const primeira = (x) => x;\n` +
    `export const segunda = async (x) => x;\n`;
  const nomes = extrairExportados(amostra);
  assert.ok(nomes.includes("primeira"), "`export const nome = (` parou de ser reconhecido.");
  assert.ok(nomes.includes("segunda"), "`export const nome = async` parou de ser reconhecido.");
});

test("export type NÃO é reconhecido — tipo não sobrevive ao build", () => {
  const amostra = `export type AgenteDeSombra = "a" | "b";\n`;
  const nomes = extrairExportados(amostra);
  assert.ok(
    !nomes.includes("AgenteDeSombra"),
    "um `export type` foi capturado como se fosse valor em tempo de execução — " +
      "cobrar chamador de algo que não existe depois do build é ruído garantido.",
  );
});

test("export let também é reconhecido — mesma forma de atribuição que const", () => {
  const amostra = `export let contador = 0;\n`;
  const nomes = extrairExportados(amostra);
  assert.ok(nomes.includes("contador"), "`export let` não é reconhecido, mesmo tendo a mesma forma de `export const`.");
});
