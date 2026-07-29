import type {
  OperationalModuleHealth,
  OperationalModuleId,
} from "./live-operational-health";
import { getLiveDevelopmentWriteHomologation } from "./live-development-write-homologation";
import { acaoPrimariaDoModulo } from "./page-registry";

export const ATLAS_LIVE_WRITE_READINESS_PREVIOUS_VERSION =
  "live-write-readiness-v2" as const;
export const ATLAS_LIVE_WRITE_READINESS_LEGACY_DEVELOPMENT_BLOCKERS = [
  "canonical-developments-domain-not-live",
] as const;
export const ATLAS_LIVE_WRITE_READINESS_VERSION = "live-write-readiness-v3" as const;

export type OperationalWriteState = "ready" | "source-mediated" | "blocked";

export type OperationalWriteReadiness = {
  state: OperationalWriteState;
  label: string;
  detail: string;
  href: string;
  actionLabel: string;
  mode: "protected-server-boundary" | "rls-direct" | "lead-source" | "manual-gate";
  operations: readonly string[];
  safeguards: readonly string[];
  blockers: readonly string[];
};

type WriteCapability = Omit<OperationalWriteReadiness, "state"> & {
  state: OperationalWriteState;
};

const developmentHomologation = getLiveDevelopmentWriteHomologation();

/**
 * PARA ONDE ESTE CARTÃO LEVA — vem do catálogo, não da mão.
 *
 * `/pipeline?focus=priority` e `/tasks?create=1` estavam escritos aqui como
 * texto. São exatamente as promessas que `page-registry` declara para esses
 * dois módulos, e uma quarta cópia de um href é uma quarta chance de o
 * parâmetro se perder — foi assim que "/pipeline" ficou sem `?focus=priority`
 * em um dos três catálogos e ninguém viu.
 *
 * O RÓTULO continua local de propósito: aqui ele descreve a ESCRITA que está
 * pronta ("Abrir prioridades", "Nova tarefa"), não a ação primária da tela.
 * São perguntas diferentes; só o destino era resposta repetida.
 */
const destinoDoModulo = (id: Parameters<typeof acaoPrimariaDoModulo>[0]) =>
  acaoPrimariaDoModulo(id).href;

const WRITE_CAPABILITIES: Readonly<Record<OperationalModuleId, WriteCapability>> = {
  leads: {
    state: "ready",
    label: "Ação pronta",
    detail: "Criar e atualizar pela API protegida",
    href: "/leads/new",
    actionLabel: "Novo lead",
    mode: "protected-server-boundary",
    operations: ["create", "update"],
    safeguards: ["authenticated-identity", "explicit-tenant", "duplicate-check", "lead-event-audit"],
    blockers: [],
  },
  pipeline: {
    state: "ready",
    label: "Movimentação pronta",
    detail: "Mover com conflito, histórico e reversão segura",
    href: destinoDoModulo("pipeline"),
    actionLabel: "Abrir prioridades",
    mode: "protected-server-boundary",
    operations: ["move", "reverse"],
    safeguards: ["lead-scope", "optimistic-conflict-check", "pipeline-history", "compensating-write"],
    blockers: [],
  },
  "tasks-and-agenda": {
    state: "ready",
    label: "Ação pronta",
    detail: "Criar, concluir e reagendar com escopo",
    href: destinoDoModulo("tasks-and-agenda"),
    actionLabel: "Nova tarefa",
    mode: "rls-direct",
    operations: ["create", "complete", "reschedule"],
    safeguards: ["authenticated-context", "explicit-tenant", "assignee-scope", "copilot-human-confirmation"],
    blockers: [],
  },
  "customers-360": {
    state: "source-mediated",
    label: "Via Lead 360",
    detail: "A fonte única é atualizada na lead de origem",
    href: "/leads",
    actionLabel: "Localizar lead",
    mode: "lead-source",
    operations: ["update-source-record"],
    safeguards: ["single-source-of-truth", "lead-scope", "explicit-tenant", "lead-event-audit"],
    blockers: ["canonical-customer-table-not-approved"],
  },
  developments: {
    state: "blocked",
    label: "Plano homologado",
    detail: "Ativação aguarda migration isolada e teste de papéis",
    href: "/developments/homologation",
    actionLabel: "Revisar homologação",
    mode: "manual-gate",
    operations: ["preflight-create", "preflight-update", "review-activation-evidence"],
    safeguards: [
      "atomic-rpc-only",
      "append-only-audit",
      "explicit-role-contract",
      "explicit-tenant",
      "idempotency",
      "cross-tenant-denial",
      "no-direct-dml",
      "no-delete-rollout",
      "human-homologation",
      "live-data-preserved",
    ],
    blockers: developmentHomologation.missingEvidence,
  },
};

export function resolveOperationalWriteReadiness(
  module: Pick<OperationalModuleHealth, "id" | "state" | "href">,
): OperationalWriteReadiness {
  const capability = WRITE_CAPABILITIES[module.id];

  if (module.state === "unavailable") {
    return {
      state: "blocked",
      label: "Leitura necessária",
      detail: "Restabeleça a leitura antes de alterar dados",
      href: module.href,
      actionLabel: "Revisar módulo",
      mode: "manual-gate",
      operations: [],
      safeguards: ["read-before-write", "live-data-preserved"],
      blockers: ["module-read-unavailable"],
    };
  }

  return capability;
}

export function listOperationalWriteCapabilities() {
  return WRITE_CAPABILITIES;
}
