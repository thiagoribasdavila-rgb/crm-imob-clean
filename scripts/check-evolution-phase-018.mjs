import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-018-profile-validation.json", "utf8"));
const navigationSource = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const palette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");
const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const layout = fs.readFileSync("app/(crm)/layout.tsx", "utf8");
const security = fs.readFileSync("lib/api/security.ts", "utf8");

const compiled = ts.transpileModule(navigationSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const compiledModule = { exports: {} };
const context = vm.createContext({ module: compiledModule, exports: compiledModule.exports });
vm.runInContext(compiled, context, { filename: "navigation.compiled.cjs" });

const {
  getAtlasNavigationForIdentity,
  getAtlasContextCommandsForIdentity,
} = compiledModule.exports;

const checks = [
  ["Fase concluída sem mutação real", config.status === "completed" && config.liveUsersModified === false && config.productionDataModified === false],
  ["Seis personas cobrem acesso e hierarquia", config.personas.length === 6],
  ["Política central exportada", typeof getAtlasNavigationForIdentity === "function" && typeof getAtlasContextCommandsForIdentity === "function"],
  ["Sidebar usa política central", sidebar.includes("getAtlasNavigationForIdentity")],
  ["Busca usa política central", palette.includes("getAtlasNavigationForIdentity") && palette.includes("getAtlasContextCommandsForIdentity")],
  ["Dock móvel usa política central", mobileDock.includes("getAtlasMobileNavigationForIdentity")],
  ["Paleta recebe identidade confirmada", appShell.includes("<CommandPalette identity={identity}") && !layout.includes("CommandPalette")],
  ["Cache não restaura papéis", appShell.includes("...defaultIdentity") && !appShell.includes("setIdentity({ ...defaultIdentity, ...parsed })")],
  ["Fallback legado preserva papel canônico", config.exitCriteria.legacyRoleFallbackIsCanonical === true && appShell.includes("commercialRoleCandidate") && appShell.includes('? "superintendent"')],
  ["Servidor confirma o usuário", security.includes("auth.getUser") && security.includes('from("profiles")')],
  ["Servidor valida organização ativa", security.includes('from("organizations")') && security.includes("organizationIsActive")],
  ["Dados pessoais fora da validação", config.personalDataCaptured === false],
  ["Bloqueio real registrado sem falsa aprovação", config.runtimeAudit.executed === true && config.runtimeAudit.status === "blocked_schema_contract" && config.runtimeAudit.mutationPerformed === false && config.exitCriteria.runtimeEvidenceInvented === false],
];

for (const persona of config.personas) {
  const identity = { role: persona.role, accessRole: persona.accessRole };
  const navigation = getAtlasNavigationForIdentity(identity);
  const contextCommands = getAtlasContextCommandsForIdentity(identity);
  const visible = new Set([...navigation, ...contextCommands].map((item) => item.href));
  checks.push([`${persona.label}: quantidade de módulos`, navigation.length === persona.expectedNavigationCount]);
  checks.push([`${persona.label}: quantidade de comandos`, contextCommands.length === persona.expectedContextCommandCount]);
  checks.push([`${persona.label}: ações permitidas`, persona.allowed.every((href) => visible.has(href))]);
  checks.push([`${persona.label}: ações bloqueadas`, persona.blocked.every((href) => !visible.has(href))]);
}

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 018 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 018: experiência e catálogo validados para cada perfil sem alterar usuários reais.");
