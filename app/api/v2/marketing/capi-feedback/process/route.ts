import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { loadWindowBatch, loadOrgCapiConfig } from "@/lib/integrations/meta/capi-window";
import { sendCapiBatch } from "@/lib/integrations/meta/capi-feedback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * DEVOLVER A CONVERSÃO PARA A META — nível A1 (execução segura).
 *
 * ── O que estava quebrado ───────────────────────────────────────────────────
 *
 * A Meta sabe quem preencheu o formulário. Ela NÃO sabe quem virou visita,
 * proposta ou venda — isso está no CRM. Sem receber esse sinal de volta, ela
 * otimiza a entrega para gerar mais formulários preenchidos, que é o que ela
 * consegue medir. Você paga por lead que nunca ia fechar.
 *
 * O CAPI já estava construído inteiro. Mas o único caminho que enviava exigia
 * sessão humana de liderança, então não rodava por cron: virou um botão que
 * ninguém aperta. Medido antes deste worker: `meta_conversion_events` com
 * ZERO linhas. Nenhum evento jamais saiu.
 *
 * ── O que ele faz e o que não faz ───────────────────────────────────────────
 *
 * Faz: lê a janela de leads, aplica a MESMA régua de consentimento da rota
 * manual (mesmo código, `loadWindowBatch`), monta o lote e envia.
 *
 * Não faz: não cria, não pausa e não altera campanha; não move verba; não
 * escreve na lead. Ele devolve um sinal — quem decide o que fazer com ele é a
 * Meta, na entrega, e a liderança, na tela.
 *
 * ── Falha FECHADA ───────────────────────────────────────────────────────────
 *
 * Sem `ATLAS_META_CAPI_ENABLED=true`, sem token ou sem dataset, `sendCapiBatch`
 * recusa e devolve o motivo. O worker registra e sai com sucesso: um envio
 * bloqueado por configuração ausente não é falha do worker, e marcá-lo como
 * erro faria o alarme tocar todo dia até alguém desligar o alarme.
 *
 * Consentimento tem a mesma postura: quem não tem consentimento verificado não
 * entra no lote, e a lacuna é contada e declarada em vez de silenciada.
 */

/** Janela de leitura. 7 dias cobre o ciclo de qualificação sem reprocessar meses. */
const JANELA_DIAS = 7;

