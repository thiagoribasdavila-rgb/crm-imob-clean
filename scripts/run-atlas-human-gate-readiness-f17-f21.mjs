import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessHomologationDossier } from "./run-atlas-homologation-decision-dossier-phase-017.mjs";
import { assessIsolatedBranchPreflight } from "./run-atlas-isolated-branch-preflight-phase-018.mjs";
import { assessSanitizedRemediationPlan } from "./run-atlas-sanitized-remediation-plan-phase-019.mjs";
import { assessLocalRemediationSpecification } from "./run-atlas-local-remediation-specification-phase-020.mjs";
import { assessLocalMigrationAuthoring } from "./run-atlas-local-migration-authoring-phase-021.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidencePath =
  "artifacts/runtime/human-gates/f17-f21-readiness-evidence.json";

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

function fileFact(path) {
  if (!safeWorkspacePath(path)) {
    return { path, exists: false, sha256: null };
  }
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    return { path, exists: false, sha256: null };
  }
  return {
    path,
    exists: true,
    sha256: sha256(readFileSync(absolute)),
  };
}

const readinessKeyByPhase = {
  17: "ready_for_manual_homologation_preflight",
  18: "ready_for_sanitized_remediation_planning",
  19: "ready_for_local_migration_design",
  20: "ready_for_local_migration_authoring",
  21: "ready_for_single_local_cli_authoring",
};

const titleByPhase = {
  17: "Dossiê de decisão para homologação",
  18: "Preflight sanitizado de branch isolada",
  19: "Plano sanitizado de remediação",
  20: "Especificação local de remediação",
  21: "Autoria local de migration",
};

function gateMetrics(phase, assessment) {
  const metrics =
    phase <= 19
      ? assessment.specification
      : phase === 20
        ? assessment.specification_gates
        : assessment.authoring_gates;
  return {
    passed: Number(metrics?.passed ?? 0),
    total: Number(metrics?.total ?? 0),
    percentage: Number(metrics?.percentage ?? 0),
    blockers: Array.isArray(metrics?.blockers) ? metrics.blockers : [],
  };
}

function phaseFact(phase, assessment) {
  const readinessKey = readinessKeyByPhase[phase];
  return {
    phase,
    title: titleByPhase[phase],
    status: assessment.status,
    ready: assessment.conclusion?.[readinessKey] === true,
    readiness_key: readinessKey,
    gates: gateMetrics(phase, assessment),
    inputs: assessment.inputs ?? {},
  };
}

export function evaluateChain(phases) {
  const ordered = [...phases].sort((left, right) => left.phase - right.phase);
  const firstBlocking = ordered.find((phase) => phase.ready !== true) ?? null;
  return {
    status: firstBlocking
      ? "human_gate_chain_blocked"
      : "human_gate_chain_ready",
    ready: firstBlocking === null,
    phases_ready: ordered.filter((phase) => phase.ready === true).length,
    phases_total: ordered.length,
    first_blocking_phase: firstBlocking?.phase ?? null,
    first_blocking_status: firstBlocking?.status ?? null,
  };
}

function nextAction(chain, prerequisites, manualArtifacts) {
  if (!prerequisites.every((artifact) => artifact.exists)) {
    return {
      owner: "equipe_tecnica",
      action:
        "Concluir e validar o pacote F15, o ensaio local F16 e a evidência de restauração F02 antes de qualquer aprovação humana.",
    };
  }
  if (chain.first_blocking_phase === 17) {
    const pending = manualArtifacts
      .filter((artifact) => artifact.phase === 17 && !artifact.exists)
      .map((artifact) => artifact.path);
    return {
      owner: "diretoria_e_revisor_independente",
      action:
        "Revisar as evidências locais e preencher manualmente os artefatos F17 vinculados por SHA-256.",
      pending_artifacts: pending,
    };
  }
  if (chain.first_blocking_phase === 18) {
    return {
      owner: "diretoria_e_operador_autorizado",
      action:
        "Emitir autorização JIT de leitura sanitizada e executar o preflight isolado pelo fluxo autorizado; este coordenador não acessa o remoto.",
    };
  }
  if (chain.first_blocking_phase === 19) {
    return {
      owner: "equipe_tecnica",
      action:
        "Gerar em memória o plano sanitizado F19 a partir da observação F18 aceita.",
    };
  }
  if (chain.first_blocking_phase === 20) {
    return {
      owner: "diretoria_e_revisor_independente",
      action:
        "Aprovar ou adiar explicitamente os workstreams sanitizados da F20.",
    };
  }
  if (chain.first_blocking_phase === 21) {
    return {
      owner: "diretoria_e_revisor_independente",
      action:
        "Emitir autorização única, curta e vinculada por hash para autoria local da migration.",
    };
  }
  return {
    owner: "equipe_tecnica",
    action:
      "Executar o preflight de ambiente F22 antes de iniciar qualquer ensaio local descartável.",
  };
}

