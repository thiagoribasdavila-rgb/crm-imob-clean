export type ShellIdentity = {
  name: string;
  email: string;
  organization: string;
  role: string;
  accessRole: "admin" | "director_decisor" | "director" | "broker";
};

export type DesktopDensity = "compact" | "comfortable";

export const ATLAS_DECISION_DENSITY_PROFILES = [
  "execution",
  "exceptions",
  "executive",
] as const;

export type DecisionDensityProfile =
  (typeof ATLAS_DECISION_DENSITY_PROFILES)[number];

/**
 * Resolve somente a apresentação do mesmo contrato de decisão.
 * O papel comercial autoritativo tem precedência; accessRole cobre apenas o
 * estado transitório enquanto o contexto completo da organização é carregado.
 */
export function resolveDecisionDensityProfile(
  identity: Pick<ShellIdentity, "role" | "accessRole">,
): DecisionDensityProfile {
  const commercialRole = identity.role.trim().toLowerCase();

  if (commercialRole === "director") return "executive";
  if (commercialRole === "manager" || commercialRole === "superintendent") {
    return "exceptions";
  }
  if (commercialRole === "broker") return "execution";

  return identity.accessRole === "admin" ||
    identity.accessRole === "director_decisor" ||
    identity.accessRole === "director"
    ? "executive"
    : "execution";
}
