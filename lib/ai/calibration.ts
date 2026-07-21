/**
 * Calibração central das IAs do Atlas — um único painel de limiares.
 *
 * Todas as IAs determinísticas (estrategista de marketing, relatório Andromeda,
 * criativos, briefing da diretoria) leem seus limiares daqui. A diretoria pode
 * ajustar dentro de TRILHOS de segurança (min/max); parâmetros de POLÍTICA da
 * Meta (categoria HOUSING) são travados — política não se calibra, se cumpre.
 *
 * Núcleo puro: merge de overrides com clamp + rejeição explicada; a persistência
 * (tabela ai_calibration) fica na rota. Nada aqui chama rede ou banco.
 */

export type AiCalibration = {
  marketing: {
    minSpendToJudgeBrl: number;  // gasto mínimo antes de julgar campanha
    cplRatioReview: number;      // CPL acima de X× a mediana → revisar
    minSpendCplReviewBrl: number; // gasto mínimo para acionar revisão por CPL
  };
  fatigue: {
    freqLimit: number;           // frequency acima disso = fadiga
    ctrDropPct: number;          // queda % de CTR semana a semana = fadiga
    cpmRisePct: number;          // alta % de CPM semana a semana = fadiga
  };
  diversity: {
    targetAdsPerCampaign: number; // nº de criativos ativos que vale score 100
  };
  consolidation: {
    smallAccountMonthlyBrl: number;   // conta "pequena" até este gasto/mês
    maxActiveCampaignsSmall: number;  // acima disso em conta pequena = fragmentada
  };
  creative: {
    maxVariants: number;          // variações por campo no asset_feed_spec
    primaryMaxChars: number;
    headlineMaxChars: number;
    descriptionMaxChars: number;
    recommendedPrimaryChars: number;
  };
  briefing: {
    maxDecisions: number;         // decisões máximas por briefing (anti-ruído)
    urgencyAttention: number;     // urgency >= isto => mood "atencao"
  };
  sizing: {
    learningEventsPerWeek: number; // eventos/semana p/ um conjunto sair do aprendizado (Meta ~50)
    maxAdSets: number;             // teto de conjuntos recomendados (Andromeda premia consolidar)
    fallbackCplBrl: number;        // CPL assumido quando não há histórico (R$)
  };
  audience: {
    minRadiusKm: number;          // POLÍTICA Meta HOUSING — travado
    ageMin: number;               // POLÍTICA — travado
    ageMax: number;               // POLÍTICA — travado
  };
};

export type CalibrationRail = { min: number; max: number; locked?: boolean; label: string };

/** Trilhos por parâmetro (chave = "grupo.campo"). locked = política, não preferência. */
export const CALIBRATION_RAILS: Record<string, CalibrationRail> = {
  "marketing.minSpendToJudgeBrl": { min: 50, max: 5000, label: "Gasto mínimo p/ julgar campanha (R$)" },
  "marketing.cplRatioReview": { min: 1.2, max: 5, label: "Revisar quando CPL passa de X× a mediana" },
  "marketing.minSpendCplReviewBrl": { min: 50, max: 5000, label: "Gasto mínimo p/ revisão por CPL (R$)" },
  "fatigue.freqLimit": { min: 1.5, max: 6, label: "Frequência máxima antes de fadiga" },
  "fatigue.ctrDropPct": { min: 10, max: 60, label: "Queda de CTR que sinaliza fadiga (%)" },
  "fatigue.cpmRisePct": { min: 10, max: 60, label: "Alta de CPM que sinaliza fadiga (%)" },
  "diversity.targetAdsPerCampaign": { min: 3, max: 10, label: "Criativos ativos p/ diversidade plena" },
  "consolidation.smallAccountMonthlyBrl": { min: 1000, max: 50000, label: "Teto de conta pequena (R$/mês)" },
  "consolidation.maxActiveCampaignsSmall": { min: 1, max: 10, label: "Campanhas ativas máx. em conta pequena" },
  "creative.maxVariants": { min: 2, max: 5, label: "Variações por campo (limite Meta = 5)" },
  "creative.primaryMaxChars": { min: 80, max: 200, label: "Texto principal — máx. de caracteres" },
  "creative.headlineMaxChars": { min: 20, max: 40, label: "Título — máx. de caracteres" },
  "creative.descriptionMaxChars": { min: 15, max: 30, label: "Descrição — máx. de caracteres" },
  "creative.recommendedPrimaryChars": { min: 80, max: 160, label: "Texto principal — recomendação visível" },
  "briefing.maxDecisions": { min: 1, max: 10, label: "Decisões máximas por briefing" },
  "briefing.urgencyAttention": { min: 2, max: 5, label: "Urgência que liga o modo atenção" },
  "sizing.learningEventsPerWeek": { min: 20, max: 100, label: "Eventos/semana p/ sair do aprendizado (Meta)" },
  "sizing.maxAdSets": { min: 1, max: 10, label: "Conjuntos recomendados — teto" },
  "sizing.fallbackCplBrl": { min: 1, max: 100, label: "CPL assumido sem histórico (R$)" },
  "audience.minRadiusKm": { min: 24, max: 24, locked: true, label: "Raio mínimo HOUSING (política Meta)" },
  "audience.ageMin": { min: 18, max: 18, locked: true, label: "Idade mínima HOUSING (política Meta)" },
  "audience.ageMax": { min: 65, max: 65, locked: true, label: "Idade máxima HOUSING (política Meta)" },
};

