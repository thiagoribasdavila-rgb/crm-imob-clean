/**
 * Contrato: O CAPI NÃO PODE FALHAR EM SILÊNCIO.
 *
 * ── O que estava em jogo ────────────────────────────────────────────────────
 *
 * A Conversions API é o que devolve venda e visita para a Meta otimizar. Sem
 * ela, o anúncio aprende só com clique — e o dinheiro vai para quem clica, não
 * para quem compra.
 *
 * O remetente tinha boas guardas (flag, organização, token, dataset, código de
 * teste) mas descobria CREDENCIAL ERRADA só ao enviar: cada evento estourava,
 * cada um consumia o retry, e o operador via ruído de log. Com a flag ligada, o
 * painel diria "CAPI ativado" enquanto nenhuma conversão chegava. O sintoma
 * apareceria semanas depois como custo por lead subindo sem explicação.
 *
 * ── O que foi medido ────────────────────────────────────────────────────────
 *
 * Em 2026-07-27, o token de conversões deste ambiente não passa nem no `/me`:
 * "The application does not belong to system user's business". Foi gerado por
 * um app que não é o do Business dono do dataset. Um GET barato revela isso
 * antes de qualquer POST — e antes de qualquer conversão se perder.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "integrations", "meta", "capi-feedback.ts"), "utf8");
/** Sem comentários: o cabeçalho CITA o defeito para explicar a guarda. */
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("a credencial é verificada ANTES de enviar, não durante", () => {
  const iPreflight = codigo.indexOf("verificarAlcanceDoDataset(apiVersion");
  const iPost = codigo.indexOf('method: "POST"');
  assert.ok(iPreflight > -1, "o preflight sumiu");
  assert.ok(iPost > -1, "o envio sumiu");
  assert.ok(iPreflight < iPost,
    "verificar depois de enviar não verifica nada: a conversão já se perdeu");
});

test("dataset inalcançável RECUSA — não estoura nem envia", () => {
  // Falha fechada, como o resto do arquivo. Estourar faria o chamador tratar
  // credencial errada como falha temporária e tentar de novo para sempre.
  assert.match(codigo, /reason: "dataset_unreachable"/);
  assert.match(codigo, /if \(!alcance\.ok\)[\s\S]{0,200}?return \{[\s\S]{0,120}?sent: false/,
    "precisa RETORNAR recusa, não lançar");
});

test("a recusa diz a causa REAL e quem resolve", () => {
  // A Meta descreve o sintoma no lugar errado com frequência neste produto —
  // já custou semanas. Repassar a mensagem crua repassaria o engano.
  assert.match(fonte, /190 && sub === 465/, "o caso medido: app fora do Business do dataset");
  assert.match(fonte, /é app errado/i, "e a tradução que impede procurar permissão à toa");
  assert.match(fonte, /codigo === 100/, "e o caso de permissão faltando de verdade");
  assert.match(fonte, /Atribuir parceiros/i, "com o caminho no Business Manager");
});

test("rede fora não é acusada de credencial errada", () => {
  // Dizer que é credencial mandaria alguém mexer no Business Manager por causa
  // de um firewall — e ele mexeria numa coisa que estava certa.
  assert.match(fonte, /a verifica[çc][ãa]o n[ãa]o completou/i);
  assert.match(fonte, /sa[íi]da de rede do servidor/i);
});

test("o preflight não lança — quem chama precisa poder recusar", () => {
  const bloco = fonte.slice(fonte.indexOf("async function verificarAlcanceDoDataset"), fonte.indexOf("export type CapiSendOutcome"));
  assert.match(bloco, /try \{/);
  assert.match(bloco, /catch \(erro\)/);
  assert.ok(!/\bthrow\b/.test(bloco), "lançar aqui devolveria o comportamento que a guarda existe para tirar");
});

test("a razão nova está no tipo do resultado", () => {
  // Sem isso o TypeScript aceita a recusa, mas ninguém que consome o resultado
  // sabe que ela existe — e o painel não tem como mostrá-la.
  assert.match(codigo, /\| "dataset_unreachable"/);
});

test("as guardas anteriores continuam de pé", () => {
  // O preflight ACRESCENTA; se ele tivesse substituído alguma, o envio ficaria
  // mais frouxo do que era.
  for (const razao of ["flag_disabled", "org_disabled", "missing_token", "missing_dataset", "missing_test_event_code", "empty_batch"]) {
    assert.match(codigo, new RegExp(`reason: "${razao}"`), `a guarda ${razao} sumiu`);
  }
});
