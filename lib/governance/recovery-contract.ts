export const V3_RELEASE_ROLLBACK_MARKER = "ATLAS_V3_RELEASE_ROLLBACK:";

export const v3ReleaseRollbackSteps = [
  "Confirmar restauração isolada do banco e registrar a evidência",
  "Confirmar inventário e recuperação dos arquivos do Storage",
  "Validar o pacote imutável da versão anterior do V3",
  "Congelar novas entradas durante a janela aprovada",
  "Apontar o tráfego para a versão anterior do V3",
  "Validar login, leads, pipeline, agenda e integrações críticas",
  "Registrar tempo, resposta HTTP, responsável e evidências",
] as const;

export type V3ReleaseRollbackNotes = {
  releaseVersion: string;
  artifactReference: string;
  storageEvidenceReference: string;
  notes?: string | null;
};

function cleanLine(value: string, limit: number) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, limit);
}

export function buildV3ReleaseRollbackNotes(
  input: V3ReleaseRollbackNotes,
) {
  const payload = {
    release_version: cleanLine(input.releaseVersion, 80),
    artifact_reference: cleanLine(input.artifactReference, 300),
    storage_evidence_reference: cleanLine(
      input.storageEvidenceReference,
      300,
    ),
    notes: input.notes ? cleanLine(input.notes, 900) : null,
  };

  return `${V3_RELEASE_ROLLBACK_MARKER}${JSON.stringify(payload)}`.slice(
    0,
    2000,
  );
}

export function isDifferentHttpsReleaseTarget(
  targetUrl: string,
  currentUrl?: string | null,
) {
  try {
    const target = new URL(targetUrl);
    if (target.protocol !== "https:") return false;
    if (!currentUrl) return true;
    const current = new URL(currentUrl);
    return (
      target.origin !== current.origin ||
      target.pathname.replace(/\/+$/, "") !==
        current.pathname.replace(/\/+$/, "")
    );
  } catch {
    return false;
  }
}
