export const PIPELINE_STAGE_KEYS = ["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho", "perdido", "comprou_outro"] as const;
export type PipelineStageKey = (typeof PIPELINE_STAGE_KEYS)[number];
export type PipelineStageDefinition = { key: PipelineStageKey; label: string; probability: number; position: number; visible: boolean; outcome: "open" | "won" | "lost" | "buyer_profile" };

export const DEFAULT_PIPELINE_STAGES: PipelineStageDefinition[] = [
  { key: "novo", label: "Novos", probability: 5, position: 10, visible: true, outcome: "open" },
  { key: "contato", label: "Contato", probability: 15, position: 20, visible: true, outcome: "open" },
  { key: "qualificacao", label: "Qualificação", probability: 30, position: 30, visible: true, outcome: "open" },
  { key: "visita", label: "Visita", probability: 50, position: 40, visible: true, outcome: "open" },
  { key: "proposta", label: "Proposta", probability: 70, position: 50, visible: true, outcome: "open" },
  { key: "contrato", label: "Contrato", probability: 90, position: 60, visible: true, outcome: "open" },
  { key: "ganho", label: "Ganhos", probability: 100, position: 70, visible: true, outcome: "won" },
  { key: "perdido", label: "Perdido", probability: 0, position: 80, visible: false, outcome: "lost" },
  { key: "comprou_outro", label: "Comprou em outro lugar", probability: 0, position: 90, visible: false, outcome: "buyer_profile" },
];

const aliases: Record<string, PipelineStageKey> = { novo_lead: "novo", new: "novo", contact: "contato", qualificação: "qualificacao", qualified: "qualificacao", meeting: "visita", negociacao: "proposta", negociação: "proposta", proposal: "proposta", contract: "contrato", won: "ganho", venda: "ganho", lost: "perdido", buyer_elsewhere: "comprou_outro" };
export function canonicalPipelineStage(value: unknown): PipelineStageKey | null {
  const normalized = String(value || "").trim().toLowerCase();
  if ((PIPELINE_STAGE_KEYS as readonly string[]).includes(normalized)) return normalized as PipelineStageKey;
  return aliases[normalized] || null;
}

export function mergePipelineStageSettings(rows: Array<Partial<PipelineStageDefinition> & { stage_key?: string }> = []) {
  const settings = new Map(rows.map((row) => [canonicalPipelineStage(row.stage_key || row.key), row]));
  return DEFAULT_PIPELINE_STAGES.map((base) => {
    const custom = settings.get(base.key);
    return { ...base, label: typeof custom?.label === "string" && custom.label.trim() ? custom.label.trim().slice(0, 40) : base.label, probability: Number.isFinite(Number(custom?.probability)) ? Math.min(100, Math.max(0, Math.round(Number(custom?.probability)))) : base.probability, position: Number.isFinite(Number(custom?.position)) ? Math.round(Number(custom?.position)) : base.position, visible: typeof custom?.visible === "boolean" ? custom.visible : base.visible };
  }).sort((a, b) => a.position - b.position);
}