export async function POST() {
  const inicio = Date.now();
  const admin = getSupabaseAdmin();

  const { data: orgs, error: erroOrgs } = await admin
    .from("organizations")
    .select("id")
    .limit(200);

  if (erroOrgs) {
    logger.error("capi-feedback: não foi possível listar organizações", { erro: erroOrgs.message });
    return NextResponse.json({ ok: false, error: erroOrgs.message }, { status: 503 });
  }

  const resultado = {
    organizacoes: 0,
    eventosMontados: 0,
    eventosEnviados: 0,
    // Por que NÃO saiu — o número que evita o diagnóstico errado.
    bloqueados: [] as Array<{ organizationId: string; motivo: string }>,
    /** Supressões parciais: o lote saiu, mas alguém ficou de fora. */
    avisos: [] as Array<{ organizationId: string; motivo: string }>,
    semConsentimento: 0,
  };

  for (const org of orgs ?? []) {
    const organizationId = String(org.id);
    resultado.organizacoes += 1;

    const janela = await loadWindowBatch(admin, organizationId, JANELA_DIAS);
    if (!janela.ok) {
      resultado.bloqueados.push({ organizationId, motivo: `${janela.step}: ${janela.error.message ?? "erro"}` });
      continue;
    }

    const { batch, consent, blockers, impedimentos } = janela.value;
    resultado.eventosMontados += batch.events.length;
    resultado.semConsentimento += (consent.suppressedLeads.denied ?? 0) + (consent.suppressedLeads.unverifiable ?? 0);

    // Avisos de supressão parcial (uma venda sem valor, um lead sem
    // consentimento) são REGISTRADOS e o lote segue com o resto. Só
    // `impedimentos` para o envio: são os casos em que nada pode sair.
    for (const aviso of blockers) {
      if (!impedimentos.includes(aviso)) resultado.avisos.push({ organizationId, motivo: aviso });
    }
    if (impedimentos.length) {
      resultado.bloqueados.push({ organizationId, motivo: impedimentos[0] });
      continue;
    }
    if (!batch.events.length) continue;

    // Config DA organização. Sem linha, não envia — ausência não vira permissão,
    // e num produto multi-organização um dataset global mandaria a conversão de
    // uma imobiliária para o dataset de outra.
    const config = await loadOrgCapiConfig(admin, organizationId);
    if (!config) {
      resultado.bloqueados.push({ organizationId, motivo: "sem meta_conversion_configs para esta organização" });
      continue;
    }
    const envio = await sendCapiBatch(batch.events, config);
    if (envio.sent) {
      resultado.eventosEnviados += batch.events.length;
      // ── ENVIAR SEM REGISTRAR É ENVIAR ÀS CEGAS ───────────────────────────
      //
      // Este caminho mandava para a Meta e não gravava nada: `queueMetaConversion`
      // (ingestão) registrava, o worker não. Sem a linha local não há como
      // responder "esta venda já foi devolvida?" nem auditar o que saiu — e a
      // janela é de 7 dias, então o mesmo evento reentra em toda execução do
      // cron. A conversão não duplica (o `event_id` é determinístico e a Meta
      // deduplica por ele), mas o CRM ficava sem memória do próprio envio.
      //
      // Todo event_id carrega o id da lead: crm-qualcom-<id>, crm-discard-<id>,
      // crm-stage-<id>-ganho. É daí que sai o vínculo, sem carregar o id da
      // lead por dentro do payload que vai para terceiro.
      const linhas = batch.events
        .map((evento) => {
          const leadId = evento.event_id.match(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
          )?.[0];
          if (!leadId) return null;
          return {
            organization_id: organizationId,
            lead_id: leadId,
            event_name: evento.event_name,
            event_id: evento.event_id,
            action_source: "system_generated",
            // "delivered" e não "sent": o vocabulário da tabela é
            // pending|processing|delivered|failed|blocked|dead_letter. Inventar
            // um status a mais estourava o check e o evento saía sem registro —
            // exatamente o buraco que este bloco veio fechar.
            status: "delivered",
            occurred_at: new Date(evento.event_time * 1000).toISOString(),
          };
        })
        .filter((linha): linha is NonNullable<typeof linha> => linha !== null);
      if (linhas.length) {
        // `ignoreDuplicates` porque reenvio dentro da janela é esperado: o
        // registro é do FATO "este evento saiu", não de cada tentativa.
        const registro = await admin
          .from("meta_conversion_events")
          .upsert(linhas, { onConflict: "organization_id,event_id", ignoreDuplicates: true });
        if (registro.error) {
          // Falhar o registro NÃO desfaz o envio (já aconteceu) nem derruba o
          // worker: vira aviso, com o número que permite reconciliar depois.
          logger.warn("capi-feedback: evento enviado sem registro local", {
            organizationId, eventos: linhas.length, erro: registro.error.message,
          });
          resultado.avisos.push({
            organizationId,
            motivo: `envio_sem_registro_local: ${linhas.length} evento(s) saíram para a Meta mas não foram gravados em meta_conversion_events (${registro.error.message}).`,
          });
        }
      }
    } else {
      // `flag_disabled` e `missing_token` são configuração ausente, não falha:
      // registram e seguem. O worker não pode virar alarme que toca todo dia.
      resultado.bloqueados.push({ organizationId, motivo: envio.reason ?? "envio recusado" });
    }
  }

  logger.info("capi-feedback: ciclo concluído", {
    ...resultado,
    duracaoMs: Date.now() - inicio,
  });

  return NextResponse.json({
    ok: true,
    ...resultado,
    duracaoMs: Date.now() - inicio,
  });
}
