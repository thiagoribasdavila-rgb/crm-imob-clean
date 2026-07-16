type QualificationLead = {
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  source?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  preferred_regions?: string[] | null;
  bedrooms?: number | null;
  purpose?: string | null;
  next_action_at?: string | null;
  last_interaction_at?: string | null;
  created_at?: string | null;
};

type QualificationInput = {
  lead: QualificationLead;
  activityCount: number;
  opportunityCount: number;
  propertyMatchCount: number;
  now?: number;
};

export type LeadQualification = {
  score: number;
  temperature: "frio" | "morno" | "quente";
  confidence: number;
  dimensions: Array<{ key: string; label: string; score: number; maximum: number; reasons: string[] }>;
  strengths: string[];
  missingData: string[];
  risks: string[];
  nextBestAction: string;
  recalculatedAt: string;
};

function daysSince(date: string | null | undefined, now: number) {
  if (!date) return null;
  const parsed = new Date(date).getTime();
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 86400000)) : null;
}

export function qualifyRealEstateLead({ lead, activityCount, opportunityCount, propertyMatchCount, now = Date.now() }: QualificationInput): LeadQualification {
  const strengths: string[] = [];
  const missingData: string[] = [];
  const risks: string[] = [];
  const dimensions: LeadQualification["dimensions"] = [];

  let profile = 0;
  if (lead.phone) { profile += 7; strengths.push("Telefone disponível"); } else missingData.push("Telefone");
  if (lead.email) { profile += 4; strengths.push("E-mail disponível"); } else missingData.push("E-mail");
  if (Number(lead.budget_max ?? 0) > 0) { profile += 10; strengths.push("Orçamento definido"); } else missingData.push("Orçamento máximo");
  if (lead.preferred_regions?.length) { profile += 6; strengths.push("Região de interesse definida"); } else missingData.push("Região de interesse");
  if (lead.bedrooms) profile += 4; else missingData.push("Tipologia desejada");
  if (lead.purpose) profile += 4; else missingData.push("Objetivo da compra");
  dimensions.push({ key: "profile", label: "Perfil e capacidade", score: profile, maximum: 35, reasons: strengths.slice() });

  const interactionDays = daysSince(lead.last_interaction_at, now);
  let engagement = 0;
  const engagementReasons: string[] = [];
  if (activityCount > 0) { engagement += Math.min(10, 4 + activityCount * 2); engagementReasons.push(`${activityCount} interação(ões) registrada(s)`); }
  if (interactionDays !== null && interactionDays <= 2) { engagement += 10; engagementReasons.push("Interação muito recente"); }
  else if (interactionDays !== null && interactionDays <= 7) { engagement += 6; engagementReasons.push("Interação na última semana"); }
  else if (interactionDays !== null && interactionDays > 14) risks.push(`Sem interação recente há ${interactionDays} dias`);
  if (lead.next_action_at) { engagement += 5; engagementReasons.push("Próxima ação agendada"); }
  else risks.push("Sem próxima ação agendada");
  dimensions.push({ key: "engagement", label: "Engajamento e cadência", score: Math.min(25, engagement), maximum: 25, reasons: engagementReasons });

  const normalizedStatus = String(lead.status ?? "novo").toLowerCase();
  const stageScores: Record<string, number> = { novo: 3, contato: 7, qualificacao: 12, "qualificação": 12, visita: 17, proposta: 21, negociacao: 23, "negociação": 23, contrato: 25, ganho: 25 };
  let intent = stageScores[normalizedStatus] ?? 4;
  const intentReasons = [`Etapa atual: ${normalizedStatus}`];
  if (opportunityCount > 0) { intent = Math.min(25, intent + 4); intentReasons.push(`${opportunityCount} oportunidade(s) vinculada(s)`); }
  dimensions.push({ key: "intent", label: "Intenção e avanço", score: intent, maximum: 25, reasons: intentReasons });

  let fit = 0;
  const fitReasons: string[] = [];
  if (propertyMatchCount > 0) { fit += Math.min(10, 4 + propertyMatchCount * 2); fitReasons.push(`${propertyMatchCount} imóvel(is) aderente(s)`); }
  if (lead.source) { fit += 3; fitReasons.push(`Origem identificada: ${lead.source}`); }
  if (lead.budget_min && lead.budget_max && lead.budget_min <= lead.budget_max) { fit += 2; fitReasons.push("Faixa financeira consistente"); }
  dimensions.push({ key: "fit", label: "Aderência comercial", score: Math.min(15, fit), maximum: 15, reasons: fitReasons });

  let score = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const createdDays = daysSince(lead.created_at, now);
  if (createdDays !== null && createdDays > 30 && activityCount === 0) { score -= 12; risks.push("Lead antigo sem interação registrada"); }
  if (lead.next_action_at && new Date(lead.next_action_at).getTime() < now) { score -= 6; risks.push("Próxima ação atrasada"); }
  if (["perdido", "lost"].includes(normalizedStatus)) score = Math.min(score, 20);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const confidence = Math.max(20, Math.min(100, Math.round(100 - missingData.length * 9 + Math.min(activityCount, 5) * 3)));
  const temperature = score >= 70 ? "quente" : score >= 40 ? "morno" : "frio";
  const nextBestAction = risks.includes("Próxima ação atrasada")
    ? "Executar o follow-up atrasado hoje e registrar o resultado."
    : !lead.phone && !lead.email
      ? "Completar um canal de contato válido antes de avançar a qualificação."
      : !lead.budget_max
        ? "Validar renda, entrada disponível e faixa de investimento sem prometer aprovação."
        : propertyMatchCount === 0
          ? "Revisar preferências e buscar unidades aderentes no estoque vigente."
          : activityCount === 0
            ? "Realizar o primeiro contato usando o imóvel com maior aderência."
            : opportunityCount === 0
              ? "Apresentar os melhores matches e abrir uma oportunidade para o interesse confirmado."
              : "Tratar a principal objeção e combinar a próxima etapa com data definida.";

  return { score, temperature, confidence, dimensions, strengths, missingData, risks, nextBestAction, recalculatedAt: new Date(now).toISOString() };
}
