/**
 * Contrato: A ESCRITA DE EMPREENDIMENTO VALIDA NA TABELA ONDE ELA CAI.
 *
 * ── O DEFEITO, MEDIDO ────────────────────────────────────────────────────────
 *
 * O adaptador de escrita conferia duplicidade e existência do alvo em
 * `crm_projects`, enquanto a leitura e a escrita de empreendimento vivem em
 * `developments`. As duas tabelas guardam OS MESMOS empreendimentos com IDs
 * DIFERENTES, então nada parecia errado — mas o id que a tela manda vem de
 * `developments` e nunca era encontrado.
 *
 * Medido no banco vivo em 2026-07-29:
 *   Inside Perdizes .......... 174 leads · existe em crm_projects? NÃO
 *   Arvo Teixeira da Silva ....11 leads · existe em crm_projects? NÃO
 *   Spin Mood ..................7 leads · existe em crm_projects? NÃO
 *   leads.development_id casa com developments em 192 de 192, e com
 *   crm_projects em 0 de 192.
 *
 * Consequência: `tenantTargetReady` ficava falso e TODA atualização de
 * empreendimento real era recusada. E a checagem de duplicidade cegaria no
 * primeiro cadastro novo, que entra só em `developments`.
 *
 * É a classe "duas tabelas de empreendimento": ler numa e validar escrita na
 * outra não dá erro — dá recusa silenciosa.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const adaptador = fs.readFileSync(
  path.join(raiz, "lib", "atlas", "core-v2", "live-development-write-adapter.ts"),
  "utf8",
);

test("a validação de escrita não consulta a tabela abandonada", () => {
  assert.doesNotMatch(adaptador, /from\("crm_projects"\)/,
    'crm_projects tem 0 de 192 leads apontando para ela: validar escrita ali recusa empreendimento que existe');
});

test("duplicidade e alvo são conferidos em developments", () => {
  const consultas = [...adaptador.matchAll(/\.from\("developments"\)/g)];
  assert.ok(consultas.length >= 2,
    `esperava ao menos as duas consultas (duplicidade e alvo) em developments, achei ${consultas.length}`);
});

test("a leitura e a escrita apontam para a mesma tabela", () => {
  // Se um dia a leitura mudar de tabela e a escrita não, o defeito volta —
  // sem erro, só recusando o que deveria aceitar.
  const leitura = fs.readFileSync(
    path.join(raiz, "lib", "atlas", "core-v2", "live-repositories.ts"),
    "utf8",
  );
  const tabelaDaLeitura = leitura.includes('from("developments")') ? "developments" : "outra";
  const tabelaDaEscrita = adaptador.includes('from("developments")') ? "developments" : "outra";
  assert.equal(tabelaDaEscrita, tabelaDaLeitura,
    "ler numa tabela e validar escrita na outra não dá erro — dá recusa silenciosa");
});
