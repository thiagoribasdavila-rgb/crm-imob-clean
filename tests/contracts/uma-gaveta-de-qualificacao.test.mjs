/**
 * CONTRATO: a qualificação tem UMA gaveta canônica, e ninguém lê só metade.
 *
 * ── O DEFEITO QUE ISTO GUARDA ───────────────────────────────────────────────
 *
 * O mesmo fato comercial tinha duas gavetas e o escritor escolheu uma enquanto
 * os leitores escolheram a outra:
 *
 *   `/api/v1/leads/[id]/qualify`      grava `leads.metadata.qualificationAnswers`
 *   Copilot, assistente de visita,
 *   handoff noturno, tela conversacional  leem `lead_qualification_profiles`
 *
 * Medido na base viva em 02/08/2026: 15 leads com resposta no metadata, 3 linhas
 * no perfil, 13 leads sem linha nenhuma. Para essas 13 o assistente de visita
 * dizia "0% qualificada" e o Copilot escrevia como se a pessoa nunca tivesse
 * falado. E a lead `Danilo Ferreira` já tinha a contradição materializada:
 * `recursos_proprios` numa gaveta contra `financing` na outra.
 *
 * A canônica é `lead_qualification_profiles` — é o SUJEITO da transação de
 * `record_structured_qualification` (que trava o par, recalcula `answered_count`
 * e emite evento), enquanto `leads.purpose` é o efeito colateral dela. Em
 * `/qualify` o sujeito da transação é a PONTUAÇÃO, e as respostas viajam de
 * carona no mesmo `update`.
 *
 * ── POR QUE O CONTRATO TEM AS DUAS METADES ──────────────────────────────────
 *
 * A metade de COMPORTAMENTO prova a régua: precedência, tradução e as recusas.
 * A metade ESTRUTURAL prova que os leitores REALMENTE passam por ela — sem essa
 * parte, alguém volta a ler uma gaveta só e a régua fica correta e inútil, que é
 * exatamente o que aconteceu com `lib/crm/lead-qualification-fields.ts`: escrita,
 * documentada, testada e importada por ninguém.
 *
 * E o caso NEGATIVO existe para impedir a correção preguiçosa: lead que não
 * respondeu nada tem de continuar em ZERO sinais. Creditar sinal para todo mundo
 * "para a tela não parecer vazia" transformaria a qualificação em enfeite.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canonicoDeLegado,
  finalidadeCanonica,
  legadoDeCanonico,
  perfilConfirmadoNoCrm,
  respostasDoFormularioNoMetadata,
  respostasLegadoDoPerfil,
  respostasLegadoNoMetadata,
  sinaisUnificados,
  unificarQualificacao,
} from "../../lib/crm/qualificacao-canonica.ts";
import { mapearQualificacao } from "../../lib/crm/lead-qualification-fields.ts";
import { qualificationProgress } from "../../lib/ai/conversational-qualification.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const lerFonte = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const semRuido = (fonte) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

/* ── COMPORTAMENTO: a precedência ────────────────────────────────────────── */

test("o perfil canônico vence o metadata — a contradição medida resolve para o perfil", () => {
  // Danilo Ferreira, 02/08/2026: perfil diz `financing`, metadata diz
  // `recursos_proprios`. Eleger o metadata reverteria o que o corretor confirmou.
  const u = unificarQualificacao({
    perfil: { purpose_key: "moradia", timeline_key: "up_to_3_months", financing_key: "financing" },
    respostasLegado: { timeline: "ate_3_meses", financing: "recursos_proprios" },
    finalidadeDaLead: "Moradia",
  });
  assert.equal(u.profile.financing, "financing");
  assert.equal(u.origens.financing, "corretor");
  assert.equal(u.divergencias.length, 1, "a contradição é REGISTRADA, não engolida");
  assert.equal(u.divergencias[0].campo, "financing");
  assert.equal(u.divergencias[0].divergente, "own_resources");
});

test("o que só existe no metadata deixa de sumir — era o caso de 13 das 15 leads", () => {
  const u = unificarQualificacao({
    perfil: null,
    respostasLegado: { purpose: "investimento", timeline: "3_a_6_meses", financing: "financiamento" },
  });
  assert.deepEqual(u.profile, { purpose: "investimento", timeline: "3_to_6_months", financing: "financing" });
  assert.equal(sinaisUnificados(u), 3, "sem isto o assistente de visita mostrava 0%");
  assert.equal(qualificationProgress(u.profile).answered, 3);
});

