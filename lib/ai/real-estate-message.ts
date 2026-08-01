type MessageContext = {
  name: string;
  channel: "whatsapp" | "email";
  objective: string;
  tone: string;
  project?: string | null;
  nextAction?: string | null;
};

const riskyPatterns = [
  { pattern: /aprova(?:ção|do) garantid/gi, label: "Promessa de aprovação de crédito" },
  { pattern: /rentabilidade garantida/gi, label: "Promessa de rentabilidade" },
  { pattern: /última unidade/gi, label: "Escassez não validada" },
  { pattern: /menor preço|melhor preço garantido/gi, label: "Promessa de preço" },
  { pattern: /subsídio garantido/gi, label: "Promessa de subsídio" },
];

export function fallbackMessageDraft(context: MessageContext) {
  const firstName = context.name.trim().split(/\s+/)[0] || "Olá";
  const project = context.project ? ` sobre o ${context.project}` : "";
  if (context.channel === "email") {
    return `Assunto: Próximos passos do seu atendimento imobiliário\n\nOlá, ${firstName}.\n\nEstou acompanhando seu interesse${project} e gostaria de entender melhor o momento da sua busca para apresentar opções realmente aderentes ao seu perfil.\n\nPodemos revisar faixa de investimento, localização e prazo desejado? Preços e disponibilidade serão confirmados na tabela e no estoque vigentes.\n\nSe preferir, responda a este e-mail com o melhor horário para conversarmos.\n\nAtenciosamente,\nEquipe comercial`;
  }
  return `Olá, ${firstName}! Tudo bem? Estou acompanhando seu interesse${project}. Para eu separar opções realmente aderentes, posso confirmar sua faixa de investimento, região preferida e prazo de compra? Preços e disponibilidade serão validados no estoque vigente. Qual é o melhor horário para conversarmos?`;
}

export function auditMessageDraft(content: string) {
  const warnings = riskyPatterns.filter(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  }).map(({ label }) => label);
  return { warnings, safe: warnings.length === 0 };
}

