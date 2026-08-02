/**
 * Contrato: UMA fronteira de "quente", e um relatório que não mente por corte.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * O cartão "Leads quentes" do diretor anuncia "Score alto OU temperatura
 * quente", como se fossem dois testes independentes.
 *
 * MEDIDO no banco vivo em 2026-08-02 (490 leads, org de produção):
 *   · máximo de `score_ia` na organização inteira ............ 63
 *   · leads com `score_ia >= 70` ............................. 0
 *   · leads com `temperature = 'quente'` ..................... 3 (scores 45/50/50)
 *
 * A causa não é azar de dados: 70 é, ao mesmo tempo, o corte que o LEITOR usa
 * para dizer "qualificado" e a fronteira em que o SCORER passa a gravar
 * `temperature: "quente"`. Eram quatro literais 70 independentes
 * (`campaign-quality.ts`, `scoring.ts`, `lead-qualification.ts`,
 * `attention-signals.ts`) mais um quinto digitado no JSX. Enquanto os cinco
 * forem iguais, o critério é `X OU X` e uma das metades nunca acrescenta nada;
 * no dia em que UM deles se mexer, as duas metades passam a falar de coisas
 * diferentes com o mesmo nome, sem erro nenhum na tela.
 *
 * Este contrato MEDE POR EXECUÇÃO — chama o scorer, não lê o comentário.
 *
 * E o segundo defeito, na mesma família: `app/(crm)/reports/page.tsx` lia
 * `.limit(5000)` numa consulta só. O PostgREST corta em 1000 SEM erro (o
 * próprio repositório documenta isso em
 * `app/api/v1/analytics/sala-de-comando/route.ts`), então todo agregado da tela
 * canônica de relatório do diretor sairia de amostra cortada, em silêncio,
 * assim que a base passasse de 1000.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateLeadScore } from "../../lib/atlas/scoring.ts";
import {
  HOT_LEAD_CRITERION,
  HOT_LEAD_CRITERION_SHORT,
  HOT_SCORE_THRESHOLD,
  isDeclaredHotTemperature,
  isHotLead,
} from "../../lib/atlas/temperatura-do-lead.ts";
import {
  CAMPAIGN_QUALITY_QUALIFIED_SCORE,
  isQualifiedLead,
} from "../../lib/atlas/campaign-quality.ts";
import { fetchAllRowsPure, PAGE_SIZE } from "../../lib/supabase/paginacao-exaustiva.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const semComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── AS DUAS METADES DO CRITÉRIO SÃO O MESMO NÚMERO ────────────────────────── */

test("o corte do leitor É a fronteira de quente do scorer, não uma cópia dela", () => {
  // Se alguém baixar o limiar para "acender o cartão", este teste continua
  // verde SÓ se o que mudou foi a definição de quente do produto inteiro —
  // que é uma decisão visível, não um ajuste de cartão.
  assert.equal(CAMPAIGN_QUALITY_QUALIFIED_SCORE, HOT_SCORE_THRESHOLD,
    "o leitor de qualidade voltou a escolher o próprio corte");
});

test("MEDIDO por execução: no corte do leitor o scorer JÁ grava quente", () => {
  // É esta igualdade que torna a metade "score alto" incapaz de acrescentar
  // uma lead sozinha quando a temperatura foi derivada. Está aqui para ficar
  // MEDIDA, não afirmada em comentário.
  const noCorte = calculateLeadScore({
    email: "a@b.c",
    phone: "11999999999",
    budgetMax: 1,
    preferredRegions: ["Centro"],
    bedrooms: 2,
    purpose: "moradia",
    status: "novo",
  });
  assert.equal(noCorte.score, HOT_SCORE_THRESHOLD,
    "o teto da porta de criação por API deixou de empatar com a fronteira de quente");
  assert.equal(noCorte.temperature, "quente");
  // A prova do X OU X: a lead que acende pelo score acende pela temperatura.
  assert.equal(isQualifiedLead({ score_ia: noCorte.score, temperature: noCorte.temperature }), true);
  assert.equal(isDeclaredHotTemperature(noCorte.temperature), true);
});

