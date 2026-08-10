import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath =
  "supabase/migrations/20260723143000_harden_internal_trigger_functions.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const failures = [];
let checks = 0;

function expect(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const internalTriggerFunctions = [
  "apply_opportunity_commission_sla",
  "refresh_commission_status",
  "scaffold_project_intelligence",
];

for (const functionName of internalTriggerFunctions) {
  expect(
    migration.includes(`alter function public.${functionName}()`),
    `${functionName} precisa ter configuração explícita`,
  );
  expect(
    new RegExp(
      `alter function public\\.${functionName}\\(\\)[\\s\\S]*?set search_path = '';`,
      "i",
    ).test(migration),
    `${functionName} precisa usar search_path vazio`,
  );
  expect(
    new RegExp(
      `revoke all on function public\\.${functionName}\\(\\)[\\s\\S]*?from public, anon, authenticated;`,
      "i",
    ).test(migration),
    `${functionName} não pode ser executável pela Data API`,
  );
}

const duplicateIndexesToDrop = [
  "idx_ai_insights_org_rls",
  "idx_campaigns_org_rls",
  "dead_letter_org_resolved_created_idx",
];

for (const indexName of duplicateIndexesToDrop) {
  expect(
    migration.includes(`drop index if exists public.${indexName};`),
    `o índice duplicado ${indexName} precisa ser removido com segurança`,
  );
}

const indexesToKeep = [
  "idx_ai_insights_organization_id",
  "idx_campaigns_organization_id",
  "idx_dlq_unresolved",
];

for (const indexName of indexesToKeep) {
  expect(
    !migration.includes(`drop index if exists public.${indexName};`),
    `o índice canônico ${indexName} precisa ser preservado`,
  );
}

expect(
  migration.trimStart().startsWith("begin;"),
  "a migration precisa começar em transação",
);
expect(
  migration.trimEnd().endsWith("commit;"),
  "a migration precisa encerrar a transação",
);

if (failures.length) {
  console.error(
    `Endurecimento Supabase vivo: ${failures.length} falha(s) em ${checks} verificações.`,
  );
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Endurecimento Supabase vivo: ${checks}/${checks} verificações aprovadas. ` +
    "Funções internas e índices duplicados estão governados.",
);
