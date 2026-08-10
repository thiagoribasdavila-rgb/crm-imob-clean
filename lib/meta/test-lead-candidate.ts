export type MetaLeadRecord = {
  created_at: string | null;
  email: string | null;
  id: string;
  metadata: Record<string, unknown> | null;
  name: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
};

export type MetaLeadCandidate = {
  createdAt: string | null;
  hasConsent: boolean;
  hasEmail: boolean;
  hasOrigin: boolean;
  hasPhone: boolean;
  id: string;
  label: string;
  missing: string[];
  privacy: string;
  projectName: string;
  readinessPct: number;
  recommendedAction: string;
  riskLevel: "baixo" | "médio" | "alto";
  source: string;
  status: string;
};

export const metaLeadSelect = "id,name,email,phone,source,status,metadata,created_at";

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickBoolean(...values: unknown[]) {
  for (const value of values) {
    if (value === true) return true;
    if (
      typeof value === "string"
      && ["1", "true", "sim", "yes", "consentido", "authorized"].includes(value.trim().toLowerCase())
    ) return true;
  }
  return false;
}

function nestedMeta(metadata: Record<string, unknown>) {
  return {
    attribution: toObject(metadata.attribution),
    leadgen: toObject(metadata.leadgen),
    meta: toObject(metadata.meta),
    utm: toObject(metadata.utm),
  };
}

export function hasMetaOrigin(row: MetaLeadRecord) {
  const metadata = toObject(row.metadata);
  const { attribution, leadgen, meta, utm } = nestedMeta(metadata);
  const source = pickString(row.source, metadata.source, attribution.source, utm.utm_source);
  const originTokens = [
    source,
    pickString(meta.campaignId, meta.campaign_id, meta.campaignName, meta.adId, meta.ad_id, meta.formId, meta.form_id),
    pickString(attribution.campaignId, attribution.campaign_id, attribution.channel),
    pickString(leadgen.formId, leadgen.pageId),
  ].join(" ");

  return /meta|facebook|instagram|lead ads/i.test(originTokens);
}

function resolveProjectName(row: MetaLeadRecord) {
  const metadata = toObject(row.metadata);
  const { attribution, meta } = nestedMeta(metadata);

  return pickString(
    metadata.projectName,
    metadata.project_name,
    metadata.project,
    metadata.developmentName,
    metadata.development_name,
    meta.projectName,
    meta.project,
    attribution.projectName,
    attribution.project,
  ) || "Projeto ainda não vinculado";
}

function resolveConsent(row: MetaLeadRecord) {
  const metadata = toObject(row.metadata);
  const { attribution, leadgen, meta } = nestedMeta(metadata);

  return pickBoolean(
    metadata.dataSharingConsent,
    metadata.lgpdConsent,
    metadata.marketingConsent,
    metadata.allowMetaFeedback,
    metadata.consent,
    meta.dataSharingConsent,
    meta.lgpdConsent,
    meta.marketingConsent,
    meta.allowMetaFeedback,
    meta.consent,
    attribution.consent,
    leadgen.consent,
  );
}

function maskLeadName(name: string | null, id: string) {
  const firstName = name?.trim().split(/\s+/)[0] || "Lead";
  return `${firstName} · Meta #${id.slice(0, 8)}`;
}

function recommendedAction(missing: string[]) {
  if (missing.includes("consentimento")) return "Registrar consentimento/base legal antes do ensaio oficial.";
  if (missing.includes("telefone ou e-mail")) return "Completar identificador seguro antes de deduplicar.";
  if (missing.includes("origem Meta")) return "Reconectar campanha/conjunto/anúncio ou escolher lead Meta mais recente.";
  if (missing.includes("projeto")) return "Vincular projeto para orientar público, oferta e evento.";
  return "Pronta para handoff de ensaio oficial; nenhum evento foi enviado.";
}

export function buildMetaLeadCandidate(row: MetaLeadRecord): MetaLeadCandidate {
  const hasConsent = resolveConsent(row);
  const hasEmail = Boolean(row.email);
  const hasPhone = Boolean(row.phone);
  const hasOrigin = hasMetaOrigin(row);
  const projectName = resolveProjectName(row);
  const hasProject = projectName !== "Projeto ainda não vinculado";
  const missing = [
    hasConsent ? null : "consentimento",
    hasEmail || hasPhone ? null : "telefone ou e-mail",
    hasOrigin ? null : "origem Meta",
    hasProject ? null : "projeto",
  ].filter((item): item is string => Boolean(item));
  const readinessPct = Math.min(
    100,
    (hasConsent ? 30 : 0)
      + (hasEmail || hasPhone ? 30 : 0)
      + (hasOrigin ? 25 : 0)
      + (hasProject ? 15 : 0),
  );

  return {
    createdAt: row.created_at,
    hasConsent,
    hasEmail,
    hasOrigin,
    hasPhone,
    id: row.id,
    label: maskLeadName(row.name, row.id),
    missing,
    privacy: "Nome mascarado; telefone/e-mail não são expostos nesta tela.",
    projectName,
    readinessPct,
    recommendedAction: recommendedAction(missing),
    riskLevel: missing.length === 0 ? "baixo" : missing.length <= 2 ? "médio" : "alto",
    source: row.source || "origem não informada",
    status: row.status || "sem status",
  };
}

export function isMetaLeadReadyForDirectorApproval(candidate: MetaLeadCandidate) {
  return candidate.readinessPct === 100
    && candidate.riskLevel === "baixo"
    && candidate.missing.length === 0;
}