export const DEFAULT_CALIBRATION: AiCalibration = {
  marketing: { minSpendToJudgeBrl: 300, cplRatioReview: 2, minSpendCplReviewBrl: 200 },
  fatigue: { freqLimit: 2.5, ctrDropPct: 25, cpmRisePct: 20 },
  diversity: { targetAdsPerCampaign: 5 },
  consolidation: { smallAccountMonthlyBrl: 5000, maxActiveCampaignsSmall: 3 },
  creative: { maxVariants: 5, primaryMaxChars: 200, headlineMaxChars: 40, descriptionMaxChars: 30, recommendedPrimaryChars: 125 },
  briefing: { maxDecisions: 6, urgencyAttention: 4 },
  sizing: { learningEventsPerWeek: 50, maxAdSets: 3, fallbackCplBrl: 8 },
  audience: { minRadiusKm: 24, ageMin: 18, ageMax: 65 },
};

export type RejectedOverride = { path: string; reason: string };

/**
 * Aplica overrides sobre o default com clamp nos trilhos.
 * Retorna a calibração efetiva + a lista do que foi rejeitado (e por quê).
 */
export function mergeCalibration(overrides: unknown): { calibration: AiCalibration; rejected: RejectedOverride[] } {
  const rejected: RejectedOverride[] = [];
  const result = structuredClone(DEFAULT_CALIBRATION) as unknown as Record<string, Record<string, number>>;
  if (overrides == null || typeof overrides !== "object" || Array.isArray(overrides)) {
    if (overrides != null) rejected.push({ path: "$", reason: "overrides deve ser um objeto {grupo:{campo:numero}}" });
    return { calibration: result as unknown as AiCalibration, rejected };
  }
  for (const [group, fields] of Object.entries(overrides as Record<string, unknown>)) {
    if (!(group in result)) { rejected.push({ path: group, reason: "grupo desconhecido" }); continue; }
    if (fields == null || typeof fields !== "object" || Array.isArray(fields)) {
      rejected.push({ path: group, reason: "grupo deve ser objeto {campo:numero}" }); continue;
    }
    for (const [field, raw] of Object.entries(fields as Record<string, unknown>)) {
      const path = `${group}.${field}`;
      const rail = CALIBRATION_RAILS[path];
      if (!rail) { rejected.push({ path, reason: "parâmetro desconhecido" }); continue; }
      if (rail.locked) { rejected.push({ path, reason: "política Meta — travado, não calibrável" }); continue; }
      const value = Number(raw);
      if (!Number.isFinite(value)) { rejected.push({ path, reason: "valor não numérico" }); continue; }
      const clamped = Math.min(Math.max(value, rail.min), rail.max);
      if (clamped !== value) rejected.push({ path, reason: `fora do trilho [${rail.min}–${rail.max}] — ajustado para ${clamped}` });
      result[group][field] = clamped;
    }
  }
  return { calibration: result as unknown as AiCalibration, rejected };
}

/** Lista plana p/ UI da diretoria: caminho, valor efetivo, trilho e trava. */
export function flattenCalibration(c: AiCalibration): Array<{ path: string; value: number; min: number; max: number; locked: boolean; label: string }> {
  const flat: Array<{ path: string; value: number; min: number; max: number; locked: boolean; label: string }> = [];
  const record = c as unknown as Record<string, Record<string, number>>;
  for (const [path, rail] of Object.entries(CALIBRATION_RAILS)) {
    const [group, field] = path.split(".");
    flat.push({ path, value: record[group][field], min: rail.min, max: rail.max, locked: rail.locked === true, label: rail.label });
  }
  return flat;
}

/** Resumo executivo em PT — como as IAs estão calibradas, sem jargão. */
export function calibrationSummary(c: AiCalibration): string[] {
  return [
    `Marketing: campanhas só são julgadas após R$ ${c.marketing.minSpendToJudgeBrl} de gasto; revisão quando o CPL passa de ${c.marketing.cplRatioReview}× a mediana da conta.`,
    `Fadiga criativa: frequência acima de ${c.fatigue.freqLimit}, CTR caindo ${c.fatigue.ctrDropPct}% ou CPM subindo ${c.fatigue.cpmRisePct}% semana a semana.`,
    `Diversidade (Andromeda): ${c.diversity.targetAdsPerCampaign} criativos ativos valem saúde plena; menos que isso reduz o score.`,
    `Consolidação: conta até R$ ${c.consolidation.smallAccountMonthlyBrl}/mês deve ter no máximo ${c.consolidation.maxActiveCampaignsSmall} campanhas ativas.`,
    `Criativos: até ${c.creative.maxVariants} variações por campo; texto principal máx. ${c.creative.primaryMaxChars} (recomendado ${c.creative.recommendedPrimaryChars}), título ${c.creative.headlineMaxChars}, descrição ${c.creative.descriptionMaxChars}.`,
    `Briefing: no máximo ${c.briefing.maxDecisions} decisões por vez; urgência ${c.briefing.urgencyAttention}+ liga o modo atenção.`,
    `Dimensionamento: cada conjunto precisa de ~${c.sizing.learningEventsPerWeek} conversões/semana para sair do aprendizado; no máximo ${c.sizing.maxAdSets} conjuntos (sem histórico, CPL assumido R$ ${c.sizing.fallbackCplBrl}).`,
    `Público (política Meta HOUSING, travado): idade ${c.audience.ageMin}–${c.audience.ageMax}+, raio mínimo ${c.audience.minRadiusKm} km, sem gênero/lookalike/CEP.`,
  ];
}
