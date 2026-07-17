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
  answers?: Record<string, string>;
  historicalMemories?: HistoricalMemory[];
};

export type HistoricalMemory = {
  source_file?: string | null;
  source_sheet?: string | null;
  commercial_facts?: Record<string, unknown> | null;
  excluded_sensitive_fields?: string[] | null;
  duplicate_group_size?: number | null;
  memory_role?: string | null;
  created_at?: string | null;
};

export type QualificationQuestion = { key: string; question: string; why: string; options?: Array<{ value: string; label: string }> };

export type LeadQualification = {
  score: number;
  temperature: "frio" | "morno" | "quente";
  confidence: number;
  dimensions: Array<{ key: string; label: string; score: number; maximum: number; reasons: string[] }>;
  strengths: string[];
  missingData: string[];
  risks: string[];
  nextBestAction: string;
  recommendedQuestions: QualificationQuestion[];
  recalculatedAt: string;
  historicalIntelligence: {
    adjustment: number;
    maximumAdjustment: number;
    dataConfidence: number;
    memoryCount: number;
    sourceCount: number;
    signals: string[];
    privacyGuard: string;
  };
};

function daysSince(date: string | null | undefined, now: number) {
  if (!date) return null;
  const parsed = new Date(date).getTime();
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 86400000)) : null;
}

export function qualifyRealEstateLead({ lead, activityCount, opportunityCount, propertyMatchCount, answers = {}, historicalMemories = [], now = Date.now() }: QualificationInput): LeadQualification {
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
  if (answers.financing) { profile += 3; strengths.push("Forma de pagamento conhecida"); } else missingData.push("Forma de pagamento");
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
  if (["ate_3_meses", "3_a_6_meses"].includes(answers.timeline)) { intent = Math.min(25, intent + 4); intentReasons.push("Prazo de compra próximo"); }
  dimensions.push({ key: "intent", label: "Intenção e avanço", score: intent, maximum: 25, reasons: intentReasons });

  let fit = 0;
  const fitReasons: string[] = [];
  if (propertyMatchCount > 0) { fit += Math.min(10, 4 + propertyMatchCount * 2); fitReasons.push(`${propertyMatchCount} imóvel(is) aderente(s)`); }
  if (lead.source) { fit += 3; fitReasons.push(`Origem identificada: ${lead.source}`); }
  if (lead.budget_min && lead.budget_max && lead.budget_min <= lead.budget_max) { fit += 2; fitReasons.push("Faixa financeira consistente"); }
  dimensions.push({ key: "fit", label: "Aderência comercial", score: Math.min(15, fit), maximum: 15, reasons: fitReasons });

  const sources = new Set(historicalMemories.map((memory) => `${memory.source_file ?? ""}:${memory.source_sheet ?? ""}`).filter((source) => source !== ":"));
  const factEntries = historicalMemories.flatMap((memory) => Object.entries(memory.commercial_facts ?? {}));
  const factKeys = new Set(factEntries.map(([key]) => key.toLowerCase()));
  const factValues = factEntries.map(([, value]) => String(value ?? "").toLowerCase());
  const sensitivePresence = new Set(historicalMemories.flatMap((memory) => memory.excluded_sensitive_fields ?? []).map((field) => field.toLowerCase()));
  const historicalSignals: string[] = [];
  let historicalAdjustment = 0;
  if (historicalMemories.length >= 2) { historicalAdjustment += 2; historicalSignals.push("Histórico comercial encontrado em mais de um registro"); }
  if (sources.size >= 2) { historicalAdjustment += 2; historicalSignals.push(`Presença consistente em ${sources.size} fontes comerciais`); }
  if ([...factKeys].some((key) => /campanha|anuncio|conjunto|criativo|origem|site/.test(key))) { historicalAdjustment += 2; historicalSignals.push("Origem de campanha ou anúncio rastreável"); }
  if (factValues.some((value) => /visita|proposta|negocia|reuni[aã]o|atendimento/.test(value))) { historicalAdjustment += 3; historicalSignals.push("Histórico registra avanço comercial relevante"); }
  if ([...factKeys].some((key) => /localizacao|cidade|bairro|regiao|estado/.test(key))) { historicalAdjustment += 1; historicalSignals.push("Preferência geográfica histórica disponível"); }
  historicalAdjustment = Math.min(10, historicalAdjustment);

  const usefulFactCount = factKeys.size;
  const contactConfidence = (lead.phone ? 18 : 0) + (lead.email ? 12 : 0);
  const historyConfidence = Math.min(35, historicalMemories.length * 5) + Math.min(20, sources.size * 5) + Math.min(15, usefulFactCount * 2);
  const documentReadiness = sensitivePresence.has("cpf") || sensitivePresence.has("cnpj") ? 5 : 0;
  const historicalDataConfidence = Math.min(100, 10 + contactConfidence + historyConfidence + documentReadiness);
  if (documentReadiness) historicalSignals.push("Documento consta na origem protegida e melhora somente a confiança cadastral");

  let score = dimensions.reduce((sum, dimension) => sum + dimension.score, 0) + historicalAdjustment;
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

  const recommendedQuestions: QualificationQuestion[] = [
    ...(!lead.purpose ? [{ key: "purpose", question: "O imóvel é para morar ou investir?", why: "Define produto, argumento e criativo.", options: [{ value: "moradia", label: "Morar" }, { value: "investimento", label: "Investir" }] }] : []),
    ...(!answers.timeline ? [{ key: "timeline", question: "Quando pretende comprar?", why: "É o sinal mais rápido de intenção real.", options: [{ value: "ate_3_meses", label: "Até 3 meses" }, { value: "3_a_6_meses", label: "3–6 meses" }, { value: "6_a_12_meses", label: "6–12 meses" }, { value: "sem_prazo", label: "Só pesquisando" }] }] : []),
    ...(!answers.financing ? [{ key: "financing", question: "Como pretende pagar?", why: "Direciona simulação e faixa viável sem prometer crédito.", options: [{ value: "financiamento", label: "Financiamento" }, { value: "recursos_proprios", label: "Recursos próprios" }, { value: "permuta", label: "Permuta + recursos" }, { value: "nao_definido", label: "Ainda não definiu" }] }] : []),
    ...(!lead.budget_max ? [{ key: "budget", question: "Qual faixa de investimento fica confortável?", why: "Evita apresentar produto incompatível." }] : []),
    ...(!lead.preferred_regions?.length ? [{ key: "region", question: "Quais regiões são prioridade e por quê?", why: "Separa preferência real de curiosidade." }] : []),
  ].slice(0, 3) as QualificationQuestion[];

  return {
    score, temperature, confidence, dimensions, strengths, missingData, risks, nextBestAction, recommendedQuestions,
    historicalIntelligence: {
      adjustment: historicalAdjustment,
      maximumAdjustment: 10,
      dataConfidence: historicalDataConfidence,
      memoryCount: historicalMemories.length,
      sourceCount: sources.size,
      signals: historicalSignals,
      privacyGuard: "CPF, CNPJ e endereço exato não entram no potencial comercial nem são enviados à IA.",
    },
    recalculatedAt: new Date(now).toISOString(),
  };
}
