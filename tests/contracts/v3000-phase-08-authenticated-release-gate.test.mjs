import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pagePath = "app/(crm)/notifications/page.tsx";
const reportPath = "docs/V3000_PHASE_08_AUTHENTICATED_RELEASE_GATE.md";
const evidencePath = "docs/evidence/V3000_PHASE_08_RELEASE_GATE.json";

const page = readFileSync(pagePath, "utf8");
const report = readFileSync(reportPath, "utf8");
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));

test("Fase 8 distingue contrato local de rota ausente na release autenticada", () => {
  assert.equal(existsSync(pagePath), true);
  assert.match(page, /<V3000PageTemplate/);
  assert.doesNotMatch(page, /^['"]use client['"];?/m);
  assert.match(report, /https:\/\/atlasaios\.com\.br\/notifications/);
  assert.match(report, /página 404 do próprio Atlas/);
  assert.equal(evidence.localContract, "approved");
  assert.equal(evidence.authenticatedProductionRoute, "missing");
});

test("gate impede promoção enquanto desktop, mobile, teclado e ações estão bloqueados", () => {
  assert.equal(evidence.eligibleForTemplatePromotion, false);
  assert.equal(evidence.desktopProof, "blocked-by-release-parity");
  assert.equal(evidence.mobileProof, "blocked-by-release-parity");
  assert.equal(evidence.keyboardProof, "blocked-by-release-parity");
  assert.equal(evidence.realActionsProof, "blocked-by-release-parity");
  assert.match(report, /BLOQUEADO\s+PARA PROMOÇÃO/);
  assert.match(report, /NÃO ELEGÍVEL/);
});

test("evidência autenticada é segura, sem mutação e sem esconder o estado do console", () => {
  assert.equal(evidence.consoleWarnings, 0);
  assert.equal(evidence.consoleErrors, 0);
  assert.equal(evidence.dataMutations, 0);
  assert.match(report, /Avisos no console \| 0/);
  assert.match(report, /Erros no console \| 0/);
  assert.match(report, /Mutação de dados \| 0/);
  assert.doesNotMatch(report, /homologada em produção/i);
});

test("próximo gate exige paridade da release antes de uma segunda página", () => {
  assert.equal(
    evidence.nextGate,
    "deploy-current-pilot-and-repeat-authenticated-proof",
  );
  assert.match(report, /confirmar que `\/notifications` deixa de responder 404/);
  assert.match(
    report,
    /nenhuma\s+segunda página deve adotar o template V3000/,
  );
});
