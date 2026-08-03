/**
 * CONTRATO: a Sala de Comando responde o que sabe, e diz quando não sabe.
 *
 * A direção "a IA é a interface" tem um modo de falha próprio, e é silencioso:
 * a pessoa pergunta uma coisa e recebe um cartão plausível sobre outra. Não há
 * erro na tela, não há vermelho em lugar nenhum — há um número certo respondendo
 * a pergunta errada, e decisão tomada em cima dele.
 *
 * Estes casos existem para que esse desfecho seja impossível por construção:
 * pergunta vaga devolve opções, pergunta específica ganha da genérica, e nada
 * que não case devolve cartão.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTENCOES,
  normalizar,
  resolverPergunta,
  perguntasSugeridas,
} from "../../lib/atlas/perguntas-da-sala.ts";

/* ── O QUE IMPEDE O CARTÃO ERRADO ─────────────────────────────────────────── */

test("pergunta vaga NÃO vira cartão — devolve as opções", () => {
  for (const vaga of ["leads", "e aí", "me mostra", "?", "atlas"]) {
    const r = resolverPergunta(vaga);
    assert.equal(
      r.tipo,
      "nao_entendi",
      `"${vaga}" casou uma intenção. Pergunta vaga respondida com o cartão mais parecido é o defeito silencioso desta tela.`,
    );
    assert.ok(r.sugestoes.length > 0, "não entender sem oferecer o que existe deixa a pessoa sem saída");
  }
});

test("texto vazio devolve sugestões, não erro nem cartão", () => {
  const r = resolverPergunta("   ");
  assert.equal(r.tipo, "nao_entendi");
  assert.ok(r.sugestoes.length >= 1);
});

/* ── A ESPECÍFICA GANHA DA GENÉRICA ───────────────────────────────────────── */

test("\"quantas mornas sem contato?\" cai na intenção de 2 grupos, não na de 1", () => {
  const r = resolverPergunta("quantas mornas sem contato?");
  assert.equal(r.tipo, "entendi");
  assert.equal(
    r.intencao.id,
    "mornas-sem-contato",
    "quem pediu o recorte estreito recebeu o largo: responder 182 a quem perguntou pelas 171 é errar por excesso",
  );
  // A genérica continua à mão, para corrigir em um clique.
  assert.ok(r.alternativas.some((i) => i.id === "mornas"));
});

test("\"leads mornas\" sozinho cai na genérica", () => {
  const r = resolverPergunta("leads mornas");
  assert.equal(r.tipo, "entendi");
  assert.equal(r.intencao.id, "mornas");
});

test("as TRÊS intenções que dividem o grupo \"sem contato\" não se sequestram", () => {
  // perdidas-sem-contato, mornas-sem-contato e sem-primeiro-contato compartilham
  // o mesmo grupo de termos. As duas primeiras se distinguem só pelo OUTRO grupo,
  // e a terceira é a genérica. Um termo a mais no lugar errado faz uma engolir as
  // outras — e a pessoa recebe 409 quando perguntou por 160, sem saber.
  const casos = [
    ["quantas perdidas sem contato?", "perdidas-sem-contato"],
    ["mornas sem contato", "mornas-sem-contato"],
    ["leads sem primeiro contato", "sem-primeiro-contato"],
  ];
  for (const [pergunta, esperado] of casos) {
    const r = resolverPergunta(pergunta);
    assert.equal(r.tipo, "entendi", `"${pergunta}" deixou de casar`);
    assert.equal(r.intencao.id, esperado, `"${pergunta}" caiu em "${r.intencao.id}" em vez de "${esperado}"`);
  }
});

test("acento e caixa não mudam a resposta", () => {
  const a = resolverPergunta("DECISÕES PENDÊNCIAS");
  const b = resolverPergunta("decisoes pendencias");
  assert.equal(a.tipo, "entendi");
  assert.equal(b.tipo, "entendi");
  assert.equal(a.intencao.id, b.intencao.id);
});

test("empate de especificidade devolve as candidatas — quem escolhe é a pessoa", () => {
  const catalogo = [
    { id: "a", titulo: "A", responde: "a", termos: [["xis"]], acoes: [{ rotulo: "ir", href: "/a" }] },
    { id: "b", titulo: "B", responde: "b", termos: [["xis"]], acoes: [{ rotulo: "ir", href: "/b" }] },
  ];
  const r = resolverPergunta("quero xis", catalogo);
  assert.equal(r.tipo, "ambigua", "desempatar sozinho é escolher pela pessoa sem ela saber");
  assert.equal(r.candidatas.length, 2);
});

/* ── O CATÁLOGO NÃO PODE NASCER QUEBRADO ──────────────────────────────────── */

test("toda intenção tem ao menos uma AÇÃO", () => {
  for (const i of INTENCOES) {
    assert.ok(
      i.acoes.length >= 1,
      `"${i.id}" responde e não deixa agir. Dizer "são 171" sem próximo passo é a versão elegante de não responder.`,
    );
    for (const a of i.acoes) {
      assert.ok(a.href.startsWith("/"), `"${i.id}" tem ação para "${a.href}" — ação precisa apontar para dentro do produto`);
      assert.ok(a.rotulo.trim().length > 0, `"${i.id}" tem ação sem rótulo`);
    }
  }
});

test("toda intenção tem termos, e nenhum termo é vazio", () => {
  for (const i of INTENCOES) {
    assert.ok(i.termos.length >= 1, `"${i.id}" não casa com nada`);
    for (const grupo of i.termos) {
      assert.ok(grupo.length >= 1, `"${i.id}" tem grupo de termos vazio — grupo vazio nunca casa, a intenção fica morta`);
      for (const termo of grupo) {
        assert.ok(normalizar(termo).length > 0, `"${i.id}" tem termo vazio`);
      }
    }
  }
});

test("os ids são únicos", () => {
  const ids = INTENCOES.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "id repetido torna indecidível qual cartão foi mostrado");
});

test("toda intenção é ALCANÇÁVEL por pelo menos um dos próprios termos", () => {
  // Uma intenção cujos termos nunca a elegem é código morto que parece vivo:
  // ela aparece no catálogo, some da resposta, e ninguém percebe.
  for (const i of INTENCOES) {
    const frase = i.termos.map((grupo) => grupo[0]).join(" ");
    const r = resolverPergunta(frase);
    assert.notEqual(r.tipo, "nao_entendi", `"${i.id}" não é alcançável nem pelos próprios termos (frase: "${frase}")`);
    if (r.tipo === "entendi") {
      assert.equal(r.intencao.id, i.id, `"${i.id}" é sequestrada por "${r.intencao.id}" quando se usa os termos dela`);
    }
  }
});

test("as sugestões iniciais saem do catálogo, e são poucas", () => {
  const s = perguntasSugeridas();
  assert.ok(s.length >= 1 && s.length <= 4, "a tela em branco não pode despejar o catálogo inteiro");
  for (const i of s) assert.ok(INTENCOES.some((c) => c.id === i.id));
});
