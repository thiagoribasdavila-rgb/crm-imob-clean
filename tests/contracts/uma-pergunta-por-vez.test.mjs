/**
 * Contrato da QUALIFICAÇÃO CONVERSACIONAL — as três promessas da Fase 86.
 *
 * `docs/STRUCTURED_CONVERSATIONAL_QUALIFICATION_PHASE_86.md` escreve o requisito:
 * "O Atlas sugere uma pergunta por vez conforme as lacunas da lead. O corretor
 * conversa naturalmente e confirma apenas uma resposta controlada. Transcrição,
 * áudio, mensagem, resposta livre e inferência automática não são armazenados."
 *
 * POR QUE ESTE ARQUIVO EXISTE (2026-07-29):
 * o portão `conversational-qualification:check` cobrava as três promessas
 * procurando os RÓTULOS em caixa alta "UMA PERGUNTA POR VEZ", "CORRETOR
 * CONFIRMA" e "CONVERSA BRUTA: ZERO" na tela. Esses rótulos eram três
 * `<AtlasBadge>` de um hero de marketing, apagado de propósito no commit
 * 2c059a79 a pedido literal do dono ("essa parte intuitiva de facil
 * preenchimento") porque o hero empurrava a pergunta para baixo da dobra no
 * mobile. O COMPORTAMENTO nunca saiu; só o cartaz que o anunciava saiu.
 *
 * Procurar o cartaz é o pior tipo de guarda: sobrevive a um produto que perdeu
 * a funcionalidade (basta escrever o texto) e reprova um produto que a tem.
 * Aqui as três promessas são EXECUTADAS.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const lerFonte = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const fonteLib = lerFonte("lib", "ai", "conversational-qualification.ts");
const q = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonteLib))}`);

// Uma asserção que casa a linha do `import` não prova que o código usa aquilo,
// e um comentário que EXPLICA o proibido não pode reprovar a tela.
const semRuido = (fonte) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*import\b/.test(l))
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const tela = semRuido(lerFonte("app", "(crm)", "leads", "[id]", "qualification", "page.tsx"));
const rota = semRuido(lerFonte("app", "api", "v1", "leads", "[id]", "conversational-qualification", "route.ts"));

const campos = q.QUALIFICATION_FIELDS;
const perfilDe = (mascara) => {
  const perfil = {};
  campos.forEach((f, i) => {
    if (mascara & (1 << i)) perfil[f] = q.options[f][0];
  });
  return perfil;
};

// ── Promessa 1: UMA pergunta por vez ───────────────────────────────────────

test("lead sem nenhum sinal recebe UMA pergunta, não as oito", () => {
  const p = q.qualificationProgress({});
  assert.equal(p.missing.length, 8, "as oito lacunas existem");
  assert.equal(typeof p.nextField, "string", "e ainda assim só uma é perguntada");
  assert.equal(
    p.nextQuestion.split("?").length - 1,
    1,
    "a pergunta é UMA frase — empilhar oito interrogações é o formulário que a Fase 86 existe para não ser",
  );
});

test("nos 256 estados possíveis do perfil, nunca há duas perguntas ativas", () => {
  // Varre TODO o espaço de combinações: é o único jeito de afirmar "sempre".
  for (let m = 0; m < 1 << campos.length; m++) {
    const p = q.qualificationProgress(perfilDe(m));
    assert.ok(p.nextField === null || typeof p.nextField === "string");
    if (p.nextField !== null) assert.ok(campos.includes(p.nextField), `${p.nextField} não é campo da fase`);
  }
});

test("o lado inverso: perfil incompleto NUNCA fica sem pergunta", () => {
  // Uma guarda que só provasse "no máximo uma" passaria com zero perguntas
  // para sempre — a tela emudeceria e o corretor não teria o que fazer.
  for (let m = 0; m < 1 << campos.length; m++) {
    const p = q.qualificationProgress(perfilDe(m));
    if (p.missing.length > 0) {
      assert.equal(typeof p.nextField, "string", `perfil ${m} tem lacuna e nenhuma pergunta`);
      assert.ok(p.nextQuestion.length > 0);
    }
  }
});

test("perfil completo PARA de perguntar", () => {
  const p = q.qualificationProgress(perfilDe((1 << campos.length) - 1));
  assert.equal(p.nextField, null, "perguntar para sempre é o inverso de qualificar");
  assert.equal(p.percent, 100);
  assert.equal(p.missing.length, 0);
});

test("a pergunta seguinte é a PRIMEIRA lacuna, não uma aleatória", () => {
  // Ordem estável: o corretor que voltar à tela vê a mesma pergunta.
  const p = q.qualificationProgress({ purpose: q.options.purpose[0] });
  assert.equal(p.nextField, p.missing[0]);
  assert.equal(p.nextField, "timeline");
});

test("a tela desenha UM campo por vez, não o formulário inteiro", () => {
  assert.match(tela, /data\.options\[activeField\]/, "as opções vêm de um único campo ativo");
  assert.match(tela, /activeField\s*=\s*editing\s*\?\?\s*nextField/, "e o campo ativo deriva de UMA próxima pergunta");
  assert.ok(
    !/QUALIFICATION_FIELDS\.map|Object\.keys\(\s*(data\.)?options\s*\)\.map|Object\.entries\(\s*data\.options\s*\)\.map/.test(tela),
    "iterar os oito campos para renderizar seria o formulário de uma vez",
  );
});

// ── Promessa 2: o CORRETOR confirma uma resposta controlada ────────────────

test("resposta fora da lista NÃO conta como sinal confirmado", () => {
  // Esta é a régua real: `qualificationProgress` só credita valor da lista.
  const livre = q.qualificationProgress({ purpose: "quero algo bom, me liga" });
  assert.equal(livre.answered, 0, "texto livre virando sinal é a inferência automática que a fase proíbe");
  assert.equal(livre.nextField, "purpose", "e o campo continua pendente");
});

test("todas as opções legítimas contam — a régua não barra todo mundo", () => {
  let creditadas = 0;
  for (const campo of campos) {
    for (const valor of q.options[campo]) {
      const p = q.qualificationProgress({ [campo]: valor });
      assert.equal(p.answered, 1, `${campo}=${valor} deveria contar como sinal`);
      creditadas++;
    }
  }
  assert.equal(creditadas, 30, "as 30 opções comerciais da fase");
});

test("valor vazio não é resposta", () => {
  for (const vazio of ["", null, undefined]) {
    assert.equal(q.qualificationProgress({ purpose: vazio }).answered, 0);
  }
});

test("prontidão exige volume E os três sinais que sustentam apresentação", () => {
  const { purpose, timeline, financing } = q.options;
  const seis = {
    purpose: purpose[0], timeline: timeline[0], financing: financing[0],
    budget_readiness: q.options.budget_readiness[0],
    region_readiness: q.options.region_readiness[0],
    unit_profile: q.options.unit_profile[0],
  };
  assert.equal(q.qualificationProgress(seis).readyForPresentation, true);

  const seisSemPagamento = { ...seis, financing: undefined, decision_role: q.options.decision_role[0] };
  assert.equal(
    q.qualificationProgress(seisSemPagamento).readyForPresentation,
    false,
    "apresentar sem saber a forma de pagamento é a reunião que não fecha",
  );
  assert.equal(
    q.qualificationProgress({ purpose: purpose[0], timeline: timeline[0], financing: financing[0] }).readyForPresentation,
    false,
    "três sinais não são qualificação",
  );
});

test("a rota recusa campo e valor fora do catálogo antes de gravar", () => {
  // Ancorado na REGIÃO, não na linha: `\s*` atravessa reflow da fonte
  // minificada. Mas a condição e o seu `return` têm de ser ADJACENTES — medir
  // só a ORDEM de duas ocorrências deixa passar um `if (false)` no meio, e
  // `indexOf` sem as aspas de fechamento casa o prefixo de um identificador
  // renomeado (`QUALIFICATION_INVALID_X`). As duas cegueiras foram medidas.
  const guarda = rota.slice(rota.indexOf("export async function POST"));
  assert.match(
    guarda,
    /if\s*\(\s*!\(\s*field in options\s*\)\s*\|\|\s*!options\[[^\]]*\]\.includes\(\s*value\s*\)\s*\)\s*return\s+apiError\(\s*"QUALIFICATION_INVALID"/,
    "campo inventado e valor fora da lista são recusados pela MESMA guarda, que retorna ali mesmo",
  );
  assert.ok(
    guarda.indexOf('"QUALIFICATION_INVALID"') < guarda.indexOf("record_structured_qualification"),
    "a recusa tem de vir ANTES da gravação, senão valida o que já entrou",
  );
});

test("só o corretor responsável confirma, e TODO gatilho de escrita obedece", () => {
  assert.match(rota, /canAnswer:\s*lead\.assigned_to\s*===\s*access\.access\.profile\.id/);
  assert.match(rota, /Somente o corretor respons[aá]vel/);

  // A tela tem DOIS gatilhos de escrita (responder e corrigir). Procurar
  // `disabled={busy||!data.canAnswer}` no arquivo inteiro não prova nada:
  // desarmar um deixa o outro satisfazendo a busca. Medido — era ponto cego.
  for (const gatilho of ["void pick(", "setEditing(field)"]) {
    const i = tela.indexOf(gatilho);
    assert.ok(i > 0, `gatilho ${gatilho} desapareceu da tela`);
    assert.match(
      tela.slice(Math.max(0, i - 260), i),
      /!data\.canAnswer/,
      `${gatilho} pode gravar sem checar se o corretor é o responsável`,
    );
  }
});

// ── Promessa 3: conversa bruta ZERO ────────────────────────────────────────

test("a tela não tem por onde entrar texto livre", () => {
  // Sem campo de digitação não existe transcrição para armazenar. Esta é a
  // promessa de privacidade da fase, verificada na ausência.
  for (const entrada of [/<textarea/i, /<input/i, /contentEditable/i]) {
    assert.ok(!entrada.test(tela), `${entrada} abriria porta para conversa bruta`);
  }
  assert.match(tela, /<button/, "a resposta é seleção de um toque");
});

test("a rota lê apenas o par campo/valor do corpo", () => {
  assert.match(rota, /field\?\s*:\s*string;\s*value\?\s*:\s*string/, "o corpo aceito tem dois campos e só");
  assert.ok(
    !/transcript|audio|raw_conversation|message_body|free_text/i.test(rota),
    "nenhum vestígio de transcrição, áudio ou mensagem",
  );
  assert.match(rota, /rawConversationStored:\s*false/, "e a política é declarada para o cliente");
});

test("o documento da fase e o código dizem a mesma coisa", () => {
  // Se divergirem, alguém corrige o código para satisfazer um requisito que o
  // produto não tem — ou o contrário.
  const doc = lerFonte("docs", "STRUCTURED_CONVERSATIONAL_QUALIFICATION_PHASE_86.md");
  assert.match(doc, /uma pergunta por vez/, "o requisito é escrito, não invenção de agente");
  assert.match(doc, /confirma apenas uma resposta controlada/);
  assert.match(doc, /não são armazenados/);
  for (const campo of campos) {
    assert.ok(q.options[campo].length >= 3, `${campo} sem opções não é resposta controlada`);
  }
  assert.equal(campos.length, 8, "o documento promete oito sinais");
});
