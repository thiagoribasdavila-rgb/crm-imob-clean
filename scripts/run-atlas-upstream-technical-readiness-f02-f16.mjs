import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessRecoveryReadiness } from "./run-atlas-recovery-readiness-phase-002.mjs";
import { assessAccessSurface } from "./run-atlas-access-surface-inventory-phase-013.mjs";
import { assessSecurityRemediationBacklog } from "./run-atlas-security-remediation-backlog-phase-014.mjs";
import { assessIsolatedMigrationPackage } from "./run-atlas-isolated-migration-package-phase-015.mjs";
import { assessLocalMigrationRehearsal } from "./run-atlas-local-migration-rehearsal-phase-016.mjs";
import { validateRecovery } from "./run-atlas-homologation-decision-dossier-phase-017.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidencePath =
  "artifacts/runtime/human-gates/f02-f16-upstream-readiness-evidence.json";
const recoveryPath =
  "artifacts/runtime/phase-002/execution/recovery-drill-evidence.json";
const localBootstrapEvidencePath =
  "artifacts/runtime/phase-012/local-supabase-bootstrap-evidence.json";
const localBootstrapApprovalPath =
  "artifacts/runtime/phase-012/manual/local-supabase-bootstrap-approval.json";

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function safeWorkspacePath(candidate) {
  if (typeof candidate !== "string" || !candidate || isAbsolute(candidate)) {
    return false;
  }
  if (candidate.includes("\0")) return false;
  const absolute = resolve(root, candidate);
  const offset = relative(root, absolute);
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

function fileFact(path, metadata = {}) {
  if (!safeWorkspacePath(path)) {
    return { ...metadata, path, exists: false, sha256: null };
  }
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    return { ...metadata, path, exists: false, sha256: null };
  }
  return {
    ...metadata,
    path,
    exists: true,
    sha256: sha256(readFileSync(absolute)),
  };
}

function jsonFact(path) {
  const fact = fileFact(path);
  if (!fact.exists) return { ...fact, parses: false, value: null };
  try {
    return {
      ...fact,
      parses: true,
      value: JSON.parse(readFileSync(resolve(root, path), "utf8")),
    };
  } catch {
    return { ...fact, parses: false, value: null };
  }
}

function runJsonAssessment(path) {
  const result = spawnSync(process.execPath, [path], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`assessment_failed:${path}`);
  }
  return JSON.parse(result.stdout);
}

function recoveryAssessment() {
  const artifact = jsonFact(recoveryPath);
  const validation = validateRecovery(artifact.value);
  const gates = validation.gates ?? {};
  const evidence = {
    database_restore: gates.database_restore_passed === true,
    storage_restore: gates.storage_restore_passed === true,
    immutable_artifact:
      gates.previous_v3_artifact_is_immutable === true,
    previous_v3_release: gates.legacy_v2_is_not_rollback === true,
    authenticated_smoke: gates.authenticated_smoke_passed === true,
    recovery_metrics: gates.recovery_metrics_are_present === true,
    director_approval: gates.director_approval_is_present === true,
  };
  return {
    assessment: assessRecoveryReadiness({
      envAvailable: false,
      runtimeRequested: false,
      evidence,
    }),
    artifact: {
      path: artifact.path,
      exists: artifact.exists,
      parses: artifact.parses,
      sha256: artifact.sha256,
    },
    contract: {
      accepted: validation.accepted === true,
      passed: Object.values(gates).filter(Boolean).length,
      total: Object.keys(gates).length,
      blockers: Object.entries(gates)
        .filter(([, passed]) => passed !== true)
        .map(([name]) => name),
    },
  };
}

const phaseTitles = {
  2: "Restauração isolada e rollback V3",
  12: "Captura estrutural sanitizada",
  13: "Inventário de RLS, GRANTs e ACL",
  14: "Backlog determinístico de segurança",
  15: "Pacote local aprovado de migration",
  16: "Ensaio local descartável",
};

const readinessKeys = {
  12: "captureAccepted",
  13: "security_approved",
  14: "backlog_ready_for_review",
  15: "ready_for_cli_scaffold_review",
  16: "ready_for_single_local_rehearsal",
};

