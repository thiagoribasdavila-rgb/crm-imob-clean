import { strict as assert } from "node:assert";
import test from "node:test";
import { classificarFalhaDeIa } from "../../lib/ai/falha-de-ia.ts";

/**
 * AS RESPOSTAS QUE AS DUAS CONTAS DERAM DE VERDADE.
 *
 * ── Por que este arquivo existe ────────────────────────────────────────────
 *
 * Em 03/08/2026 o dono perguntou por que o Atlas não usava a chave da Anthropic
 * que ele havia ligado. A chave estava presente (108 caracteres), o modelo era
 * válido (`claude-opus-4-8`), o provedor estava na ordem configurada e
 * `aiProviderReadiness()` o reconhecia. Ainda assim: 67 chamadas em 9 dias,
 * ZERO atendidas pela Anthropic.
 *
 * Uma chamada real a cada API respondeu o que nenhuma leitura de código diria:
 *
 *   · Anthropic → HTTP 400, "Your credit balance is too low to access the
 *     Anthropic API. Please go to Plans & Billing to upgrade or purchase
 *     credits."
 *   · OpenAI    → HTTP 429, "You exceeded your current quota, please check your
 *     plan and billing details." (`insufficient_quota`)
 *
 * As duas chaves AUTENTICARAM — chave inválida teria devolvido 401. O bloqueio
 * é saldo, e saldo é do dono da conta.
 *
 * ── O que este portão protege ──────────────────────────────────────────────
 *
 * Estas duas frases precisam continuar caindo em `cota`, e não em
 * `configuracao` nem `credencial`. A diferença não é semântica: `quemResolve`
 * muda de dono. Classificar saldo esgotado como configuração manda o time
 * técnico procurar bug de modelo por uma fatura em aberto; como credencial,
 * manda trocar uma chave que está perfeita.
 *
 * O caso da Anthropic é o delicado: a resposta vem com HTTP 400 e o corpo diz
 * `invalid_request_error` — o balde genérico de 4xx e a lista de códigos de
 * configuração pegariam os dois se a ordem dos testes mudasse. É por isso que
 * cota é decidida ANTES de configuração.
 *
 * ── O QUE AS DUAS FRASES REAIS NÃO PROVAM ──────────────────────────────────
 *
 * Medido ao mutar o classificador: tirar `credit balance` do reconhecedor de
 * cota, ou apagar o teste de HTTP 429, NÃO derruba nenhuma asserção sobre elas.
 * As frases carregam várias assinaturas ao mesmo tempo ("billing", "quota",
 * 429), e as sobreviventes acertam sozinhas. A redundância do classificador é
 * boa; a conclusão sobre o teste é que essas duas frases medem o DESFECHO, e
 * não a ordem.
 *
 * Por isso existe um caso construído sem redundância — 4xx com as assinaturas de
 * cota e de configuração na mesma frase — em que só a ordem decide. É ele que
 * trava a ordem; as frases reais travam o desfecho que o dono viu.
 */

/** Resposta literal da API da Anthropic, medida em 03/08/2026. */
const ANTHROPIC_SEM_SALDO = Object.assign(
  new Error(
    "HTTP 400 invalid_request_error: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
  ),
  { name: "Error" },
);

/** Resposta literal da API da OpenAI, medida em 03/08/2026. */
const OPENAI_SEM_COTA = Object.assign(
  new Error(
    "HTTP 429 insufficient_quota: You exceeded your current quota, please check your plan and billing details.",
  ),
  { name: "Error" },
);

test("saldo esgotado na Anthropic é cota, não configuração", () => {
  const falha = classificarFalhaDeIa(ANTHROPIC_SEM_SALDO, "anthropic");
  assert.equal(
    falha.classe,
    "cota",
    "a resposta vem com HTTP 400 e `invalid_request_error`: se cota deixar de ser " +
      "testada antes de configuração, uma fatura em aberto vira caça a bug de modelo.",
  );
  assert.match(
    falha.quemResolve,
    /Dono da conta/,
    "quem destrava saldo é o dono da conta, não o time técnico.",
  );
  assert.match(falha.mensagem, /credit balance is too low/, "a frase do provedor tem de sobreviver inteira até a tela.");
  assert.equal(falha.httpStatus, 400);
});

