import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalCommercialRole,
  canonicalLeadStatus,
  compatibleLeadStatuses,
  leadAsOpportunity,
  liveLeadSortColumn,
  mapLegacyLead,
  mapLegacyProfile,
  mapLegacyProject,
  mapLegacyTask,
} from "../../lib/compat/legacy-v2.ts";

test("normaliza etapas comerciais legadas sem perder o significado", () => {
  assert.equal(canonicalLeadStatus("NOVO_LEAD"), "novo");
  assert.equal(canonicalLeadStatus("QUALIFICADO"), "qualificacao");
  assert.equal(canonicalLeadStatus("NEGOCIAÇÃO"), "proposta");
  assert.equal(canonicalLeadStatus("VENDIDO"), "ganho");
  assert.ok(compatibleLeadStatuses("qualificacao").includes("QUALIFICADO"));
});

/**
 * ── ASSERÇÃO REAPONTADA EM 02/08/2026, COM A CAUSA MEDIDA ───────────────────
 *
 * Esta linha exigia `liveLeadSortColumn("updated_at") === "created_at"`. O nome
 * do teste diz o critério — "colunas existentes no banco V3" — e a asserção
 * estava certa quanto ao critério e ERRADA quanto ao fato: `updated_at` existe.
 * Conferido no banco vivo (pozbrcsfthnhmnebfoxv) antes de mexer aqui:
 *
 *   information_schema.columns → leads.updated_at, timestamptz, is_nullable=NO
 *   criada na ponte V3 20260717213001, no mesmo `add column` de next_action_at
 *
 * O que a asserção congelava: a tela oferece "Última atualização" no seletor de
 * ordenação (app/(crm)/leads/page.tsx), e ordenar por ela ordenava por data de
 * CADASTRO. Em 468 das 490 leads desta base as duas datas diferem por mais de um
 * dia — não é a mesma ordem, é outra lista com o mesmo rótulo.
 *
 * O portão não foi removido: foi apontado para a coluna certa e ganhou o caso
 * que faltava — o recuo continua valendo para chave DESCONHECIDA, que é o que a
 * asserção deveria proteger desde o começo. Um teste que exige o valor errado
 * não protege: ele obriga o defeito a continuar.
 */
test("usa colunas existentes no banco V3 para ordenação", () => {
  assert.equal(liveLeadSortColumn("score"), "score_ia");
  assert.equal(liveLeadSortColumn("updated_at"), "updated_at",
    "leads.updated_at existe e é not null; mandar para created_at faz 'Última atualização' ordenar por cadastro");
  assert.equal(liveLeadSortColumn("name"), "name");
  assert.equal(liveLeadSortColumn("unknown"), "created_at",
    "chave desconhecida não escolhe coluna: created_at é a única presente em qualquer banco");
  assert.equal(liveLeadSortColumn(""), "created_at");
});

/**
 * ── ASSERÇÃO REAPONTADA EM 03/08/2026, COM A CAUSA MEDIDA ──────────────────
 *
 * O teste antigo exigia `value: 900_000` vindo de `budget_max` e estava VERDE,
 * congelando um mal-entendido: `value` é o ORÇAMENTO QUE A PESSOA DECLAROU no
 * formulário, e /reports somava isso chamando de "VGV em oportunidades".
 *
 * Medido no banco vivo:
 *   · a tela mostrava .......... R$ 5.011.616.337
 *   · vendas apuradas .......... R$ 1.506.000 (2 vendas)
 *   · uma ÚNICA lead ........... 99,77% daquele número (orçamento de 5 bilhões)
 *   · menor orçamento na base .. −5
 *
 * E /sales já mostrava R$ 1.506.000, porque usa `apurarVgv`. A mesma empresa
 * tinha duas receitas em dois itens do mesmo menu, com 3.328× de diferença.
 *
 * `value` NÃO mudou de valor: consumidores antigos leem essa chave, e este
 * arquivo não pode importar o módulo canônico (contratos o carregam por `data:`
 * URL, onde nem alias nem caminho relativo resolvem). O que mudou é que agora a
 * verdade tem nome ao lado — e a asserção passa a EXIGIR que os dois campos
 * existam separados, para ninguém voltar a confundi-los.
 */
