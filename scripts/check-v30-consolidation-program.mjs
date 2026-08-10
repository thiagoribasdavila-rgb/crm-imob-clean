import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(read("config/v30-consolidation-30-phases.json"));
const report = read("docs/ATLAS_V30_CONSOLIDATION_30_PHASES.md");
const readme = read("README.md");
const packageJson = JSON.parse(read("package.json"));
const packageScript = read("scripts/package-hostinger.mjs");
const nodeVersion = read(".nvmrc").trim();

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(config.phases.length === 30, "o programa deve ter exatamente 30 fases");
expect(
  config.phases.every((phase, index) => phase.id === index + 1),
  "as fases devem ser sequenciais de 1 a 30",
);
expect(
  config.phases.every(
    (phase) =>
      phase.title &&
      phase.objective &&
      Array.isArray(phase.acceptance) &&
      phase.acceptance.length >= 3 &&
      Array.isArray(phase.tests) &&
      phase.tests.length >= 2,
  ),
  "toda fase deve ter objetivo, pelo menos três aceites e dois testes",
);
expect(
  config.phases.filter((phase) => phase.buildAllowed).map((phase) => phase.id).join(",") === "29",
  "somente a fase 29 pode executar o build completo",
);
expect(config.releaseGates.singleFullBuildPhase === 29, "gate de build divergente");
expect(config.releaseGates.artifactPhase === 29, "gate de artefato divergente");
expect(config.releaseGates.realDeploymentPhase === 30, "gate de implantação divergente");
expect(config.releaseGates.productionPromotionRequiresHumanApproval, "produção exige aprovação humana");
expect(packageJson.engines?.node === ">=22", "package.json deve exigir Node 22+");
expect(nodeVersion === "24", ".nvmrc deve recomendar Node 24");
expect(readme.includes("Hospedagem: Hostinger"), "README deve declarar Hostinger");
expect(!readme.includes("Deploy on Vercel"), "README não pode orientar deploy Vercel");
expect(report.includes("um único build completo"), "relatório deve registrar o gate único de build");
expect(report.includes("Meta/CAPI"), "relatório deve incluir teste Meta/CAPI");
expect(
  packageJson.scripts?.["next16:runtime-contract:check"]?.includes(
    "check-next16-runtime-contract.mjs",
  ),
  "o programa deve validar o contrato de runtime do Next 16",
);
expect(
  packageJson.scripts?.["preflight:contract:check"]?.includes(
    "check-production-preflight-contract.mjs",
  ),
  "o programa deve validar que o preflight falha com mensagens acionáveis",
);
expect(packageScript.includes("sourceFingerprint"), "pacote precisa registrar fingerprint de origem");
expect(packageScript.includes("workspace-content-hash"), "snapshot sem Git precisa usar hash de conteúdo");

if (failures.length) {
  console.error(`ATLAS V30 consolidação: ${failures.length} falha(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "ATLAS V30 consolidação: 30/30 fases contratadas; Node, Hostinger, testes e gate único de build aprovados.",
);