test("MEDIDO por execução: um ponto abaixo do corte o scorer NÃO diz quente", () => {
  // O outro lado do filtro. Sem ele, "no corte grava quente" passaria também
  // num scorer que gravasse "quente" para todo mundo.
  const abaixo = calculateLeadScore({
    email: "a@b.c",
    phone: "11999999999",
    budgetMax: 1,
    preferredRegions: ["Centro"],
    bedrooms: 2,
    // sem `purpose`: 10 pontos a menos
    status: "novo",
  });
  assert.equal(abaixo.score, HOT_SCORE_THRESHOLD - 10);
  assert.notEqual(abaixo.temperature, "quente");
  assert.equal(isQualifiedLead({ score_ia: abaixo.score, temperature: abaixo.temperature }), false);
});

test("MEDIDO por execução: o teto de cada porta de entrada de lead", () => {
  // A razão de o cartão marcar 3 e não 40. Se alguém mexer nos pesos do
  // scorer, estes tetos mudam e o número aqui precisa ser reconhecido — e não
  // descoberto meses depois, num painel que nunca acende.
  const cheio = {
    email: "a@b.c", phone: "11999999999", budgetMax: 1,
    preferredRegions: ["Centro"], bedrooms: 2, purpose: "moradia",
  };
  const ingestao = calculateLeadScore({ email: cheio.email, phone: cheio.phone, status: "novo" }).score;
  const importacao = calculateLeadScore({ email: cheio.email, phone: cheio.phone, status: "visita" }).score;
  const criacao = calculateLeadScore({ ...cheio, status: "novo" }).score;

  assert.equal(ingestao, 25, "teto da ingestão Meta/portal (só e-mail e telefone)");
  assert.equal(importacao, 45, "teto da importação de planilha");
  assert.equal(criacao, HOT_SCORE_THRESHOLD, "teto da criação por API");

  // O que isto significa: DUAS das três portas não conseguem produzir uma lead
  // quente por score nem com cadastro perfeito, e a terceira só empatando.
  assert.ok(ingestao < HOT_SCORE_THRESHOLD && importacao < HOT_SCORE_THRESHOLD,
    "se uma destas portas passar a alcançar o corte sozinha, o critério mudou de significado");
});

test("as cinco cópias do 70 sumiram do código", () => {
  const alvos = [
    ["lib", "atlas", "scoring.ts"],
    ["lib", "atlas", "campaign-quality.ts"],
    ["lib", "ai", "lead-qualification.ts"],
    ["lib", "atlas", "attention-signals.ts"],
    ["app", "(crm)", "leads", "ai-qualify", "page.tsx"],
  ];
  for (const alvo of alvos) {
    const codigo = semComentarios(ler(...alvo));
    assert.ok(!/\b(>=|>)\s*70\b/.test(codigo),
      `${alvo.join("/")} voltou a escolher o próprio 70 em vez de importar a fronteira`);
  }
});

test("a temperatura é lida normalizada — a base tem MORNO, FRIO e quente", () => {
  // Comparação `=== "quente"` crua deixava uma lead gravada "QUENTE" fora da
  // conta, sem erro nenhum. MEDIDO no banco vivo: 5 leads "MORNO", 2 "FRIO".
  assert.equal(isDeclaredHotTemperature("QUENTE"), true);
  assert.equal(isDeclaredHotTemperature("  Quente "), true);
  assert.equal(isDeclaredHotTemperature("MORNO"), false);
  assert.equal(isQualifiedLead({ score_ia: 15, temperature: "QUENTE" }), true);
});

test("lead sem score e sem temperatura não é quente por omissão", () => {
  // `Number(null) === 0` já transformou ausência em nota neste repositório.
  assert.equal(isHotLead({ score_ia: null, temperature: null }), false);
  assert.equal(isHotLead({ score_ia: "", temperature: "" }), false);
  assert.equal(isHotLead({}), false);
});

