/**
 * Contrato da GOVERNANÇA DA REATIVAÇÃO CONSENTIDA (fase 89).
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────
 *
 * Até 2026-07-29 a única guarda dessa regra era
 * `scripts/check-consented-reactivation-governance.mjs`, e ela era um grep de
 * 29 literais. Estava VERMELHA em 9 deles, e a quarentena de
 * `scripts/portoes-todos.mjs` a classificava como AMBIENTE, alegando que o
 * bloqueio era o WhatsApp NOT_VERIFIED.
 *
 * Medido executando o portão em 2026-07-29: nenhum dos 9 vermelhos tem relação
 * com WhatsApp, credencial ou rede. Dois motivos, os dois de ESCRITA da guarda:
 *
 *   1. ESPAÇO DEPOIS DOS DOIS-PONTOS. A guarda exigia o literal
 *      `officialApiOnly:true`; o código diz `officialApiOnly: true`
 *      (app/api/v1/crm/reactivation/governance/route.ts:61). Seis dos nove
 *      vermelhos são isso — a guarda cobrava a FORMATAÇÃO, e qualquer passada
 *      de prettier a derruba.
 *   2. TEXTO DE TELA. A guarda exigia as frases "WHATSAPP OFICIAL",
 *      "CONSENTIMENTO OBRIGATÓRIO", "RESPOSTA INTERROMPE CADÊNCIA" e o slug
 *      `89-consented-reactivation-governance` em
 *      app/(crm)/leads/reactivation-governance/page.tsx. A reescrita da tela
 *      trocou a copy e o atributo passou a `data-evolution-phase="43"`. É o
 *      mesmo defeito de `visibleItems`: cobrar o NOME, não a propriedade.
 *
 * A propriedade nunca caiu. O que caiu foi a grafia.
 *
 * ── E POR QUE ELE EXECUTA EM VEZ DE PROCURAR TEXTO ───────────────────────────
 *
 * `evaluateReactivationPlan` é função pura, sem I/O e sem WhatsApp: os bloqueios
 * saem dos ARGUMENTOS. Então a governança inteira é mensurável nesta máquina,
 * offline — e é isso que este arquivo faz. Um grep por `maximumAttempts:2`
 * sobrevive a `return {..., maximumAttempts: 2}` num galho morto; aqui o número
 * é lido do objeto DEVOLVIDO.
 *
 * Os dois lados de cada regra são exigidos: que o bloqueio APAREÇA quando falta
 * a condição, e que ele NÃO apareça quando ela está satisfeita. Guarda que
 * bloqueia sempre passaria em qualquer teste de vazamento e mataria a feature.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateReactivationPlan } from "../../lib/commercial/consented-reactivation-policy.ts";

const ROTA = "app/api/v1/crm/reactivation/governance/route.ts";
const TELA = "app/(crm)/leads/reactivation-governance/page.tsx";

/** Plano em que TODAS as condições estão satisfeitas — o lado do "deixa passar". */
const PLANO_LIMPO = {
  quality: "green",
  requestedDailyCap: 120,
  requestedIntervalSeconds: 60,
  consentBasis: "formulário assinado",
  approvedTemplate: true,
  eligibleContacts: 40,
  officialApiReady: true,
};

test("com todas as condições satisfeitas o plano é elegível — a regra não barra todo mundo", () => {
  const plano = evaluateReactivationPlan(PLANO_LIMPO);
  assert.deepEqual(plano.blockers, [], "plano completo com bloqueio é filtro que barra quem deveria passar");
  assert.equal(plano.eligible, true);
  assert.ok(plano.dailyCap > 0, "cap zero num plano elegível deixaria a feature inútil sem reprovar nada");
});

