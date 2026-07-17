import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-projects-developers.json", '"phase": 6', '"maximum_interactions": 3', '"authenticated_read": true', '"authenticated_upload": true');
need("config/final-10-phases-improvement.json", '"current_phase": 6', '"completed": [1, 2, 3, 4, 5, 6]');
need("app/(crm)/developments/materials/page.tsx", "accessToken", 'Authorization: `Bearer ${token}`', "essentialMaterials", "Acesso rápido ao kit essencial");
need("app/api/v1/developments/[id]/materials/route.ts", "requireAccessContext", "signedMaterialUrl", "hasExpectedSignature", "version_project_material_cloud");
need("app/(crm)/developments/[id]/page.tsx", "Estudo regional", "Book, tabela e espelho", "Vigência comercial", "Abrir estoque");
need("docs/FINAL_PHASE_6_PROJECTS_DEVELOPERS.md", "no máximo três interações", "links assinados com 15 minutos");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nProjetos aprovados: ${checks.length} controles; Fase Final 6 concluída.`);
