/**
 * Kaizen — canal de melhoria contínua dos corretores.
 *
 * Qualquer pessoa da operação propõe uma ideia; a liderança avalia. O núcleo é
 * puro e testável: valida, classifica no quadrante impacto×esforço (quick wins
 * primeiro) e governa as transições de status. Nada aqui toca banco — a rota
 * persiste e aplica RBAC.
 */

export const KAIZEN_CATEGORIES = [
  "processo", "produto", "marketing", "atendimento", "tecnologia", "outro",
] as const;
export type KaizenCategory = (typeof KAIZEN_CATEGORIES)[number];

export const KAIZEN_STATUSES = [
  "nova", "em_analise", "aprovada", "implementada", "rejeitada",
] as const;
export type KaizenStatus = (typeof KAIZEN_STATUSES)[number];

export type KaizenInput = {
  title?: string;
  description?: string;
  category?: string;
  impact?: number; // 1..5 (percebido por quem propõe)
  effort?: number; // 1..5
};

export type KaizenIdea = {
  title: string;
  description: string;
  category: KaizenCategory;
  impact: number;
  effort: number;
};

export type KaizenValidation =
  | { ok: true; value: KaizenIdea }
  | { ok: false; error: string };

function clampScore(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

export function validateKaizen(input: KaizenInput): KaizenValidation {
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  if (title.length < 4) return { ok: false, error: "O título precisa de ao menos 4 caracteres." };
  if (title.length > 120) return { ok: false, error: "O título passou de 120 caracteres." };
  if (description.length < 10) return { ok: false, error: "Descreva a ideia com ao menos 10 caracteres." };
  if (description.length > 2000) return { ok: false, error: "A descrição passou de 2000 caracteres." };
  const raw = String(input.category ?? "outro").trim().toLowerCase();
  const category = (KAIZEN_CATEGORIES as readonly string[]).includes(raw) ? (raw as KaizenCategory) : "outro";
  return {
    ok: true,
    value: { title, description, category, impact: clampScore(input.impact), effort: clampScore(input.effort) },
  };
}

/** Prioridade = impacto / esforço. Quanto maior, mais "vale a pena agora". */
export function kaizenPriority(impact: number, effort: number): number {
  return Math.round((clampScore(impact) / Math.max(1, clampScore(effort))) * 100) / 100;
}

export type KaizenQuadrant = "quick_win" | "grande_aposta" | "incremental" | "evitar";

/** Matriz impacto×esforço — orienta a triagem da liderança. */
export function kaizenQuadrant(impact: number, effort: number): KaizenQuadrant {
  const hiImpact = clampScore(impact) >= 4;
  const loEffort = clampScore(effort) <= 2;
  if (hiImpact && loEffort) return "quick_win";
  if (hiImpact && !loEffort) return "grande_aposta";
  if (!hiImpact && loEffort) return "incremental";
  return "evitar";
}

/** Transições de status permitidas (governança do fluxo). */
export const KAIZEN_TRANSITIONS: Record<KaizenStatus, readonly KaizenStatus[]> = {
  nova: ["em_analise", "rejeitada"],
  em_analise: ["aprovada", "rejeitada"],
  aprovada: ["implementada", "rejeitada"],
  implementada: [],
  rejeitada: [],
};

export function canTransition(from: string, to: string): boolean {
  const list = KAIZEN_TRANSITIONS[from as KaizenStatus];
  return Array.isArray(list) && (list as readonly string[]).includes(to);
}

/** Rejeição exige motivo; demais decisões são livres. */
export function decisionRequiresReason(to: string): boolean {
  return to === "rejeitada";
}