test("a finalidade já gravada no cadastro conta — a tela parava de perguntar", () => {
  // 181 leads tinham `leads.purpose` e abriam em "0 de 8 sinais". A primeira
  // pergunta era justamente a que a pessoa já tinha respondido no anúncio.
  for (const [cru, esperado] of [
    ["morar", "moradia"], ["Moradia", "moradia"], ["moradia", "moradia"],
    ["investir", "investimento"], ["Investimento", "investimento"], ["investimento", "investimento"],
  ]) {
    assert.equal(finalidadeCanonica(cru), esperado, `${cru} é a mesma resposta com outro nome`);
  }
  const u = unificarQualificacao({ perfil: null, finalidadeDaLead: "morar" });
  assert.equal(u.profile.purpose, "moradia");
  assert.equal(u.origens.purpose, "cadastro");
  assert.equal(qualificationProgress(u.profile).nextField, "timeline", "a próxima pergunta pula a já respondida");
});

test("lead que não disse nada continua em ZERO — a correção não pode inflar", () => {
  const u = unificarQualificacao({ perfil: null, respostasLegado: {}, finalidadeDaLead: null, respostasDoFormulario: [] });
  assert.equal(sinaisUnificados(u), 0);
  assert.equal(qualificationProgress(u.profile).nextField, "purpose");
  assert.equal(u.divergencias.length, 0);
});

/* ── COMPORTAMENTO: as recusas ───────────────────────────────────────────── */

test("valor sem par honesto NÃO vira sinal — 'não sei' não é uma decisão", () => {
  // `sem_prazo` não é `over_12_months` e `nao_definido` não é `mixed`. Inventar
  // o par transformaria "a pessoa não sabe" em "a pessoa decidiu".
  assert.equal(canonicoDeLegado("timeline", "sem_prazo"), null);
  assert.equal(canonicoDeLegado("financing", "nao_definido"), null);
  const u = unificarQualificacao({ perfil: null, respostasLegado: { timeline: "sem_prazo", financing: "nao_definido" } });
  assert.equal(sinaisUnificados(u), 0);
});

test("a régua traduz nas DUAS direções sem inventar valor no caminho", () => {
  for (const [campo, legado, canonico] of [
    ["purpose", "moradia", "moradia"],
    ["timeline", "ate_3_meses", "up_to_3_months"],
    ["timeline", "3_a_6_meses", "3_to_6_months"],
    ["timeline", "6_a_12_meses", "6_to_12_months"],
    ["financing", "financiamento", "financing"],
    ["financing", "recursos_proprios", "own_resources"],
    ["financing", "permuta", "exchange"],
  ]) {
    assert.equal(canonicoDeLegado(campo, legado), canonico, `${legado} → ${canonico}`);
    assert.equal(legadoDeCanonico(campo, canonico), legado, `${canonico} → ${legado}`);
  }
  assert.equal(canonicoDeLegado("purpose", "qualquer coisa"), null, "fora do catálogo não entra");
  assert.equal(canonicoDeLegado("naoexiste", "moradia"), null, "campo inventado não entra");
});

test("o que a lead declarou no anúncio NÃO se disfarça de confirmação do corretor", () => {
  // A memória comercial promete não guardar prazo e pagamento sem confirmação.
  // Unir as gavetas sem este recorte teria transformado a promessa em mentira.
  const u = unificarQualificacao({
    perfil: { timeline_key: "up_to_3_months" },
    respostasLegado: { financing: "financiamento" },
    finalidadeDaLead: "morar",
  });
  assert.equal(u.origens.purpose, "cadastro");
  const confirmado = perfilConfirmadoNoCrm(u);
  assert.equal(confirmado.purpose, undefined, "o cadastro não confirma nada em nome do corretor");
  assert.equal(confirmado.timeline, "up_to_3_months");
  assert.equal(confirmado.financing, "financing", "resposta dada dentro do CRM continua valendo");
  assert.deepEqual(respostasLegadoDoPerfil(confirmado), { timeline: "ate_3_meses", financing: "financiamento" });
});

/* ── COMPORTAMENTO: o tradutor ligado ────────────────────────────────────── */

