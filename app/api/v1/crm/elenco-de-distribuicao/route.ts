import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * QUEM PARTICIPA DA FILA DE CADA PROJETO E DE CADA CAMPANHA.
 *
 * A regra vive em `lib/distribution/elenco-por-escopo.ts`, pura e testada. Esta
 * rota só lê e escreve as linhas — a decisão de quem recebe a lead continua na
 * cascata, no momento em que a lead entra.
 *
 * ── QUEM PODE MEXER, E POR QUÊ A DIFERENÇA ─────────────────────────────────
 *
 * LER ..... qualquer pessoa da organização. Saber quem atende o quê não é
 *           segredo dentro da casa — e o corretor precisa conseguir entender
 *           por que não recebeu a lead do Arvo.
 * ESCREVER  só liderança. Montar time é decisão de gestão; se o próprio
 *           corretor pudesse se incluir, o elenco deixaria de significar algo.
 *
 * A checagem de escrita é feita AQUI, em código, e a RLS da tabela repete a
 * mesma regra. Não é redundância inútil: esta rota usa `service_role`, que passa
 * por cima da RLS. A política existe para o dia em que alguém consultar a tabela
 * por outro caminho.
 *
 * ── O QUE ESTA ROTA NUNCA FAZ ──────────────────────────────────────────────
 *
 * Devolver lista vazia quando a leitura falhou. Elenco vazio significa "fila
 * aberta a toda a equipe" — é uma AFIRMAÇÃO sobre a operação, e afirmá-la por
 * causa de um erro de banco faria o gestor acreditar que ninguém foi cadastrado
 * quando o time está lá. Falha vira 503.
 */

const ESCOPOS = ["projeto", "campanha"] as const;
type Escopo = (typeof ESCOPOS)[number];

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "crm.elenco-distribuicao" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;

  const url = new URL(request.url);
  const escopo = url.searchParams.get("escopo");
  const escopoId = url.searchParams.get("escopoId");

  const admin = getSupabaseAdmin();
  let consulta = admin
    .from("distribution_roster")
    .select("id,escopo,escopo_id,profile_id,ativo,created_at")
    .eq("organization_id", organizationId);
  if (escopo && (ESCOPOS as readonly string[]).includes(escopo)) consulta = consulta.eq("escopo", escopo);
  if (escopoId) consulta = consulta.eq("escopo_id", escopoId);

  const { data, error } = await consulta.order("created_at", { ascending: true });
  if (error) {
    return apiError(
      "ELENCO_READ_FAILED",
      "Não foi possível ler o elenco de distribuição. A lista NÃO está vazia — ela não pôde ser lida.",
      identity.meta,
      { status: 503 },
    );
  }

  const linhas = data ?? [];
  return apiSuccess({
    membros: linhas.map((r) => ({
      id: r.id,
      escopo: r.escopo,
      escopoId: r.escopo_id,
      profileId: r.profile_id,
      ativo: r.ativo,
    })),
    total: linhas.length,
    // A frase que a tela mostra quando não há ninguém. Dizer "vazio" sem dizer o
    // que vazio SIGNIFICA já produziu confusão suficiente neste produto.
    significadoDeVazio:
      "Sem elenco cadastrado, a fila deste escopo fica aberta a toda a equipe — que é o comportamento padrão.",
  }, identity.meta);
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "crm.elenco-distribuicao.escrita" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;

  // A checagem por PAPEL acima já barra corretor. Esta segunda, pelo mesmo
  // predicado que o resto do produto usa para "vê o funil inteiro", existe
  // porque as duas listas podem divergir com o tempo — e a que manda em
  // "montar time" é esta.
  if (!leLiderancaInteira(identity.access.profile)) {
    return apiError("ELENCO_SEM_PERMISSAO", "Montar o elenco de distribuição é decisão de liderança.", identity.meta, { status: 403 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return apiError("ELENCO_CORPO_INVALIDO", "Corpo inválido: esperado JSON.", identity.meta, { status: 400 });
  }

  const { escopo, escopoId, profileId, ativo } = (corpo ?? {}) as Record<string, unknown>;

  // Validação explícita e por campo. Mensagem genérica obriga quem chama a
  // adivinhar qual dos quatro está errado.
  if (typeof escopo !== "string" || !(ESCOPOS as readonly string[]).includes(escopo)) {
    return apiError("ELENCO_ESCOPO_INVALIDO", `\`escopo\` deve ser um de: ${ESCOPOS.join(", ")}.`, identity.meta, { status: 400 });
  }
  if (typeof escopoId !== "string" || escopoId.trim().length === 0) {
    return apiError("ELENCO_ESCOPO_ID_AUSENTE", "`escopoId` é obrigatório: o id do empreendimento ou da campanha.", identity.meta, { status: 400 });
  }
  if (typeof profileId !== "string" || !/^[0-9a-f-]{36}$/i.test(profileId)) {
    return apiError("ELENCO_PERFIL_INVALIDO", "`profileId` deve ser o uuid do perfil do corretor.", identity.meta, { status: 400 });
  }
  const querAtivo = ativo === undefined ? true : Boolean(ativo);

  const admin = getSupabaseAdmin();

  // O perfil precisa ser DESTA organização. Sem esta checagem, um id válido de
  // outra empresa entraria no elenco — e a distribuição passaria a considerar
  // alguém que não deveria nem existir para esta operação.
  const { data: perfil, error: erroPerfil } = await admin
    .from("profiles")
    .select("id,organization_id,active")
    .eq("id", profileId)
    .maybeSingle();
  if (erroPerfil) return apiError("ELENCO_PERFIL_ILEGIVEL", "Não foi possível validar o perfil informado.", identity.meta, { status: 503 });
  if (!perfil || perfil.organization_id !== organizationId) {
    return apiError("ELENCO_PERFIL_DE_FORA", "Perfil não encontrado nesta organização.", identity.meta, { status: 404 });
  }

  const { data, error } = await admin
    .from("distribution_roster")
    .upsert(
      {
        organization_id: organizationId,
        escopo: escopo as Escopo,
        escopo_id: escopoId.trim(),
        profile_id: profileId,
        ativo: querAtivo,
        created_by: identity.access.profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,escopo,escopo_id,profile_id" },
    )
    .select("id,escopo,escopo_id,profile_id,ativo")
    .maybeSingle();

  if (error) return apiError("ELENCO_ESCRITA_FALHOU", "Não foi possível gravar o elenco agora.", identity.meta, { status: 503 });

  return apiSuccess({
    membro: data,
    // Um perfil inativo pode ser cadastrado de propósito (montar o time antes de
    // ativar a pessoa), mas quem está montando precisa saber.
    aviso: perfil.active === false
      ? "Este perfil está INATIVO: ele fica no elenco, mas não entra no rodízio enquanto não for ativado."
      : null,
  }, identity.meta);
}
