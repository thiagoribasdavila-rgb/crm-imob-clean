/**
 * Contrato do CICLO FECHADO DO STOP LOSS: medir → propor → parar.
 *
 * O motor já tinha teste próprio. Este afere a fronteira que a rota POST
 * atravessa, que é onde mora o risco: ela escreve em `approval_requests`, e uma
 * escrita de governança errada move verba.
 *
 * As três promessas que este arquivo protege:
 *
 *   1. a tela NÃO dita o conteúdo da proposta — só o identificador da regra;
 *   2. decisão que sumiu da medição atual é RECUSADA, não proposta;
 *   3. aprovar autoriza; nada pausa campanha sozinho.
 *
 * Rodar: node --test tests/contracts/stop-loss-proposta.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "marketing", "stop-loss", "route.ts"), "utf8");
const tela = fs.readFileSync(path.join(raiz, "app", "(crm)", "marketing", "page.tsx"), "utf8");

/**
 * Tira comentários antes de afirmar coisas sobre o CÓDIGO.
 *
 * A primeira versão deste arquivo reprovou porque a própria rota explica, em
 * comentário, que a execução continua em `/api/v1/marketing/execute`. Portão que
 * lê prosa como se fosse chamada mede a documentação, não o comportamento — e
 * o remédio óbvio, apagar o comentário, deixaria o código pior.
 */
const semComentarios = (fonte) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const rotaCodigo = semComentarios(rota);

test("o POST remede em vez de acreditar na tela", () => {
  const corpoDoPost = rota.slice(rota.indexOf("export async function POST"));
  assert.match(corpoDoPost, /await medirEAvaliar\(/, "o POST precisa medir de novo");
  assert.match(
    corpoDoPost,
    /medicao\.veredito\.decisoes\.find\(\(d\) => d\.regra === regra\)/,
    "a decisão tem que ser achada na medição do servidor",
  );
});

test("a tela manda apenas a regra — nunca o texto nem o valor", () => {
  const envio = tela.slice(tela.indexOf("levarParaAprovacao"), tela.indexOf("levarParaAprovacao") + 1400);
  assert.match(envio, /JSON\.stringify\(\{ regra \}\)/, "o corpo só pode carregar o identificador");
  assert.ok(
    !/proposta:|motivo:|acao:|title:/.test(envio),
    "se a tela pudesse ditar o conteúdo, o stop loss viraria formulário livre com cara de análise",
  );
});

test("decisão que saiu da medição é recusada com 409", () => {
  assert.match(rota, /DECISAO_VENCIDA/, "falta o código de erro da decisão vencida");
  const trecho = rota.slice(rota.indexOf("DECISAO_VENCIDA") - 400, rota.indexOf("DECISAO_VENCIDA") + 500);
  assert.match(trecho, /if \(!decisao\)/, "a recusa tem que depender da decisão não existir mais");
  assert.match(trecho, /status: 409/, "conflito, não erro genérico — a situação mudou");
});

test("o payload registra o que NÃO foi possível avaliar", () => {
  // Aprovar sabendo do buraco é decisão; aprovar sem saber é acidente.
  assert.match(rota, /naoAvaliado: medicao\.veredito\.naoAvaliado/);
  assert.match(rota, /ressalvas: medicao\.ressalvas/);
  assert.match(rota, /confianca: decisao\.confianca/, "quem aprova precisa saber se o número foi medido ou inferido");
});

test("a proposta nasce pendente e não executa nada", () => {
  assert.match(rota, /status: "pending"/, "proposta nasce pendente");
  assert.match(rota, /executaAoAprovar: false/, "aprovar autoriza; a mudança na Meta é passo à parte");
  assert.ok(
    !/fetch\(|graph\.facebook|adcampaign/i.test(rotaCodigo),
    "a rota do stop loss não pode chamar a Meta — propor e executar são fronteiras diferentes",
  );
});

test("dedupe por regra impede empilhar cópias na caixa da diretoria", () => {
  assert.match(rota, /\.contains\("payload", \{ kind: "stop_loss", regra \}\)/);
  assert.match(rota, /\.eq\("status", "pending"\)/, "só dedupe contra o que ainda não foi decidido");
  assert.match(rota, /jaExistia: true/, "reenviar devolve a proposta existente em vez de criar outra");
});

test("a proposta de verba expira em 48h, não em 7 dias", () => {
  // Condição de verba envelhece rápido: uma decisão de corte parada há uma
  // semana foi tomada sobre outro mês de gasto.
  assert.match(rota, /expires_at: new Date\(Date\.now\(\) \+ 2 \* 86_400_000\)/);
});

test("propor é da liderança, com o mesmo gate do GET", () => {
  const corpoDoPost = rota.slice(rota.indexOf("export async function POST"));
  assert.match(corpoDoPost, /if \(!ehLideranca\(papel\)\)/, "corretor não propõe corte de verba");
  assert.match(corpoDoPost, /status: 403/);
});

test("o botão da tela não some depois de enviar — ele conta o que houve", () => {
  // Botão que desaparece deixa a pessoa sem saber se funcionou.
  assert.match(tela, /propostas\[d\.regra\]/, "o resultado precisa aparecer ao lado da decisão");
  assert.match(tela, /Já estava na caixa de aprovações/, "reenvio precisa dizer que já existia");
});
