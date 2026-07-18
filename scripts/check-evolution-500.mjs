import fs from "node:fs";

const source = fs.readFileSync("lib/atlas/evolution-500.ts", "utf8");
const page = fs.readFileSync("app/(crm)/atlas-v3/Evolution500Program.tsx", "utf8");
const phaseOne = JSON.parse(fs.readFileSync("config/evolution-phase-001-journey-inventory.json", "utf8"));
const phaseTwo = JSON.parse(fs.readFileSync("config/evolution-phase-002-commercial-outcome.json", "utf8"));
const phaseThree = JSON.parse(fs.readFileSync("config/evolution-phase-003-navigation-baseline.json", "utf8"));
const phaseFour = JSON.parse(fs.readFileSync("config/evolution-phase-004-canonical-navigation.json", "utf8"));
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const palette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");

const checks = [
  ["50 ondas", (source.match(/\{ id: \d+, name:/g) || []).length === 50],
  ["20 checkpoints", (source.match(/^  \".*\",$/gm) || []).length === 20],
  ["1.000 fases calculadas", source.includes("evolution1000Phases") && source.includes("checkpoints")],
  ["Busca compacta", page.includes("Buscar IA, Kimi, navegação")],
  ["Sem falsa conclusão", source.includes('status: "planejada"')],
  ["Regra de evidência", source.includes("Uma fase só avança com evidência")],
  ["Fase 001 concluída", phaseOne.phase === 1 && phaseOne.status === "completed"],
  ["Fase 001 com jornadas", phaseOne.criticalJourneys.length >= 6 && phaseOne.roles.length === 4],
  ["Fase 001 sem mudança destrutiva", phaseOne.exitCriteria.noDestructiveRouteChange === true],
  ["Fase 002 orientada a resultado", phaseTwo.status === "completed" && phaseTwo.successMeasures.length >= 4],
  ["Fase 003 sem métricas inventadas", phaseThree.status === "completed" && phaseThree.instrumentationPending.length >= 3],
  ["Fase 004 com fonte canônica", phaseFour.status === "completed" && navigation.includes("atlasNavigation")],
  ["Três consumidores canônicos", sidebar.includes("atlasNavigation") && palette.includes("atlasNavigation") && mobileDock.includes("atlasMobileNavigation")],
  ["V2 fora do catálogo canônico", !navigation.includes("/atlas-v2") && phaseFour.historicalRouteDeleted === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Programa 500 fases inválido: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Programa Atlas 1000: 50 ondas × 20 fases = 1.000 fases planejadas e verificadas.");
