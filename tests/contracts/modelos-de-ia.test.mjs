/**
 * Contrato dos MODELOS PADRÃO DE IA.
 *
 * ── O defeito que isto fixa ─────────────────────────────────────────────────
 *
 * Os padrões eram `gpt-5-mini` e `gpt-5.2`. Conferindo na documentação da
 * OpenAI em 2026-07-27:
 *
 *   · `gpt-5-mini` está depreciado — desligamento em 11/12/2026;
 *   · `gpt-5.2` não aparece na lista de modelos, nem na de preços, nem na de
 *     depreciações (o `gpt-5.2-codex` foi desligado em 23/07/2026).
 *
 * Ligar a chave da OpenAI sem trocar isso arriscava a primeira chamada real
 * falhar por modelo inexistente — e o sintoma ("a IA não funciona") não aponta
 * para a causa.
 *
 * ── O que este contrato pode e não pode ─────────────────────────────────────
 *
 * Ele NÃO sabe quais modelos a OpenAI aposentou hoje; nenhum teste offline
 * sabe. O que ele garante é o que causou o problema: nomes de modelo repetidos
 * em dois lugares (um foi corrigido e o outro ficou para trás) e famílias
 * aposentadas que já sabemos.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
// Os modelos vivem em `model-profiles.ts` desde que o roteador (server-only)
// impediu o portão de tarifas de perguntar e o obrigou a raspar o fonte.
const fonte = fs.readFileSync(path.join(raiz, "lib", "ai", "model-profiles.ts"), "utf8");
/** Sem comentários: o cabeçalho CITA os modelos aposentados para explicá-los. */
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("nenhum modelo sabidamente aposentado como padrão", () => {
  // Data de desligamento anunciada pela OpenAI para cada um. Ao acrescentar um
  // aqui, acrescente também a data — é ela que justifica a proibição.
  const APOSENTADOS = [
    "gpt-5-mini",   // desligamento 11/12/2026
    "gpt-5-nano",   // desligamento 11/12/2026
    "gpt-5.2",      // fora das listas de modelos e de preços
    "gpt-5-chat-latest", // desligado em 23/07/2026
    "gpt-5.1-codex",     // desligado em 23/07/2026
  ];
  for (const modelo of APOSENTADOS) {
    // Casa o nome como literal de string, não como prefixo de outro nome:
    // "gpt-5.2" não pode acusar "gpt-5.2x" nem ser acusado por "gpt-5.6".
    const literal = new RegExp(`["'\`]${modelo.replace(/[.]/g, "\\.")}["'\`]`);
    assert.ok(!literal.test(codigo),
      `${modelo} está aposentado e aparece como literal no roteador`);
  }
});

