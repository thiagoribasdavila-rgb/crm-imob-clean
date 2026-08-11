export type AtlasOperationalRole = "broker" | "manager" | "director";

export type RoleOrientedCardMode =
  | "execution"
  | "intervention"
  | "impact";

export type RoleOrientedCardTone =
  | "danger"
  | "warning"
  | "info"
  | "success";

export type RoleOrientedCardException = {
  detail: string;
  label: string;
  tone: RoleOrientedCardTone;
};

export type RoleOrientedCardInput = {
  actionDetail: string;
  actionLabel: string;
  assignedName?: string | null;
  exception?: RoleOrientedCardException | null;
  potentialLabel?: string | null;
  projectName?: string | null;
  role: AtlasOperationalRole;
  stageLabel: string;
};

export type RoleOrientedCardSnapshot = {
  detail: string;
  evidenceLabel: string;
  eyebrow: string;
  headline: string;
  metricLabel: string;
  metricValue: string;
  mode: RoleOrientedCardMode;
  ownerLabel: string | null;
  role: AtlasOperationalRole;
  scopeLabel: string;
  tone: RoleOrientedCardTone;
};

export const ROLE_ORIENTED_CARD_CONTRACT = {
  roleSource: "authenticated-profile",
  visibilitySource: "authenticated-api-and-rls",
  manuallySelectedLensChangesVisibility: false,
  brokerOwnerDisclosure: false,
  managerOwnerDisclosure: true,
  directorAggregation: true,
  exceptionEvidenceRequired: true,
} as const;

function normalized(value: string | null | undefined, fallback: string) {
  const text = value?.trim();
  return text || fallback;
}

export function buildRoleOrientedCard(
  input: RoleOrientedCardInput,
): RoleOrientedCardSnapshot {
  const stageLabel = normalized(input.stageLabel, "Etapa não informada");
  const actionLabel = normalized(input.actionLabel, "Definir próxima ação");
  const actionDetail = normalized(
    input.actionDetail,
    "A oportunidade ainda não possui uma próxima ação registrada.",
  );

  if (input.role === "broker") {
    return {
      detail: actionDetail,
      evidenceLabel: "Ação e etapa registradas",
      eyebrow: "Execução do corretor",
      headline: actionLabel,
      metricLabel: "Etapa atual",
      metricValue: stageLabel,
      mode: "execution",
      ownerLabel: null,
      role: input.role,
      scopeLabel: "Minha carteira",
      tone: input.exception?.tone || "success",
    };
  }

  if (input.role === "manager") {
    return {
      detail: input.exception?.detail || actionDetail,
      evidenceLabel: input.exception
        ? "Exceção comprovada"
        : "Atribuição e etapa registradas",
      eyebrow: "Intervenção do gerente",
      headline: input.exception?.label || "Acompanhar execução",
      metricLabel: "Etapa observada",
      metricValue: stageLabel,
      mode: "intervention",
      ownerLabel: normalized(input.assignedName, "Sem responsável"),
      role: input.role,
      scopeLabel: "Minha estrutura",
      tone: input.exception?.tone || "warning",
    };
  }

  const projectName = normalized(input.projectName, "Projeto não vinculado");
  const impactDetail = input.exception?.detail || actionDetail;

  return {
    detail: `${projectName} · ${stageLabel}. ${impactDetail}`,
    evidenceLabel: input.exception
      ? "Exceção comprovada"
      : "Agregado por etapa e valor",
    eyebrow: "Impacto para direção",
    headline: input.exception?.label || "Oportunidade monitorada",
    metricLabel: "Potencial registrado",
    metricValue: normalized(input.potentialLabel, "Sem valor registrado"),
    mode: "impact",
    ownerLabel: null,
    role: input.role,
    scopeLabel: "Visão da organização",
    tone: input.exception?.tone || "info",
  };
}
