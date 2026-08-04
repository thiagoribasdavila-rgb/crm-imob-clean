/**
 * O NÚCLEO DO BACKFILL — uma implementação, duas portas.
 *
 * ── Por que este módulo existe ────────────────────────────────────────────
 *
 * O backfill nasceu como rota de diretor: alguém abre a tela, clica, e as leads
 * que ficaram para trás entram. Isso bastava enquanto TODA Página tinha webhook.
 *
 * Medido em 03/08/2026: a Página da Inside (`1115087091694606`) produz de 5 a 15
 * leads por dia e NÃO tem inscrição `leadgen` — a inscrição exige a tarefa
 * MANAGE, que só o dono da Página concede, e a tentativa foi recusada com
 * (#200). Sem webhook, o backfill deixa de ser resgate ocasional e vira a
 * ÚNICA entrada. E backfill que ninguém agenda é backfill que não roda: as 15
 * cadências declaradas em `config/workers-schedule.json` não incluíam nenhuma
 * que buscasse lead na Meta.
 *
 * Só que a rota de diretor exige `requireAccessContext` — sessão de usuário. Um
 * cron não tem sessão. As duas portas precisam de autenticações diferentes e da
 * MESMA lógica.
 *
 * Copiar a lógica para o worker seria o caminho curto e o erro conhecido: este
 * repositório já pagou caro por "caminhos divergentes" — uma RPC e um fallback
 * que discordaram na chave, duas telas lendo colunas diferentes para o mesmo
 * fato. Aqui a esteira nasce em um lugar só; as rotas são portas.
 *
 * ── O que este módulo NÃO faz ─────────────────────────────────────────────
 *
 * Não cria lead. Ele grava o evento em `meta_lead_events` e enfileira
 * `meta.lead.fetch` no outbox — exatamente o que o webhook faz ao receber. Quem
 * cria a lead é o worker do outbox. Uma esteira, dois gatilhos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { ensureMetaLeadFetchTask, ensureOutboxTask } from "@/lib/integrations/outbox-task";

export type GraphLead = {
  id: string;
  created_time?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  /** "fb" | "ig". Separa Facebook de Instagram sem depender da conta de anúncios. */
  platform?: string;
  /** true = veio de post orgânico, não de anúncio. Campanha nunca existirá. */
  is_organic?: boolean;
  field_data?: Array<{ name?: string; values?: string[] }>;
};
type GraphPage = { data?: GraphLead[]; paging?: { cursors?: { after?: string } }; error?: { message?: string } };

export type ResultadoDoBackfill = {
  formularios: number;
  lidas: number;
  enfileiradas: number;
  duplicadas: number;
  reparadas: number;
  naoEnfileiradas: number;
  /** Formulários cuja consulta à Graph falhou. Vazio NÃO é o mesmo que "não olhei". */
  formulariosComFalha: Array<{ formId: string; motivo: string }>;
  porFormulario: Array<{ formId: string; lidas: number; enfileiradas: number; duplicadas: number; reparadas: number; naoEnfileiradas: number }>;
};

/** Início do dia atual em America/Sao_Paulo (UTC-3), em unix seconds. */
export function inicioDeHojeSaoPaulo(agora = new Date()): number {
  const sp = new Date(agora.getTime() - 3 * 3_600_000);
  return Math.floor(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0) / 1000);
}

/**
 * Puxa da Graph tudo que entrou desde `sinceUnix` nos formulários ATIVOS da
 * organização, grava o evento e enfileira a tarefa.
 *
 * Idempotente: o evento tem unique em `external_lead_id`, e um duplicado cuja
 * tarefa faltava é REPARADO em vez de ignorado — "já ingerido" antes queria
 * dizer só "o evento existe", e sem tarefa no outbox o lead nunca virava
 * registro no CRM.
 */
