export type ProjectIntelligence = {
  onboarding_status: "study_pending" | "review_pending" | "ready" | "published";
  readiness_percent: number;
  region_study: Record<string, unknown>;
  commercial_brief: Record<string, unknown>;
  ai_context: Record<string, unknown>;
  source_register: Array<Record<string, unknown>>;
  missing_information: string[];
};

export function projectReadiness(profile: Partial<ProjectIntelligence> | null | undefined) {
  if (!profile) return { percent: 0, label: "Dossiê não iniciado", missing: ["dossiê do projeto"] };
  const missing = Array.isArray(profile.missing_information) ? profile.missing_information : [];
  const percent = Math.max(0, Math.min(100, Number(profile.readiness_percent ?? 0)));
  const label = percent >= 100 ? "Pronto para publicar" : percent >= 75 ? "Revisão final" : percent >= 40 ? "Em preparação" : "Estudo inicial";
  return { percent, label, missing };
}