test("a ÚNICA pergunta que os formulários da base realmente fazem é reconhecida", () => {
  // 96 leads guardam resposta de formulário, e todas trazem esta mesma chave.
  // Antes de 02/08/2026 ela caía em `naoMapeadas`: a régua estava escrita para
  // perguntas que a conta não faz.
  for (const [resposta, intencao, finalidade] of [
    ["Moradia", "morar", "moradia"],
    ["Investimento", "investir", "investimento"],
  ]) {
    const respostas = [{ chave: "qual_o_seu_objetivo_com_o_imovel?", resposta }];
    assert.equal(mapearQualificacao(respostas).intencao, intencao);
    assert.equal(mapearQualificacao(respostas).naoMapeadas.length, 0);
    const u = unificarQualificacao({ perfil: null, respostasDoFormulario: respostas });
    assert.equal(u.profile.purpose, finalidade);
    assert.equal(u.origens.purpose, "formulario");
  }
});

test("formulário de RECRUTAMENTO continua sem virar qualificação de venda", () => {
  const u = unificarQualificacao({
    perfil: null,
    respostasDoFormulario: [{ chave: "você_possui_alguma_experiência_no_mercado_imobiliário?", resposta: "sim" }],
  });
  assert.equal(sinaisUnificados(u), 0);
});

test("as duas moradas das respostas cruas são lidas, e a mesma pergunta não conta duas vezes", () => {
  // A ingestão por planilha gravou em `metadata.respostas`; a por webhook em
  // `metadata.meta.respostas`. Escolher uma repetiria o defeito num nível abaixo.
  const daPlanilha = respostasDoFormularioNoMetadata({ respostas: [{ chave: "objetivo com o imovel", resposta: "Moradia" }] });
  const doWebhook = respostasDoFormularioNoMetadata({ meta: { respostas: [{ chave: "objetivo com o imovel", resposta: "Moradia" }] } });
  assert.equal(daPlanilha.length, 1);
  assert.equal(doWebhook.length, 1);
  const juntas = respostasDoFormularioNoMetadata({
    respostas: [{ chave: "Objetivo com o imóvel", resposta: "Moradia" }],
    meta: { respostas: [{ chave: "objetivo com o imóvel", resposta: "Investimento" }, { chave: "faixa de investimento", resposta: "Até R$ 300 mil" }] },
  });
  assert.equal(juntas.length, 2, "a duplicada é dispensada, a nova entra");
  assert.equal(juntas[0].resposta, "Moradia");
});

test("metadata sem qualificação não explode nem inventa resposta", () => {
  for (const entrada of [null, undefined, "texto", 7, { meta: {} }]) {
    assert.deepEqual(respostasLegadoNoMetadata(entrada), {});
    assert.deepEqual(respostasDoFormularioNoMetadata(entrada), []);
  }
});

test("a faixa declarada é FATO, não sinal — orçamento não é deduzido de uma faixa", () => {
  // Escolher "R$ 400 a 600 mil" não é declarar que o orçamento está definido, e
  // a Fase 86 proíbe inferência automática.
  const u = unificarQualificacao({
    perfil: null,
    respostasDoFormulario: [{ chave: "Qual faixa de investimento?", resposta: "R$ 400 mil a R$ 600 mil" }],
  });
  assert.equal(u.declarado.faixaInvestimento, "R$ 400 mil a R$ 600 mil");
  assert.equal(u.profile.budget_readiness, undefined, "faixa escolhida não é orçamento definido");
  assert.equal(sinaisUnificados(u), 0);
});

/* ── ESTRUTURA: TODO leitor passa pela mesma gaveta ──────────────────────── */

const LEITORES = [
  ["app/api/v1/leads/[id]/conversational-qualification/route.ts", "a tela do corretor"],
  ["app/api/v1/leads/[id]/visit-assistant/route.ts", "o assistente de visita"],
  ["app/api/ai/copilot/route.ts", "o Copilot"],
  ["app/api/v2/ai/nightly-handoff/route.ts", "a entrega matinal"],
  ["app/api/v1/leads/[id]/route.ts", "a ficha da lead"],
  ["app/api/v1/leads/[id]/qualify/route.ts", "a qualificação por IA"],
];

