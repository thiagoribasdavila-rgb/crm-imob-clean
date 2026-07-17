import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ApiIdentity = {
  userId: string;
  organizationId: string;
  role?: string;
  commercialRole?: string | null;
  supabase: SupabaseClient;
  fallbackOrganizationApplied?: boolean;
};

const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : "";
const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();

function routePath(request: Request) {
  try { return new URL(request.url).pathname; } catch { return "unknown"; }
}

function deny(request: Request, reason: string): never {
  logger.warn("api.access_denied", { path: routePath(request), reason });
  throw new Error(reason);
}

export async function requireApiIdentity(request: Request): Promise<ApiIdentity> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicKey) deny(request, "Supabase público não configurado.");
  if (!token) deny(request, "Token de autenticação ausente.");

  const client = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) deny(request, "Sessão inválida ou expirada.");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) deny(request, "Perfil comercial não encontrado.");
  if (profile.active === false) deny(request, "Perfil inativo.");
  let organizationId = uuid(profile.organization_id);
  let fallbackOrganizationApplied = false;
  if (!organizationId && process.env.ATLAS_ENV === "homologation") {
    organizationId = uuid(process.env.ATLAS_DEFAULT_ORGANIZATION_ID);
    fallbackOrganizationApplied = Boolean(organizationId);
  }
  if (!organizationId) deny(request, "Usuário sem organização vinculada.");

  const organizationClient = fallbackOrganizationApplied ? getSupabaseAdmin() : client;
  const { data: organization, error: organizationError } = await organizationClient
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) deny(request, "Organização não encontrada.");
  const organizationActive = organization.active === true || (organization.active !== false && ["active", "ativo", "enabled"].includes(normalized(organization.status)));
  if (!organizationActive) deny(request, "Organização inativa.");

  if (fallbackOrganizationApplied) logger.warn("fallback organization applied", { path: routePath(request), userId: userData.user.id, organizationId });

  logger.info("api.access_granted", {
    path: routePath(request),
    organizationId: profile.organization_id,
    role: profile.commercial_role || profile.role,
  });

  return {
    userId: userData.user.id,
    organizationId,
    role: typeof profile.role === "string" ? normalized(profile.role) : "broker",
    commercialRole: typeof profile.commercial_role === "string" ? normalized(profile.commercial_role) : null,
    supabase: client,
    fallbackOrganizationApplied,
  };
}

export async function requireLeadAccess(identity: ApiIdentity, leadId: string) {
  const { data, error } = await identity.supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("organization_id", identity.organizationId)
    .maybeSingle();
  if (error || !data) throw new Error("Lead fora do seu escopo comercial.");
}
