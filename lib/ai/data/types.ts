export type AtlasDataContext = {
  organizationId: string;
  userId: string;
};

export type LeadPriority = "hot" | "warm" | "cold";

export type AtlasLeadInsight = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  priority?: LeadPriority;
  score?: number;
  lastContactAt?: string | null;
};