test("os SEIS leitores da qualificação usam o unificador, nenhum lê uma gaveta só", () => {
  for (const [arquivo, quem] of LEITORES) {
    const fonte = semRuido(lerFonte(...arquivo.split("/")));
    assert.match(fonte, /unificarQualificacao\(/, `${quem} (${arquivo}) voltou a ler sem unificar`);
  }
});

test("quem lê o perfil também lê a lead — select sem `metadata` some com a outra gaveta", () => {
  for (const [arquivo, quem] of LEITORES) {
    const fonte = semRuido(lerFonte(...arquivo.split("/")));
    if (!/lead_qualification_profiles/.test(fonte)) continue;
    assert.match(fonte, /metadata/, `${quem} pede o perfil e não pede o metadata`);
  }
});

test("o assistente de visita conta os OITO sinais unificados, não `answered_count` sozinho", () => {
  const fonte = semRuido(lerFonte("app", "api", "v1", "leads", "[id]", "visit-assistant", "route.ts"));
  assert.match(fonte, /qualificationPercent:\s*Math\.round\(sinaisUnificados\(unificada\)\/8\*100\)/);
  assert.ok(
    !/Number\(qualificationResult\.data\?\.answered_count/.test(fonte),
    "voltar a `answered_count` sozinho é o 0% que 13 leads recebiam tendo respondido",
  );
});

test("o tradutor do formulário está LIGADO — não é mais código correto e inalcançável", () => {
  const modulo = semRuido(lerFonte("lib", "crm", "qualificacao-canonica.ts"));
  assert.match(modulo, /mapearQualificacao/, "a régua do formulário precisa ser importada por código que roda");
  const importadores = LEITORES.filter(([arquivo]) =>
    /qualificacao-canonica/.test(semRuido(lerFonte(...arquivo.split("/")))));
  assert.equal(importadores.length, LEITORES.length, "o caminho do tradutor até a tela não pode ter buraco");
});

/* ── ESTRUTURA: a escrita converge em vez de criar mais divergência ──────── */

test("`/qualify` grava a resposta nova TAMBÉM na gaveta canônica, pela RPC da fase", () => {
  const fonte = semRuido(lerFonte("app", "api", "v1", "leads", "[id]", "qualify", "route.ts"));
  const i = fonte.indexOf("record_structured_qualification");
  assert.ok(i > 0, "sem isto, cada chamada da rota fabrica mais uma divergência");
  assert.match(fonte.slice(Math.max(0, i - 600), i), /canonicoDeLegado\(/, "só sobe valor com par honesto");
  assert.match(fonte, /qualificationAnswers:\s*answers/, "a gaveta legada continua escrita — telas antigas ainda a leem");
});

test("a recusa da RPC é obedecida e fica VISÍVEL, nunca contornada", () => {
  // A RPC só aceita o corretor responsável. Contornar isso com `service_role`
  // seria afrouxar a trava de dono; engolir a recusa recriaria o defeito calado.
  const fonte = semRuido(lerFonte("app", "api", "v1", "leads", "[id]", "qualify", "route.ts"));
  assert.match(fonte, /canonicoRecusado\.push/);
  assert.match(fonte, /logger\.warn\("lead\.qualify\.canonico_nao_gravado"/);
  assert.match(fonte, /gavetaCanonica:\s*\{\s*gravados:\s*canonicoGravado,\s*recusados:\s*canonicoRecusado\s*\}/);
});

test("o Copilot só chama de confirmado o que foi confirmado dentro do CRM", () => {
  const fonte = semRuido(lerFonte("app", "api", "ai", "copilot", "route.ts"));
  assert.ok(!/brokerConfirmed:\s*true\b/.test(fonte), "`true` cravado passou a ser mentira quando as fontes se uniram");
  assert.match(fonte, /brokerConfirmed:\s*Object\.values\(unificada\.origens\)\.every/);
  assert.match(fonte, /confirmedQualification\s*=\s*perfilConfirmadoNoCrm\(unificada\)/);
});

test("a régua é PURA — nenhum acesso a banco dentro do unificador", () => {
  const modulo = semRuido(lerFonte("lib", "crm", "qualificacao-canonica.ts"));
  assert.ok(
    !/supabase|fetch\(|\.from\(|createClient/.test(modulo),
    "a precedência entre gavetas precisa ser revisável por quem entende do negócio",
  );
  assert.ok(!/@\//.test(modulo), "import por atalho deixa o módulo inalcançável por contrato");
});