export function assessHumanGateReadiness({
  now = new Date(),
  assessments,
} = {}) {
  const sourceAssessments = assessments ?? {
    17: assessHomologationDossier({ now }),
    18: assessIsolatedBranchPreflight({ now }),
    19: assessSanitizedRemediationPlan(),
    20: assessLocalRemediationSpecification({ now }),
    21: assessLocalMigrationAuthoring({ now }),
  };
  const phases = [17, 18, 19, 20, 21].map((phase) =>
    phaseFact(phase, sourceAssessments[phase]),
  );
  const chain = evaluateChain(phases);
  const prerequisites = [
    fileFact(
      "artifacts/runtime/phase-015/execution/isolated-migration-package.json",
    ),
    fileFact(
      "artifacts/runtime/phase-016/execution/local-migration-rehearsal-result.json",
    ),
    fileFact(
      "artifacts/runtime/phase-002/execution/recovery-drill-evidence.json",
    ),
  ];
  const manualArtifacts = [
    {
      phase: 17,
      purpose: "descritor sanitizado do alvo de homologação",
      template:
        "docs/templates/ATLAS_HOMOLOGATION_DECISION_DOSSIER_TEMPLATE.md",
      ...fileFact(
        "artifacts/runtime/phase-017/manual/homologation-target-descriptor.json",
      ),
    },
    {
      phase: 17,
      purpose: "aprovação humana apenas para preflight",
      template:
        "docs/templates/ATLAS_HOMOLOGATION_DECISION_DOSSIER_TEMPLATE.md",
      ...fileFact(
        "artifacts/runtime/phase-017/manual/homologation-preflight-approval.json",
      ),
    },
    {
      phase: 18,
      purpose: "permissão JIT read-only de uso único",
      template:
        "docs/templates/ATLAS_ISOLATED_BRANCH_PREFLIGHT_ATTESTATION_TEMPLATE.md",
      ...fileFact(
        "artifacts/runtime/phase-018/manual/isolated-branch-preflight-permit.json",
      ),
    },
    {
      phase: 18,
      purpose: "observação sanitizada produzida pelo fluxo autorizado",
      template:
        "docs/templates/ATLAS_ISOLATED_BRANCH_PREFLIGHT_ATTESTATION_TEMPLATE.md",
      ...fileFact(
        "artifacts/runtime/phase-018/execution/isolated-branch-preflight-observation.json",
      ),
    },
    {
      phase: 20,
      purpose: "aprovação humana dos workstreams sanitizados",
      template:
        "docs/templates/ATLAS_REMEDIATION_WORKSTREAM_APPROVAL_TEMPLATE.md",
      ...fileFact(
        "artifacts/runtime/phase-020/manual/remediation-workstream-approval.json",
      ),
    },
    {
      phase: 21,
      purpose: "autorização única para autoria local",
      template:
        "docs/templates/ATLAS_LOCAL_MIGRATION_AUTHORIZATION_TEMPLATE.md",
      ...fileFact(
        "artifacts/runtime/phase-021/manual/local-migration-authorization.json",
      ),
    },
  ];

  return {
    schema_version: "atlas.human_gate_readiness.f17-f21.v1",
    checked_at: now.toISOString(),
    ...chain,
    phases,
    technical_prerequisites: prerequisites,
    manual_artifacts: manualArtifacts,
    next_action: nextAction(chain, prerequisites, manualArtifacts),
    ordered_safe_flow: [
      "validar_pacote_f15_ensaio_local_f16_e_restauracao_f02",
      "decisao_humana_f17_preflight_only",
      "permissao_jit_f18_e_observacao_remota_sanitizada_autorizada",
      "plano_sanitizado_f19_em_memoria",
      "aprovacao_humana_de_workstreams_f20",
      "autorizacao_humana_unica_para_autoria_local_f21",
      "preflight_de_ambiente_e_ensaio_descartavel_f22",
    ],
    governance: {
      manual_approval_required: true,
      manual_approvals_created: false,
      missing_evidence_never_counts_as_approval: true,
      rls_and_data_api_grants_verified_separately: true,
    },
    safety: {
      remote_read_executed: false,
      remote_write_executed: false,
      linked_project_accessed: false,
      database_started: false,
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
  const cases = [
    [true, true, true, true, true],
    [false, true, true, true, true],
    [true, false, true, true, true],
    [true, true, false, true, true],
    [true, true, true, false, true],
    [true, true, true, true, false],
  ];
  const results = cases.map((flags) =>
    evaluateChain(flags.map((ready, index) => phase(index + 17, ready))),
  );
  const passed =
    results[0].ready === true &&
    results[0].first_blocking_phase === null &&
    results.slice(1).every(
      (result, index) =>
        result.ready === false &&
        result.first_blocking_phase === index + 17,
    );
  return {
    schema_version: "atlas.human_gate_readiness.self_test.v1",
    tests_passed: passed ? cases.length : 0,
    tests_total: cases.length,
    remote_accessed: false,
    database_started: false,
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
    : assessHumanGateReadiness();
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
