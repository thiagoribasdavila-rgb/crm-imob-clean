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

  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  // ── POR QUE ESTAS DUAS MENSAGENS SÃO ASSIM ────────────────────────────────
  //
  // Todo usuário criado depois do primeiro nasce `active = false` (o gatilho
  // `handle_new_auth_user` faz `active = primeiro_perfil`). É trava de segurança
  // correta: ninguém entra sozinho numa empresa e começa a trabalhar.
  //
  // Só que as 51 rotas escolhem o status HTTP testando PALAVRAS da mensagem —
  // `token`, `sessão`, `autenticação`, `autoriz`, `organização`, `escopo`. Nem
  // "Perfil inativo." nem "Perfil comercial não encontrado." batiam com
  // nenhuma, então caíam no `: 500` de todas elas.
  //
  // Resultado medido na varredura: o corretor recém-criado recebia HTTP 500 —
  // "o servidor quebrou" — quando a verdade era "seu acesso ainda não foi
  // liberado". Erro de servidor não tem o que fazer; falta de autorização tem.
  //
  // As mensagens agora dizem o caminho E contêm `autoriz`, que as rotas já
  // reconhecem. Um contrato garante que toda recusa nova continue reconhecível.
  if (profileError || !profile) {
    deny(request, "Seu usuário não tem perfil comercial autorizado nesta empresa. O diretor cria o perfil em Configurações › Usuários.");
  }
  if (profile.active === false) {
    deny(request, "Seu acesso ainda não foi autorizado. Peça ao diretor para ativar seu usuário em Configurações › Usuários — é o passo que falta.");
  }
  let organizationId = uuid(profile.organization_id);
  let fallbackOrganizationApplied = false;
  if (!organizationId && process.env.ATLAS_ENV === "homologation") {
    organizationId = uuid(process.env.ATLAS_DEFAULT_ORGANIZATION_ID);
    fallbackOrganizationApplied = Boolean(organizationId);
  }
  if (!organizationId) deny(request, "Usuário sem organização vinculada.");

  const { data: organization, error: organizationError } = await admin
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