test("o critério anunciado sai da constante, não de um literal por tela", () => {
  // A frase antiga vendia dois caminhos independentes. A nova precisa carregar
  // o número E dizer que ele é a mesma fronteira — senão volta a prometer o
  // que não existe.
  assert.match(HOT_LEAD_CRITERION, new RegExp(String(HOT_SCORE_THRESHOLD)));
  assert.match(HOT_LEAD_CRITERION, /MESMA fronteira/);
  assert.match(HOT_LEAD_CRITERION_SHORT, new RegExp(String(HOT_SCORE_THRESHOLD)));

  for (const alvo of [
    ["app", "api", "v1", "analytics", "campaign-quality", "route.ts"],
    ["app", "api", "v1", "leads", "[id]", "campaign-context", "route.ts"],
  ]) {
    const codigo = ler(...alvo);
    assert.match(codigo, /qualifiedDefinition: HOT_LEAD_CRITERION/,
      `${alvo.join("/")} voltou a redigir o critério à mão`);
  }

  // `semComentarios`: a frase antiga aparece de propósito no comentário que
  // registra o defeito. O que não pode voltar é ela no CÓDIGO — que é sobre o
  // que esta asserção sempre foi.
  const tela = ler("app", "(crm)", "leads", "ai-qualify", "page.tsx");
  assert.ok(!/Score ≥ 70/.test(semComentarios(tela)), "a tela voltou a digitar o limiar no JSX");
  assert.match(tela, /detail=\{HOT_LEAD_CRITERION_SHORT\}/);
});

/* ── O RELATÓRIO DO DIRETOR NÃO PODE MENTIR POR CORTE ──────────────────────── */

test("a paginação é alcançável fora do servidor (era o que faltava)", () => {
  // `fetch-all-rows.ts` importa `server-only`: a regra existia e a tela de
  // cliente não conseguia carregá-la. Por isso ela ficou com `.limit(5000)`.
  const porta = ler("lib", "supabase", "fetch-all-rows.ts");
  const corpo = ler("lib", "supabase", "paginacao-exaustiva.ts");
  assert.match(porta, /import "server-only"/);
  assert.match(porta, /export \{ fetchAllRowsPure as fetchAllRows/);
  // O comentário do módulo puro EXPLICA o server-only do arquivo vizinho; o
  // que reprova é o IMPORT, não a menção. A asserção mira a linha de import.
  assert.ok(!/^\s*import\s+["']server-only["']/m.test(semComentarios(corpo)),
    "o módulo puro puxou server-only e voltou a ser inalcançável pela tela");
});

test("a tela de relatórios pagina de verdade e não pede 5000 numa tacada", () => {
  const tela = semComentarios(ler("app", "(crm)", "reports", "page.tsx"));
  assert.ok(!/\.limit\(5000\)/.test(tela), "voltou o .limit(5000) — letra morta contra o corte em 1000");
  assert.match(tela, /fetchAllRowsPure/, "a leitura de leads precisa passar pelo paginador");
  assert.match(tela, /\.range\(from, to\)/, "paginar sem .range é pedir a mesma página para sempre");
});

test("quando o corte acontece, a tela DECLARA — acima dos números", () => {
  const tela = ler("app", "(crm)", "reports", "page.tsx");
  assert.match(tela, /setLeadsTruncados\(leadResult\.truncated \? leadResult\.rows\.length : null\)/,
    "a sentinela precisa guardar o tamanho da amostra, não só um booleano");
  assert.match(tela, /avisoDeTruncamento\(leadsTruncados\)/, "o aviso precisa ser RENDERIZADO");

  const posAviso = tela.indexOf('data-truncamento="leads"');
  const posNumeros = tela.indexOf("Números decisivos</p>");
  assert.ok(posAviso > 0 && posNumeros > 0, "âncoras não encontradas na tela");
  assert.ok(posAviso < posNumeros,
    "o aviso de amostra cortada desceu para depois dos números que ele qualifica");
});

test("truncated só é verdadeiro quando o teto de páginas foi de fato atingido", async () => {
  // Os dois lados: uma leitura que cabe NÃO pode declarar corte (aviso que
  // aparece sem motivo é ruído, e ruído ensina a ignorar o aviso de verdade).
  const cabe = await fetchAllRowsPure(async (from) =>
    from === 0 ? { data: Array.from({ length: 490 }, (_, i) => ({ i })), error: null } : { data: [], error: null });
  assert.equal(cabe.rows.length, 490);
  assert.equal(cabe.truncated, false);

  const paginaCheia = Array.from({ length: PAGE_SIZE }, (_, i) => ({ i }));
  const estoura = await fetchAllRowsPure(async () => ({ data: paginaCheia, error: null }), { maxPages: 2 });
  assert.equal(estoura.rows.length, PAGE_SIZE * 2);
  assert.equal(estoura.truncated, true, "o corte precisa ser declarado, não engolido");
});
