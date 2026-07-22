import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expectIncludes(relativePath, tokens) {
  const source = read(relativePath);
  for (const token of tokens) {
    if (!source.includes(token)) {
      failures += 1;
      console.error(`✗ ${relativePath}: faltou "${token}"`);
    } else {
      console.log(`✓ ${relativePath}: ${token}`);
    }
  }
}

expectIncludes("app/api/v1/integrations/meta/route.ts", [
  "evaluateAndromedaLearning",
  "lead_attribution_touches",
  "attributionCoverage",
  "freshnessScore",
  "duplicateRate",
  "governance",
  "directorDecisionOnly",
]);

expectIncludes("app/(crm)/integrations/meta/page.tsx", [
  "andromedaReadinessLabels",
  "andromedaGateLabels",
  "feedbackDeepEnough",
  "attributionReliable",
  "signalFresh",
  "Qualidade da conexão CRM → Meta",
  "Dados agregados",
]);

expectIncludes("lib/meta/andromeda-learning-loop.ts", [
  "ready_for_controlled_test",
  "noAutomaticAudienceChange: true",
  "directorDecisionRequired: true",
  "feedbackDeepEnough",
]);

if (failures > 0) {
  console.error(`\nAndromeda signal panel check falhou com ${failures} pendência(s).`);
  process.exit(1);
}

console.log("\nAndromeda signal panel check OK.");
