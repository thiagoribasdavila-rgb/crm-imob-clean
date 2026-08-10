import fs from "node:fs";

const files = [
  "config/operational-ux-phase-011-lazy-global-surfaces.json",
  "components/atlas/lazy-global-surfaces.tsx",
  "tests/contracts/lazy-global-surfaces.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_011_LAZY_GLOBAL_SURFACES.md",
];

let failed = false;
for (const file of files) {
  const pass = fs.existsSync(file);
  console.log(`${pass ? "PASS" : "FAIL"}: ${file}`);
  if (!pass) failed = true;
}

const config = JSON.parse(fs.readFileSync(files[0], "utf8"));
const loader = fs.readFileSync(files[1], "utf8");
const assertions = [
  [config.phase === 11, "identificador da fase"],
  [config.lazySurfaces.length === 5, "cinco superfícies adiadas"],
  [config.requirements.firstInteractionReplayed, "primeiro acionamento preservado"],
  [Object.values(config.infrastructureMutation).every((value) => value === false), "sem mutação de infraestrutura ou release"],
  [(loader.match(/ssr: false/g) ?? []).length === 5, "imports dinâmicos cliente"],
  [loader.includes("__atlasLazyReplay"), "replay protegido contra recursão"],
  [loader.includes("mountedRef.current"), "atalhos não duplicados após montagem"],
];

for (const [pass, label] of assertions) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failed = true;
}
if (failed) process.exit(1);
console.log("\nFase 11 aprovada: superfícies globais sob demanda com primeira ação preservada.");
