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

    const { batch, consent, blockers } = janela.value;
    resultado.eventosMontados += batch.events.length;
    resultado.semConsentimento += (consent.suppressedLeads.denied ?? 0) + (consent.suppressedLeads.unverifiable ?? 0);

    if (blockers.length) {
      resultado.bloqueados.push({ organizationId, motivo: blockers[0] });
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
