export type CognitiveStage =
  | "input"
  | "context"
  | "attention"
  | "processing"
  | "state"
  | "next-action";

export interface CognitiveStep {
  stage: CognitiveStage;
  label: string;
  order: number;
}

export const cognitiveFlow: CognitiveStep[] = [
  { stage: "input", label: "Input", order: 1 },
  { stage: "context", label: "Contexto", order: 2 },
  { stage: "attention", label: "Atenção", order: 3 },
  { stage: "processing", label: "Processamento", order: 4 },
  { stage: "state", label: "Estado", order: 5 },
  { stage: "next-action", label: "Próxima ação", order: 6 },
];

export function getNextCognitiveStep(stage: CognitiveStage): CognitiveStep | null {
  const current = cognitiveFlow.find((step) => step.stage === stage);
  if (!current) return null;
  return cognitiveFlow.find((step) => step.order === current.order + 1) ?? null;
}
