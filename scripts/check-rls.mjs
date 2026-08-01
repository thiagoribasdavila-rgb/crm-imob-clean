import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const contract = JSON.parse(fs.readFileSync(path.join(root, "config", "rls-audit.json"), "utf8"));
const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const sql = files.map((name) => fs.readFileSync(path.join(migrationsDir, name), "utf8")).join("\n").toLowerCase();
const failures = [];

for (const [table, evidence] of Object.entries(contract.criticalTables)) {
  if (!sql.includes(`alter table public.${table} enable row level security`)) failures.push(`${table}: RLS não habilitada`);
  if (!sql.includes(String(evidence).toLowerCase())) failures.push(`${table}: política/dimensão ausente (${evidence})`);
}

for (const table of contract.serviceOnlyTables) {
  if (!sql.includes(`revoke all on table public.${table} from anon, authenticated`)) failures.push(`${table}: privilégios de usuário não revogados`);
}

if (sql.includes("auth.role()")) failures.push("auth.role() obsoleto encontrado");
if (!sql.includes("to authenticated")) failures.push("nenhuma política explicitamente autenticada");

if (failures.length) {
  console.error(`RLS Fase ${contract.phase}: falhou\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`RLS Fase ${contract.phase}: aprovado — ${Object.keys(contract.criticalTables).length} superfícies críticas, ${contract.dimensions.length} dimensões e ${contract.serviceOnlyTables.length} tabelas internas protegidas.`);
