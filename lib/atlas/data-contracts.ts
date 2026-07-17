export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LEAD_STAGES = PIPELINE_STAGE_KEYS;
export type LeadStage = PipelineStageKey;

export function normalizeUuid(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeEmail(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized) ? normalized : null;
}

export function normalizePhoneE164(value: unknown, defaultCountryCode = "55") {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if ((digits.length === 10 || digits.length === 11) && defaultCountryCode) digits = `${defaultCountryCode}${digits}`;
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

export function normalizeIsoDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function moneyToCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToMoney(cents: unknown) {
  const normalized = Number(cents);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized / 100 : null;
}

export function normalizeBrazilianDocument(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{11}$|^\d{14}$/.test(digits) ? digits : null;
}

export function normalizeLeadStage(value: unknown): LeadStage | null {
  return canonicalPipelineStage(value);
}
import { PIPELINE_STAGE_KEYS, canonicalPipelineStage, type PipelineStageKey } from "@/lib/atlas/pipeline-stages";
