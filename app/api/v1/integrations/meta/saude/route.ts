/**
 * O PAINEL DA ENTRADA DA META — status, último evento, volume, erros, alarme.
 *
 * Antes desta rota, responder "as leads da Meta estão entrando?" exigia abrir o
 * Supabase e o Gerenciador de Anúncios lado a lado. O produto não sabia dizer.
 *
 * ── O que esta rota NÃO faz, de propósito ─────────────────────────────────
 *
 * Não consulta a Graph API. A represa (o que a Meta tem e o CRM não) vem de
 * `/api/v1/marketing/held-leads`, que já faz essa chamada cara e limitada por
 * cota. Aqui é leitura de banco: pode ser chamada a cada minuto por um vigia
 * sem gastar cota de ninguém. Quem quiser o número da Meta manda `represa` no
 * parâmetro; sem ele, o veredito usa a represa conhecida pelos eventos.
 */
import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { avaliarEntradaDaMeta, HORAS_ATE_MUDO } from "@/lib/meta/saude-da-entrada";
import { paginaDaOrganizacao } from "@/lib/meta/pagina-da-organizacao";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "meta.saude" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!["director", "superintendent", "manager", "admin"].includes(papel)) {
    return apiError("FORBIDDEN", "A saúde da entrada da Meta é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();
  const agora = new Date();

  const [fontes, ultimos, semDestino] = await Promise.all([
    admin.from("meta_lead_sources").select("page_id,form_id,name,active").eq("organization_id", organizationId).limit(1000),
    /**
     * DUAS DATAS, DOIS FATOS.
     *
     * `received_at` é quando a lead nasceu NA META — o backfill grava
     * `created_time` ali de propósito, para o histórico não mentir a idade.
     * `created_at` é quando o CRM registrou a linha.
     *
     * Confundi os dois na primeira versão e o painel disse "136h sem evento"
     * minutos depois de gravar 103. Para "a entrada está viva?" quem responde é
     * `created_at`; para "qual a lead mais nova?", `received_at`. Ordenar pela
     * errada faz o vigia medir a campanha quando devia medir o cano.
     */
    admin
      .from("meta_lead_events")
      .select("status,last_error,received_at,created_at,processed_at,lead_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin.from("meta_leads_sem_destino").select("motivo,created_at").limit(1000),
  ]);

  if (fontes.error) {
    return apiError("META_FONTES_INDISPONIVEIS", "Aplique a migração de Meta Lead Ads.", access.meta, { status: 503, headers: rate.headers });
  }
  // Erro ao ler eventos NÃO pode virar "zero eventos": seria o mesmo zero
  // fabricado que escondeu 103 leads por semanas.
  if (ultimos.error) {
    return apiError("META_EVENTOS_INDISPONIVEIS", `Não consegui ler o histórico de eventos: ${ultimos.error.message}`, access.meta, { status: 503, headers: rate.headers });
  }

  const eventos = ultimos.data ?? [];
  const fontesAtivas = (fontes.data ?? []).filter((f) => f.active).length;
  // "a entrada está viva?" → quando o CRM registrou pela última vez.
  const ultimoEventoEm = eventos[0]?.created_at ?? null;
  // "qual a lead mais nova?" → quando ela nasceu na Meta. Outro fato, outro campo.
  const leadMaisNovaEm = eventos.reduce<string | null>(
    (maior, e) => (!maior || new Date(e.received_at) > new Date(maior) ? e.received_at : maior),
    null,
  );

  // ── VOLUME por janela ────────────────────────────────────────────────────
  const desde = (horas: number) => new Date(agora.getTime() - horas * 3_600_000).getTime();
  // Volume é quanto ENTROU na janela. Contar por `received_at` faria uma
  // recuperação de leads antigas parecer semana sem movimento.
  const noPeriodo = (horas: number) => eventos.filter((e) => new Date(e.created_at).getTime() >= desde(horas));
  const volume = {
    ultimas24h: noPeriodo(24).length,
    ultimos7dias: noPeriodo(24 * 7).length,
    ultimos30dias: noPeriodo(24 * 30).length,
    total: eventos.length,
  };

  // ── ERROS, agrupados pela CAUSA e não pelo contador ─────────────────────
  // "7 falhas" não diz nada; "6 são contato que já existe e 1 é id inexistente"
  // diz que seis estão certas e uma precisa de olho.
  const porCausa = new Map<string, { qtd: number; ultimaEm: string }>();
  for (const e of eventos) {
    if (e.status !== "failed") continue;
    const causa = String(e.last_error ?? "sem causa registrada").slice(0, 120);
    const atual = porCausa.get(causa) ?? { qtd: 0, ultimaEm: e.created_at };
    atual.qtd += 1;
    if (new Date(e.created_at) > new Date(atual.ultimaEm)) atual.ultimaEm = e.created_at;
    porCausa.set(causa, atual);
  }
  const erros = [...porCausa.entries()]
    .map(([causa, v]) => ({
      causa,
      quantidade: v.qtd,
      ultimaEm: v.ultimaEm,
      // Contato repetido é a regra de lead única funcionando — contar isso como
      // "erro da Meta" faria a operação caçar um defeito que não existe.
      esperado: /já pertence a uma lead única/i.test(causa),
    }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const importados = eventos.filter((e) => e.status === "imported").length;
  const semVinculo = eventos.filter((e) => e.status === "imported" && !e.lead_id).length;

  // A represa REAL exige a Graph; quem chamar pode informá-la. Sem isso, o
  // substituto honesto é a fila sem destino, que é represa que já bateu à porta.
  const represaInformada = Number(new URL(request.url).searchParams.get("represa") ?? NaN);
  const semDestinoTotal = (semDestino.data ?? []).length;
  const represa = Number.isFinite(represaInformada) ? represaInformada : semDestinoTotal;

  const veredito = avaliarEntradaDaMeta({
    ultimoEventoEm,
    represa,
    fontesAtivas,
    agora: agora.toISOString(),
  });

  const pagina = await paginaDaOrganizacao(admin, organizationId);

  return apiSuccess({
    estado: veredito.estado,
    resumo: veredito.resumo,
    exigeAcao: veredito.exigeAcao,
    horasSemEvento: veredito.horasSemEvento,
    limiteDeHorasParaMudo: HORAS_ATE_MUDO,

    pagina: { pageId: pagina.pageId, ambigua: pagina.ambigua, paginasRegistradas: pagina.paginasDistintas },
    fontes: { ativas: fontesAtivas, registradas: (fontes.data ?? []).length },

    ultimoEventoEm,
    leadMaisNovaEm,
    volume,
    importados,
    // Importado sem lead é o pior estado silencioso: o contador sobe e ninguém
    // atende ninguém. Merece campo próprio, não uma nota de rodapé.
    importadosSemLead: semVinculo,
    semDestino: semDestinoTotal,
    represaConsiderada: represa,
    represaVeioDoParametro: Number.isFinite(represaInformada),

    erros,
    errosInesperados: erros.filter((e) => !e.esperado).reduce((s, e) => s + e.quantidade, 0),
  }, access.meta, { headers: rate.headers });
}
