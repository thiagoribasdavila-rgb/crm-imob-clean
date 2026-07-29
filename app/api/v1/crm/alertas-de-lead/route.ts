import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * QUANTAS LEADS CHEGARAM E AINDA NÃO FORAM VISTAS.
 *
 * ── O RECORTE POR PAPEL É APLICADO AQUI, EM CÓDIGO ───────────────────────────
 *
 * Corretor vê o que caiu na carteira DELE. Liderança vê isso mais as que
 * chegaram sem dono — que são problema de distribuição, não de ninguém em
 * particular.
 *
 * A leitura usa service_role e filtra por `destinatario_id` explicitamente, em
 * vez de deixar o RLS resolver. Não é atalho: é a correção de um defeito real.
 * A tela `/customers`, apagada nesta mesma entrega, delegava a fronteira ao RLS
 * de `leads` — cuja política `leads_org_access` é PERMISSIVE por organização e
 * faz OR com a política por dono, então "por organização" vence. Resultado
 * medido: um corretor com 195 leads recebia as 469 da imobiliária. A tabela
 * `lead_alerts` nasce com RLS negando tudo justamente para que esse caminho
 * não exista.
 *
 * ── O QUE ESTA ROTA NUNCA FAZ ────────────────────────────────────────────────
 *
 * Devolver zero quando não conseguiu ler. Falha de leitura vira 503, e o
 * cliente a traduz em "não medido" — nunca em "nenhuma lead nova", que é a
 * mentira mais cara possível aqui: ela confirma a falsa tranquilidade de uma
 * fila parada.
 */
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 120, windowMs: 60_000, scope: "crm.lead-alerts" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const perfilId = identity.access.profile.id;
  const lideranca = leLiderancaInteira(identity.access.profile);

  let consulta = admin
    .from("lead_alerts")
    .select("id,lead_id,destinatario_id,motivo,detectado_em", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("visto_em", null)
    .order("detectado_em", { ascending: false })
    .limit(50);

  consulta = lideranca
    // Liderança: as próprias e as órfãs. Lead que chegou sem dono precisa de
    // alguém para distribuí-la — se ninguém for avisado, ela espera para sempre.
    ? consulta.or(`destinatario_id.eq.${perfilId},destinatario_id.is.null`)
    : consulta.eq("destinatario_id", perfilId);

  const { data, count, error } = await consulta;
  if (error) {
    // 503 e não 200-com-zero: o cliente precisa conseguir distinguir
    // "não chegou nada" de "não consegui olhar".
    return apiError("LEAD_ALERTS_READ_FAILED", "Não foi possível verificar as chegadas agora.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  const pendentes = data ?? [];
  return apiSuccess(
    {
      escopo: lideranca ? "organizacao" : "carteira",
      novas: count ?? pendentes.length,
      // Distinguir as duas origens importa para a frase da tela: "chegou" e
      // "passou a ser sua" são eventos diferentes para quem lê.
      porMotivo: {
        criacao: pendentes.filter((linha) => linha.motivo === "criacao").length,
        atribuicao: pendentes.filter((linha) => linha.motivo === "atribuicao").length,
      },
      maisRecenteEm: pendentes[0]?.detectado_em ?? null,
      leadIds: pendentes.slice(0, 20).map((linha) => String(linha.lead_id)),
      // Carimbo de QUANDO foi medido, não booleano de "conectado": o cliente
      // rebaixa para "não medido" quando este instante envelhece.
      medidoEm: new Date().toISOString(),
    },
    identity.meta,
    { headers: rate.headers },
  );
}

/**
 * Marca como vistas. Chamado quando a pessoa abre a lista de leads — abrir a
 * lista É o ato de olhar; exigir um clique a mais em "marcar como lido" só
 * criaria uma pendência sobre a pendência.
 */
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "crm.lead-alerts.seen" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const perfilId = identity.access.profile.id;
  const lideranca = leLiderancaInteira(identity.access.profile);
  const agora = new Date().toISOString();

  let consulta = admin
    .from("lead_alerts")
    .update({ visto_em: agora })
    .eq("organization_id", organizationId)
    .is("visto_em", null);

  // O MESMO recorte da leitura. Se divergisse, alguém marcaria como visto o
  // aviso de outra pessoa — a classe de defeito que este repositório mais
  // pagou: a mesma regra escrita duas vezes.
  consulta = lideranca
    ? consulta.or(`destinatario_id.eq.${perfilId},destinatario_id.is.null`)
    : consulta.eq("destinatario_id", perfilId);

  const { error } = await consulta;
  if (error) {
    return apiError("LEAD_ALERTS_ACK_FAILED", "Não foi possível registrar a leitura.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }
  return apiSuccess({ vistoEm: agora }, identity.meta, { headers: rate.headers });
}
