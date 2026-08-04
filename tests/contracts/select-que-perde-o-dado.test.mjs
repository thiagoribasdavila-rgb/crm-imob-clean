/**
 * CONTRATO: o select PEDE o que o mapeador LÊ.
 *
 * ── A FAMÍLIA DE DEFEITO QUE ISTO GUARDA ────────────────────────────────────
 *
 * `mapLegacyLead` e `mapLegacyProfile` resolvem cada campo por uma escada de
 * colunas — canônica primeiro, legada depois, `created_at` no fim. A escada é
 * boa. O que a torna perigosa é que ela não sabe distinguir "a coluna existe e
 * está vazia" de "ninguém pediu a coluna": nos dois casos a chave não chega, e o
 * mapeador desce um degrau EM SILÊNCIO.
 *
 * Resultado: a tela recebe um valor, não um vazio. Não há tela em branco, não há
 * log, não há 500. Há um número errado com cara de certo — e, no caso do selo de
 * inatividade, um número errado que ainda declara de onde veio.
 *
 * Medido em 02/08/2026 no banco vivo (pozbrcsfthnhmnebfoxv, 490 leads):
 *
 *   updated_at difere de created_at ............ 489 de 490 (468 por mais de 1 dia)
 *   last_interaction_at preenchido ............. 24, todas com valor ≠ created_at
 *   metadata não vazio ......................... 487 de 490
 *   metadata.meta.campaignName ................. 20
 *   metadata.meta.dataSharingConsent ........... 473
 *   profiles.reports_to gravado (org 7c8c71c1).. 14 de 26; nenhum era lido
 *
 * ── POR QUE O CONTRATO TEM AS DUAS METADES ──────────────────────────────────
 *
 * A metade de COMPORTAMENTO prova que o mapeador entrega o dado do banco quando
 * a coluna chega. A metade ESTRUTURAL guarda o único lugar onde a regressão
 * entraria de novo: o `select=`. Sem ela, alguém tira a coluna do select, os
 * testes de comportamento continuam verdes (porque a fixture tem a chave) e a
 * produção volta a mentir.
 *
 * E o caso NEGATIVO existe para não trocar um defeito por outro: banco sem as
 * colunas tem de continuar caindo para a escada legada, não estourar.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ATIVIDADE_COLUMNS,
  LIVE_LEAD_SELECT,
  LIVE_LEAD_SELECT_WITH_SLA,
  LIVE_PROFILE_SELECT,
  mapLegacyLead,
  mapLegacyProfile,
} from "../../lib/compat/legacy-v2.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const colunas = (select) => select.split(",").map((c) => c.trim());

/** O que o PostgREST entrega: só o que o `select=` pediu, nada mais. */
const comoOPostgrestDevolve = (linha, select) =>
  Object.fromEntries(colunas(select).filter((c) => c in linha).map((c) => [c, linha[c]]));

/** Linha real da base viva (lead 2a350d0e), sem PII. */
const linhaViva = {
  id: "2a350d0e-5ed8-40e6-9125-7002657159a7",
  status: "qualificacao",
  score_ia: 50,
  campaign_id: null,
  created_at: "2026-05-26T05:18:42+00:00",
  updated_at: "2026-07-30T21:29:43.733+00:00",
  last_interaction_at: "2026-07-29T20:50:35.239+00:00",
  metadata: { meta: { campaignName: "Spin Mood", dataSharingConsent: true } },
};

/* ── COMPORTAMENTO ───────────────────────────────────────────────────────── */

test("a lista entrega a atividade do banco, não a data de cadastro", () => {
  const lead = mapLegacyLead(comoOPostgrestDevolve(linhaViva, LIVE_LEAD_SELECT_WITH_SLA));
  assert.equal(lead.updated_at, linhaViva.updated_at,
    "'Última atualização' com a data de cadastro é outra lista com o mesmo rótulo");
  assert.equal(lead.last_interaction_at, linhaViva.last_interaction_at,
    "'Último contato' contado desde o cadastro exagera a inatividade em 65 dias nesta lead");
  assert.notEqual(lead.updated_at, linhaViva.created_at);
});

test("banco sem as colunas de atividade continua caindo para a escada legada", () => {
  const { updated_at, last_interaction_at, ...semAtividade } = linhaViva;
  void updated_at;
  void last_interaction_at;
  const lead = mapLegacyLead(semAtividade);
  assert.equal(lead.updated_at, linhaViva.created_at,
    "ausência da coluna tem de recuar, não estourar: é o que sustenta o banco pré-V3");
  assert.equal(lead.last_interaction_at, linhaViva.created_at);
});

test("o selo de inatividade só pode dizer 'atividade' quando há atividade de verdade", () => {
  // Regra copiada de `proactiveSignal`, app/(crm)/pipeline/page.tsx.
  const basis = (lead) =>
    [lead.updated_at, lead.last_interaction_at]
      .map((v) => (v ? new Date(v).getTime() : Number.NaN))
      .filter(Number.isFinite).length > 0
      ? "atividade"
      : "criacao";
  const lead = mapLegacyLead(comoOPostgrestDevolve(linhaViva, LIVE_LEAD_SELECT_WITH_SLA));
  assert.equal(basis(lead), "atividade");
  assert.notEqual(lead.updated_at, linhaViva.created_at,
    "o selo declara procedência: dizer 'atividade' contando desde o cadastro é atestar o que não se tem");
});

