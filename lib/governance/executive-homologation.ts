export const executiveRoles = [
  "director",
  "superintendent",
  "manager",
  "broker",
] as const;
export type ExecutiveRole = (typeof executiveRoles)[number];

export type ExecutiveAcceptanceEvidence = {
  homologationTotal: number;
  homologationPassed: number;
  homologationFailed: number;
  requiredChecks: number;
  signedRoles: ExecutiveRole[];
  reliabilityReady: boolean;
  integrationReady: boolean;
  backupRestorePassed: boolean;
  rollbackPassed: boolean;
  realDataReady: boolean;
  hostinger: boolean;
  https: boolean;
};

export function evaluateExecutiveAcceptance(e: ExecutiveAcceptanceEvidence) {
  const controls = [
    {
      key: "operational_regression",
      label: "Roteiro operacional completo",
      severity: "critical",
      passed:
        e.homologationTotal >= e.requiredChecks &&
        e.homologationPassed >= e.requiredChecks &&
        e.homologationFailed === 0,
      evidence: `${e.homologationPassed}/${e.requiredChecks} aprovados · ${e.homologationFailed} falhas`,
    },
    {
      key: "role_signoffs",
      label: "Aceite dos quatro perfis",
      severity: "critical",
      passed: executiveRoles.every((role) => e.signedRoles.includes(role)),
      evidence: e.signedRoles.length
        ? e.signedRoles.join(", ")
        : "nenhuma assinatura",
    },
    {
      key: "reliability",
      label: "Confiabilidade final",
      severity: "critical",
      passed: e.reliabilityReady,
      evidence: String(e.reliabilityReady),
    },
    {
      key: "integrations",
      label: "Integrações reais",
      severity: "critical",
      passed: e.integrationReady,
      evidence: String(e.integrationReady),
    },
    {
      key: "backup_restore",
      label: "Restauração comprovada",
      severity: "critical",
      passed: e.backupRestorePassed,
      evidence: String(e.backupRestorePassed),
    },
    {
      key: "rollback",
      label: "Rollback simulado",
      severity: "critical",
      passed: e.rollbackPassed,
      evidence: String(e.rollbackPassed),
    },
    {
      key: "real_data",
      label: "Amostra operacional real",
      severity: "high",
      passed: e.realDataReady,
      evidence: String(e.realDataReady),
    },
    {
      key: "hostinger",
      label: "Ambiente Hostinger",
      severity: "high",
      passed: e.hostinger,
      evidence: String(e.hostinger),
    },
    {
      key: "https",
      label: "Domínio HTTPS",
      severity: "critical",
      passed: e.https,
      evidence: String(e.https),
    },
  ];
  const blocking = controls
    .filter((control) => !control.passed)
    .map((control) => control.key);
  return {
    status: blocking.length
      ? ("collecting" as const)
      : ("ready_for_decision" as const),
    score: Math.round(
      (controls.filter((control) => control.passed).length / controls.length) *
        100,
    ),
    controls,
    blocking,
    goAllowed: blocking.length === 0,
    automaticPublish: false,
  };
}
