export type BootstrapState = "available" | "locked";

export function bootstrapState(profileCount: number): BootstrapState {
  if (!Number.isSafeInteger(profileCount) || profileCount < 0) {
    throw new Error("Contagem de perfis inválida.");
  }
  return profileCount === 0 ? "available" : "locked";
}