function metricsFor(phase, assessment) {
  if (phase === 2) {
    const controls = assessment.evidence?.controls ?? {};
    const blockers = Object.entries(controls)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    return {
      passed: Number(assessment.evidence?.passed ?? 0),
      total: Number(assessment.evidence?.total ?? 0),
      percentage:
        assessment.evidence?.total > 0
          ? Math.round(
              (assessment.evidence.passed / assessment.evidence.total) *
                100,
            )
          : 0,
      blockers,
    };
  }
  const metrics =
    phase === 12 ? assessment.readiness : assessment.specification;
  return {
    passed: Number(metrics?.passed ?? 0),
    total: Number(metrics?.total ?? 0),
    percentage: Number(metrics?.percentage ?? 0),
    blockers: Array.isArray(metrics?.blockers) ? metrics.blockers : [],
  };
}

function phaseFact(phase, assessment, options = {}) {
  const readinessKey = readinessKeys[phase] ?? null;
  const ready =
    phase === 2
      ? assessment.status === "recovery_ready_for_human_decision" &&
        options.recoveryContractAccepted === true
      : assessment.conclusion?.[readinessKey] === true;
  return {
    phase,
    title: phaseTitles[phase],
    status: assessment.status,
    ready,
    readiness_key:
      phase === 2
        ? "recovery_ready_for_human_decision_and_contract_accepted"
        : readinessKey,
    gates: metricsFor(phase, assessment),
  };
}

export function evaluateTrack(phases, readyStatus, blockedStatus) {
  const ordered = [...phases].sort((left, right) => left.phase - right.phase);
  const firstBlocking = ordered.find((phase) => phase.ready !== true) ?? null;
  return {
    status: firstBlocking ? blockedStatus : readyStatus,
    ready: firstBlocking === null,
    phases_ready: ordered.filter((phase) => phase.ready === true).length,
    phases_total: ordered.length,
    first_blocking_phase: firstBlocking?.phase ?? null,
    first_blocking_status: firstBlocking?.status ?? null,
    phases: ordered,
  };
}

function nextRecoveryAction(track) {
  if (track.ready) {
    return {
      owner: "diretoria_e_equipe_tecnica",
      action:
        "Preservar a evidência imutável da restauração F02 e vinculá-la ao dossiê F17.",
    };
  }
  return {
    owner: "operador_autorizado_e_diretoria",
    action:
      "Executar um ensaio isolado de restauração do banco e do Storage, validar a versão V3 anterior com login autenticado, registrar RTO/RPO e concluir a aprovação humana.",
    forbidden_shortcut:
      "O V2 legado e a simples existência de backup não contam como restauração comprovada.",
  };
}

function nextMigrationAction(track, phase12, localBootstrap) {
  if (track.ready) {
    return {
      owner: "equipe_tecnica",
      action:
        "Encaminhar o resultado local F16 ao dossiê F17 sem aplicar DDL remoto.",
    };
  }
  if (track.first_blocking_phase === 12) {
    const tooling = phase12.tooling ?? {};
    return {
      owner: "equipe_tecnica_e_operador_autorizado",
      action:
        tooling.projectConfigPresent === true
          ? "Disponibilizar runtime de containers e psql; depois emitir uma aprovação curta vinculada a um PostgreSQL 17 em loopback para capturar apenas o schema."
          : "Autorizar e executar somente o bootstrap local protegido para criar supabase/config.toml; depois disponibilizar runtime de containers e psql antes da autorização separada da captura F12.",
      local_bootstrap: {
        evidence_present: localBootstrap.exists,
        evidence_parses: localBootstrap.parses,
        status: localBootstrap.value?.status ?? "evidence_absent",
        ready_to_execute:
          localBootstrap.value?.readiness?.ready_to_execute === true,
        approval_present:
          localBootstrap.value?.authorization?.receipt_present === true,
      },
      tooling_missing: {
        project_config: tooling.projectConfigPresent !== true,
        container_runtime:
          tooling.containerRuntimeAvailable !== true ||
          tooling.containerRuntimeResponding !== true,
        psql: tooling.psqlAvailable !== true,
      },
    };
  }
  const actions = {
    13: "Gerar o snapshot read-only sanitizado de RLS, GRANTs, ACL, views, funções e políticas a partir da captura F12 aceita.",
    14: "Gerar o backlog determinístico e ainda não aprovado a partir do snapshot F13.",
    15: "Submeter o backlog e o snapshot à aprovação humana; gerar somente o manifesto local permitido, sem SQL remoto.",
    16: "Autorizar um único ensaio local e executar migration, pgTAP, lint e advisors somente na stack descartável.",
  };
  return {
    owner:
      track.first_blocking_phase >= 15
        ? "diretoria_revisor_e_equipe_tecnica"
        : "equipe_tecnica",
    action: actions[track.first_blocking_phase],
  };
}

