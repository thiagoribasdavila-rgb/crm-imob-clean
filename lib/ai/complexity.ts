export type AIComplexityAssessment = {
  level: 1 | 2 | 3 | 4;
  label: "imediata" | "comercial" | "analítica" | "estratégica";
  task: "fast" | "commercial" | "reasoning";
  confidence: number;
  signals: string[];
  requiresHumanReview: boolean;
  externalResearchRecommended: boolean;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function assessAIComplexity(prompt: string): AIComplexityAssessment {
  const value = normalize(prompt);
  const signals: string[] = [];
  let points = 0;

  const add = (condition: boolean, score: number, signal: string) => {
    if (!condition) return;
    points += score;
    signals.push(signal);
  };

  add(prompt.length > 700, 2, "contexto extenso");
  add(prompt.length > 1_300, 2, "contexto muito extenso");
  add(/[0-9]+[%.,]|r\$|taxa|ticket|vgv|cpl|cac|roi|conversao|forecast/.test(value), 2, "cálculo ou indicador");
  add(/compar|cenario|alternativa|versus|sensibilidade|projecao/.test(value), 3, "comparação de cenários");
  add(/estrateg|plano diretor|campanha|publico|segment|andromeda|portfolio/.test(value), 3, "decisão estratégica");
  add(/causal|correlac|previs|probabilidade|risco|tendencia/.test(value), 3, "inferência analítica");
  add(/financ|credito|juridic|contrato|comissao|desconto|pagamento|proposta/.test(value), 4, "impacto financeiro ou regulatório");
  add(/equipe|gerente|corretor|incorporador|projeto|campanha/.test(value) && /compar|distrib|ranking|performance/.test(value), 2, "múltiplas entidades comerciais");
  add(/hoje|agora|proxima acao|resuma|resumo|checklist/.test(value) && prompt.length < 500, -2, "execução imediata");

  const level: AIComplexityAssessment["level"] = points >= 9 ? 4 : points >= 5 ? 3 : points >= 2 ? 2 : 1;
  const task: AIComplexityAssessment["task"] = level === 1 ? "fast" : level >= 3 ? "reasoning" : "commercial";
  const label = level === 1 ? "imediata" : level === 2 ? "comercial" : level === 3 ? "analítica" : "estratégica";
  const requiresHumanReview = /financ|credito|juridic|contrato|comissao|desconto|pagamento|proposta/.test(value) || level === 4;
  const externalResearchRecommended = /mercado|regiao|bairro|concorr|benchmark|tendencia|atual|internet/.test(value);

  return {
    level,
    label,
    task,
    confidence: Math.min(98, 72 + Math.abs(points) * 3 + Math.min(signals.length, 4)),
    signals: signals.length ? signals : ["solicitação direta"],
    requiresHumanReview,
    externalResearchRecommended,
  };
}
