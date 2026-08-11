export type KanbanStageBottleneckTone =
  "danger" | "warning" | "opportunity" | "healthy" | "neutral";

export type KanbanStageDecisionHeader = {
  stageLabel: string;
  volume: number;
  validValue: number;
  bottleneck: {
    label: string;
    detail: string;
    tone: KanbanStageBottleneckTone;
  };
};

export const KANBAN_DECISION_BOARD_CONTRACT = {
  visibleHeaderMetrics: 3,
  preservedCardContext: [
    "project",
    "validation",
    "next-action",
    "movement-audit",
  ],
  compactMobileColumns: 1,
  aiCalls: 0,
  businessMutation: false,
  databaseMigration: false,
} as const;

export function validLeadValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

export function buildKanbanStageDecisionHeader(input: {
  stageLabel: string;
  volume: number;
  validValue: number;
  urgent: number;
  noAction: number;
  stalled: number;
  hot: number;
}): KanbanStageDecisionHeader {
  const volume = Math.max(0, Math.trunc(input.volume));
  const validValue = validLeadValue(input.validValue);
  const urgent = Math.max(0, Math.trunc(input.urgent));
  const noAction = Math.max(0, Math.trunc(input.noAction));
  const stalled = Math.max(0, Math.trunc(input.stalled));
  const hot = Math.max(0, Math.trunc(input.hot));

  if (volume === 0) {
    return {
      stageLabel: input.stageLabel,
      volume,
      validValue,
      bottleneck: {
        label: "Etapa pronta",
        detail: "Sem gargalo no recorte",
        tone: "neutral",
      },
    };
  }

  if (urgent > 0) {
    return {
      stageLabel: input.stageLabel,
      volume,
      validValue,
      bottleneck: {
        label: `${urgent} ${urgent === 1 ? "SLA vencido" : "SLAs vencidos"}`,
        detail: "Atendimento imediato",
        tone: "danger",
      },
    };
  }

  if (noAction > 0) {
    return {
      stageLabel: input.stageLabel,
      volume,
      validValue,
      bottleneck: {
        label: `${noAction} sem próxima ação`,
        detail: "Cadência incompleta",
        tone: "warning",
      },
    };
  }

  if (stalled > 0) {
    return {
      stageLabel: input.stageLabel,
      volume,
      validValue,
      bottleneck: {
        label: `${stalled} ${stalled === 1 ? "lead parado" : "leads parados"}`,
        detail: "Mais de 72h na etapa",
        tone: "warning",
      },
    };
  }

  if (hot > 0) {
    return {
      stageLabel: input.stageLabel,
      volume,
      validValue,
      bottleneck: {
        label: `${hot} ${hot === 1 ? "lead quente" : "leads quentes"}`,
        detail: "Oportunidades para avançar",
        tone: "opportunity",
      },
    };
  }

  return {
    stageLabel: input.stageLabel,
    volume,
    validValue,
    bottleneck: {
      label: "Fluxo saudável",
      detail: "Sem gargalo crítico",
      tone: "healthy",
    },
  };
}
