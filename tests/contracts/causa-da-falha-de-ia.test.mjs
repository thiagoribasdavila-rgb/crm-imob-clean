/**
 * Contrato: A CAUSA DA FALHA DE IA — "Error" não é resposta.
 *
 * ── O DEFEITO QUE ISTO SEGURA ───────────────────────────────────────────────
 *
 * Medido no banco de produção em 02/08/2026:
 *
 *   ai_orchestration_decisions com 'openai' na ordem ..... 48
 *   ai_orchestration_decisions que ESCOLHERAM openai .....  0
 *   ai_usage_events com provider='openai' ................  0
 *   ai_orchestration_decisions com status='failed' .......  0
 *
 * A OpenAI foi tentada 48 vezes e não atendeu nenhuma. `copilot` caiu no
 * fallback determinístico 13 vezes. E `/api/ai/openai-test` devolvia
 * `details: error.name` — a string "Error" — sem gravar linha nenhuma.
 *
 * ── POR QUE O TESTE EXECUTA O CLASSIFICADOR ─────────────────────────────────
 *
 * Duas armadilhas já mordidas nesta base e registradas em outros contratos:
 * asserção que procura a palavra sobrevive à mutação (o identificador continua
 * na linha do `import`), e asserção presa a formatação quebra no primeiro
 * reflow. Então aqui o classificador é CHAMADO contra as frases que os
 * provedores realmente devolvem.
 *
 * E os DOIS lados são exigidos. Um classificador que respondesse "credencial"
 * para tudo passaria num teste que só verificasse chave vencida — e mandaria o
 * dono repor crédito quando o problema fosse um parâmetro errado. Por isso cada
 * classe tem caso positivo E contra-exemplo.
 *
 * Rodar: node --test tests/contracts/causa-da-falha-de-ia.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");

const fonteClassificador = fs.readFileSync(path.join(raiz, "lib", "ai", "falha-de-ia.ts"), "utf8");
const { classificarFalhaDeIa, redigirSegredo, tentativaFalhaDe } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonteClassificador))}`
);

// ── AS FRASES REAIS DOS PROVEDORES ──────────────────────────────────────────
//
// Não são inventadas: são as formas que OpenAI, Perplexity e o `resilientFetch`
// deste repositório produzem, mais os erros que o próprio provider-router lança.

test("chave ausente é CREDENCIAL — e aponta o dono, não o time técnico", () => {
  const falha = classificarFalhaDeIa(new Error("OPENAI_API_KEY não configurada."), "openai");
  assert.equal(falha.classe, "credencial");
  assert.match(falha.quemResolve, /Dono da conta/);
});

test("401 e invalid_api_key são CREDENCIAL mesmo embrulhados em invalid_request_error", () => {
  // A OpenAI devolve 401 com `type: invalid_request_error`. Se o balde genérico
  // de 4xx vier antes, isto vira "configuração" e o dono nunca sabe que precisa
  // repor a chave. A ordem dos testes no classificador é o que segura isso.
  for (const frase of [
    "OpenAI HTTP 401",
    "Incorrect API key provided: sk-abc123456789012345. invalid_api_key",
    "invalid_request_error: Unauthorized",
  ]) {
    assert.equal(classificarFalhaDeIa(new Error(frase), "openai").classe, "credencial", frase);
  }
});

test("429 e insufficient_quota são COTA — e apontam saldo, não rede", () => {
  for (const frase of [
    "OpenAI HTTP 429",
    "You exceeded your current quota, please check your plan and billing details. insufficient_quota",
    "Rate limit reached for gpt-5-mini",
  ]) {
    const falha = classificarFalhaDeIa(new Error(frase), "openai");
    assert.equal(falha.classe, "cota", frase);
    assert.match(falha.quemResolve, /Dono da conta/);
  }
});

test("timeout, DNS e 5xx são REDE — e não culpam ninguém do Atlas", () => {
  for (const frase of [
    "TimeoutError: The operation was aborted due to timeout",
    "OpenAI HTTP 503",
    "fetch failed",
  ]) {
    const falha = classificarFalhaDeIa(new Error(frase), "openai");
    assert.equal(falha.classe, "rede", frase);
  }
  // `cause.code` do undici precisa chegar ao classificador: sem ler a causa,
  // "fetch failed" e ECONNREFUSED viram a mesma frase opaca.
  const comCausa = new Error("fetch failed", { cause: { code: "ECONNREFUSED" } });
  const falha = classificarFalhaDeIa(comCausa, "openai");
  assert.equal(falha.classe, "rede");
  assert.equal(falha.codigo, "ECONNREFUSED");
});

test("modelo inválido e effort recusado são CONFIGURACAO — time técnico, não saldo", () => {
  for (const frase of [
    "Modelo OpenAI não configurado.",
    "The model `gpt-9` does not exist. model_not_found",
    "Unsupported value: 'none' is not supported with this model. unsupported_value",
    "OpenAI retornou resposta vazia.",
  ]) {
    const falha = classificarFalhaDeIa(new Error(frase), "openai");
    assert.equal(falha.classe, "configuracao", frase);
    assert.match(falha.quemResolve, /Time técnico/);
  }
});

test("a regra do próprio Atlas é POLITICA_INTERNA, não incidente", () => {
  // Perplexity com dado pessoal é recusa DELIBERADA. Classificá-la como falha
  // de provedor faria a operação caçar um defeito que não existe.
  const falha = classificarFalhaDeIa(
    new Error("Pesquisa externa bloqueada para contexto com dados pessoais."),
    "perplexity",
  );
  assert.equal(falha.classe, "politica_interna");
  assert.match(falha.quemResolve, /Ninguém/);
});

test("cancelamento de quem pediu não vira falha de provedor", () => {
  const abort = new Error("This operation was aborted");
  abort.name = "AbortError";
  assert.equal(classificarFalhaDeIa(abort, "openai").classe, "cancelada");
});

// ── OS DOIS LADOS: O CLASSIFICADOR PRECISA SABER DIZER "NÃO" ────────────────

test("classificador não responde a mesma classe para tudo", () => {
  const classes = new Set(
    [
      "OPENAI_API_KEY não configurada.",
      "OpenAI HTTP 429",
      "TimeoutError: aborted",
      "model_not_found",
      "Pesquisa externa bloqueada para contexto com dados pessoais.",
    ].map((frase) => classificarFalhaDeIa(new Error(frase), "openai").classe),
  );
  assert.equal(
    classes.size,
    5,
    "todas as frases caíram em menos classes que o esperado: um classificador que colapsa " +
      "manda a pessoa errada consertar o problema errado",
  );
});

test("frase desconhecida vira DESCONHECIDA, e não uma classe inventada", () => {
  // O balde honesto importa: chutar "rede" para o que não se entende produziria
  // um "repita mais tarde" eterno para um defeito permanente.
  const falha = classificarFalhaDeIa(new Error("algo completamente novo aconteceu"), "openai");
  assert.equal(falha.classe, "desconhecida");
  assert.ok(falha.mensagem.includes("algo completamente novo"));
});

// ── SEGREDO NÃO SAI, MAS A CAUSA FICA ──────────────────────────────────────

test("a chave é redigida e a frase SOBREVIVE", () => {
  const frase = "Incorrect API key provided: sk-proj-AbCdEf0123456789xyz. You can find your key at...";
  const limpo = redigirSegredo(frase);
  assert.ok(!limpo.includes("sk-proj-AbCdEf0123456789xyz"), "a chave vazou");
  assert.ok(limpo.includes("[SEGREDO]"));
  // Este é o ponto: `sanitizeLogMetadata` apagaria a string inteira e a causa
  // sumiria de novo. Redigir tem de preservar o diagnóstico.
  assert.ok(limpo.includes("Incorrect API key provided"), "a causa foi apagada junto com o segredo");
});

test("bearer, JWT e e-mail não passam", () => {
  const limpo = redigirSegredo(
    "Authorization: Bearer abcdef0123456789 eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSM contato@exemplo.com.br",
  );
  assert.ok(!/abcdef0123456789/.test(limpo));
  assert.ok(!/eyJhbGciOi\./.test(limpo));
  assert.ok(!/contato@exemplo/.test(limpo));
});

test("nenhuma classificação devolve segredo na mensagem", () => {
  const falha = classificarFalhaDeIa(
    new Error("auth failed for key sk-live-9988776655443322 on account dono@empresa.com.br"),
    "openai",
  );
  assert.ok(!falha.mensagem.includes("sk-live-9988776655443322"));
  assert.ok(!falha.mensagem.includes("dono@empresa.com.br"));
});

test("a mensagem tem teto e não vira despejo de payload", () => {
  const falha = classificarFalhaDeIa(new Error("x".repeat(5_000)), "openai");
  assert.ok(falha.mensagem.length <= 500);
});

// ── TODA CLASSE TEM UM RESPONSÁVEL ─────────────────────────────────────────

test("toda falha classificada diz QUEM resolve", () => {
  // Regra do produto: zero desenhado como saúde é proibido. Uma falha sem
  // responsável é exatamente isso — um estado ruim que ninguém foi encarregado
  // de tirar do lugar.
  for (const frase of [
    "OPENAI_API_KEY não configurada.",
    "OpenAI HTTP 429",
    "fetch failed",
    "model_not_found",
    "content_filter",
    "Pesquisa externa bloqueada para contexto com dados pessoais.",
    "qualquer coisa",
  ]) {
    const falha = tentativaFalhaDe(new Error(frase), "openai");
    assert.ok(falha.quemResolve && falha.quemResolve.length > 20, `sem responsável: ${frase}`);
    assert.equal(falha.provedor, "openai");
  }
});

// ── A ROTA NÃO PODE VOLTAR A RESPONDER "Error" ─────────────────────────────

/**
 * Remove comentário de fonte TS/JS.
 *
 * Existe porque a PRIMEIRA versão deste contrato reprovou o arquivo já
 * corrigido: a rota documenta o defeito antigo citando
 * `details: error instanceof Error ? error.name` dentro de um comentário, e o
 * detector casou com a PROSA em vez do código. Portão que lê comentário proíbe
 * documentar o próprio defeito — e documentar é o que impede a regressão.
 */
