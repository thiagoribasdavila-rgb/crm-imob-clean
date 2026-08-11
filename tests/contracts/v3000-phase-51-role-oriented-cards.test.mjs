import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_ORIENTED_CARD_CONTRACT,
  buildRoleOrientedCard,
} from "../../lib/atlas/role-oriented-card.ts";
import {
  loadRoleOrientedCardsRegistry,
  validateRoleOrientedCards,
} from "../../scripts/check-v3000-phase-51-role-oriented-cards.mjs";

const root = process.cwd();

function baseInput(overrides = {}) {
  return {
    actionDetail: "Ligar até 14h e registrar o resultado.",
    actionLabel: "Fazer primeiro contato",
    assignedName: "Diego",
    potentialLabel: "R$ 850.000",
    projectName: "Inside Perdizes",
    role: "broker",
    stageLabel: "Novo",
    ...overrides,
  };
}

test("Fase 51 preserva identidade autenticada e RLS", () => {
  const registry = loadRoleOrientedCardsRegistry(root);
  const result = validateRoleOrientedCards({ root, registry });

  assert.equal(result.phase, 51);
  assert.equal(result.status, "role-oriented-cards-adopted");
  assert.equal(result.roleSource, "authenticated-profile");
  assert.equal(result.visibilitySource, "authenticated-api-and-rls");
  assert.equal(result.manualLensChangesVisibility, false);
});

test("corretor recebe execução sem exposição do responsável", () => {
  const snapshot = buildRoleOrientedCard(baseInput());

  assert.equal(snapshot.mode, "execution");
  assert.equal(snapshot.scopeLabel, "Minha carteira");
  assert.equal(snapshot.headline, "Fazer primeiro contato");
  assert.equal(snapshot.ownerLabel, null);
  assert.equal(snapshot.metricValue, "Novo");
});

test("gerente recebe intervenção com responsável de linha permitida", () => {
  const snapshot = buildRoleOrientedCard(
    baseInput({
      role: "manager",
      exception: {
        detail: "Sem interação registrada há 5 dias.",
        label: "Silêncio operacional",
        tone: "warning",
      },
    }),
  );

  assert.equal(snapshot.mode, "intervention");
  assert.equal(snapshot.scopeLabel, "Minha estrutura");
  assert.equal(snapshot.headline, "Silêncio operacional");
  assert.equal(snapshot.ownerLabel, "Diego");
  assert.equal(snapshot.evidenceLabel, "Exceção comprovada");
});

test("gerente sem exceção acompanha execução registrada", () => {
  const snapshot = buildRoleOrientedCard(
    baseInput({ role: "manager", assignedName: null }),
  );

  assert.equal(snapshot.headline, "Acompanhar execução");
  assert.equal(snapshot.ownerLabel, "Sem responsável");
  assert.equal(snapshot.evidenceLabel, "Atribuição e etapa registradas");
});

test("diretor recebe impacto, projeto e potencial sem responsável individual", () => {
  const snapshot = buildRoleOrientedCard(baseInput({ role: "director" }));

  assert.equal(snapshot.mode, "impact");
  assert.equal(snapshot.scopeLabel, "Visão da organização");
  assert.equal(snapshot.metricValue, "R$ 850.000");
  assert.match(snapshot.detail, /Inside Perdizes · Novo/);
  assert.equal(snapshot.ownerLabel, null);
});

test("diretor só chama de exceção quando recebe evidência", () => {
  const withoutException = buildRoleOrientedCard(
    baseInput({ role: "director" }),
  );
  const withException = buildRoleOrientedCard(
    baseInput({
      role: "director",
      exception: {
        detail: "Faixas de preço não se sobrepõem.",
        label: "Faixa incompatível",
        tone: "danger",
      },
    }),
  );

  assert.equal(withoutException.evidenceLabel, "Agregado por etapa e valor");
  assert.equal(withException.evidenceLabel, "Exceção comprovada");
  assert.equal(withException.tone, "danger");
});

test("contrato proíbe lente manual de ampliar visibilidade", () => {
  assert.equal(
    ROLE_ORIENTED_CARD_CONTRACT.manuallySelectedLensChangesVisibility,
    false,
  );
  assert.equal(
    ROLE_ORIENTED_CARD_CONTRACT.visibilitySource,
    "authenticated-api-and-rls",
  );
});

test("Fase 51 rejeita expansão de visibilidade pela lente manual", () => {
  const registry = structuredClone(loadRoleOrientedCardsRegistry(root));
  registry.identity.manualLensChangesVisibility = true;

  assert.throws(
    () => validateRoleOrientedCards({ root, registry }),
    /lente manual não pode ampliar acesso/,
  );
});
