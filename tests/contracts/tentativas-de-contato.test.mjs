/**
 * Contrato das TENTATIVAS DE CONTATO.
 *
 * `leads.first_contacted_at` é binário: contatado ou não. Não distingue a lead
 * que ninguém ligou da lead que se tentou cinco vezes e nunca atendeu.
 *
 * São situações opostas. A primeira é falha de atendimento; a segunda é lead
 * que provavelmente não presta. Tratar igual faz o corretor descartar a
 * primeira — que era boa — e insistir na segunda.
 *
 * ── O piso mudou de status: de regra para configuração ──────────────────────
 *
 * Até 2026-07-27 o descarte era RECUSADO abaixo de 3 tentativas. A justificativa
 * segue válida em regime, mas pressupõe tentativas nascendo dentro do CRM.
 *
 * Na largada a base é importada: 195 leads cujo histórico de contato nunca
 * virou evento aqui. O piso, nesse cenário, não protege atendimento nenhum —
 * só impede de organizar a base, e ensina o corretor que o sistema atrapalha.
 *
 * Decisão do dono do produto: piso ZERO. Estes testes fixam as duas metades —
 * que hoje FLUI, e que a trava volta inteira ao configurar o env.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const fonte = ler("lib", "crm", "contact-attempts.ts");

/**
 * O módulo lê o env na avaliação. Importar uma cópia nova, com o env já
 * ajustado, é o que permite exercitar os dois regimes no mesmo processo — o
 * sufixo varia a URL para escapar do cache de módulos.
 */
const carregar = (sufixo = "") =>
  import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}${sufixo}`);

delete process.env.ATLAS_TENTATIVAS_MINIMAS;
const t = await carregar();

const ev = (tipo) => ({ event_type: tipo, created_at: new Date().toISOString() });

// ── Regime atual: sem piso ─────────────────────────────────────────────────

test("sem piso configurado, o padrão é ZERO", () => {
  // A falha segura nesta fase é DEIXAR FLUIR: um env ausente ou com erro de
  // digitação não pode travar a operação do corretor.
  assert.equal(t.TENTATIVAS_MINIMAS, 0);
  assert.equal(t.HA_PISO, false);
});

test("lead sem NENHUMA tentativa pode ser descartada", () => {
  const r = t.contarTentativas([], false);
  assert.equal(r.total, 0);
  assert.equal(r.podeDescartar, true, "é o destravamento que o início pediu");
  assert.equal(t.SEM_TENTATIVA.podeDescartar, true, "a constante segue a mesma regra");
});

test("o cartão continua INFORMANDO que ninguém tentou", () => {
  // Informar não custa nada; impedir custa. A contagem é a metade que fica.
  assert.match(t.frasePara(t.contarTentativas([], false)), /está no CRM, mas sem contato/);
});

test("nenhuma frase promete uma trava que não existe", () => {
  // O texto que dizia "mais 2 antes de poder descartar" viraria mentira: o
  // corretor leria um impedimento e encontraria o caminho livre.
  for (const n of [0, 1, 2, 3, 5]) {
    const frase = t.frasePara(t.contarTentativas(Array.from({ length: n }, () => ev("call")), false));
    if (frase) assert.ok(!/antes de poder descartar/.test(frase), `frase com ${n} tentativa(s) promete trava`);
  }
});

test("o descarte com motivo continua sendo o que ensina o algoritmo", () => {
  assert.match(
    t.frasePara(t.contarTentativas([ev("call"), ev("call")], false)),
    /diga o motivo — ele volta para a Meta/,
  );
});

test("a contagem concorda em número e plural", () => {
  assert.match(t.frasePara(t.contarTentativas([ev("call")], false)), /^1 tentativa /);
  assert.match(t.frasePara(t.contarTentativas([ev("call"), ev("call")], false)), /^2 tentativas /);
});

test("quem JÁ RESPONDEU não recebe contador", () => {
  const r = t.contarTentativas([ev("whatsapp")], true);
  assert.equal(r.podeDescartar, true);
  assert.equal(t.frasePara(r), null, "conversa em andamento: o assunto dela é outro");
});

test("só evento de CONTATO conta como tentativa", () => {
  const r = t.contarTentativas([ev("lead_created"), ev("nota"), ev("stage_change")], false);
  assert.equal(r.total, 0, "criar lead não é tentar falar com ela");
});

test("nenhuma coluna nova — conta o que já é registrado", () => {
  assert.match(fonte, /\.from\("lead_events"\)/);
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/contact_attempts|tentativas_count/.test(codigo));
});

// ── A trava não foi apagada: foi desligada ─────────────────────────────────

test("configurar o env RELIGA o piso inteiro", () => {
  // Apagar a regra obrigaria a reescrevê-la quando a operação entrar em regime.
  // Este teste é o que garante que religar é mesmo uma linha de .env.
  process.env.ATLAS_TENTATIVAS_MINIMAS = "3";
  return carregar("//religado").then((comPiso) => {
    delete process.env.ATLAS_TENTATIVAS_MINIMAS;
    assert.equal(comPiso.TENTATIVAS_MINIMAS, 3);
    assert.equal(comPiso.HA_PISO, true);
    assert.equal(comPiso.contarTentativas([], false).podeDescartar, false);
    assert.equal(comPiso.contarTentativas([ev("call"), ev("whatsapp")], false).podeDescartar, false);
    assert.equal(comPiso.contarTentativas([ev("call"), ev("call"), ev("call")], false).podeDescartar, true);
    assert.equal(comPiso.contarTentativas([ev("whatsapp")], true).podeDescartar, true,
      "quem já respondeu escapa do piso: houve contato, a informação existe");
    assert.match(comPiso.frasePara(comPiso.contarTentativas([ev("call")], false)),
      /Mais 2 antes de poder descartar/);
  });
});

test("valor inválido no env cai em ZERO, não em trava", () => {
  process.env.ATLAS_TENTATIVAS_MINIMAS = "três";
  return carregar("//invalido").then((m) => {
    delete process.env.ATLAS_TENTATIVAS_MINIMAS;
    assert.equal(m.TENTATIVAS_MINIMAS, 0, "erro de digitação não pode travar a operação");
  });
});

test("por que o piso existe continua escrito junto da regra", () => {
  // A razão precisa sobreviver ao desligamento: sem ela, religar vira decisão
  // sem fundamento — e o próximo a ler o código apaga a regra de vez.
  assert.match(fonte, /descartar quem nunca foi contatado ensina a\s*\* Meta a evitar um público que talvez fosse ótimo/);
  assert.match(fonte, /ATLAS_TENTATIVAS_MINIMAS/, "e como religar");
});

// ── O servidor, quando a trava existe, é quem recusa ───────────────────────

test("a rota respeita o piso configurado, e o pula quando não há", () => {
  // Bloquear só o botão da tela é sugestão, não regra: qualquer chamada direta
  // à API passaria por cima. E sem piso, nem consulta o banco.
  const pipeline = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(pipeline, /if \(HA_PISO && stage === "perdido" && !reversalOf\) \{/);
  assert.match(pipeline, /MINIMO_DE_TENTATIVAS/);
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
  assert.match(pipeline, /stage === "perdido" && !reversalOf/);
});

test("o MOTIVO do descarte continua obrigatório", () => {
  // O piso saiu; o motivo não. É ele que volta para a Meta como sinal — sem
  // ele o descarte não ensina nada, só some com a lead.
  const pipeline = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(pipeline, /DISCARD_REASON_REQUIRED/);
  assert.match(pipeline, /INVALID_DISCARD_REASON/);
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
