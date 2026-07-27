/**
 * Contrato das TENTATIVAS DE CONTATO.
 *
 * `leads.first_contacted_at` é binário: contatado ou não. Não distingue a lead
 * que ninguém ligou da lead que se tentou cinco vezes e nunca atendeu.
 *
 * São situações opostas. A primeira é falha de atendimento; a segunda é lead
 * que provavelmente não presta. Tratar igual faz o corretor descartar a
 * primeira — que era boa — e insistir na segunda.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const fonte = ler("lib", "crm", "contact-attempts.ts");
const t = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

const ev = (tipo) => ({ event_type: tipo, created_at: new Date().toISOString() });

test("lead sem NENHUMA tentativa não pode ser descartada", () => {
  // "Não deu certo" e "ninguém tentou" são coisas diferentes. Só a primeira é
  // informação; a segunda é o atendimento sendo apagado antes de existir.
  const r = t.contarTentativas([], false);
  assert.equal(r.total, 0);
  assert.equal(r.podeDescartar, false);
  assert.match(t.frasePara(r), /está no CRM, mas sem contato/);
});

test("o piso é de 3 tentativas", () => {
  assert.equal(t.TENTATIVAS_MINIMAS, 3);
  assert.equal(t.contarTentativas([ev("call"), ev("whatsapp")], false).podeDescartar, false);
  assert.equal(t.contarTentativas([ev("call"), ev("whatsapp"), ev("call")], false).podeDescartar, true);
});

test("quem JÁ RESPONDEU pode ser descartada antes do piso", () => {
  // Houve contato: a informação existe. O piso protege quem nunca atendeu.
  const r = t.contarTentativas([ev("whatsapp")], true);
  assert.equal(r.podeDescartar, true);
  assert.equal(t.frasePara(r), null, "sem contato pendente, silêncio");
});

test("só evento de CONTATO conta como tentativa", () => {
  const r = t.contarTentativas([ev("lead_created"), ev("nota"), ev("stage_change")], false);
  assert.equal(r.total, 0, "criar lead não é tentar falar com ela");
});

test("nenhuma coluna nova — conta o que já é registrado", () => {
  // Criar `leads.contact_attempts` daria duas verdades sobre o mesmo fato, e a
  // coluna sairia do lugar no primeiro evento gravado por outro caminho.
  assert.match(fonte, /\.from\("lead_events"\)/);
  // Sem comentários: o cabeçalho CITA `leads.contact_attempts` justamente para
  // explicar por que essa coluna não foi criada.
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/contact_attempts|tentativas_count/.test(codigo));
});

test("a frase muda o que o corretor faz", () => {
  // "tentou 1 de 3" convida a tentar de novo; "3 tentativas, ninguém atendeu"
  // autoriza a fechar o assunto.
  assert.match(t.frasePara(t.contarTentativas([ev("call")], false)), /Mais 2 antes de poder descartar/);
  assert.match(
    t.frasePara(t.contarTentativas([ev("call"), ev("call"), ev("call")], false)),
    /diga o motivo — ele volta para a Meta/,
    "o descarte com motivo é o que ensina o algoritmo",
  );
});

test("o motivo do piso está escrito junto da regra", () => {
  assert.match(fonte, /descartar quem nunca foi contatado ensina o algoritmo a/,
    "a razão do piso precisa estar escrita junto da regra, não só no commit");
});

// ── A trava está no SERVIDOR, não só na tela ───────────────────────────────

test("o descarte é RECUSADO abaixo do piso", () => {
  // Bloquear só o botão da tela é sugestão, não regra: qualquer chamada
  // direta à API passaria por cima.
  const pipeline = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(pipeline, /MINIMO_DE_TENTATIVAS/);
  assert.match(pipeline, /if \(!tentativas\.podeDescartar\)/);
  assert.match(pipeline, /status: 422/);
});

test("a trava vem ANTES de qualquer escrita", () => {
  const pipeline = ler("app", "api", "v1", "pipeline", "route.ts");
  const iTrava = pipeline.indexOf("MINIMO_DE_TENTATIVAS");
  const iEscrita = pipeline.indexOf('.from("leads").update');
  assert.ok(iTrava > -1);
  if (iEscrita > -1) assert.ok(iTrava < iEscrita, "recusar depois de gravar não recusa nada");
});

test("desfazer um descarte NÃO é barrado pelo piso", () => {
  // `reversalOf` é correção de erro, não novo descarte. Barrar impediria de
  // consertar justamente a lead descartada cedo demais.
  const pipeline = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(pipeline, /if \(stage === "perdido" && !reversalOf\) \{/);
});

test("a mensagem distingue 'ninguém tentou' de 'faltam tentativas'", () => {
  const pipeline = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(pipeline, /Ninguém tentou falar com esta lead ainda/);
  assert.match(pipeline, /lead que ninguém alcançou não é lead ruim/);
});

test("a tela avisa ANTES, para a regra não ser descoberta no erro", () => {
  const badge = ler("components", "crm", "contact-attempts-badge.tsx");
  assert.match(badge, /if \(!estado \|\| estado\.houveResposta \|\| !estado\.frase\) return null;/,
    "lead que já respondeu não precisa de contador");
  const pagina = ler("app", "(crm)", "leads", "[id]", "page.tsx");
  assert.match(pagina, /<ContactAttemptsBadge leadId=/);
});

test("a rota de leitura não pode gravar", () => {
  const rota = ler("app", "api", "v1", "crm", "leads", "contact-attempts", "route.ts");
  assert.match(rota, /export async function GET/);
  assert.ok(!/export async function (POST|PATCH|PUT|DELETE)/.test(rota),
    "a trava fica no servidor que grava, não aqui");
});