function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("a rota de teste não devolve error.name como diagnóstico", () => {
  const rota = semComentarios(
    fs.readFileSync(path.join(raiz, "app", "api", "ai", "openai-test", "route.ts"), "utf8"),
  );
  // A asserção mira o PADRÃO que causou o defeito — `error.name` usado como
  // detalhe da resposta — e não a ausência de uma palavra qualquer.
  assert.ok(
    !/details:\s*error instanceof Error \? error\.name/.test(rota),
    "voltou a devolver error.name como details: isso responde a string \"Error\" para toda falha",
  );
  assert.ok(
    /quemResolve/.test(rota),
    "a resposta de falha precisa carregar quem resolve, senão a tela mostra causa sem dono",
  );
});

// O defeito era estrutural: `recordUsage(request, await generateProvedor(...))`
// nunca é alcançado quando o `await` interno lança. Se algum teste de conexão
// voltar a essa forma sem `try`, a falha volta a não deixar rastro.
const FORMA_QUE_SO_GRAVA_SUCESSO = /return recordUsage\(request, await generate/;

test("o caminho de erro do roteador registra, e não só loga no PM2", () => {
  const roteador = semComentarios(
    fs.readFileSync(path.join(raiz, "lib", "ai", "provider-router.ts"), "utf8"),
  );
  assert.ok(
    !FORMA_QUE_SO_GRAVA_SUCESSO.test(roteador),
    "um teste de conexão voltou à forma que só grava em caso de sucesso: se o provedor lança, " +
      "recordUsage não é alcançado e a falha não deixa linha nenhuma",
  );
  // A falha precisa CHEGAR ao banco, não só ao console da Hostinger.
  assert.ok(
    /provider_attempts/.test(roteador),
    "o roteador parou de enviar as tentativas falhas para ai_orchestration_decisions",
  );
});

// ── OS DETECTORES PRECISAM SABER ACUSAR ────────────────────────────────────
//
// Detector que nunca dispara passa em qualquer refatoração e não protege nada.
// Estes dois casos são a prova de que os portões acima têm dente — e também de
// que `semComentarios` não está apagando o código junto com a prosa.

// ── FALLBACK NÃO PODE SE APRESENTAR COMO GENERATIVO ────────────────────────
//
// `generateAIText` NÃO lança quando todos os provedores falham: ela devolve o
// texto determinístico com provider="local". Os dois rascunhos só marcavam
// `mode = "local-fallback"` dentro do `catch`, então o caminho mais comum de
// falha — o que de fato aconteceu 48 vezes com a OpenAI — saía rotulado como
// "generative". O corretor recebia texto de modelo e a tela dizia que a IA
// escreveu.

test("os rascunhos não chamam de generativo o texto que veio do fallback", () => {
  for (const rota of [
    ["app", "api", "v1", "leads", "[id]", "message-draft", "route.ts"],
    ["app", "api", "v1", "leads", "[id]", "presentation-draft", "route.ts"],
  ]) {
    const fonte = semComentarios(fs.readFileSync(path.join(raiz, ...rota), "utf8"));
    assert.ok(
      /result\.provider === "local"/.test(fonte),
      `${rota.join("/")}: sem checar provider==="local", o rascunho determinístico se apresenta ` +
        `como generativo — generateAIText devolve o fallback em vez de lançar`,
    );
    assert.ok(
      /motivoDoFallback/.test(fonte),
      `${rota.join("/")}: o rascunho local precisa dizer POR QUE não foi generativo`,
    );
  }
});

test("o detector de error.name ACUSA a forma defeituosa", () => {
  const defeituoso = semComentarios(
    `catch (error) { return apiError("X", "y", m, { status: 502, details: error instanceof Error ? error.name : "Error" }); }`,
  );
  assert.ok(/details:\s*error instanceof Error \? error\.name/.test(defeituoso));
});

test("o detector da forma que só grava sucesso ACUSA, e ignora só o comentário", () => {
  assert.ok(
    FORMA_QUE_SO_GRAVA_SUCESSO.test("  return recordUsage(request, await generateOpenAI(request));"),
    "o detector não reconhece a forma que originou o defeito",
  );
  // E o mesmo texto DENTRO de comentário não pode acusar: foi assim que a
  // primeira versão deste contrato reprovou o arquivo já corrigido.
  assert.ok(
    !FORMA_QUE_SO_GRAVA_SUCESSO.test(
      semComentarios("/* antes era: return recordUsage(request, await generateOpenAI(request)); */"),
    ),
  );
});
