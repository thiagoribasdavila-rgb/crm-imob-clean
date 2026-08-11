export type KanbanCardAccessibility = {
  description: string;
  keyShortcuts: "Alt+ArrowLeft Alt+ArrowRight";
  label: string;
  movementAvailable: boolean;
};

export const KANBAN_ACCESSIBILITY_CONTRACT = {
  wcagTarget: "AA",
  minimumTextContrast: 4.5,
  minimumTargetSize: 24,
  primaryTargetSize: 44,
  keyboardMovement: ["Alt+ArrowLeft", "Alt+ArrowRight"],
  motionPurposes: ["state-change", "data-arrival", "disclosure"],
  liveRegion: "polite",
  reducedMotion: true,
  aiCalls: 0,
  businessMutation: false,
  databaseMigration: false,
} as const;

function readable(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized || fallback;
}

export function buildKanbanCardAccessibility(input: {
  busy: boolean;
  currentStageLabel: string;
  leadName: string | null | undefined;
  nextActionLabel: string | null | undefined;
  nextStageLabel: string | null | undefined;
  previousStageLabel: string | null | undefined;
  projectName: string | null | undefined;
}): KanbanCardAccessibility {
  const leadName = readable(input.leadName, "Lead sem nome");
  const stageLabel = readable(input.currentStageLabel, "Etapa não informada");
  const projectName = readable(input.projectName, "Projeto não informado");
  const nextAction = readable(
    input.nextActionLabel,
    "Próxima ação não definida",
  );
  const previousStage = input.previousStageLabel?.trim();
  const nextStage = input.nextStageLabel?.trim();
  const movementAvailable = !input.busy && Boolean(previousStage || nextStage);

  const movementDescription = input.busy
    ? "Movimentação temporariamente indisponível enquanto a alteração é salva."
    : [
        previousStage
          ? `Alt mais seta para esquerda volta para ${previousStage}.`
          : "Esta é a primeira etapa; não há movimento para a esquerda.",
        nextStage
          ? `Alt mais seta para direita avança para ${nextStage}.`
          : "Esta é a última etapa visível; não há movimento para a direita.",
      ].join(" ");

  return {
    label: `${leadName}. Projeto ${projectName}. Etapa ${stageLabel}. Próxima ação: ${nextAction}.`,
    description: `${movementDescription} Abra o contexto para consultar evidências, histórico e execução.`,
    keyShortcuts: "Alt+ArrowLeft Alt+ArrowRight",
    movementAvailable,
  };
}