test("cada condição ausente produz o SEU bloqueio, e só o seu", () => {
  /**
   * Um por um, para que um bloqueio que passe a ser emitido sempre (ou nunca)
   * seja pego. Confrontar o conjunto INTEIRO é o que impede a asserção fraca
   * "existe pelo menos um bloqueio".
   */
  const casos = [
    ["consent_missing", { consentBasis: null }],
    ["consent_missing", { consentBasis: "   " }],
    ["approved_template_missing", { approvedTemplate: false }],
    ["eligible_contacts_missing", { eligibleContacts: 0 }],
    ["official_whatsapp_api_missing", { officialApiReady: false }],
    ["quality_red", { quality: "red" }],
  ];
  for (const [esperado, alteracao] of casos) {
    const plano = evaluateReactivationPlan({ ...PLANO_LIMPO, ...alteracao });
    assert.deepEqual(
      plano.blockers,
      [esperado],
      `${JSON.stringify(alteracao)} deveria produzir exatamente ["${esperado}"], veio ${JSON.stringify(plano.blockers)}`,
    );
    assert.equal(plano.eligible, false, `com ${esperado} o plano não pode ser elegível`);
  }
});

test("o bloqueio do WhatsApp vem do ARGUMENTO, não do ambiente", () => {
  /**
   * É esta asserção que refuta o motivo da quarentena. Se `official_whatsapp_api_missing`
   * dependesse do WhatsApp real (hoje NOT_VERIFIED, em ON_PREMISE, zero templates
   * aprovados), o resultado mudaria com a variável de ambiente. Ele não muda:
   * com a variável APAGADA o plano continua elegível quando o argumento diz que
   * a API está pronta.
   */
  const salvo = process.env.WHATSAPP_ACCESS_TOKEN;
  try {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    assert.equal(evaluateReactivationPlan(PLANO_LIMPO).eligible, true);
    process.env.WHATSAPP_ACCESS_TOKEN = "token-de-mentira-que-nao-deve-influenciar";
    assert.deepEqual(
      evaluateReactivationPlan({ ...PLANO_LIMPO, officialApiReady: false }).blockers,
      ["official_whatsapp_api_missing"],
      "o bloqueio passou a olhar o ambiente — a política deixou de ser pura e o portão volta a ser de AMBIENTE",
    );
  } finally {
    if (salvo === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = salvo;
  }
});

test("qualidade vermelha zera o cap; verde é o teto mais alto — a escala é monotônica", () => {
  const caps = ["red", "unknown", "yellow", "green"].map(
    (quality) => evaluateReactivationPlan({ ...PLANO_LIMPO, quality, requestedDailyCap: 10_000 }).dailyCap,
  );
  assert.equal(caps[0], 0, "qualidade vermelha com cap acima de zero é a reincidência que a fase 89 existe para impedir");
  assert.deepEqual(
    caps,
    [...caps].sort((a, b) => a - b),
    `os tetos por qualidade deveriam crescer de red para green, vieram ${JSON.stringify(caps)}`,
  );
  assert.ok(caps[3] > caps[1], "verde precisa valer mais que desconhecida, senão classificar qualidade não muda nada");
});

test("o teto corta para baixo e o intervalo empurra para cima — e nenhum dos dois fixa valor", () => {
  const pedindoDemais = evaluateReactivationPlan({ ...PLANO_LIMPO, requestedDailyCap: 10_000, requestedIntervalSeconds: 1 });
  assert.equal(pedindoDemais.dailyCap, 250, "green deveria limitar o cap a 250");
  assert.equal(pedindoDemais.intervalSeconds, 45, "green deveria empurrar o intervalo ao piso de 45s");

  // O outro lado: pedido MAIS conservador que o limite tem de ser respeitado.
  // Sem isto, `return {dailyCap: 250, intervalSeconds: 45}` fixo passaria acima.
  const pedindoPouco = evaluateReactivationPlan({ ...PLANO_LIMPO, requestedDailyCap: 7, requestedIntervalSeconds: 900 });
  assert.equal(pedindoPouco.dailyCap, 7, "pedido de 7/dia virou outro número — o limite está sobrescrevendo a escolha humana");
  assert.equal(pedindoPouco.intervalSeconds, 900, "intervalo de 900s foi reduzido — o piso está virando teto");
});

test("as travas de segurança valem também no plano REPROVADO", () => {
  /**
   * O risco real é a trava viajar junto com a elegibilidade: um plano bloqueado
   * que devolvesse `stopOnReply:false` seria lido por quem só olha o snapshot.
   */
  for (const plano of [evaluateReactivationPlan(PLANO_LIMPO), evaluateReactivationPlan({ ...PLANO_LIMPO, quality: "red", consentBasis: null })]) {
    assert.equal(plano.maximumAttempts, 2);
    assert.equal(plano.coolingOffHours, 72);
    for (const trava of ["stopOnReply", "stopOnOptOut", "stopOnInvalidPhone", "oneLeadOneBroker", "brokerChoiceOnBadExperience", "officialApiOnly", "humanApprovalRequired"]) {
      assert.equal(plano[trava], true, `${trava} deixou de ser garantido (eligible=${plano.eligible})`);
    }
  }
  assert.equal(evaluateReactivationPlan(PLANO_LIMPO).sendWindow.timezone, "America/Sao_Paulo");
});

/**
 * As duas asserções abaixo confrontam DUAS LISTAS entre arquivos, no espírito de
 * `cerca-de-leads`: o defeito que elas pegam é a divergência silenciosa (a tela
 * manda `officialApiReady`, a rota lê `officialApi`, e a simulação passa a
 * responder sempre "API ausente" sem erro nenhum).
 */
const semImports = (caminho) =>
  readFileSync(caminho, "utf8")
    .split("\n")
    .filter((linha) => !/^\s*import\b/.test(linha))
    .join("\n");

test("as chaves que a rota lê do corpo são exatamente as que a tela envia", () => {
  const rota = semImports(ROTA);
  const tela = semImports(TELA);

  const corpo = /body\.([A-Za-z][A-Za-z0-9]*)/g;
  const lidasPelaRota = new Set([...rota.matchAll(corpo)].map((m) => m[1]));
  assert.ok(lidasPelaRota.size >= 7, `a rota deveria ler as 7 entradas do plano, achei ${lidasPelaRota.size}`);

  const estadoDoForm = tela.match(/useState\(\{\s*quality[^}]*\}\)/);
  assert.ok(estadoDoForm, `não encontrei o estado do simulador em ${TELA}`);
  const enviadasPelaTela = new Set([...estadoDoForm[0].matchAll(/([A-Za-z][A-Za-z0-9]*)\s*:/g)].map((m) => m[1]));

  for (const chave of lidasPelaRota) {
    assert.ok(
      enviadasPelaTela.has(chave),
      `a rota lê body.${chave} e o simulador não envia essa chave — a simulação responderia com o valor padrão, calada`,
    );
  }
  for (const chave of enviadasPelaTela) {
    assert.ok(
      lidasPelaRota.has(chave),
      `o simulador envia "${chave}" e a rota não lê — o controle está na tela e não vale nada`,
    );
  }
});

test("a rota de governança da reativação não escreve nada — simular não pode enviar", () => {
  const ESCRITAS = /\.(insert|upsert|update|delete|rpc)\s*\(/;

  // Os dois lados do PREDICADO, antes de aplicá-lo: ele tem de acusar a escrita
  // e absolver o texto limpo. Sem isto, um regex quebrado aprovaria qualquer coisa.
  assert.ok(ESCRITAS.test('supabase.from("x").insert({})'), "o predicado deixou de reconhecer uma escrita");
  assert.ok(!ESCRITAS.test('supabase.from("x").select("id")'), "o predicado está acusando leitura como escrita");

  const rota = semImports(ROTA);
  assert.ok(!ESCRITAS.test(rota), `${ROTA} passou a escrever no banco — a simulação deixou de ser simulação`);
  assert.match(rota, /evaluateReactivationPlan\s*\(/, "a rota parou de CHAMAR a política (o import sozinho não decide nada)");
  assert.match(rota, /simulationOnly/, "a resposta parou de declarar que é simulação");
});
