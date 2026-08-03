import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { triarAlertasParaMarcar } from "@/lib/crm/alerta-que-nao-se-apaga";

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

  /**
   * QUEM CHEGOU — e por que o nome pode sair daqui.
   *
   * Até aqui esta rota devolvia só `leadIds`: a pastilha dizia "3" e o corretor
   * tinha que abrir a lista e procurar quais. Com SLA de primeiro contato de 5
   * minutos, o caminho "vejo um número → abro a lista → descubro quais → abro a
   * ficha" gasta o orçamento em navegação.
   *
   * O nome não é exposição nova: a consulta acima já filtra por
   * `destinatario_id = eu` (ou, para liderança, as órfãs, que ela enxerga no
   * funil inteiro de qualquer jeito). São leads da PRÓPRIA carteira de quem
   * pergunta — a mesma pessoa vê o nome, o telefone e o histórico inteiro ao
   * abrir a ficha.
   *
   * Telefone e e-mail continuam FORA: o aviso precisa identificar, não
   * qualificar. Menos dado no caminho quente é menos dado para vazar.
   */
  let chegadas: Array<{ leadId: string; nome: string; origem: string; esperaMinutos: number; motivo: string }> = [];
  if (pendentes.length) {
    const { data: leads } = await admin
      .from("leads")
      .select("id,name,source,created_at")
      .eq("organization_id", organizationId)
      .in("id", pendentes.slice(0, 20).map((linha) => String(linha.lead_id)))
      .limit(20);
    const porId = new Map((leads ?? []).map((lead) => [String(lead.id), lead]));
    chegadas = pendentes
      .slice(0, 20)
      .map((linha) => {
        const lead = porId.get(String(linha.lead_id));
        if (!lead) return null;
        const criadaEm = Date.parse(String(lead.created_at));
        return {
          leadId: String(lead.id),
          nome: String(lead.name || "Lead sem nome").slice(0, 60),
          origem: String(lead.source || "não informada").slice(0, 40),
          esperaMinutos: Number.isFinite(criadaEm) ? Math.max(0, Math.floor((Date.now() - criadaEm) / 60_000)) : 0,
          motivo: String(linha.motivo),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  return apiSuccess(
    {
      escopo: lideranca ? "organizacao" : "carteira",
      novas: count ?? pendentes.length,
      // A lista que permite ir direto à ficha, sem passar pela lista de leads.
      chegadas,
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
 * Marca como vistas — MENOS as que continuam de pé.
 *
 * ── O defeito que este bloco corrige, e ele era desta rota ────────────────
 *
 * Abrir a lista carimbava TUDO. Medido em 03/08/2026: quatro leads da Inside
 * entraram às 15:31:03, :04, :06 e :07, e as quatro foram marcadas como vistas
 * às 16:41:49 — no mesmo segundo, 70 minutos depois. Não foram quatro pessoas
 * percebendo quatro leads: foi uma chamada a este POST. Três horas depois, as
 * quatro seguiam SEM DONO e o painel mostrava zero.
 *
 * O cabeçalho desta rota já dizia a regra certa sobre o GET: devolver zero sem
 * ter conseguido ler "confirma a falsa tranquilidade de uma fila parada". Este
 * POST fabricava a mesma tranquilidade pelo outro lado, e passou porque zero
 * parece bom.
 *
 * A distinção que faltava (em lib/crm/alerta-que-nao-se-apaga.ts): aviso de
 * FATO ("passou a ser sua") encerra-se ao ser lido; aviso de CONDIÇÃO ("chegou
 * e não tem dono") não, porque a condição continua. Ele só some quando alguém
 * assume a lead.
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

  // O MESMO recorte da leitura, aplicado na consulta abaixo. Se divergisse,
  // alguém marcaria como visto o aviso de outra pessoa — a classe de defeito
  // que este repositório mais pagou: a mesma regra escrita duas vezes.
  let pendentes = admin
    .from("lead_alerts")
    .select("id,lead_id,motivo,destinatario_id")
    .eq("organization_id", organizationId)
    .is("visto_em", null)
    .limit(1000);
  pendentes = lideranca
    ? pendentes.or(`destinatario_id.eq.${perfilId},destinatario_id.is.null`)
    : pendentes.eq("destinatario_id", perfilId);

  const { data: abertos, error: erroDaLeitura } = await pendentes;
  if (erroDaLeitura) {
    return apiError("LEAD_ALERTS_ACK_FAILED", "Não foi possível registrar a leitura.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }
  if (!abertos?.length) return apiSuccess({ vistoEm: agora, marcados: 0, persistentes: 0, motivo: null }, identity.meta, { headers: rate.headers });

  // Quais dessas leads AINDA estão sem dono. É esta pergunta — e não o texto do
  // aviso — que decide se a condição acabou.
  const leadIds = [...new Set(abertos.map((a) => String(a.lead_id)).filter(Boolean))];
  const { data: donos, error: erroDosDonos } = await admin
    .from("leads")
    .select("id,assigned_to")
    .eq("organization_id", organizationId)
    .in("id", leadIds)
    .limit(1000);
  if (erroDosDonos) {
    // Não conseguir saber quem tem dono NÃO pode virar "marque tudo": seria
    // exatamente o defeito de volta, agora por falha de leitura.
    return apiError("LEAD_ALERTS_ACK_FAILED", "Não consegui conferir quais leads já têm responsável.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }
  const semDono = new Set((donos ?? []).filter((l) => !l.assigned_to).map((l) => String(l.id)));

  const triagem = triarAlertasParaMarcar(
    abertos.map((a) => ({
      id: String(a.id),
      leadId: String(a.lead_id),
      motivo: String(a.motivo),
      destinatarioId: a.destinatario_id ? String(a.destinatario_id) : null,
      leadSemDono: semDono.has(String(a.lead_id)),
    })),
  );

  if (triagem.paraMarcar.length) {
    const { error } = await admin
      .from("lead_alerts")
      .update({ visto_em: agora })
      .eq("organization_id", organizationId)
      .is("visto_em", null)
      .in("id", triagem.paraMarcar);
    if (error) {
      return apiError("LEAD_ALERTS_ACK_FAILED", "Não foi possível registrar a leitura.", identity.meta, {
        status: 503,
        headers: rate.headers,
      });
    }
  }

  return apiSuccess(
    {
      vistoEm: agora,
      marcados: triagem.paraMarcar.length,
      // A tela precisa poder dizer por que o contador não zerou.
      persistentes: triagem.persistentes.length,
      motivo: triagem.motivoDaPersistencia,
    },
    identity.meta,
    { headers: rate.headers },
  );
}
