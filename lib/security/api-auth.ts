import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type ApiIdentity = {
  userId: string;
  organizationId: string;
  role?: string;
  commercialRole?: string | null;
  supabase: SupabaseClient;
};

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
    .select("organization_id,role,commercial_role,active")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.organization_id) deny(request, "Usuário sem organização vinculada.");
  if (!profile.active) deny(request, "Perfil inativo.");

  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("id,active")
    .eq("id", profile.organization_id)
    .maybeSingle();
  if (organizationError || !organization) deny(request, "Organização não encontrada.");
  if (!organization.active) deny(request, "Organização inativa.");

  logger.info("api.access_granted", {
    path: routePath(request),
    organizationId: profile.organization_id,
    role: profile.commercial_role || profile.role,
  });

  return {
    userId: userData.user.id,
    organizationId: profile.organization_id,
    role: profile.role,
    commercialRole: profile.commercial_role,
    supabase: client,
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