function artifactInventory() {
  return [
    fileFact(recoveryPath, {
      phase: 2,
      kind: "execution_and_human_decision",
    }),
    fileFact("supabase/config.toml", {
      phase: 12,
      kind: "local_project_config",
    }),
    fileFact(localBootstrapEvidencePath, {
      phase: 12,
      kind: "local_bootstrap_evidence",
    }),
    fileFact(localBootstrapApprovalPath, {
      phase: 12,
      kind: "local_bootstrap_manual_approval",
    }),
    fileFact(
      "artifacts/runtime/phase-012/manual-capture-approval-receipt.json",
      { phase: 12, kind: "manual_approval" },
    ),
    fileFact(
      "artifacts/runtime/phase-012/execution/canonical_baseline.public.sql",
      { phase: 12, kind: "schema_only_capture" },
    ),
    fileFact(
      "artifacts/runtime/phase-012/execution/schema_inventory.json",
      { phase: 12, kind: "sanitized_inventory" },
    ),
    fileFact(
      "artifacts/runtime/phase-012/execution/checksums.sha256",
      { phase: 12, kind: "integrity" },
    ),
    fileFact(
      "artifacts/runtime/phase-012/isolated-baseline-capture-evidence.json",
      { phase: 12, kind: "evidence" },
    ),
    fileFact(
      "artifacts/runtime/phase-013/execution/access-surface-snapshot.json",
      { phase: 13, kind: "read_only_snapshot" },
    ),
    fileFact(
      "artifacts/runtime/phase-013/access-surface-inventory-evidence.json",
      { phase: 13, kind: "evidence" },
    ),
    fileFact(
      "artifacts/runtime/phase-014/execution/security-remediation-backlog.json",
      { phase: 14, kind: "unapproved_backlog" },
    ),
    fileFact(
      "artifacts/runtime/phase-014/security-remediation-backlog-evidence.json",
      { phase: 14, kind: "evidence" },
    ),
    fileFact(
      "artifacts/runtime/phase-015/manual/isolated-rehearsal-approval.json",
      { phase: 15, kind: "manual_approval" },
    ),
    fileFact(
      "artifacts/runtime/phase-015/execution/isolated-migration-package.json",
      { phase: 15, kind: "local_manifest" },
    ),
    fileFact(
      "artifacts/runtime/phase-015/isolated-migration-package-evidence.json",
      { phase: 15, kind: "evidence" },
    ),
    fileFact(
      "artifacts/runtime/phase-016/manual/local-migration-rehearsal-permit.json",
      { phase: 16, kind: "one_shot_manual_permit" },
    ),
    fileFact(
      "artifacts/runtime/phase-016/manual/local-migration-review.json",
      { phase: 16, kind: "manual_review" },
    ),
    fileFact(
      "artifacts/runtime/phase-016/execution/local-migration-rehearsal-result.json",
      { phase: 16, kind: "local_rehearsal_result" },
    ),
    fileFact(
      "artifacts/runtime/phase-016/local-migration-rehearsal-evidence.json",
      { phase: 16, kind: "evidence" },
    ),
  ];
}

