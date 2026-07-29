import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { aplicarPisoDeCarteira } from "@/lib/crm/escopo-de-leitura";
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

/**
 * A recusa de "esta lead não é sua", com identidade própria.
 *
 * Ela precisa ser RECONHECÍVEL pelo `catch` de cada rota: as rotas escolhem o
 * status HTTP testando palavras da mensagem, e nessa régua a primeira condição
 * já captura `escopo` para 401 — nenhuma frase consegue produzir 403 por ali.
 * Recusa de autorização chegando como 401 manda a tela deslogar o corretor, e
 * como 400 manda ele "corrigir os dados". As duas saídas são falsas.
 */
export class LeadForaDaCarteiraError extends Error {
  constructor() {
    super("Esta lead está com outra pessoa — ela não aparece na sua carteira.");
    this.name = "LeadForaDaCarteiraError";
  }
}

export function ehLeadForaDaCarteira(error: unknown): error is LeadForaDaCarteiraError {
  return error instanceof LeadForaDaCarteiraError;
}

/**
 * O PISO DE CARTEIRA NA ESCRITA — e não só na leitura.
 *
 * ── O DEFEITO QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * Esta função conferia ORGANIZAÇÃO, nunca dono: `id` + `organization_id`. O
 * SELECT era feito com o cliente do usuário, e parecia que o RLS terminaria o
 * serviço — mas em `leads` as políticas permissivas se somam por OR, e a
 * política de organização inteira engole as comerciais. Resultado: o "ok" desta
 * função queria dizer apenas "é da mesma empresa".
 *
 * Depois desse ok, as rotas escrevem com a chave de serviço filtrando por
 * `id` + `organization_id`. O dono nunca entrava no WHERE.
 *
 * MEDIDO EM 2026-07-29 com sessão real de um corretor descartável de carteira
 * vazia, contra a lead de um colega (as linhas foram relidas do banco depois de
 * cada verbo, não só o HTTP):
 *   PATCH /api/v1/leads/{id} .................. 200 · nome, telefone, notas e
 *                                               orçamento sobrescritos
 *   PATCH /api/v1/leads/{id} {status} ......... 200 · novo → contato → perdido
 *                                               (descarte pela porta lateral)
 *   POST  /api/v1/leads/{id}/qualify .......... 200 · score_ia e temperatura
 *   POST  /api/v1/leads/{id}/first-contact .... 201 · SLA do colega fechado
 *   POST  /api/v1/leads/{id}/visits ........... 201 · visita criada com
 *                                               broker_id = O COLEGA
 * O Kanban recusava a MESMA movimentação com 403 porque a RPC reconfere o ator
 * no banco. Porta da frente trancada, porta lateral aberta: é a classe
 * "caminhos divergentes" que já mordeu este repositório três vezes.
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────────
 *
 * O recorte vem de lib/crm/escopo-de-leitura — o mesmo que a listagem e o
 * Kanban aplicam. Liderança segue enxergando o funil inteiro; quem lê só a
 * própria carteira só alcança a própria carteira, mais a lead sem dono, que
 * precisa continuar alcançável para ser adotada.
 */
export async function requireLeadAccess(identity: ApiIdentity, leadId: string) {
  const consulta = identity.supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("organization_id", identity.organizationId);
  const comPiso = aplicarPisoDeCarteira(
    consulta,
    { commercialRole: identity.commercialRole, role: identity.role },
    identity.userId,
  );
  const { data, error } = await comPiso.maybeSingle();
  if (error || !data) throw new LeadForaDaCarteiraError();
}