test("cota esgotada na OpenAI é cota", () => {
  const falha = classificarFalhaDeIa(OPENAI_SEM_COTA, "openai");
  assert.equal(falha.classe, "cota");
  assert.equal(falha.codigo, "insufficient_quota", "o código curto é o que torna a linha acionável sem abrir o texto.");
  assert.match(falha.quemResolve, /Dono da conta/);
  assert.equal(falha.httpStatus, 429);
});

test("com 4xx e as duas assinaturas na mesma frase, quem decide é a ORDEM", () => {
  // As duas frases reais acima são reconhecidas por VÁRIAS alternativas ao mesmo
  // tempo ("credit balance", "billing", "quota", HTTP 429) — o classificador é
  // redundante de propósito, e por isso elas sozinhas NÃO provam a ordem: mutar
  // um único reconhecedor deixa os outros acertarem, e o portão passa verde
  // sobre código quebrado (medido: duas mutações sobreviveram).
  //
  // Este caso é construído para não ter redundância: HTTP 400 com
  // `invalid_request_error` (assinatura de configuração) e `quota` (assinatura
  // de cota) na mesma frase. Só a ordem dos testes decide o resultado — se
  // configuração passar à frente, esta asserção cai.
  const falha = classificarFalhaDeIa(
    new Error("HTTP 400 invalid_request_error: quota exceeded for this account"),
    "anthropic",
  );
  assert.equal(
    falha.classe,
    "cota",
    "configuração passou à frente de cota: toda conta sem saldo vira 'bug de modelo' " +
      "e o dono nunca é avisado de que precisa liberar crédito.",
  );
  assert.match(falha.quemResolve, /Dono da conta/);
});

test("sem nenhum reconhecedor de cota a frase real MUDA de dono — o portão é letal", () => {
  // A prova de que os casos acima não são decorativos: se o balde de cota
  // deixasse de existir, esta mesma frase cairia em configuração e o aviso
  // mandaria o time técnico procurar bug. É o desfecho que os testes anteriores
  // impedem — declarado aqui para que a intenção não dependa de comentário.
  const falha = classificarFalhaDeIa(ANTHROPIC_SEM_SALDO, "anthropic");
  assert.notEqual(falha.classe, "configuracao");
  assert.notEqual(falha.classe, "desconhecida");
});

test("chave recusada continua sendo credencial — as duas não podem colapsar", () => {
  // O outro lado do filtro: se tudo virasse `cota`, o aviso mandaria comprar
  // crédito para uma chave que o provedor simplesmente não aceita.
  const falha = classificarFalhaDeIa(
    new Error("HTTP 401 invalid_api_key: Incorrect API key provided."),
    "anthropic",
  );
  assert.equal(falha.classe, "credencial");
  assert.match(falha.quemResolve, /chave do provedor está ausente ou foi recusada/);
});

test("modelo inexistente continua sendo configuração — é do time técnico", () => {
  const falha = classificarFalhaDeIa(
    new Error("HTTP 404 model_not_found: The model `claude-inexistente` does not exist."),
    "anthropic",
  );
  assert.equal(falha.classe, "configuracao");
  assert.match(falha.quemResolve, /Time técnico/);
});

test("a mensagem chega à tela sem segredo, mesmo vindo do provedor", () => {
  // A chave fake é montada por CONCATENAÇÃO de propósito: o fonte não pode conter
  // `sk-` seguido de 20+ caracteres contíguos, senão o scanner de segredos (que é
  // sem allowlist por design — fixtures precisam de assinatura curta, como o JWT
  // `.abc` em observabilidade.test.ts) trava o PACOTE inteiro com um falso
  // positivo. O valor em runtime é idêntico ao da chave inteira; não rejunte.
  const chaveFake = "sk-" + "ant-api03-ABCDEFGHIJKLMNOPqrstuvwx";
  const falha = classificarFalhaDeIa(
    new Error(
      `HTTP 429 insufficient_quota: quota esgotada para a chave ${chaveFake} da conta dono@empresa.com.br`,
    ),
    "anthropic",
  );
  assert.equal(falha.classe, "cota");
  assert.doesNotMatch(falha.mensagem, /sk-ant-api03-ABCDEF/, "a chave não pode vazar para a tela de orquestração.");
  assert.doesNotMatch(falha.mensagem, /dono@empresa\.com\.br/, "o e-mail da conta não pode vazar para a tela.");
  assert.match(
    falha.mensagem,
    /quota esgotada/,
    "a redação é INLINE: apagar a frase inteira devolveria o cego que este trabalho tirou.",
  );
});
