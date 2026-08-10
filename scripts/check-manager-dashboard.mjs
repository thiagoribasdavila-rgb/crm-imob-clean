import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "config", "manager-dashboard.json"), "utf8"));
const endpoint = fs.readFileSync(path.join(root, contract.endpoint), "utf8");
const page = fs.readFileSync(path.join(root, contract.page), "utf8");
const failures = [];

for (const area of contract.requiredAreas) if (!endpoint.includes(area) || !page.includes(area)) failures.push(`área gerencial ausente: ${area}`);
for (const control of contract.scopeControls) if (!endpoint.includes(control)) failures.push(`escopo ausente: ${control}`);
for (const control of contract.decisionControls) if (!endpoint.toLowerCase().includes(control.toLowerCase()) && !page.toLowerCase().includes(control.toLowerCase())) failures.push(`governança ausente: ${control}`);
if (!endpoint.includes('roles: ["manager"]')) failures.push("endpoint não é exclusivo do gerente");
if (!endpoint.includes('.eq("reports_to", managerId)')) failures.push("corretores não são limitados ao subordinado direto");
if (!endpoint.includes("portfolio.length >= 20")) failures.push("conversão compara amostra imatura");
if (/\.from\([^)]*\)\.(insert|update|delete)|\.rpc\(/.test(endpoint)) failures.push("dashboard executa mutação automática");
if (!page.includes('data-phase="22-manager-daily"')) failures.push("cockpit da fase 22 não está visível");

if (failures.length) {
  console.error(`MANAGER DASHBOARD Fase ${contract.phase}: falhou\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`MANAGER DASHBOARD Fase ${contract.phase}: aprovado — ${contract.requiredAreas.length} áreas; time direto; estruturas paralelas excluídas; amostra mínima; intervenções somente recomendadas.`);
