export const integrationCatalog = [
  { provider: "meta", name: "Meta Ads", group: "ads", capabilities: ["leads", "campaigns", "insights", "conversions", "audiences"] },
  { provider: "google_ads", name: "Google Ads", group: "ads", capabilities: ["campaigns", "keywords", "insights", "offline_conversions"] },
  { provider: "youtube", name: "YouTube Ads", group: "ads", capabilities: ["video_campaigns", "insights", "audiences", "conversions"] },
  { provider: "tiktok_ads", name: "TikTok Ads", group: "ads", capabilities: ["instant_forms", "campaigns", "insights", "events"] },
  { provider: "linkedin_ads", name: "LinkedIn Ads", group: "ads", capabilities: ["lead_forms", "campaigns", "insights"] },
  { provider: "zap_imoveis", name: "ZAP Imóveis", group: "portals", capabilities: ["listings", "leads", "inventory"] },
  { provider: "vivareal", name: "Viva Real", group: "portals", capabilities: ["listings", "leads", "inventory"] },
  { provider: "olx_imoveis", name: "OLX Imóveis", group: "portals", capabilities: ["listings", "leads", "inventory"] },
  { provider: "quintoandar", name: "QuintoAndar", group: "portals", capabilities: ["listings", "leads"] },
  { provider: "imovelweb", name: "Imovelweb", group: "portals", capabilities: ["listings", "leads", "inventory"] },
  { provider: "chavesnamao", name: "Chaves na Mão", group: "portals", capabilities: ["listings", "leads"] },
  { provider: "website", name: "Site próprio", group: "owned", capabilities: ["forms", "listings", "events", "webhooks"] },
  { provider: "webhook", name: "Webhook universal", group: "automation", capabilities: ["inbound", "outbound", "signatures", "retries"] },
] as const;

export type IntegrationProvider = (typeof integrationCatalog)[number]["provider"];
export const integrationProviders = new Set<string>(integrationCatalog.map((item) => item.provider));