test("o padrão da OpenAI tem UMA fonte só", () => {
  // Havia duas cópias: `aiModelProfiles()` e `openAIDefaultModel()`. Corrigir
  // uma e esquecer a outra deixava o caminho de recuperação servindo o modelo
  // aposentado — justamente quando já se está tratando outro erro.
  // `openAIDefaultModel` ficou no roteador (usa `AITask`, que é tipo de
  // transporte); os nomes vieram para cá. A guarda é ele CHAMAR a função.
  const roteador = fs.readFileSync(path.join(raiz, "lib", "ai", "provider-router.ts"), "utf8");
  assert.match(roteador, /const openAIDefaultModel = \(task: AITask\) => \{[\s\S]{0,300}?aiModelProfiles\(\)/,
    "openAIDefaultModel precisa derivar de aiModelProfiles, não repetir os nomes");
});

test("um modelo só, em todos os tiers da OpenAI", () => {
  // Decisão do dono (2026-07-27): só `gpt-5.6-luna`, para o custo ser previsível
  // na largada — uma tarifa, uma linha na tabela de preços. Espalhar o nome
  // pelos três tiers traria de volta o problema que acabou de ser corrigido:
  // trocar um e esquecer os outros.
  assert.match(codigo, /const MODELO_OPENAI_PADRAO = "gpt-5\.6-luna"/);
  const literais = [...codigo.matchAll(/"gpt-5\.6-[a-z]+"/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(literais)], ['"gpt-5.6-luna"'],
    `só um modelo da OpenAI pode aparecer no roteador; achei ${literais.join(", ")}`);
  assert.equal(literais.length, 1, "e uma vez só — os tiers usam a constante");
});

test("toda variável de ambiente continua tendo precedência", () => {
  // O padrão é rede de segurança para quem não configurou. Quem configurou
  // manda — inclusive para fixar um modelo que este contrato desconhece.
  assert.match(codigo, /process\.env\.ATLAS_AI_FAST_MODEL \|\|/);
  assert.match(codigo, /process\.env\.ATLAS_AI_COMMERCIAL_MODEL \|\| process\.env\.ATLAS_AI_MODEL \|\|/);
  assert.match(codigo, /process\.env\.ATLAS_AI_REASONING_MODEL \|\| process\.env\.ATLAS_AI_MODEL \|\|/);
});

test("a razão da troca está escrita junto da regra", () => {
  // Sem a data e a fonte, o próximo a ler acha que os nomes são arbitrários e
  // volta a mexer sem conferir a página de depreciações.
  assert.match(fonte, /2026-07-27/, "a data da conferência precisa estar registrada");
  assert.match(fonte, /deprecations|deprecia/i, "e o lugar onde conferir de novo");
});

test("o exemplo de produção traz a tarifa do modelo que roda", () => {
  // Modelo sem tarifa grava custo NULO: o painel de FinOps mostra zero e parece
  // saudável quando não é. O que roda é luna; os outros ficam documentados para
  // quem trocar um tier por variável, e não precisar buscar preço de novo.
  const exemplo = fs.readFileSync(path.join(raiz, ".env.production.example"), "utf8");
  assert.ok(exemplo.includes("openai/gpt-5.6-luna"), "sem tarifa para o modelo que roda de fato");
  assert.match(exemplo, /2026-07-27/, "a tarifa precisa vir com a data em que foi conferida");
  assert.match(exemplo, /PRE[ÇC]O MUDA|confira antes de subir/i, "e com o aviso de que preço muda");
});

test("a tarifa do exemplo bate com o modelo padrão do roteador", () => {
  // Divergir aqui é o pior caso silencioso: a IA roda num modelo e o custo é
  // calculado por outro — ou por nenhum, gravando zero.
  const exemplo = fs.readFileSync(path.join(raiz, ".env.production.example"), "utf8");
  const padrao = codigo.match(/const MODELO_OPENAI_PADRAO = "([^"]+)"/)?.[1];
  assert.ok(padrao, "não achei o modelo padrão no roteador");
  assert.match(
    exemplo,
    new RegExp(`ATLAS_AI_PRICE_TABLE=\\{"openai/${padrao.replace(/[.]/g, "\\.")}"`),
    `a linha pronta do .env precisa cobrir ${padrao}, que é o que o roteador usa`,
  );
});

// ── O PORTÃO DE TARIFAS PERGUNTA, NÃO RASPA ────────────────────────────────

test("o portão de tarifas importa o módulo, em vez de ler o fonte com regex", () => {
  // A versão antiga lia `provider-router.ts` com expressão regular. Acusava
  // `openai/gpt-5.2` — que só existia num EXEMPLO dentro de um comentário — e
  // devolvia nomes truncados. Pior: lia `ATLAS_OPENAI_MODEL`, `OPENAI_MODEL` e
  // `ATLAS_PERPLEXITY_MODEL`, variáveis que não existem neste produto. Por isso
  // nunca enxergou `gpt-5-mini`, o modelo que de fato rodava.
  //
  // Portão cego é pior que portão nenhum: ele diz "conferido".
  const portaoBruto = fs.readFileSync(path.join(raiz, "scripts", "check-ai-pricing.mjs"), "utf8");
  // Sem comentários: o cabeçalho CITA as variáveis inexistentes e a raspagem
  // por regex justamente para explicar por que sumiram.
  const portao = portaoBruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(portao, /modelosEmUso\(\)/, "tem que perguntar ao código quais modelos rodam");
  assert.match(portao, /model-profiles\.ts/, "e importar o módulo puro, não o roteador");
  assert.ok(!/matchAll\(/.test(portao), "raspar o fonte com regex foi o defeito — não pode voltar");
  assert.ok(!/ATLAS_OPENAI_MODEL|ATLAS_PERPLEXITY_MODEL/.test(portao),
    "variáveis inexistentes davam a impressão de cobertura");
});

test("modelosEmUso() enxerga o que o ambiente fixa, não só o padrão", () => {
  // Era exatamente o buraco: com ATLAS_AI_FAST_MODEL apontando para um modelo
  // aposentado, o portão passava verde.
  assert.match(fonte, /export function modelosEmUso\(\)/);
  assert.match(fonte, /perfis\.fast, perfis\.commercial, perfis\.reasoning, perfis\.research/);
  assert.match(fonte, /ATLAS_ANTHROPIC_MODEL \|\| process\.env\.ATLAS_CLAUDE_MODEL/,
    "sem o modelo da Anthropic, o consumo dela gravaria custo nulo");
});

test("modelo de família desconhecida entra na conferência", () => {
  // Silenciar o desconhecido recria o custo nulo silencioso: um modelo que
  // ninguém reconhece ainda vai ser cobrado.
  assert.match(fonte, /desconhecida" \? "desconhecido"/);
});
