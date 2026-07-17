import { canonicalPipelineStage, mergePipelineStageSettings, type PipelineStageDefinition } from "@/lib/atlas/pipeline-stages";

export type ForecastOpportunity = { id: string; stage: string | null; value: number | null; expected_close_at: string | null; created_at?: string | null };
type ForecastStageInput = Partial<PipelineStageDefinition> & { stage_key?: string };
const money = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const rounded = (value: number) => Math.round(value * 100) / 100;

export function buildStageForecast(opportunities: ForecastOpportunity[], settings: ForecastStageInput[] = [], now = new Date()) {
  const stages = mergePipelineStageSettings(settings.map((item) => ({ key: item.key, stage_key: item.stage_key, label: item.label, probability: item.probability, position: item.position, visible: item.visible })));
  const stageMap = new Map(stages.map((stage) => [stage.key, stage]));
  const open = opportunities.flatMap((item) => {
    const key = canonicalPipelineStage(item.stage);
    if (!key) return [];
    const stage = stageMap.get(key);
    if (!stage || stage.outcome !== "open") return [];
    const value = money(item.value);
    const closeTime = item.expected_close_at ? new Date(item.expected_close_at).getTime() : Number.NaN;
    return [{ ...item, stage, value, weighted: value * stage.probability / 100, closeTime: Number.isFinite(closeTime) ? closeTime : null }];
  });
  const total = open.length;
  const withValue = open.filter((item) => item.value > 0).length;
  const withDate = open.filter((item) => item.closeTime !== null).length;
  const pipelineGross = open.reduce((sum, item) => sum + item.value, 0);
  const forecastWeighted = open.reduce((sum, item) => sum + item.weighted, 0);
  const score = total ? Math.round((withValue / total) * 40 + (withDate / total) * 35 + 15 + Math.min(10, total)) : 0;
  const confidence = { score, band: score >= 80 && total >= 5 ? "alta" : score >= 60 && total >= 3 ? "media" : "baixa", sampleSufficient: total >= 5, valueCoverage: total ? Math.round(withValue / total * 100) : 0, closeDateCoverage: total ? Math.round(withDate / total * 100) : 0 } as const;
  const byStage = stages.filter((stage) => stage.outcome === "open").map((stage) => { const items = open.filter((item) => item.stage.key === stage.key); return { key: stage.key, label: stage.label, probability: stage.probability, opportunities: items.length, pipelineGross: rounded(items.reduce((sum, item) => sum + item.value, 0)), forecastWeighted: rounded(items.reduce((sum, item) => sum + item.weighted, 0)) }; });
  const days = (amount: number) => now.getTime() + amount * 86_400_000;
  const bucket = (key: string, label: string, filter: (time: number | null) => boolean) => { const items = open.filter((item) => filter(item.closeTime)); return { key, label, opportunities: items.length, pipelineGross: rounded(items.reduce((sum,item)=>sum+item.value,0)), forecastWeighted: rounded(items.reduce((sum,item)=>sum+item.weighted,0)) }; };
  const timeline = [
    bucket("overdue", "Prazo vencido", (time) => time !== null && time < now.getTime()),
    bucket("30d", "Próximos 30 dias", (time) => time !== null && time >= now.getTime() && time <= days(30)),
    bucket("31_60d", "31 a 60 dias", (time) => time !== null && time > days(30) && time <= days(60)),
    bucket("61_90d", "61 a 90 dias", (time) => time !== null && time > days(60) && time <= days(90)),
    bucket("later", "Após 90 dias", (time) => time !== null && time > days(90)),
    bucket("no_date", "Sem data prevista", (time) => time === null),
  ];
  const risks = [
    withValue < total ? `${total - withValue} oportunidades sem valor` : null,
    withDate < total ? `${total - withDate} oportunidades sem data prevista` : null,
    timeline[0].opportunities ? `${timeline[0].opportunities} oportunidades com prazo vencido` : null,
    !confidence.sampleSufficient ? "Amostra menor que 5 oportunidades abertas" : null,
  ].filter((item): item is string => Boolean(item));
  return { summary: { opportunities: total, pipelineGross: rounded(pipelineGross), forecastWeighted: rounded(forecastWeighted), gap: rounded(Math.max(0,pipelineGross-forecastWeighted)), method: "canonical_stage_probability_v1" }, confidence, byStage, timeline, risks, governance: { probabilistic: true, revenueGuaranteed: false, humanReviewRequired: true, movementClaimed: false } };
}
