import { readFileSync } from "node:fs";

const root = process.cwd();
const contract = JSON.parse(readFileSync(`${root}/config/contracts/lead-roundtrip-runtime-schema-contract.json`, "utf8"));

export function evaluateLeadRoundtripSchemaSnapshot(snapshot) {
  const indexed = new Map((snapshot?.objects ?? []).map((item) => [item.table, item]));
  const checks = [];
  const add = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail });

  add("snapshot_schema", snapshot?.schema === "atlas.lead-roundtrip-schema-snapshot.v1", "snapshot reconhecido");
  add("catalog_only", snapshot?.catalogOnly === true && snapshot?.businessRowsRead === false, "nenhuma linha comercial consultada");

  for (const requirement of contract.objects) {
    const object = indexed.get(requirement.table);
    add(`${requirement.table}.exists`, object?.exists === true, "objeto obrigatório");
    if (!object?.exists) continue;
    add(`${requirement.table}.rls`, !requirement.rlsRequired || object.rlsEnabled === true, "RLS obrigatória em schema exposto");
    const columns = new Set(object.columns ?? []);
    for (const column of requirement.requiredColumns) add(`${requirement.table}.column.${column}`, columns.has(column), "coluna obrigatória");
    for (const [index, group] of (requirement.anyOfColumnGroups ?? []).entries()) add(`${requirement.table}.column_group.${index}`, group.some((column) => columns.has(column)), `uma de: ${group.join(", ")}`);
    add(`${requirement.table}.policy`, Number(object.policyCount) > 0, "ao menos uma política declarada");
  }

  for (const group of contract.anyOfObjects) {
    const present = group.tables.filter((table) => indexed.get(table)?.exists === true);
    add(`object_group.${group.name}`, present.length >= group.minimumPresent, `presentes: ${present.join(", ") || "nenhum"}`);
  }

  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.name);
  return {
    schema: "atlas.lead-roundtrip-schema-evaluation.v1",
    status: failedChecks.length ? "schema_not_ready" : "schema_catalog_ready_execution_still_blocked",
    passedChecks: checks.length - failedChecks.length,
    totalChecks: checks.length,
    failedChecks,
    checks,
    release: {
      schemaReady: failedChecks.length === 0,
      executionAllowed: false,
      productionAllowed: false,
      migrationAllowed: false,
      zipAllowed: false
    }
  };
}

function syntheticSnapshot() {
  const objects = contract.objects.map((requirement) => ({
    table: requirement.table,
    exists: true,
    rlsEnabled: true,
    columns: [...requirement.requiredColumns, ...(requirement.anyOfColumnGroups ?? []).map((group) => group[0])],
    policyCount: 1
  }));
  objects.push({ table: "developments", exists: true, rlsEnabled: true, columns: ["id"], policyCount: 1 });
  objects.push({ table: "projects", exists: false, rlsEnabled: false, columns: [], policyCount: 0 });
  return { schema: "atlas.lead-roundtrip-schema-snapshot.v1", catalogOnly: true, businessRowsRead: false, objects };
}

if (process.argv.includes("--self-test")) {
  const valid = evaluateLeadRoundtripSchemaSnapshot(syntheticSnapshot());
  const missingRlsInput = syntheticSnapshot();
  missingRlsInput.objects.find((item) => item.table === "leads").rlsEnabled = false;
  const missingRls = evaluateLeadRoundtripSchemaSnapshot(missingRlsInput);
  const missingOwnerInput = syntheticSnapshot();
  const lead = missingOwnerInput.objects.find((item) => item.table === "leads");
  lead.columns = lead.columns.filter((column) => !["assigned_to", "assigned_user_id"].includes(column));
  const missingOwner = evaluateLeadRoundtripSchemaSnapshot(missingOwnerInput);
  const passed = valid.status === "schema_catalog_ready_execution_still_blocked"
    && missingRls.failedChecks.includes("leads.rls")
    && missingOwner.failedChecks.includes("leads.column_group.0")
    && valid.release.executionAllowed === false;
  console.log(JSON.stringify({ passed, cases: 3 }, null, 2));
  process.exit(passed ? 0 : 1);
}

const snapshotFlag = process.argv.indexOf("--snapshot");
if (snapshotFlag >= 0 && process.argv[snapshotFlag + 1]) {
  const snapshot = JSON.parse(readFileSync(process.argv[snapshotFlag + 1], "utf8"));
  console.log(JSON.stringify(evaluateLeadRoundtripSchemaSnapshot(snapshot), null, 2));
} else if (process.argv[1]?.endsWith("evaluate-lead-roundtrip-schema-snapshot.mjs")) {
  console.error("Informe --snapshot <arquivo.json> ou use --self-test. Nenhuma conexão foi aberta.");
  process.exit(2);
}
