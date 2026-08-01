export const REVENUE_FUNNEL = [
  { key: "Lead", label: "Lead recebido" },
  { key: "QualifiedLead", label: "Lead qualificado" },
  { key: "Contact", label: "Contato realizado" },
  { key: "Schedule", label: "Visita marcada" },
  { key: "SubmitApplication", label: "Proposta" },
  { key: "ConvertedLead", label: "Venda" },
] as const;

export const REVENUE_POLICY = {
  timezone: "America/Sao_Paulo",
  nightWindow: "22:00–06:59",
  maximumAutomatedStage: "qualification",
  morningHandoff: true,
  oneLeadOneBroker: true,
  documentedConsentRequired: true,
  approvedTemplateRequired: true,
  officialWhatsAppOnly: true,
  optOutStopsImmediately: true,
  automaticAudienceChanges: false,
  directorDecisionRequired: true,
} as const;

export type IntegrationState = "operational" | "configured" | "pending" | "blocked";

export function detectRevenueInfrastructure(env: NodeJS.ProcessEnv = process.env) {
  const metaCore = Boolean(env.META_APP_SECRET && env.META_ADS_ACCESS_TOKEN);
  const conversionApi = Boolean(env.META_CONVERSIONS_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID);
  const webhook = Boolean(env.META_WEBHOOK_VERIFY_TOKEN && env.META_APP_SECRET);
  const whatsapp = Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_NIGHTLY_APPROACH_TEMPLATE);
  return {
    metaApi: { state: metaCore ? "configured" : "pending", detail: metaCore ? "Credenciais detectadas; teste real ainda determina operação." : "Credenciais essenciais ausentes." },
    leadAds: { state: metaCore && webhook ? "configured" : "pending", detail: "Página, formulário e assinatura leadgen exigem validação real." },
    webhook: { state: webhook ? "configured" : "pending", detail: webhook ? "Segredo e token de verificação detectados." : "Token de verificação ou segredo ausente." },
    conversionApi: { state: conversionApi ? "configured" : "blocked", detail: conversionApi ? "Pronta para teste de evento com deduplicação." : "Token de conversões ou conta de anúncios ausente." },
    andromeda: { state: conversionApi ? "configured" : "pending", detail: "Não é uma API direta: aprende com sinais de conversão entregues à Meta." },
    nightSales: { state: whatsapp ? "configured" : "blocked", detail: whatsapp ? "API oficial e template detectados; cada saída segue aprovação." : "WhatsApp oficial ou template aprovado não configurado." },
  } satisfies Record<string, { state: IntegrationState; detail: string }>;
}

