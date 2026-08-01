export type ExperienceAssessment = {
  friction: boolean;
  signalType: "slow_response" | "service_complaint" | "broker_rejection" | "general_friction";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  recommendation: "keep_with_recovery" | "offer_broker_change" | "manager_review";
  evidence: string;
  suggestedReply: string;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function assessCustomerExperience(message: string): ExperienceAssessment {
  const text = normalize(message).slice(0, 2000);
  const brokerRejection = /(nao quero (mais )?(esse|este|o) corretor|trocar (de )?corretor|outro corretor|nao quero falar com ele|nao me atende)/.test(text);
  const serviceComplaint = /(pessim|horrivel|mal atendid|atendimento ruim|desrespeit|grosseir|enganad|mentiu|reclamacao)/.test(text);
  const slowResponse = /(demor|nao responde|nao retorn|sumiu|esperando ha|fiquei sem resposta)/.test(text);
  const frustration = /(insatisfeit|decepcionad|chatead|irritad|cansad|desisti por causa)/.test(text);
  const friction = brokerRejection || serviceComplaint || slowResponse || frustration;
  const signalType = brokerRejection ? "broker_rejection" : serviceComplaint ? "service_complaint" : slowResponse ? "slow_response" : "general_friction";
  const severity = brokerRejection || /desrespeit|enganad|mentiu/.test(text) ? "critical" : serviceComplaint ? "high" : slowResponse && frustration ? "high" : slowResponse ? "medium" : "low";
  const confidence = brokerRejection ? 96 : serviceComplaint ? 90 : slowResponse ? 84 : frustration ? 72 : 20;
  const recommendation = brokerRejection || severity === "critical" ? "offer_broker_change" : severity === "high" ? "manager_review" : "keep_with_recovery";
  const evidence = brokerRejection ? "Cliente mencionou rejeição ou troca do corretor." : serviceComplaint ? "Cliente relatou experiência negativa de atendimento." : slowResponse ? "Cliente relatou demora ou ausência de retorno." : frustration ? "Cliente demonstrou frustração com a experiência." : "Nenhum atrito explícito identificado.";
  const suggestedReply = recommendation === "offer_broker_change"
    ? "Sinto muito pela experiência. Posso manter o atendimento atual com acompanhamento da gestão ou encaminhar você para outro corretor. Qual opção prefere?"
    : "Sinto muito pela experiência. Vou acompanhar seu atendimento de perto e garantir um retorno objetivo. Podemos continuar por aqui?";
  return { friction, signalType, severity, confidence, recommendation, evidence, suggestedReply };
}
