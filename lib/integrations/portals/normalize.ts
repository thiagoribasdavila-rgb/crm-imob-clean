// Normaliza o payload de lead de um portal imobiliário para um contrato único,
// tolerante às variações de nome de campo entre ZAP/Viva Real (Grupo OLX) e
// os demais portais. Não faz I/O — apenas mapeia dados já recebidos.

export type PortalNormalizedLead = {
  externalLeadId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  listingId: string | null;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pick(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function onlyDigits(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

// ZAP/Viva Real e os demais portais entregam o lead ora achatado, ora aninhado
// sob lead/client/contact; unimos essas camadas antes de extrair os campos.
function normalizeGeneric(payload: unknown): PortalNormalizedLead {
  const root = asRecord(payload);
  const contact = { ...root, ...asRecord(root.lead), ...asRecord(root.client), ...asRecord(root.contact) };
  const listing = { ...asRecord(root.listing), ...asRecord(root.property), ...asRecord(root.imovel) };

  const areaCode = pick(contact, "ddd", "areaCode", "area_code");
  const rawPhone = pick(contact, "phone", "telephone", "telefone", "celular", "mobile", "phoneNumber", "phone_number");
  const phone = onlyDigits([areaCode, rawPhone].filter(Boolean).join("")) ?? onlyDigits(rawPhone);

  return {
    externalLeadId:
      pick(root, "leadId", "lead_id", "id", "protocol", "protocolo") ??
      pick(contact, "leadId", "lead_id", "id"),
    name: pick(contact, "name", "nome", "fullName", "full_name", "clientName"),
    email: pick(contact, "email", "e-mail", "mail"),
    phone,
    message:
      pick(root, "message", "mensagem", "comment", "comentario", "observacao") ??
      pick(contact, "message", "mensagem", "comment"),
    listingId:
      pick(listing, "id", "listingId", "externalId", "codigo", "code") ??
      pick(root, "listingId", "listing_id", "propertyId", "imovelId", "codigoImovel"),
    raw: root,
  };
}

const providerNormalizers: Record<string, (payload: unknown) => PortalNormalizedLead> = {
  zap_imoveis: normalizeGeneric,
  vivareal: normalizeGeneric,
  olx_imoveis: normalizeGeneric,
  quintoandar: normalizeGeneric,
  imovelweb: normalizeGeneric,
  chavesnamao: normalizeGeneric,
};

export function normalizePortalLead(provider: string, payload: unknown): PortalNormalizedLead {
  return (providerNormalizers[provider] ?? normalizeGeneric)(payload);
}
