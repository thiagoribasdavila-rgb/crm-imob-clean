export const AVAILABLE_STATUSES = new Set(["ativo", "available", "disponivel", "disponível", "livre", "em estoque"]);
export const BLOCKED_STATUSES = new Set(["vendido", "sold", "reservado", "reserved", "indisponivel", "indisponível", "inativo"]);

export function normalizePropertyStatus(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function isPropertyAvailable(value: string | null | undefined) {
  return AVAILABLE_STATUSES.has(normalizePropertyStatus(value));
}

export function isPropertyBlocked(value: string | null | undefined) {
  return BLOCKED_STATUSES.has(normalizePropertyStatus(value));
}
