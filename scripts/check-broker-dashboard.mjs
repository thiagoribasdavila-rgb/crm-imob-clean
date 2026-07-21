import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "config", "broker-dashboard.json"), "utf8"));
const endpoint = fs.readFileSync(path.join(root, contract.endpoint), "utf8");
const page = fs.readFileSync(path.join(root, contract.page), "utf8");
const failures = [];

for (const section of contract.requiredSections) if (!endpoint.includes(section) || !page.includes(section)) failures.push(`seção diária ausente: ${section}`);
for (const signal of contract.rankingSignals) if (!endpoint.includes(signal)) failures.push(`sinal de prioridade ausente: ${signal}`);
for (const safety of contract.safety) if (!endpoint.includes(safety)) failures.push(`proteção ausente: ${safety}`);
if (!endpoint.includes('roles: ["broker"]')) failures.push("endpoint não é exclusivo do corretor");
if (!endpoint.includes('.eq("assigned_user_id", brokerId)')) failures.push("carteira não filtra explicitamente o corretor");
if (endpoint.includes("getSupabaseAdmin")) failures.push("dashboard do corretor não deve contornar RLS");
if (!page.includes('aria-label="Fila do dia"')) failures.push("experiência da fase 21 não está visível");
if (!page.includes("por que entrou na fila")) failures.push("ranking não está explicado ao corretor");

if (failures.length) {
  console.error(`BROKER DASHBOARD Fase ${contract.phase}: falhou\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`BROKER DASHBOARD Fase ${contract.phase}: aprovado — ${contract.requiredSections.length} blocos diários; ${contract.rankingSignals.length} sinais explicáveis; carteira própria; RLS; decisão humana.`);
