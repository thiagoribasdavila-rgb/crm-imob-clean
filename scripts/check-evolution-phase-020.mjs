import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const source = fs.readFileSync("lib/atlas/evolution-500.ts", "utf8");
const page = fs.readFileSync("app/(crm)/atlas-v3/Evolution500Program.tsx", "utf8");
const runner = fs.readFileSync("scripts/run-evolution-wave-001-homologation.mjs", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_020_WAVE_HOMOLOGATION.md", "utf8");

const failedGates = config.releaseGates.filter((gate) => !gate.passed);
const checks = [
  ["Fase permanece bloqueada com verdade", config.phase === 20 && config.status === "blocked"],
  ["Publicação de produção não autorizada", config.productionReleaseAllowed === false],
  ["Nenhum dado de produção foi alterado", config.productionDataModified === false && config.runtimeEvidence.runtimeMutationExecuted === false],
  ["Bloqueios possuem responsável", failedGates.length >= 7 && failedGates.every((gate) => gate.owner)],
  ["Evidência runtime não foi inventada", config.runtimeEvidence.canonicalSchemaReady === false && config.runtimeEvidence.canonicalHierarchyReady === false],
  ["Critérios de saída exigem staging", Object.values(config.exitCriteria).every((value) => value === false)],
  ["Programa suporta status bloqueado", source.includes('\"planejada\" | \"bloqueada\" | \"concluída\"') && source.includes('status: \"bloqueada\"')],
  ["Interface explica o próximo passo", page.includes("Aguardando staging") && page.includes("data-blocked")],
  ["Runner não aplica migrations", runner.includes("Somente leitura") && !runner.includes("db push") && !runner.includes("migration up")],
  ["Relatório proíbe push direto", report.includes("Não executar `supabase db push` diretamente em produção")],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 020 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log(`Fase 020: gate formal ativo; ${failedGates.length} evidências ainda bloqueiam a homologação da onda.`);