export function assessUpstreamTechnicalReadiness({ now = new Date() } = {}) {
  const recovery = recoveryAssessment();
  const localBootstrap = jsonFact(localBootstrapEvidencePath);
  const assessments = {
    2: recovery.assessment,
    12: runJsonAssessment(
      "scripts/run-atlas-isolated-baseline-capture-phase-012.mjs",
    ),
    13: assessAccessSurface(),
    14: assessSecurityRemediationBacklog(),
    15: assessIsolatedMigrationPackage(),
    16: assessLocalMigrationRehearsal(now),
  };
  const phase2 = phaseFact(2, assessments[2], {
    recoveryContractAccepted: recovery.contract.accepted,
  });
  const migrationPhases = [12, 13, 14, 15, 16].map((phase) =>
    phaseFact(phase, assessments[phase]),
  );
  const recoveryTrack = evaluateTrack(
    [phase2],
    "recovery_track_ready",
    "recovery_track_blocked",
  );
  const migrationTrack = evaluateTrack(
    migrationPhases,
    "local_migration_track_ready",
    "local_migration_track_blocked",
  );
  const ready = recoveryTrack.ready && migrationTrack.ready;

  return {
    schema_version: "atlas.upstream_technical_readiness.f02-f16.v1",
    checked_at: now.toISOString(),
    status: ready
      ? "upstream_technical_chain_ready"
      : "upstream_technical_chain_blocked",
    ready,
    tracks: {
      recovery: recoveryTrack,
      local_migration: migrationTrack,
    },
    recovery_contract: recovery.contract,
    artifacts: artifactInventory(),
    next_actions: {
      recovery: nextRecoveryAction(recoveryTrack),
      local_migration: nextMigrationAction(
        migrationTrack,
        assessments[12],
        localBootstrap,
      ),
    },
    ordered_safe_flow: [
      "f02_isolated_recovery_drill",
      "f12_local_pg17_schema_only_capture",
      "f13_read_only_access_surface_inventory",
      "f14_deterministic_unapproved_security_backlog",
      "f15_human_approved_local_migration_manifest",
      "f16_single_disposable_local_rehearsal",
      "f17_f21_human_decision_chain",
      "f22_disposable_environment_preflight",
    ],
    governance: {
      human_approval_required: true,
      manual_approvals_created: false,
      missing_evidence_never_counts_as_approval: true,
      historical_migrations_are_not_runtime_proof: true,
      rls_and_data_api_grants_verified_separately: true,
      remote_apply_requires_new_explicit_authorization: true,
    },
    safety: {
      remote_read_executed: false,
      remote_write_executed: false,
      linked_project_accessed: false,
      local_database_started: false,
      migration_generated: false,
      migration_applied: false,
      production_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
  };
}

function selfTest() {
  const phase = (number, ready) => ({
    phase: number,
    ready,
    status: ready ? "ready" : `blocked-${number}`,
  });
  const phaseNumbers = [2, 12, 13, 14, 15, 16];
  const cases = [
    phaseNumbers.map(() => true),
    ...phaseNumbers.map((number) =>
      phaseNumbers.map((candidate) => candidate !== number),
    ),
  ];
  const results = cases.map((flags) =>
    evaluateTrack(
      flags.map((ready, index) => phase(phaseNumbers[index], ready)),
      "ready",
      "blocked",
    ),
  );
  const passed =
    results[0].ready === true &&
    results[0].first_blocking_phase === null &&
    results.slice(1).every(
      (result, index) =>
        result.ready === false &&
        result.first_blocking_phase === phaseNumbers[index],
    );
  return {
    schema_version: "atlas.upstream_technical_readiness.self_test.v1",
    tests_passed: passed ? cases.length : 0,
    tests_total: cases.length,
    remote_accessed: false,
    local_database_started: false,
    migration_applied: false,
    manual_approval_created: false,
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const payload = process.argv.includes("--self-test")
    ? selfTest()
    : assessUpstreamTechnicalReadiness();
  if (process.argv.includes("--write-evidence")) {
    const absolute = resolve(root, evidencePath);
    mkdirSync(resolve(absolute, ".."), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(payload, null, 2));
  if (
    process.argv.includes("--self-test") &&
    payload.tests_passed !== payload.tests_total
  ) {
    process.exit(1);
  }
}