test("o Kanban nomeia a campanha quando o metadata chega", () => {
  // Regra copiada de `metaCampaign`, app/(crm)/pipeline/page.tsx.
  const rotulo = (lead) => {
    const meta = lead.metadata?.meta;
    if (!meta || typeof meta !== "object") return lead.campaign_id;
    return String(meta.campaignName || meta.campaignId || lead.campaign_id || "");
  };
  const comColuna = mapLegacyLead(comoOPostgrestDevolve(linhaViva, `${LIVE_LEAD_SELECT_WITH_SLA},metadata`));
  assert.equal(rotulo(comColuna), "Spin Mood");

  const semColuna = mapLegacyLead(comoOPostgrestDevolve(linhaViva, LIVE_LEAD_SELECT_WITH_SLA));
  assert.notEqual(rotulo(semColuna), "Spin Mood",
    "sem a coluna o mapeador entrega {} e o card cai no id — é o defeito, e ele precisa continuar visível aqui");
});

test("o perfil entrega o papel e o chefe gravados, não os adivinhados", () => {
  // Perfil real da org 7c8c71c1: role=director mas commercial_role=manager.
  const perfilVivo = {
    id: "865ee50a-4d75-4e44-8a7e-54302daad008",
    active: true,
    role: "director",
    commercial_role: "manager",
    reports_to: "6f150832-4c97-42a7-954e-eea962a003fa",
  };
  const perfil = mapLegacyProfile(comoOPostgrestDevolve(perfilVivo, LIVE_PROFILE_SELECT));
  assert.equal(perfil.commercial_role, "manager",
    "sem commercial_role no select o mapeador cai em `role` e este gerente vira diretor");
  assert.equal(perfil.reports_to, perfilVivo.reports_to,
    "sem reports_to o organograma inteiro é derivado do palpite 'o primeiro gerente da lista'");
});

/* ── ESTRUTURA: quem pede o quê, e a que custo ───────────────────────────── */

test("as colunas de atividade entram no select estendido, não no degrau final", () => {
  assert.deepEqual([...ATIVIDADE_COLUMNS], ["updated_at", "last_interaction_at"]);
  for (const coluna of ATIVIDADE_COLUMNS) {
    assert.ok(colunas(LIVE_LEAD_SELECT_WITH_SLA).includes(coluna),
      `${coluna} fora do estendido: o mapeador volta a cair em created_at`);
    assert.ok(!colunas(LIVE_LEAD_SELECT).includes(coluna),
      `${coluna} nasceu na ponte V3 (20260717213001), a mesma de next_action_at; no degrau final ela derruba com 42703 todo banco pré-V3`);
  }
});

test("`metadata` fica fora dos selects COMPARTILHADOS — 20.000 leads não podem carregá-la", () => {
  // 509 B por lead medidos com pg_column_size; distribution e director-daily
  // varrem até 20.000 leads e não abrem o campo.
  assert.ok(!colunas(LIVE_LEAD_SELECT).includes("metadata"));
  assert.ok(!colunas(LIVE_LEAD_SELECT_WITH_SLA).includes("metadata"));
});

test("e entra nas DUAS escadas de quem realmente a lê", () => {
  const lista = ler("app", "api", "v1", "crm", "leads", "route.ts");
  for (const constante of ["COLUNAS_DA_LISTA", "COLUNAS_DA_LISTA_SEM_SLA"]) {
    const linha = lista.split("\n").find((l) => l.trimStart().startsWith(`const ${constante} =`));
    assert.ok(linha, `${constante} sumiu — a lista voltou ao select compartilhado e ao metadata vazio`);
    assert.match(linha, /metadata/, `${constante} parou de pedir metadata: o selo de consentimento apaga em 473 leads`);
  }
  assert.match(lista, /montarConsulta\(COLUNAS_DA_LISTA,/);
  assert.match(lista, /montarConsulta\(COLUNAS_DA_LISTA_SEM_SLA,/);

  const repositorio = ler("lib", "atlas", "core-v2", "live-repositories.ts");
  assert.match(repositorio, /input\.comMetadata \? `\$\{LIVE_LEAD_SELECT_WITH_SLA\},metadata` : LIVE_LEAD_SELECT_WITH_SLA/,
    "a escada de cima do repositório precisa carregar metadata quando pedido");
  assert.match(repositorio, /input\.comMetadata \? `\$\{LIVE_LEAD_SELECT\},metadata` : LIVE_LEAD_SELECT/,
    "e a de baixo também: a degradação por 42703 troca o select inteiro");

  const kanban = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(kanban, /comMetadata: true/,
    "o Kanban é quem lê metadata.meta.campaignName; sem pedir, o card mostra o UUID");
});

test("os quatro chamadores que NÃO leem metadata continuam sem pagar por ela", () => {
  // 509 B/lead: launch-os sozinho lê 5.000 leads (2,5 MB). Só o Kanban abre o
  // campo — os outros pagariam por uma coluna que nunca tocam.
  for (const arquivo of [
    ["app", "api", "v1", "launch-os", "route.ts"],
    ["app", "api", "v1", "calendar", "route.ts"],
    ["app", "api", "v1", "tasks", "route.ts"],
    ["lib", "atlas", "core-v2", "live-operational-health.ts"],
  ]) {
    assert.ok(!/comMetadata/.test(ler(...arquivo)),
      `${arquivo.join("/")} não lê metadata; pedir a coluna aqui é custo sem leitor`);
  }
});

test("o select de perfil pede o papel comercial e a chefia", () => {
  for (const coluna of ["commercial_role", "reports_to"]) {
    assert.ok(colunas(LIVE_PROFILE_SELECT).includes(coluna),
      `resolveLiveHierarchy lê ${coluna}; fora do select, o organograma inteiro é adivinhado`);
  }
  assert.ok(colunas(LIVE_PROFILE_SELECT).includes("role"),
    "a legada continua: ela é o recuo de `commercial_role` em banco pré-V3");
});