export async function executarBackfillMeta(entrada: {
  admin: SupabaseClient;
  organizationId: string;
  sinceUnix: number;
  accessToken: string;
  apiVersion: string;
  /** Restringe a uma Página. Sem isto, todas as Páginas ativas da organização. */
  pageId?: string | null;
  /** Teto de páginas de cursor por formulário. 50 × 100 leads é o padrão. */
  maxPaginasPorFormulario?: number;
}): Promise<ResultadoDoBackfill | { erro: string }> {
  const { admin, organizationId, sinceUnix, accessToken, apiVersion } = entrada;
  const teto = entrada.maxPaginasPorFormulario ?? 50;

  let consulta = admin
    .from("meta_lead_sources")
    .select("id,page_id,form_id")
    .eq("organization_id", organizationId)
    .eq("active", true)
    // O backfill puxa POR FORMULÁRIO: a fonte pega-tudo (form_id nulo) não tem
    // endpoint na Graph para consultar.
    .not("form_id", "is", null)
    .limit(1000);
  if (entrada.pageId) consulta = consulta.eq("page_id", String(entrada.pageId));

  const { data: fontes, error } = await consulta;
  if (error) return { erro: `não consegui ler as fontes: ${error.message}` };
  if (!fontes?.length) return { erro: "nenhuma fonte Meta ativa com formulário registrado" };

  const filtro = encodeURIComponent(
    JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]),
  );
  const resultado: ResultadoDoBackfill = {
    formularios: fontes.length,
    lidas: 0, enfileiradas: 0, duplicadas: 0, reparadas: 0, naoEnfileiradas: 0,
    formulariosComFalha: [], porFormulario: [],
  };

  for (const fonte of fontes) {
    const formId = String(fonte.form_id);
    // A Graph API NÃO devolve atribuição por padrão. Medido em 2026-07-26, na
    // primeira ingestão real: sem `fields`, a resposta traz só id, created_time
    // e field_data — e as leads entraram sem formulário, sem plataforma e sem
    // campanha. O webhook recebe esses ids no payload; o backfill precisa PEDIR.
    const campos = "id,created_time,ad_id,adset_id,campaign_id,form_id,platform,is_organic,field_data";
    const base = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(formId)}/leads?limit=100&fields=${encodeURIComponent(campos)}&filtering=${filtro}`;
    let url: string | null = base;
    const doForm = { formId, lidas: 0, enfileiradas: 0, duplicadas: 0, reparadas: 0, naoEnfileiradas: 0 };
    let volta = 0;

    while (url && volta < teto) {
      volta += 1;
      let pagina: GraphPage;
      try {
        // Token SEMPRE por header, nunca na query string: a URL vai parar em log
        // de proxy e CDN.
        const resposta = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        pagina = (await resposta.json().catch(() => ({}))) as GraphPage;
        if (!resposta.ok || pagina.error) {
          const motivo = pagina.error?.message ?? `HTTP ${resposta.status}`;
          // Falha em UM formulário não pode zerar os outros — e não pode sumir:
          // um `break` mudo faria o operador ler "0 lidas" como "nada novo".
          resultado.formulariosComFalha.push({ formId, motivo });
          logger.error("meta.backfill.graph_failed", new Error(motivo), { formId, organizationId });
          break;
        }
      } catch (err) {
        const motivo = (err as Error).message;
        resultado.formulariosComFalha.push({ formId, motivo });
        logger.error("meta.backfill.graph_error", err as Error, { formId, organizationId });
        break;
      }

      for (const lead of pagina.data ?? []) {
        if (!lead.id) continue;
        doForm.lidas += 1;
        // `received_at` guarda quando a lead nasceu NA META, para o histórico
        // não mentir a idade. Quando o CRM registrou é `created_at`.
        const nasceuEm = lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString();
        const { data: inserido, error: erroDeInsercao } = await admin
          .from("meta_lead_events")
          .insert({
            organization_id: organizationId,
            source_id: fonte.id,
            external_lead_id: lead.id,
            page_id: fonte.page_id,
            form_id: formId,
            ad_id: lead.ad_id || null,
            adset_id: lead.adset_id || null,
            campaign_external_id: lead.campaign_id || null,
            payload: { ...lead, backfill: true },
            received_at: nasceuEm,
          })
          .select("id")
          .single();

        if (erroDeInsercao) {
          if (erroDeInsercao.code !== "23505") {
            logger.error("meta.backfill.persistence_failed", erroDeInsercao, { leadgenId: lead.id });
            doForm.naoEnfileiradas += 1;
            continue;
          }
          // Já ingerido — mas "ingerido" era só o EVENTO. Sem tarefa no outbox o
          // lead nunca vira registro no CRM, e o backfill existe justamente para
          // recuperar lead que ficou de fora.
          doForm.duplicadas += 1;
          const reparo = await ensureMetaLeadFetchTask(admin, { organizationId, externalLeadId: lead.id });
          if (!reparo.ok) {
            logger.error("meta.backfill.outbox_recovery_failed", new Error(reparo.reason), { leadgenId: lead.id, code: reparo.code });
            doForm.naoEnfileiradas += 1;
          } else if (reparo.state === "created") {
            doForm.reparadas += 1;
          }
          continue;
        }

        const enfileirado = await ensureOutboxTask(admin, {
          organizationId,
          topic: "meta.lead.fetch",
          aggregateType: "meta_lead_event",
          aggregateId: inserido.id,
          payload: { externalLeadId: lead.id },
        });
        // "enfileirada" significa ENFILEIRADA. Antes o erro do outbox nem era
        // conferido e o contador subia de qualquer jeito: o operador lia
        // "accepted: N" sobre leads que nenhum worker jamais buscaria.
        if (!enfileirado.ok) {
          logger.error("meta.backfill.outbox_failed", new Error(enfileirado.reason), { eventId: inserido.id, leadgenId: lead.id, code: enfileirado.code });
          doForm.naoEnfileiradas += 1;
          continue;
        }
        doForm.enfileiradas += 1;
      }

      // Cursor próprio em vez de seguir `paging.next` cru: o `next` da Meta traz
      // o token embutido na URL.
      const depois = pagina.paging?.cursors?.after;
      url = depois ? `${base}&after=${encodeURIComponent(depois)}` : null;
    }

    resultado.lidas += doForm.lidas;
    resultado.enfileiradas += doForm.enfileiradas;
    resultado.duplicadas += doForm.duplicadas;
    resultado.reparadas += doForm.reparadas;
    resultado.naoEnfileiradas += doForm.naoEnfileiradas;
    resultado.porFormulario.push(doForm);
  }

  logger.info("meta.backfill.completed", {
    organizationId, sinceUnix,
    lidas: resultado.lidas, enfileiradas: resultado.enfileiradas,
    duplicadas: resultado.duplicadas, naoEnfileiradas: resultado.naoEnfileiradas,
    formulariosComFalha: resultado.formulariosComFalha.length,
  });
  return resultado;
}
