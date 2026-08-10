import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inventoryHistoricalMigrations } from "./run-atlas-access-surface-inventory-phase-013.mjs";

const config = JSON.parse(
  readFileSync(
    "config/atlas-10x-phase-014-security-remediation-backlog.json",
    "utf8",
  ),
);
const phase013Config = JSON.parse(
  readFileSync(config.input_contract.phase_013_config_path, "utf8"),
);
const phase013Evidence = JSON.parse(
  readFileSync(config.input_contract.phase_013_evidence_path, "utf8"),
);
const phase014Evidence = JSON.parse(
  readFileSync(config.backlog_contract.evidence_path, "utf8"),
);

const apiRoles = new Set(config.security_contract.api_roles);
const trustedExecuteGrantees = new Set(
  config.security_contract.trusted_execute_grantees,
);
const authenticatedDefinerAllowlist = new Set(
  config.security_contract.security_definer_authenticated_allowlist,
);
const canonicalBusinessTables = new Set(
  config.security_contract.canonical_business_tables,
);
const severityByCategory = new Map(
  Object.entries(config.risk_taxonomy).flatMap(([severity, categories]) =>
    categories.map((category) => [category, severity]),
  ),
);
const remediationOrder = new Map(
  config.remediation_order.map((step) => [step.id, step.order]),
);

function grantsFor(object, role) {
  return (object?.grants ?? [])
    .filter((grant) => grant.grantee === role)
    .flatMap((grant) => grant.privileges ?? []);
}

function isApiExposed(object) {
  return [...apiRoles].some((role) => grantsFor(object, role).length > 0);
}

function policyRoles(policy) {
  return Array.isArray(policy?.roles) ? policy.roles : [];
}

function roleCoveredBySelect(role, table, policies) {
  return policies.some((policy) => {
    const roles = policyRoles(policy);
    return (
      policy.table === table &&
      ["SELECT", "ALL"].includes(policy.command) &&
      (roles.includes("public") || roles.includes(role))
    );
  });
}

function functionSignature(fn) {
  return `${fn.schema}.${fn.name}(${fn.identity_arguments ?? ""})`;
}

function safeLabel(value) {
  return String(value ?? "unknown")
    .replace(/[\r\n]/g, " ")
    .replace(/[^a-zA-Z0-9_.,() -]/g, "_")
    .slice(0, 180);
}

