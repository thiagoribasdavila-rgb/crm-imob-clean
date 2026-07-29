/**
 * Contrato do sinal NUNCA CONTATADO.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * Medido no banco vivo em 2026-07-28: dos 448 leads em atendimento, 443 nunca
 * tiveram primeiro contato registrado. Mesmo assim a carteira do corretor
 * renderizava o estado vazio "Operação em dia", em verde, com o texto "Nenhuma
 * ação necessária agora" — porque nenhum dos quatro sinais existentes lia
 * `first_contacted_at`, e `stale_stage` só dispara depois de 1 dia em "novo"
 * (a importação dos 271 leads do Vinicius era do mesmo dia).
 *
 * Não era um número errado: era uma INSTRUÇÃO errada, dada no dia em que dois
 * corretores começavam a trabalhar uma base inteiramente intocada.
 *
 * ── AS DUAS ARMADILHAS QUE ESTE CONTRATO GUARDA ──────────────────────────────
 *
 * 1. Ausência de leitura não pode virar afirmação. Quem não seleciona
 *    FIRST_CONTACT_SLA_COLUMNS enxerga `first_contacted_at` como undefined —
 *    e tratar isso como "nunca contatado" marcaria 100% de qualquer carteira.
 *    Por isso a rota exige `primeiroContatoMensuravel` explícito, e a regra
 *    exige o campo já convertido: `undefined` nunca chega aqui como "nulo".
 *
 * 2. Um predicado só para o texto e para o filtro. O predicado antigo (status
 *    "novo" há mais de 15 min) diverge do predicado por coluna nos DOIS
 *    sentidos — nesta base perde 19 leads que avançaram de etapa sem ninguém
 *    ter ligado, e conta 5 que já foram contatados e seguem em "novo". Telas
 *    que contam de um jeito e filtram de outro se desmentem no primeiro
 *    clique; é a classe de defeito que mais apareceu neste repositório.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  avaliarNuncaContatado,
  NEVER_CONTACTED_CRITICAL_HOURS,
} from "../../lib/atlas/regra-nunca-contatado.ts";

const AGORA = Date.parse("2026-07-28T18:00:00.000Z");
const HORA = 3_600_000;
const emHoras = (h) => AGORA - h * HORA;

const avaliar = (over = {}) =>
  avaliarNuncaContatado({
    firstContactedAtMs: null,
    firstContactDueAtMs: emHoras(48),
    createdAtMs: emHoras(72),
    agoraMs: AGORA,
    ...over,
  });

test("lead sem primeiro contato e com prazo vencido dispara o sinal", () => {
  const veredito = avaliar();
  assert.ok(veredito, "o sinal precisa existir — é o único que olha primeiro contato");
  assert.equal(veredito.horasVencido, 48, "a métrica é o atraso em horas");
  assert.equal(veredito.critico, true, "48h de atraso é crítico, não aviso");
  assert.equal(veredito.desde, emHoras(48), "a âncora é o prazo, não o agora");
  assert.equal(veredito.temPrazoGravado, true);
});

test("lead já contatado encerra a questão", () => {
  assert.equal(
    avaliar({ firstContactedAtMs: emHoras(24) }),
    null,
    "prazo vencido não importa quando o contato aconteceu — o relógio parou",
  );
});

test("a fronteira de criticidade está onde o limiar diz", () => {
  assert.equal(avaliar({ firstContactDueAtMs: emHoras(NEVER_CONTACTED_CRITICAL_HOURS - 1) }).critico, false,
    "1h antes do limiar ainda é aviso: o corretor pode estar discando agora");
  assert.equal(avaliar({ firstContactDueAtMs: emHoras(NEVER_CONTACTED_CRITICAL_HOURS) }).critico, true,
    "no limiar já é crítico");
});

test("prazo ainda no futuro não dispara", () => {
  assert.equal(
    avaliar({ firstContactDueAtMs: AGORA + 2 * HORA }),
    null,
    "lead dentro do prazo não é pendência — alertar aqui ensina a ignorar a lista",
  );
});

test("lead sem prazo de SLA conta desde a criação, e não fica invisível", () => {
  const veredito = avaliar({ firstContactDueAtMs: null });
  assert.ok(veredito, "não ter SLA gravado não pode ser o que salva o lead de aparecer");
  assert.equal(veredito.horasVencido, 72, "conta desde created_at quando não há prazo");
  assert.equal(veredito.temPrazoGravado, false, "e precisa declarar que a âncora mudou");
});

test("sem prazo e sem criação não inventa sinal", () => {
  assert.equal(
    avaliar({ firstContactDueAtMs: null, createdAtMs: null }),
    null,
    "sem nenhuma âncora de tempo, afirmar atraso seria inventar o dado que falta",
  );
});

/**
 * Os testes abaixo guardam a FIAÇÃO: a regra pura pode estar perfeita e o
 * sinal continuar invisível se a rota não ler as colunas ou se a tela não
 * desenhar o número. Foi exatamente assim que `firstContactOverdue` viveu —
 * calculado, tipado, devolvido pela API e nunca renderizado.
 */
