export type AtlasRole = "admin" | "manager" | "broker" | "marketing" | "developer" | "finance";
export type LeadTemperature = "frio" | "morno" | "quente";
export type LeadStage = "novo" | "contato" | "qualificacao" | "visita" | "proposta" | "contrato" | "ganho" | "perdido";

export interface AtlasLead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStage | string | null;
  temperature: LeadTemperature | string | null;
  score: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredRegions: string[];
  bedrooms: number | null;
  purpose: string | null;
  assignedTo: string | null;
  campaignId: string | null;
  lastInteractionAt: string | null;
  nextActionAt: string | null;
  notes: string | null;
}

export interface AtlasProperty {
  id: string;
  title: string | null;
  price: number | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  area: number | null;
  status: string | null;
}

export interface AtlasInsight {
  id: string;
  entityType: string;
  entityId: string | null;
  insightType: string;
  title: string;
  summary: string | null;
  score: number | null;
  confidence: number | null;
  recommendation: string | null;
}
