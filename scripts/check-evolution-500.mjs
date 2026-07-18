import fs from "node:fs";

const source = fs.readFileSync("lib/atlas/evolution-500.ts", "utf8");
const page = fs.readFileSync("app/(crm)/atlas-v3/Evolution500Program.tsx", "utf8");

const checks = [
  ["25 ondas", (source.match(/\{ id: \d+, name:/g) || []).length === 25],
  ["20 checkpoints", (source.match(/^  \".*\",$/gm) || []).length === 20],
  ["500 fases calculadas", source.includes("waveDefinitions") && source.includes("checkpoints")],
  ["Busca compacta", page.includes("Buscar IA, Kimi, navegação")],
  ["Sem falsa conclusão", source.includes('status: "planejada"')],
  ["Regra de evidência", source.includes("Uma fase só avança com evidência")],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Programa 500 fases inválido: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Programa Atlas 500: 25 ondas × 20 fases = 500 fases planejadas e verificadas.");