const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

test("a rota do corretor lê as colunas de SLA e declara quando não pôde", () => {
  const rota = ler("app", "api", "v1", "analytics", "broker-daily", "route.ts");
  assert.match(rota, /LIVE_LEAD_SELECT_WITH_SLA/,
    "sem as colunas de SLA a rota não tem como saber quem nunca foi contatado");
  assert.match(rota, /primeiroContatoMensuravel = false/,
    "base legada sem as colunas precisa cair para o select base");
  assert.match(rota, /primeiroContatoMensuravel\s*\n?\s*\?\s*activeLeads\.filter\(\(lead\) => !lead\.first_contacted_at\)\.length\s*\n?\s*:\s*null/,
    "não medido tem que virar null, nunca zero");
});

test("o total da fila é contado antes do corte de exibição", () => {
  const rota = ler("app", "api", "v1", "analytics", "broker-daily", "route.ts");
  assert.match(rota, /leadsNeedingAttention: attentionQueueCompleta\.length/,
    "publicar o tamanho da página fazia o anel usar um teto de paginação como nota de saúde");
  assert.doesNotMatch(rota, /leadsNeedingAttention: attentionQueue\.length/,
    "o valor cortado não pode voltar a ser publicado como total");
});

test("a tela desenha o número e o anel usa a escala certa", () => {
  const pagina = ler("app", "(crm)", "command-center", "page.tsx");
  assert.match(pagina, /Sem 1º contato/,
    "o número que descreve o dia do corretor precisa existir em pixel, não só na resposta HTTP");
  assert.match(pagina, /firstContactOverdue \?\? "—"/,
    "não medido aparece como travessão, não como zero");
  assert.doesNotMatch(pagina, /fraction: Math\.min\(1, Math\.max\(0, rate \/ 100\)\)/,
    "followUpComplianceRate é razão 0–1: dividir por 100 desenhava 85% como 0,85% de anel");
});

test("o sinal é acionável, não só visível", () => {
  const propostas = ler("lib", "ai", "action-proposals.ts");
  assert.match(propostas, /signal === "never_contacted"/,
    "sinal sem proposta é um beco: o corretor lê e não tem o que clicar");
  assert.match(propostas, /strategy: "hierarchical_cascade"/,
    "lead nunca contatado E sem dono precisa ser distribuído antes de agendado");
  const aprovacoes = ler("app", "api", "v2", "approvals", "route.ts");
  assert.match(aprovacoes, /"never_contacted"/,
    "a rota precisa aceitar o sinal, senão o botão existe e o POST recusa");
});

test("o bônus de prioridade decide por coluna, não por etapa", () => {
  /**
   * Era o ÚLTIMO lugar onde o predicado divergente sobrevivia. O +120 de
   * "aguardando primeiro contato" olhava `status === "novo"` há mais de 15 min.
   *
   * Medido na carteira do Diego em 2026-07-29 (137 abertos): 22 leads NUNCA
   * contatados já saíram de "novo" — 16 em contato, 6 em qualificação — porque
   * alguém mexeu na etapa e não ligou. Eles não ganhavam o empurrão e
   * afundavam na fila, sendo justamente os parados há mais tempo. E 3 leads em
   * "novo" que JÁ foram contatados ganhavam um bônus que não mereciam.
   *
   * Os dois lados importam: o filtro tem de corrigir para cima e para baixo.
   */
  const rota = ler("app", "api", "v1", "analytics", "broker-daily", "route.ts");
  assert.match(rota, /const firstContactOverdue = primeiroContatoMensuravel\s*\n\s*\? !lead\.first_contacted_at/,
    "o bônus precisa sair da coluna, igual ao sinal, ao painel, ao risco e ao filtro da lista");
  assert.match(rota, /:\s*normalize\(lead\.status\) === "novo" &&/,
    "base sem a coluna cai para o predicado antigo — e o recuo é declarado, não silencioso");
});
