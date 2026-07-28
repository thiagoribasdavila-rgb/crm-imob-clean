/**
 * Contrato: CADA ID DE EMPREENDIMENTO NA SUA TABELA.
 *
 * ── O defeito que isto fixa ─────────────────────────────────────────────────
 *
 * Os MESMOS 4 empreendimentos vivem em `crm_projects` E em `developments`, com
 * ids diferentes (drift medido em 2026-07-28). As FKs se dividem por convenção:
 *
 *   leads.project_id      → crm_projects
 *   leads.development_id  → developments
 *
 * com uma exceção traiçoeira: `meta_lead_sources.development_id` chama-se
 * development_id mas referencia crm_projects.
 *
 * A ingestão copiava o id da fonte (crm_projects) para AS DUAS colunas da
 * lead. Na certa funcionava; na errada estourava a FK e A LEAD INTEIRA SE
 * PERDIA — provado no banco vivo: o par errado devolve 23503.
 *
 * Dormente enquanto nenhuma fonte tinha empreendimento; armado no instante em
 * que os formulários com qualificação foram vinculados. O pior tipo de bug:
 * ativado por uma melhoria feita em outro lugar.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const rota = ler("app", "api", "v2", "outbox", "process", "route.ts");
/** Sem comentários: o cabeçalho CITA o bug antigo para explicá-lo. */
const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("o id da fonte vai para project_id — nunca para development_id", () => {
  // O valor da fonte É um id de crm_projects. Colocá-lo em development_id foi
  // exatamente o bug: FK 23503 e lead perdida.
  assert.match(codigo, /project_id: crmProjectId/);
  assert.ok(!/development_id: crmProjectId/.test(codigo),
    "o id de crm_projects na coluna de developments é o bug que perdia a lead");
  assert.ok(!/development_id: sourceResult\.data\?\.development_id/.test(codigo),
    "a forma original do bug não pode voltar");
});

test("development_id vem da PONTE, não de adivinhação", () => {
  assert.match(codigo, /from\("crm_projects"\)\.select\("development_id"\)/,
    "a ponte é crm_projects.development_id (migration 20260728010000)");
  assert.match(codigo, /development_id: developmentIdDaPonte/);
});

test("ponte ausente avisa em vez de inventar", () => {
  // Fallback silencioso aqui viraria funil por empreendimento errado — pior
  // que nulo, porque nulo aparece e errado se esconde.
  assert.match(codigo, /ponte_de_empreendimento_ausente/);
  assert.match(rota, /preencha crm_projects\.development_id/,
    "o log precisa dizer o passo que resolve, não só reclamar");
});

test("a ponte não é consultada para lead que já existe", () => {
  // Lead existente não é recriada; gastar uma ida ao banco por evento repetido
  // seria custo sem efeito.
  assert.match(codigo, /if \(crmProjectId && !existingLead\)/);
});

test("a migration da ponte existe, é idempotente e documenta o rollback", () => {
  const migration = ler("supabase", "migrations", "20260728010000_mapeia_crm_projects_para_developments.sql");
  assert.match(migration, /add column if not exists development_id/i, "reexecutar precisa ser seguro");
  assert.match(migration, /where p\.development_id is null/i, "o backfill só preenche onde está nulo");
  assert.match(migration, /\) = 1/, "casamento ambíguo fica nulo — vínculo errado em silêncio é pior");
  assert.match(migration, /drop column if exists development_id/i, "o rollback precisa estar escrito na própria migration");
  assert.match(migration, /references public\.developments\(id\)/i);
});

test("a razão do drift está escrita junto da correção", () => {
  // Sem ela, o próximo a ler "simplifica" de volta para uma variável só — e
  // rearma o bug.
  assert.match(rota, /DUAS IDENTIDADES PARA O MESMO EMPREENDIMENTO/i);
  assert.match(rota, /apesar de a coluna dela se chamar development_id/i,
    "a exceção de nomenclatura da fonte é a armadilha central");
});
