export type CommercialOutcomeContextPreviewDimension = "project" | "source";

export type CommercialOutcomeContextPreview = {
  projectName: string | null;
  sourceName: string | null;
  missingDimensions: CommercialOutcomeContextPreviewDimension[];
  status: "complete" | "attention";
  primaryFinding: string;
  policy: {
    currentLeadSnapshotOnly: true;
    humanReviewRequired: true;
    missingContextBlocksRecording: false;
    automaticFill: false;
    historicalSnapshotOnConfirmation: true;
  };
};

function contextLabel(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || null
    : null;
}

export function buildCommercialOutcomeContextPreview(input: {
  projectName?: unknown;
  sourceName?: unknown;
}): CommercialOutcomeContextPreview {
  const projectName = contextLabel(input.projectName);
  const sourceName = contextLabel(input.sourceName);
  const missingDimensions: CommercialOutcomeContextPreviewDimension[] = [];
  if (!projectName) missingDimensions.push("project");
  if (!sourceName) missingDimensions.push("source");

  const status = missingDimensions.length === 0 ? "complete" : "attention";
  const primaryFinding = status === "complete"
    ? "Projeto e origem serão preservados com o resultado confirmado."
    : missingDimensions.length === 2
      ? "Projeto e origem não estão informados. O resultado pode ser salvo, mas ficará sem essas duas dimensões."
      : `${missingDimensions[0] === "project" ? "Projeto" : "Origem"} não está informado(a). O resultado pode ser salvo sem preenchimento automático.`;

  return {
    projectName,
    sourceName,
    missingDimensions,
    status,
    primaryFinding,
    policy: {
      currentLeadSnapshotOnly: true,
      humanReviewRequired: true,
      missingContextBlocksRecording: false,
      automaticFill: false,
      historicalSnapshotOnConfirmation: true,
    },
  };
}

export function sameCommercialOutcomeContextPreview(
  left: Pick<CommercialOutcomeContextPreview, "projectName" | "sourceName">,
  right: Pick<CommercialOutcomeContextPreview, "projectName" | "sourceName">,
) {
  return left.projectName === right.projectName && left.sourceName === right.sourceName;
}
