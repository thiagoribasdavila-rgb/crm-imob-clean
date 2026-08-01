/**
 * Contrato do CADASTRO DE EMPREENDIMENTOS.
 *
 * `crm_projects` e `developments` guardavam os MESMOS empreendimentos com
 * identificadores DIFERENTES. A tela de Projetos lia a primeira; as 174 leads
 * apontam para a segunda. Nenhuma junção fechava — quatro projetos com ZERO
 * leads, sendo que Inside Perdizes tem 174.
 *
 * `developments` é a canônica sem discussão: 33 tabelas a referenciam contra 6
 * de `crm_projects` — e nenhuma dessas 6 tinha uma única linha apontando para
 * lá. A tabela antiga tinha 4 linhas para as quais nada aponta.
 *
 * Rodar: node --test tests/contracts/empreendimento-tabela-canonica.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const repo = fs.readFileSync(path.join(raiz, "lib", "atlas", "core-v2", "live-repositories.ts"), "utf8");
const launchOs = fs.readFileSync(path.join(raiz, "app", "api", "v1", "launch-os", "route.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(raiz, "supabase", "migrations", "20260727010000_unifica_empreendimentos_em_developments.sql"),
  "utf8",
);

test("a leitura de empreendimentos usa a tabela canônica", () => {
  const bloco = repo.slice(
    repo.indexOf("export async function readCompatibleDevelopments"),
    repo.indexOf("export async function readCompatibleDevelopments") + 1800,
  );
  assert.match(bloco, /\.from\("developments"\)/, "a canônica é `developments`");
  assert.ok(!/\.from\("crm_projects"\)/.test(bloco),
    "ler a tabela órfã devolve IDs que nenhuma lead conhece");
  assert.match(bloco, /"public\.developments"/, "a origem declarada tem que acompanhar");
});

test("as colunas renomeadas entram por alias, sem quebrar quem consome", () => {
  // `code` virou `project_code` e `address` virou `address_line` na migração V3.
  assert.match(repo, /code:project_code/);
  assert.match(repo, /address:address_line/);
});

test("a migration é idempotente e não apaga nada", () => {
  assert.match(migration, /where not exists \(/,
    "rodar de novo não pode duplicar empreendimento");
  for (const destrutivo of [/\bdrop\s+table\b/i, /\bdelete\s+from\b/i, /\btruncate\b/i, /\bdrop\s+column\b/i]) {
    assert.ok(!destrutivo.test(migration),
      `a migration contém comando destrutivo: ${destrutivo}`);
  }
});

test("a migration confere o resultado em vez de torcer", () => {
  assert.match(migration, /raise exception 'Unificacao incompleta/,
    "sem a verificação, uma unificação parcial passaria despercebida");
});

test("a contagem de leads do projeto vem da fonte, não da campanha", () => {
  // `marketing_campaigns.leads_count` só existe quando a campanha é registrada
  // E ligada ao projeto. A lead pode chegar por portal, site, indicação ou
  // importação — contar pela campanha era contar uma fatia e chamá-la de total.
  assert.match(launchOs, /db\.from\("leads"\)\.select\("development_id"\)/);
  assert.match(launchOs, /totalLeads: contagemDeLeads\.get\(id\) \?\? 0/);
  assert.match(launchOs, /campaignLeads: leads,/,
    "a contagem por campanha CONTINUA: uma coisa é o que a mídia trouxe, outra é o que o empreendimento tem");
});