function findingId(category, subject) {
  return `SEC-${createHash("sha256")
    .update(`${category}:${subject.type}:${subject.schema}:${subject.name}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase()}`;
}

const remediationByCategory = {
  EXPOSED_TABLE_WITHOUT_RLS: {
    stage: "CONTAIN_EXPOSURE",
    reason: "Tabela alcançável por papel da API sem RLS habilitada.",
    action: "Conter grants amplos, habilitar RLS e revisar políticas antes de restaurar acesso mínimo."
  },
  ANON_BUSINESS_GRANT: {
    stage: "CONTAIN_EXPOSURE",
    reason: "Papel anon possui privilégio em entidade comercial canônica.",
    action: "Revogar o privilégio anônimo e comprovar que o fluxo público usa uma superfície dedicada e mínima."
  },
  UNSAFE_API_VIEW: {
    stage: "HARDEN_VIEWS",
    reason: "View exposta à API não está marcada como security_invoker.",
    action: "Aplicar security_invoker quando compatível ou retirar a view da superfície exposta."
  },
  SECURITY_DEFINER_PUBLIC_EXECUTE: {
    stage: "HARDEN_PRIVILEGED_FUNCTIONS",
    reason: "Função SECURITY DEFINER pode ser executada por PUBLIC.",
    action: "Revogar EXECUTE de PUBLIC e conceder somente a papéis explicitamente aprovados."
  },
  POLICY_TRUSTS_USER_METADATA: {
    stage: "REPAIR_RLS_POLICIES",
    reason: "Política confia em user_metadata, que pode ser alterado pelo usuário.",
    action: "Trocar a autorização por claims imutáveis ou dados de associação protegidos no banco."
  },
  BROAD_DEFAULT_PRIVILEGE: {
    stage: "HARDEN_DEFAULT_PRIVILEGES",
    reason: "Privilégio padrão expõe objetos futuros a papel amplo da API.",
    action: "Revogar o default amplo e declarar grants mínimos por tipo de objeto e papel."
  },
  UPDATE_POLICY_INCOMPLETE: {
    stage: "REPAIR_RLS_POLICIES",
    reason: "Política UPDATE não possui SELECT aplicável, USING e WITH CHECK completos.",
    action: "Criar ou corrigir SELECT e UPDATE com o mesmo limite de tenant e validar leitura antes da atualização."
  },
  POLICY_USES_AUTH_ROLE: {
    stage: "REPAIR_RLS_POLICIES",
    reason: "Política usa auth.role(), padrão descontinuado para políticas novas.",
    action: "Declarar papéis com TO e manter o predicado focado em identidade e tenant."
  },
  SECURITY_DEFINER_UNSAFE_SEARCH_PATH: {
    stage: "HARDEN_PRIVILEGED_FUNCTIONS",
    reason: "Função SECURITY DEFINER não possui search_path vazio ou fixo.",
    action: "Fixar search_path, qualificar objetos e revalidar todas as referências da função."
  },
  SECURITY_DEFINER_AUTHENTICATED_EXECUTE_UNAPPROVED: {
    stage: "HARDEN_PRIVILEGED_FUNCTIONS",
    reason: "authenticated executa função SECURITY DEFINER fora da allowlist.",
    action: "Revogar EXECUTE ou submeter a função a revisão explícita de autorização e parâmetros."
  },
  CANONICAL_ENTITY_MISSING: {
    stage: "CONTAIN_EXPOSURE",
    reason: "Entidade comercial canônica não apareceu no inventário.",
    action: "Confirmar schema, renomeação ou ausência antes de gerar qualquer migration."
  },
  INVENTORY_INCOMPLETE: {
    stage: "CONTAIN_EXPOSURE",
    reason: "O snapshot não contém todas as coleções ou atributos necessários.",
    action: "Refazer a captura canônica; não inferir correções a partir de inventário parcial."
  }
};

function createFinding(category, subject, details = {}) {
  const remediation = remediationByCategory[category];
  const severity = severityByCategory.get(category);
  const currentOrder = remediationOrder.get(remediation.stage);
  const dependencyIds = config.remediation_order
    .filter((step) => step.order < currentOrder)
    .map((step) => step.id);
  const normalizedSubject = {
    type: safeLabel(subject.type),
    schema: safeLabel(subject.schema ?? "public"),
    name: safeLabel(subject.name),
  };
  return {
    id: findingId(category, normalizedSubject),
    category,
    severity,
    subject: normalizedSubject,
    reason: remediation.reason,
    evidence: details,
    proposed_action: remediation.action,
    remediation_stage: remediation.stage,
    remediation_order: currentOrder,
    depends_on: dependencyIds,
    review_status: "unapproved",
    automatic_remediation_allowed: false,
    human_approval_required: true,
  };
}

function inventoryShapeComplete(snapshot) {
  const required = phase013Config.inventory_contract.required_collections;
  if (!required.every((collection) => Array.isArray(snapshot?.[collection]))) {
    return false;
  }
  return (
    snapshot.tables.every(
      (table) =>
        typeof table?.name === "string" &&
        typeof table?.rls_enabled === "boolean" &&
        Array.isArray(table?.grants),
    ) &&
    snapshot.views.every(
      (view) =>
        typeof view?.name === "string" &&
        typeof view?.security_invoker === "boolean" &&
        Array.isArray(view?.grants),
    ) &&
    snapshot.functions.every(
      (fn) =>
        typeof fn?.name === "string" &&
        typeof fn?.security_definer === "boolean" &&
        typeof fn?.search_path_mode === "string" &&
        Array.isArray(fn?.execute_grantees),
    ) &&
    snapshot.policies.every(
      (policy) =>
        typeof policy?.table === "string" &&
        typeof policy?.command === "string" &&
        Array.isArray(policy?.roles) &&
        typeof policy?.has_using === "boolean" &&
        typeof policy?.has_with_check === "boolean" &&
        typeof policy?.uses_auth_role === "boolean" &&
        typeof policy?.uses_user_metadata === "boolean",
    ) &&
    snapshot.default_privileges.every(
      (entry) =>
        typeof entry?.owner === "string" &&
        typeof entry?.schema === "string" &&
        typeof entry?.object_type === "string" &&
        typeof entry?.grantee === "string" &&
        typeof entry?.privilege === "string",
    )
  );
}

export function generateSecurityBacklog(snapshot) {
  const findings = [];
  const required = phase013Config.inventory_contract.required_collections;
  const collectionsPresent = required.every((name) =>
    Array.isArray(snapshot?.[name]),
  );
  if (!collectionsPresent || !inventoryShapeComplete(snapshot)) {
    findings.push(
      createFinding("INVENTORY_INCOMPLETE", {
        type: "snapshot",
        schema: "catalog",
        name: "access-surface-snapshot",
      }),
    );
  }

  const tables = Array.isArray(snapshot?.tables) ? snapshot.tables : [];
  const views = Array.isArray(snapshot?.views) ? snapshot.views : [];
  const functions = Array.isArray(snapshot?.functions)
    ? snapshot.functions
    : [];
  const policies = Array.isArray(snapshot?.policies) ? snapshot.policies : [];
  const defaultPrivileges = Array.isArray(snapshot?.default_privileges)
    ? snapshot.default_privileges
    : [];
  const tableNames = new Set(tables.map((table) => table.name));

  for (const name of canonicalBusinessTables) {
    if (!tableNames.has(name)) {
      findings.push(
        createFinding("CANONICAL_ENTITY_MISSING", {
          type: "table",
          schema: "public",
          name,
        }),
      );
    }
  }

  for (const table of tables) {
    if (isApiExposed(table) && table.rls_enabled !== true) {
      findings.push(
        createFinding(
          "EXPOSED_TABLE_WITHOUT_RLS",
          { type: "table", schema: table.schema, name: table.name },
          { api_roles: [...apiRoles].filter((role) => grantsFor(table, role).length > 0) },
        ),
      );
    }
    if (
      canonicalBusinessTables.has(table.name) &&
      grantsFor(table, "anon").length > 0
    ) {
      findings.push(
        createFinding(
          "ANON_BUSINESS_GRANT",
          { type: "table", schema: table.schema, name: table.name },
          { privileges: [...new Set(grantsFor(table, "anon"))].sort() },
        ),
      );
    }
  }

  for (const view of views) {
    if (isApiExposed(view) && view.security_invoker !== true) {
      findings.push(
        createFinding(
          "UNSAFE_API_VIEW",
          { type: "view", schema: view.schema, name: view.name },
          { api_exposed: true },
        ),
      );
    }
  }

  for (const fn of functions.filter((item) => item.security_definer === true)) {
    const signature = functionSignature(fn);
    if (fn.execute_grantees.includes("public")) {
      findings.push(
        createFinding(
          "SECURITY_DEFINER_PUBLIC_EXECUTE",
          { type: "function", schema: fn.schema, name: signature },
        ),
      );
    }
    if (!["empty", "fixed"].includes(fn.search_path_mode)) {
      findings.push(
        createFinding(
          "SECURITY_DEFINER_UNSAFE_SEARCH_PATH",
          { type: "function", schema: fn.schema, name: signature },
          { search_path_mode: safeLabel(fn.search_path_mode) },
        ),
      );
    }
    if (
      fn.execute_grantees.includes("authenticated") &&
      !authenticatedDefinerAllowlist.has(signature)
    ) {
      findings.push(
        createFinding(
          "SECURITY_DEFINER_AUTHENTICATED_EXECUTE_UNAPPROVED",
          { type: "function", schema: fn.schema, name: signature },
        ),
      );
    }
    for (const grantee of fn.execute_grantees) {
      if (
        !trustedExecuteGrantees.has(grantee) &&
        grantee !== "public" &&
        grantee !== "authenticated"
      ) {
        findings.push(
          createFinding(
            "SECURITY_DEFINER_PUBLIC_EXECUTE",
            { type: "function", schema: fn.schema, name: `${signature}:${grantee}` },
            { untrusted_grantee: safeLabel(grantee) },
          ),
        );
      }
    }
  }

  for (const policy of policies) {
    const subject = {
      type: "policy",
      schema: policy.schema,
      name: `${policy.table}.${policy.name}`,
    };
    if (policy.uses_user_metadata === true) {
      findings.push(createFinding("POLICY_TRUSTS_USER_METADATA", subject));
    }
    if (policy.uses_auth_role === true) {
      findings.push(createFinding("POLICY_USES_AUTH_ROLE", subject));
    }
    if (["UPDATE", "ALL"].includes(policy.command)) {
      const complete =
        policy.has_using === true &&
        policy.has_with_check === true &&
        policyRoles(policy).every((role) =>
          roleCoveredBySelect(role, policy.table, policies),
        );
      if (!complete) {
        findings.push(
          createFinding("UPDATE_POLICY_INCOMPLETE", subject, {
            has_using: policy.has_using === true,
            has_with_check: policy.has_with_check === true,
            select_policy_covers_roles: policyRoles(policy).every((role) =>
              roleCoveredBySelect(role, policy.table, policies),
            ),
          }),
        );
      }
    }
  }

  for (const entry of defaultPrivileges) {
    if (["public", "anon", "authenticated"].includes(entry.grantee)) {
      findings.push(
        createFinding(
          "BROAD_DEFAULT_PRIVILEGE",
          {
            type: "default_privilege",
            schema: entry.schema,
            name: `${entry.owner}:${entry.object_type}:${entry.grantee}:${entry.privilege}`,
          },
        ),
      );
    }
  }

  const unique = new Map(findings.map((finding) => [finding.id, finding]));
  const ordered = [...unique.values()].sort(
    (a, b) =>
      a.severity.localeCompare(b.severity) ||
      a.remediation_order - b.remediation_order ||
      a.category.localeCompare(b.category) ||
      a.subject.name.localeCompare(b.subject.name),
  );
  return {
    schema_version: config.backlog_contract.schema_version,
    review_status: config.backlog_contract.review_status,
    generated_from: config.input_contract.phase_013_snapshot_path,
    findings: ordered,
    summary: {
      total: ordered.length,
      P0: ordered.filter((finding) => finding.severity === "P0").length,
      P1: ordered.filter((finding) => finding.severity === "P1").length,
      approved: 0,
      automatic_remediations: 0,
    },
  };
}

export function renderCommentOnlyReview(backlog) {
  const lines = [
    "-- ATLAS AI OS — BACKLOG DE CORREÇÕES PARA REVISÃO",
    "-- NÃO EXECUTAR — TODAS AS LINHAS PERMANECEM COMENTADAS",
    `-- Status: ${safeLabel(backlog.review_status)}`,
    `-- Total: ${backlog.summary.total} | P0: ${backlog.summary.P0} | P1: ${backlog.summary.P1}`,
  ];
  for (const finding of backlog.findings) {
    lines.push("--");
    lines.push(
      `-- ${finding.id} | ${finding.severity} | ${finding.category}`,
      `-- Objeto: ${finding.subject.type} ${finding.subject.schema}.${finding.subject.name}`,
      `-- Ordem: ${finding.remediation_order} ${finding.remediation_stage}`,
      `-- Dependências: ${finding.depends_on.join(", ") || "nenhuma"}`,
      `-- Motivo: ${finding.reason}`,
      `-- Proposta: ${finding.proposed_action}`,
      "-- Aprovação humana: obrigatória | Estado: unapproved",
    );
  }
  return `${lines.join("\n")}\n`;
}

function readSnapshot() {
  const path = config.input_contract.phase_013_snapshot_path;
  if (!existsSync(path)) return { exists: false, parses: false, snapshot: null };
  try {
    return {
      exists: true,
      parses: true,
      snapshot: JSON.parse(readFileSync(path, "utf8")),
    };
  } catch {
    return { exists: true, parses: false, snapshot: null };
  }
}

function isCommentOnly(source) {
  return source
    .split(/\r?\n/)
    .every((line) => line.trim() === "" || line.trim().startsWith("--"));
}

export function assessSecurityRemediationBacklog() {
  const snapshotResult = readSnapshot();
  const snapshot = snapshotResult.snapshot;
  const expectedFingerprint = phase013Evidence.source?.target_fingerprint;
  const collectionsPresent =
    snapshot &&
    phase013Config.inventory_contract.required_collections.every((name) =>
      Array.isArray(snapshot?.[name]),
    );
  const canonicalEntitiesInventoried =
    snapshot &&
    [...canonicalBusinessTables].every((name) =>
      snapshot.tables?.some((table) => table.name === name),
    );
  const backlog = snapshot ? generateSecurityBacklog(snapshot) : null;
  const deterministic =
    backlog &&
    JSON.stringify(backlog) ===
      JSON.stringify(generateSecurityBacklog(structuredClone(snapshot)));
  const reviewTemplate = readFileSync(
    config.backlog_contract.review_template_path,
    "utf8",
  );
  const dynamicReview = backlog ? renderCommentOnlyReview(backlog) : "";
  const inventoryIntegrityAccepted =
    snapshotResult.parses &&
    snapshot?.schema_version ===
      config.input_contract.required_snapshot_schema_version &&
    snapshot?.source?.kind === config.input_contract.required_source_kind &&
    snapshot?.source?.postgres_major ===
      config.input_contract.expected_postgres_major &&
    typeof expectedFingerprint === "string" &&
    expectedFingerprint.length === 64 &&
    snapshot?.source?.target_fingerprint === expectedFingerprint &&
    snapshot?.source?.transaction_read_only === true &&
    snapshot?.source?.table_rows_read === false &&
    collectionsPresent &&
    canonicalEntitiesInventoried &&
    inventoryShapeComplete(snapshot);

  const gates = {
    phase_013_snapshot_exists: snapshotResult.exists,
    phase_013_snapshot_parses: snapshotResult.parses,
    snapshot_schema_version_matches:
      snapshot?.schema_version ===
      config.input_contract.required_snapshot_schema_version,
    snapshot_source_is_approved_loopback:
      snapshot?.source?.kind === config.input_contract.required_source_kind,
    snapshot_postgres_major_matches:
      snapshot?.source?.postgres_major ===
      config.input_contract.expected_postgres_major,
    snapshot_fingerprint_is_attested:
      typeof expectedFingerprint === "string" &&
      expectedFingerprint.length === 64 &&
      snapshot?.source?.target_fingerprint === expectedFingerprint,
    snapshot_transaction_is_read_only:
      snapshot?.source?.transaction_read_only === true,
    table_rows_not_read: snapshot?.source?.table_rows_read === false,
    required_collections_present: collectionsPresent === true,
    canonical_entities_inventoried: canonicalEntitiesInventoried === true,
    inventory_structure_complete:
      snapshot ? inventoryShapeComplete(snapshot) : false,
    findings_are_deterministic: deterministic === true,
    findings_have_severity:
      backlog?.findings.every((finding) =>
        ["P0", "P1"].includes(finding.severity),
      ) === true,
    findings_have_dependency_order:
      backlog?.findings.every(
        (finding) =>
          Number.isInteger(finding.remediation_order) &&
          Array.isArray(finding.depends_on),
      ) === true,
    findings_are_unapproved:
      backlog?.review_status === "unapproved" &&
      backlog.findings.every(
        (finding) =>
          finding.review_status === "unapproved" &&
          finding.human_approval_required === true &&
          finding.automatic_remediation_allowed === false,
      ),
    review_template_is_comment_only:
      isCommentOnly(reviewTemplate) &&
      (dynamicReview === "" || isCommentOnly(dynamicReview)),
    historical_migrations_not_used_as_runtime_proof:
      phase014Evidence.source
        ?.historical_migrations_used_as_runtime_proof === false,
    live_homologation_not_touched:
      phase014Evidence.safety?.live_homologation_touched === false,
    remote_write_not_executed:
      phase014Evidence.safety?.remote_write_executed === false,
    build_not_executed:
      phase014Evidence.safety?.build_executed === false,
    package_not_created:
      phase014Evidence.safety?.package_created === false,
  };
  const orderedGates = Object.fromEntries(
    config.required_runtime_gates.map((name) => [name, gates[name] === true]),
  );
  const blockers = Object.entries(orderedGates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const passed = config.required_runtime_gates.length - blockers.length;

  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      inventoryIntegrityAccepted && blockers.length === 0
        ? "security_remediation_backlog_ready_for_review"
        : "security_remediation_contract_ready_inventory_blocked",
    specification: {
      passed,
      total: config.required_runtime_gates.length,
      percentage: Math.round(
        (passed / config.required_runtime_gates.length) * 100,
      ),
      blockers,
    },
    canonical_backlog: backlog?.summary ?? {
      total: 0,
      P0: 0,
      P1: 0,
      approved: 0,
      automatic_remediations: 0,
    },
    local_reference: inventoryHistoricalMigrations(),
    safety: {
      source_authority:
        "phase_013_canonical_snapshot_required_for_remediation",
      historical_migrations_are_not_runtime_proof: true,
      executable_sql_generated: false,
      automatic_migration_created: false,
      automatic_remediation_executed: false,
      remote_write_executed:
        phase014Evidence.safety?.remote_write_executed === true,
      live_homologation_touched:
        phase014Evidence.safety?.live_homologation_touched === true,
      build_executed:
        phase014Evidence.safety?.build_executed === true,
      package_created:
        phase014Evidence.safety?.package_created === true,
    },
    gates: orderedGates,
    conclusion: {
      backlog_ready_for_review:
        inventoryIntegrityAccepted && blockers.length === 0,
      changes_approved: false,
      sql_applied: false,
      next_phase: config.next_phase,
    },
  };
}

function syntheticSnapshot() {
  const tables = [...canonicalBusinessTables].map((name) => ({
    schema: "public",
    name,
    rls_enabled: true,
    grants: [
      { grantee: "authenticated", privileges: ["SELECT", "INSERT", "UPDATE"] },
      {
        grantee: "service_role",
        privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      },
    ],
  }));
  const policies = [...canonicalBusinessTables].flatMap((table) => [
    {
      schema: "public",
      table,
      name: `${table}_select`,
      command: "SELECT",
      roles: ["authenticated"],
      has_using: true,
      has_with_check: false,
      uses_auth_role: false,
      uses_user_metadata: false,
    },
    {
      schema: "public",
      table,
      name: `${table}_update`,
      command: "UPDATE",
      roles: ["authenticated"],
      has_using: true,
      has_with_check: true,
      uses_auth_role: false,
      uses_user_metadata: false,
    },
  ]);
  return {
    schema_version: config.input_contract.required_snapshot_schema_version,
    source: {
      kind: config.input_contract.required_source_kind,
      postgres_major: config.input_contract.expected_postgres_major,
      target_fingerprint: "a".repeat(64),
      transaction_read_only: true,
      table_rows_read: false,
    },
    tables,
    views: [
      {
        schema: "public",
        name: "lead_summary",
        security_invoker: true,
        grants: [{ grantee: "authenticated", privileges: ["SELECT"] }],
      },
    ],
    functions: [
      {
        schema: "public",
        name: "internal_audit",
        identity_arguments: "",
        security_definer: true,
        search_path_mode: "empty",
        execute_grantees: ["service_role"],
      },
    ],
    policies,
    default_privileges: [],
  };
}

function runSelfTest() {
  const baseline = syntheticSnapshot();
  const safe = generateSecurityBacklog(baseline);
  if (safe.findings.length !== 0) {
    throw new Error("synthetic safe baseline produced findings");
  }
  const mutants = [
    ["EXPOSED_TABLE_WITHOUT_RLS", (s) => { s.tables[0].rls_enabled = false; }],
    ["ANON_BUSINESS_GRANT", (s) => { s.tables[0].grants.push({ grantee: "anon", privileges: ["SELECT"] }); }],
    ["UNSAFE_API_VIEW", (s) => { s.views[0].security_invoker = false; }],
    ["SECURITY_DEFINER_PUBLIC_EXECUTE", (s) => { s.functions[0].execute_grantees.push("public"); }],
    ["POLICY_TRUSTS_USER_METADATA", (s) => { s.policies[0].uses_user_metadata = true; }],
    ["BROAD_DEFAULT_PRIVILEGE", (s) => { s.default_privileges.push({ owner: "postgres", schema: "public", object_type: "functions", grantee: "public", privilege: "EXECUTE" }); }],
    ["UPDATE_POLICY_INCOMPLETE", (s) => { s.policies.find((p) => p.command === "UPDATE").has_with_check = false; }],
    ["POLICY_USES_AUTH_ROLE", (s) => { s.policies[0].uses_auth_role = true; }],
    ["SECURITY_DEFINER_UNSAFE_SEARCH_PATH", (s) => { s.functions[0].search_path_mode = "unsafe"; }],
    ["SECURITY_DEFINER_AUTHENTICATED_EXECUTE_UNAPPROVED", (s) => { s.functions[0].execute_grantees.push("authenticated"); }],
    ["CANONICAL_ENTITY_MISSING", (s) => { s.tables.shift(); }],
    ["INVENTORY_INCOMPLETE", (s) => { delete s.views; }],
  ];
  for (const [expectedCategory, mutate] of mutants) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    const backlog = generateSecurityBacklog(candidate);
    if (!backlog.findings.some((finding) => finding.category === expectedCategory)) {
      throw new Error(`mutant escaped category ${expectedCategory}`);
    }
    if (!isCommentOnly(renderCommentOnlyReview(backlog))) {
      throw new Error(`review escaped comment-only rule for ${expectedCategory}`);
    }
  }
  return {
    safe_baseline: "accepted",
    mutants_classified: mutants.length,
    review_output: "comment_only",
    automatic_remediation: "disabled",
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  console.log(
    JSON.stringify(
      process.argv.includes("--self-test")
        ? runSelfTest()
        : assessSecurityRemediationBacklog(),
      null,
      2,
    ),
  );
}
