import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const foundation = fs.readFileSync("supabase/migrations/20260711040000_atlas_v3_foundation.sql", "utf8");
const executableFoundation = foundation
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "")
  .trim();
const foundationHasDDL = /\b(create|alter|drop)\s+(table|type|function|policy|view|schema)\b/i.test(executableFoundation);
const failed = config.releaseGates.filter((gate) => !gate.passed);

console.log("ATLAS · ONDA 001 · HOMOLOGAÇÃO");
console.log("Modo: Somente leitura; nenhuma migration ou escrita remota será executada.");
console.log(`Qualidade local: ${Object.values(config.localEvidence).every(Boolean) ? "APROVADA" : "PENDENTE"}`);
console.log(`Baseline reproduzível: ${foundationHasDDL ? "DETECTADA" : "NÃO COMPROVADA"}`);
for (const gate of config.releaseGates) console.log(`${gate.passed ? "✓" : "✗"} ${gate.label} · responsável: ${gate.owner}`);

if (failed.length || !foundationHasDDL) {
  console.error(`ONDA 001 BLOQUEADA: ${failed.length} gates pendentes; produção não autorizada.`);
  process.exit(1);
}

console.log("ONDA 001 ELEGÍVEL PARA ACEITE HUMANO. Esta verificação não publica produção.");
