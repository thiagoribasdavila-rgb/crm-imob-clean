import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const config = JSON.parse(read("config/developer-material-center.json"));
const sql = read(config.migration).toLowerCase();
const api = read(config.api);
const projectApi = read(config.projectApi);
const page = read(config.page);
const failures = [];

for (const marker of [
  "review_status text",
  "project_material_review_events",
  "review_project_material",
  "material_review_actor_forbidden",
  "material_review_not_current",
  "currentversiononly",
  "auditable",
]) {
  if (!sql.includes(marker)) failures.push(`banco incompleto: ${marker}`);
}

for (const marker of [
  "coverageByDeveloper",
  "coveragePercent",
  "essentialAvailable",
  "pendingReview",
  "review_project_material",
  "materials.reviewed",
]) {
  if (!api.includes(marker)) failures.push(`API incompleta: ${marker}`);
}
for (const marker of [/groupedByDeveloper\s*:\s*true/, /validityAware\s*:\s*true/]) {
  if (!marker.test(api)) failures.push(`API incompleta: ${marker.source}`);
}

for (const marker of ["review_status", "verified_at"]) {
  if (!projectApi.includes(marker))
    failures.push(`API do projeto incompleta: ${marker}`);
}

for (const marker of [
  'data-phase="67-developer-material-center"',
  "Cobertura por incorporadora",
  "Fila de materiais",
  "Revisão pendente",
  "Atualização simples",
]) {
  if (!page.includes(marker)) failures.push(`experiência incompleta: ${marker}`);
}
if (!/onClick=\{\(\)\s*=>\s*void reviewMaterial\(/s.test(page)) {
  failures.push("experiência incompleta: ação de validar material");
}

if (failures.length) {
  console.error("MATERIAIS Fase 67: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "MATERIAIS Fase 67: aprovada — incorporadoras, cobertura, vigência, revisão, links privados e atualização simples.",
);
