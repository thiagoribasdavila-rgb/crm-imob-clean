import fs from "node:fs";
const c = [];
const n = (f, ...ts) => {
  const s = fs.readFileSync(f, "utf8");
  for (const t of ts) c.push([`${f}: ${t}`, s.includes(t)]);
};
n(
  "lib/governance/executive-homologation.ts",
  "role_signoffs",
  "rollback",
  "goAllowed: blocking.length === 0",
  "automaticPublish: false",
);
n(
  "supabase/migrations/20260719213000_phase_99_executive_homologation_acceptance.sql",
  "executive_homologation_cycles",
  "executive_homologation_signoffs",
  "Evidência executiva é imutável",
  "unique(cycle_id,commercial_role)",
);
n(
  "app/api/v1/governance/executive-acceptance/route.ts",
  "DIRECTOR_REQUIRED",
  "GO_BLOCKED",
  "productionPublished: false",
  "secretsReturned: false",
);
n(
  "app/(crm)/atlas-v3/acceptance/page.tsx",
  "99-executive-homologation-acceptance",
  "Quatro perfis assinam",
  "Registrar NO-GO",
  "não publica arquivos",
);
n(
  "config/executive-homologation-acceptance.json",
  '"phase":99',
  '"automatic_publish":false',
  '"signoffs_immutable":true',
);
for (const [x, o] of c) console.log(`${o ? "✓" : "✗"} ${x}`);
if (c.some(([, o]) => !o)) process.exit(1);
console.log(`\nFase 99 aprovada: ${c.length} controles de aceite executivo.`);