test("orçamento declarado e valor de venda são campos DIFERENTES", () => {
  const opportunity = leadAsOpportunity({
    id: "lead-1",
    name: "Cliente",
    status: "PROPOSTA_ENVIADA",
    budget_max: 900_000,
    assigned_user_id: "broker-1",
    project_id: "project-1",
    created_at: "2026-07-20T10:00:00.000Z",
  });

  assert.deepEqual(
    {
      id: opportunity.id,
      stage: opportunity.stage,
      orcamentoDeclarado: opportunity.orcamentoDeclarado,
      saleValueBrl: opportunity.saleValueBrl,
      probability: opportunity.probability,
      assigned_to: opportunity.assigned_to,
      development_id: opportunity.development_id,
      source: opportunity.compatibility_source,
    },
    {
      id: "lead-1",
      stage: "proposta",
      orcamentoDeclarado: 900_000,
      // Proposta enviada NÃO é venda. Somar isto como receita produziu os
      // R$ 5,01 bilhões.
      saleValueBrl: null,
      probability: 0,
      assigned_to: "broker-1",
      development_id: "project-1",
      source: "legacy_lead",
    },
  );
});

test("com venda fechada, os dois números convivem sem se confundir", () => {
  // O caso real: Monique Teles declarou R$ 756.000 e pagou R$ 956.000. A tela
  // antiga mostrava o que ela DISSE que podia pagar.
  const vendida = leadAsOpportunity({
    id: "lead-2", name: "Monique", status: "ganho",
    budget_max: 756_000, sale_value_brl: 956_000,
    created_at: "2026-07-20T10:00:00.000Z",
  });
  assert.equal(vendida.orcamentoDeclarado, 756_000);
  assert.equal(vendida.saleValueBrl, 956_000, "quem soma receita usa ESTE, pelo módulo canônico");
});

test("orçamento NEGATIVO não vira número: a base tem uma lead com −5", () => {
  const suja = leadAsOpportunity({ id: "lead-3", name: "Edson", status: "novo", budget_min: -5, created_at: "2026-07-20T10:00:00.000Z" });
  assert.equal(suja.orcamentoDeclarado, null, "número impossível é ausência de dado, não dado");
  assert.equal(suja.saleValueBrl, null);
});

test("compatibiliza score, temperatura, próxima ação e preferências do lead", () => {
  const lead = mapLegacyLead({
    score_ia: "84",
    classificacao_ia: "QUENTE",
    assigned_user_id: "broker-1",
    next_action: "Ligar",
    next_contact: "2026-07-24T13:00:00.000Z",
    preferred_neighborhoods: "Perdizes;Pinheiros",
    notes: "Objetivo declarado: investimento.",
  });

  assert.equal(lead.score, 84);
  assert.equal(lead.temperature, "quente");
  assert.equal(lead.assigned_to, "broker-1");
  assert.equal(lead.next_action_label, "Ligar");
  assert.equal(lead.next_action_at, "2026-07-24T13:00:00.000Z");
  assert.deepEqual(lead.preferred_regions, ["Perdizes", "Pinheiros"]);
  assert.equal(lead.purpose, "investimento");
});

test("compatibiliza prazo de tarefa usando due_date antes de created_at", () => {
  const task = mapLegacyTask({
    id: "task-1",
    due_date: "2026-07-24T15:00:00.000Z",
    created_at: "2026-07-20T15:00:00.000Z",
    user_id: "broker-1",
  });
  assert.equal(task.due_at, "2026-07-24T15:00:00.000Z");
  assert.equal(task.assigned_to, "broker-1");
});

test("compatibiliza projeto e perfil sem exigir colunas novas", () => {
  const project = mapLegacyProject({
    name: "Inside Perdizes",
    developer: "Incorporadora",
    bairro: "Perdizes",
    cidade: "São Paulo",
    uf: "SP",
  });
  const profile = mapLegacyProfile({
    name: "Senna",
    role: "DIRETOR_COMERCIAL",
  });

  assert.equal(project.development_name, "Inside Perdizes");
  assert.equal(project.developer_name, "Incorporadora");
  assert.equal(project.neighborhood, "Perdizes");
  assert.equal(project.city, "São Paulo");
  assert.equal(project.state, "SP");
  assert.equal(profile.full_name, "Senna");
  assert.equal(profile.commercial_role, "director");
  assert.equal(canonicalCommercialRole("CORRETOR"), "broker");
});
