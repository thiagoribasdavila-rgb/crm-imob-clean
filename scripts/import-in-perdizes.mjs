import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const organizationId = process.env.ATLAS_IMPORT_ORGANIZATION_ID;
if (!url || !serviceKey || !organizationId) throw new Error("Configure Supabase e ATLAS_IMPORT_ORGANIZATION_ID antes da importação.");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const project = {
  organization_id: organizationId,
  name: "IN Perdizes",
  developer_name: "Integra Desenvolvimento Urbano",
  neighborhood: "Perdizes",
  city: "São Paulo",
  state: "SP",
  status: "launch",
};

const sourceRegister = [
  { kind: "book", title: "Prospecto Digital — IN Perdizes", issuer: "Integra Desenvolvimento Urbano", reviewed: true },
  { kind: "price_table", title: "Tabela de vendas — junho/2026 R.01", issuer: "Integra Desenvolvimento Urbano", valid_from: "2026-06-01", reviewed: true },
];

const regionStudy = {
  status: "source_based_review_pending",
  address: "Rua Monte Alegre, 1540, esquina com Rua Professor João Arruda, Perdizes, São Paulo — SP",
  positioning: "Produto de 1 e 2 dormitórios em zona residencial de Perdizes, com proposta tecnológica e lazer incomum para a tipologia.",
  landmarks_from_book: ["PUC-SP Campus Monte Alegre", "Allianz Parque", "Hospital Albert Einstein Perdizes", "Teatro TUCA", "Parque da Água Branca", "Estádio do Pacaembu"],
  mobility_from_book: ["Futura Estação Perdizes — Linha 6-Laranja", "Futura Estação PUC-Cardoso de Almeida — Linha 6-Laranja"],
  verification_rule: "Distâncias, prazos de estações, preços de mercado e concorrentes precisam de fonte atual antes de uso pela IA.",
};

const commercialBrief = {
  product: { tower_count: 1, floors: 14, residential_units: 104, areas_m2: [27.21, 30.02, 41.62, 42.53, 43.03, 51.13, 67.48], bedrooms: [1, 2], total_parking_spaces: 55, autonomous_parking_spaces: 21 },
  differentiators: ["automação residencial Vivo Casa Inteligente", "terraço gourmet", "quadra de squash", "piscina climatizada", "garden spa", "reconhecimento facial na portaria", "coworking com fibra óptica", "infraestrutura para veículos elétricos", "lavanderia pay per use", "mini mercado", "dry car"],
  amenities: ["academia", "sauna", "yoga", "alongamento", "pet place", "central delivery", "bicicletário", "solarium", "deck molhado", "pub gourmet"],
  architecture: "Marcio Vaz", interiors: "Noss Arquitetura", landscaping: "Jéssica Sarl",
  price_table: { revision: "2026-06 R.01", opportunity_from_brl: 333158, residential_ceiling_brl: 800000, autonomous_parking_from_brl: 85292.15, autonomous_parking_to_brl: 121970.03, suspended_units_must_be_blocked: true },
};

const { data: existing } = await db.from("developments").select("id").eq("organization_id", organizationId).ilike("name", "IN Perdizes").maybeSingle();
let developmentId = existing?.id;
if (!developmentId) {
  const { data, error } = await db.from("developments").insert(project).select("id").single();
  if (error) throw error;
  developmentId = data.id;
}

const { error: profileError } = await db.from("project_intelligence_profiles").upsert({
  organization_id: organizationId,
  development_id: developmentId,
  onboarding_status: "review_pending",
  readiness_percent: 82,
  region_study: regionStudy,
  commercial_brief: commercialBrief,
  ai_context: { safe_to_generate: false, knowledge_status: "human_review_required", allowed_facts: ["region_study", "commercial_brief"], prohibited_assumptions: ["delivery_date", "construction_status", "current_travel_times", "future_station_opening_date", "unit_availability_without_current_sales_mirror"] },
  source_register: sourceRegister,
  missing_information: ["espelho de vendas vigente", "data de entrega", "fluxo de pagamento da incorporadora", "validação atual do estudo regional"],
  updated_at: new Date().toISOString(),
}, { onConflict: "organization_id,development_id" });
if (profileError) throw profileError;

console.log(JSON.stringify({ ok: true, developmentId, readinessPercent: 82, next: "Subir book/tabela no Hub e validar os quatro itens pendentes." }));
