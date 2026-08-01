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

test("usa colunas existentes no banco V3 para ordenação", () => {
  assert.equal(liveLeadSortColumn("score"), "score_ia");
  assert.equal(liveLeadSortColumn("updated_at"), "created_at");
  assert.equal(liveLeadSortColumn("name"), "name");
  assert.equal(liveLeadSortColumn("unknown"), "created_at");
});

test("converte lead legado em oportunidade sem inventar probabilidade", () => {
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
      value: opportunity.value,
      probability: opportunity.probability,
      assigned_to: opportunity.assigned_to,
      development_id: opportunity.development_id,
      source: opportunity.compatibility_source,
    },
    {
      id: "lead-1",
      stage: "proposta",
      value: 900_000,
      probability: 0,
      assigned_to: "broker-1",
      development_id: "project-1",
      source: "legacy_lead",
    },
  );
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
