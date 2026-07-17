export type DataGapQuestion = { key: string; label: string; question: string; why: string; priority: "critical" | "high" | "medium"; action: "qualify" | "focus" | "navigate"; target: string; options?: Array<{ value: string; label: string }> };
type LeadForCompleteness = { name?: string | null; phone?: string | null; email?: string | null; purpose?: string | null; budget_min?: number | null; budget_max?: number | null; preferred_regions?: string[] | null; bedrooms?: number | null; development_id?: string | null; next_action_at?: string | null; metadata?: unknown };

export function assessLeadCompleteness(lead: LeadForCompleteness, hasInteraction: boolean) {
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
  const answers = metadata.qualificationAnswers && typeof metadata.qualificationAnswers === "object" ? metadata.qualificationAnswers as Record<string, string> : {};
  const fields = [
    { key: "name", label: "nome", complete: Boolean(lead.name), weight: 10 }, { key: "contact", label: "telefone ou e-mail", complete: Boolean(lead.phone || lead.email), weight: 18 },
    { key: "purpose", label: "finalidade da compra", complete: Boolean(lead.purpose || answers.purpose), weight: 12 }, { key: "timeline", label: "prazo de compra", complete: Boolean(answers.timeline), weight: 12 },
    { key: "financing", label: "forma de pagamento", complete: Boolean(answers.financing), weight: 10 }, { key: "budget", label: "faixa de investimento", complete: lead.budget_min != null || lead.budget_max != null, weight: 12 },
    { key: "regions", label: "região de preferência", complete: Boolean(lead.preferred_regions?.length), weight: 8 }, { key: "bedrooms", label: "quantidade de dormitórios", complete: lead.bedrooms != null, weight: 5 },
    { key: "development", label: "projeto de interesse", complete: Boolean(lead.development_id), weight: 5 }, { key: "interaction", label: "interação registrada", complete: hasInteraction, weight: 4 },
    { key: "next_action", label: "próxima ação com data", complete: Boolean(lead.next_action_at), weight: 4 },
  ];
  const questions: DataGapQuestion[] = [
    ...(!lead.phone && !lead.email ? [{ key: "contact", label: "Canal válido", question: "Qual é o melhor telefone ou e-mail para continuar o atendimento?", why: "Sem um canal válido não existe continuidade comercial segura.", priority: "critical" as const, action: "focus" as const, target: "phone" }] : []),
    ...(!lead.purpose && !answers.purpose ? [{ key: "purpose", label: "Objetivo", question: "O imóvel é para morar ou investir?", why: "Define produto, argumento e abordagem.", priority: "high" as const, action: "qualify" as const, target: "purpose", options: [{ value: "moradia", label: "Morar" }, { value: "investimento", label: "Investir" }] }] : []),
    ...(!answers.timeline ? [{ key: "timeline", label: "Prazo", question: "Quando pretende comprar?", why: "É um dos sinais mais fortes de intenção e urgência.", priority: "high" as const, action: "qualify" as const, target: "timeline", options: [{ value: "ate_3_meses", label: "Até 3 meses" }, { value: "3_a_6_meses", label: "3–6 meses" }, { value: "6_a_12_meses", label: "6–12 meses" }, { value: "sem_prazo", label: "Só pesquisando" }] }] : []),
    ...(!answers.financing ? [{ key: "financing", label: "Pagamento", question: "Como pretende pagar?", why: "Direciona a simulação sem prometer aprovação de crédito.", priority: "high" as const, action: "qualify" as const, target: "financing", options: [{ value: "financiamento", label: "Financiamento" }, { value: "recursos_proprios", label: "Recursos próprios" }, { value: "permuta", label: "Permuta + recursos" }, { value: "nao_definido", label: "Não definiu" }] }] : []),
    ...(lead.budget_min == null && lead.budget_max == null ? [{ key: "budget", label: "Investimento", question: "Qual faixa de investimento fica confortável?", why: "Evita apresentar produtos incompatíveis.", priority: "high" as const, action: "focus" as const, target: "budget_max" }] : []),
    ...(!lead.preferred_regions?.length ? [{ key: "regions", label: "Região", question: "Quais regiões são prioridade e por quê?", why: "Melhora o matching e revela necessidades de mobilidade.", priority: "medium" as const, action: "focus" as const, target: "preferred_regions" }] : []),
    ...(lead.bedrooms == null ? [{ key: "bedrooms", label: "Tipologia", question: "Quantos dormitórios atendem sua necessidade?", why: "Elimina unidades que não servem ao cliente.", priority: "medium" as const, action: "focus" as const, target: "bedrooms" }] : []),
    ...(!lead.development_id ? [{ key: "development", label: "Projeto", question: "Já existe algum projeto de maior interesse?", why: "Conecta materiais, estoque e estudo da região.", priority: "medium" as const, action: "navigate" as const, target: "/developments" }] : []),
    ...(!lead.next_action_at ? [{ key: "next_action", label: "Compromisso", question: "Qual próxima etapa ficou combinada e para quando?", why: "Evita que uma conversa promissora seja esquecida.", priority: "medium" as const, action: "navigate" as const, target: "schedule" }] : []),
  ];
  const completedWeight = fields.filter((field) => field.complete).reduce((sum, field) => sum + field.weight, 0);
  return { fields, questions, completeness: completedWeight, completedFields: fields.filter((field) => field.complete).length, totalFields: fields.length, nextQuestion: questions[0] || null };
}
