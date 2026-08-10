import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assistedInteractionDescription,
  buildDeterministicInteractionDraft,
  mergeGeneratedInteractionDraft,
  validateAssistedConfirmation,
  validateAssistedSource,
} from "../../lib/ai/assisted-interaction.ts";

const route = readFileSync(
  "app/api/v1/leads/[id]/assisted-interaction/route.ts",
  "utf8",
);
const component = readFileSync(
  "components/crm/assisted-interaction-capture.tsx",
  "utf8",
);

test("rascunho determinístico extrai apenas sinais observáveis", () => {
  const draft = buildDeterministicInteractionDraft(
    "Cliente quer morar, achou o preço alto e precisa avaliar financiamento.",
  );
  assert.equal(draft.intent, "Moradia");
  assert.deepEqual(draft.objections, ["Preço", "Financiamento"]);
  assert.equal(draft.confidence, 0.45);
  assert.match(draft.nextAction, /entrada|faixa de investimento/i);
});

test("resposta gerada inválida volta ao modo local seguro", () => {
  const fallback = buildDeterministicInteractionDraft(
    "Cliente pediu retorno amanhã.",
  );
  assert.deepEqual(
    mergeGeneratedInteractionDraft("resposta sem JSON", fallback),
    fallback,
  );
});

test("confirmação humana é obrigatória e o original é preservado", () => {
  const base = {
    sourceText: "Cliente gostou da planta e pediu retorno amanhã.",
    channel: "call",
    captureId: "1ec8a95b-ff17-48ca-9825-0d6276f16580",
    outcome: "Interesse confirmado",
    intent: "Moradia",
    objections: [],
    summary: "Cliente gostou da planta.",
    nextAction: "Retornar amanhã.",
    confidence: 0.8,
    generatedBy: "openai",
    model: "modelo-testado",
  };
  const rejected = validateAssistedConfirmation(base);
  assert.equal(rejected.ok, false);
  const accepted = validateAssistedConfirmation({
    ...base,
    humanConfirmed: true,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.match(
    assistedInteractionDescription(accepted.value),
    /Registro original preservado: Cliente gostou da planta/,
  );
  const untrustedProvider = validateAssistedConfirmation({
    ...base,
    humanConfirmed: true,
    generatedBy: "provedor-injetado",
    model: "modelo-injetado",
  });
  assert.equal(untrustedProvider.ok, true);
  if (untrustedProvider.ok) {
    assert.equal(untrustedProvider.value.generatedBy, "local");
    assert.equal(
      untrustedProvider.value.model,
      "deterministic-safe-fallback",
    );
  }
});

test("entrada rejeita canal desconhecido e anotação insuficiente", () => {
  assert.equal(
    validateAssistedSource({ sourceText: "curto", channel: "call" }).ok,
    false,
  );
  assert.equal(
    validateAssistedSource({
      sourceText: "Atendimento válido para análise.",
      channel: "telegram",
    }).ok,
    false,
  );
});

test("API separa rascunho de persistência e evita duplicidade", () => {
  const draftStart = route.indexOf('if (action === "draft")');
  const confirmStart = route.indexOf('if (action === "confirm")');
  assert.ok(draftStart >= 0 && confirmStart > draftStart);
  const draftBlock = route.slice(draftStart, confirmStart);
  assert.doesNotMatch(draftBlock, /recordLiveLeadEvent/);
  assert.match(route, /humanConfirmed/);
  assert.match(route, /captureId/);
  assert.match(route, /assisted_interaction_confirmed/);
  assert.match(route, /rawConversationInCommercialMemory: false/);
  assert.doesNotMatch(route, /sourceText[),}\]]*\s*[,}]?\s*\n?\s*logger\./);
});

test("interface exige revisão explícita antes de confirmar", () => {
  assert.match(component, /Confirmação humana obrigatória/);
  assert.match(component, /checked=\{reviewed\}/);
  assert.match(component, /!reviewed \|\|/);
  assert.match(component, /nada entra no histórico antes da sua revisão/);
  assert.match(component, /Confirmar no histórico/);
});

test("feedback da preparação é opcional e não executa contato externo", () => {
  assert.match(component, /A preparação ajudou neste atendimento/);
  assert.match(component, /action: "feedback"/);
  assert.match(component, /Nenhuma ação é enviada ao cliente/);
});
