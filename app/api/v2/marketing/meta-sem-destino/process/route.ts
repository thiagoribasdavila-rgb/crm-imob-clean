import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

/**
 * RESGATE DAS LEADS DA META QUE CHEGARAM SEM DESTINO.
 *
 * Uma lead cai em `meta_leads_sem_destino` quando o webhook não sabe de qual
 * organização ela é — página ou formulário sem cadastro em
 * `meta_lead_sources`. Antes de essa tabela existir, ela virava só um log e se
 * perdia na rotação.
 *
 * ── POR QUE ISTO É UM WORKER E NÃO UM SCRIPT ─────────────────────────────────
 *
 * O script `scripts/meta-reprocessa-sem-destino.mjs` faz o mesmo, e continua
 * útil para rodar na mão com `--aplicar`. Mas depender dele significa depender
 * de alguém LEMBRAR de rodá-lo no dia em que a fonte for cadastrada — e o
 * próprio config/workers-schedule.json documenta essa armadilha: "a fila só
 * rodava se alguém lembrasse de criar uma linha de crontab".
 *
 * A lead guardada não avisa que está lá. Sem worker, ela espera para sempre.
 *
 * Cadência espaçada de propósito: o resgate só tem o que fazer DEPOIS que
 * alguém cadastra a fonte que faltava, o que é evento raro e manual. Rodar de
 * hora em hora é suficiente e o custo de uma execução vazia é uma consulta que
 * volta sem linhas.
 */
export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const admin = getSupabaseAdmin();
  const inicio = Date.now();

  const { data: pendentes, error } = await admin
    .from("meta_leads_sem_destino")
    .select("id,leadgen_id,page_id,form_id,ad_id,campaign_external_id,payload,received_at")
    .eq("resolvido", false)
    .order("received_at", { ascending: true })
    .limit(200);
  if (error) {
    logger.error("meta.sem_destino.leitura_falhou", error, {});
    return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
  }
  if (!pendentes?.length) {
    return NextResponse.json({ ok: true, pendentes: 0, resgatadas: 0, aindaSemFonte: 0, duracaoMs: Date.now() - inicio });
  }

  // Erro descartado aqui deixava `fontes` em `undefined`: nenhuma fonte para
  // casar, nenhuma lead resolvida, e o vigia respondendo 200 como se tivesse
  // varrido a fila. "Nao achei destino para ninguem" e "nao consegui ler as
  // fontes" viravam a mesma resposta.
  const fontesQuery = await admin
    .from("meta_lead_sources")
    .select("id,organization_id,page_id,form_id")
    .eq("active", true);
  if (fontesQuery.error) throw fontesQuery.error;
  const fontes = fontesQuery.data;

  let resgatadas = 0;
  let aindaSemFonte = 0;
  const paginasSemFonte = new Set<string>();

  for (const lead of pendentes) {
    // Casa pela página primeiro (é o que o webhook usa) e depois pelo
    // formulário; a fonte "curinga" (form_id nulo) atende qualquer formulário
    // daquela página.
    const daPagina = (fontes ?? []).filter((f) => String(f.page_id) === String(lead.page_id));
    const fonte = daPagina.find((f) => String(f.form_id) === String(lead.form_id))
      ?? daPagina.find((f) => !f.form_id);
    if (!fonte) {
      aindaSemFonte += 1;
      if (lead.page_id) paginasSemFonte.add(String(lead.page_id));
      continue;
    }

    const { data: evento, error: erroEvento } = await admin.from("meta_lead_events").insert({
      organization_id: fonte.organization_id,
      source_id: fonte.id,
      external_lead_id: lead.leadgen_id,
      page_id: lead.page_id,
      form_id: lead.form_id,
      ad_id: lead.ad_id,
      campaign_external_id: lead.campaign_external_id,
      payload: lead.payload,
      received_at: lead.received_at,
    }).select("id").single();

    // 23505 = a lead já entrou por outro caminho. Marcar como resolvida é o
    // certo; reprocessar criaria duplicata do que já existe.
    if (erroEvento && erroEvento.code !== "23505") {
      logger.warn("meta.sem_destino.evento_nao_criado", { leadgenId: lead.leadgen_id, erro: erroEvento.message });
      continue;
    }
    if (evento?.id) {
      const { error: erroFila } = await admin.from("integration_outbox").insert({
        organization_id: fonte.organization_id,
        topic: "meta.lead.fetch",
        aggregate_type: "meta_lead_event",
        aggregate_id: evento.id,
        payload: { leadgenId: lead.leadgen_id, sourceId: fonte.id },
      });
      // Fila cheia não desfaz o evento: o worker do outbox tem seu próprio
      // caminho de recuperação, e o evento já existir é o que impede a lead de
      // se perder de novo.
      if (erroFila && erroFila.code !== "23505") {
        logger.warn("meta.sem_destino.fila_nao_enfileirada", { leadgenId: lead.leadgen_id, erro: erroFila.message });
      }
    }

    // A lead so esta REALMENTE resolvida se a marcacao gravou. Sem conferir,
        // o contador subia e a lead continuava orfa na proxima rodada.
        const marcou = await admin.from("meta_leads_sem_destino")
      .update({ resolvido: true, resolvido_em: new Date().toISOString() })
      .eq("id", lead.id);
        if (marcou.error) throw marcou.error;
    resgatadas += 1;
  }

  const resultado = {
    ok: true,
    pendentes: pendentes.length,
    resgatadas,
    aindaSemFonte,
    // As páginas aparecem na resposta porque são ACIONÁVEIS: cada uma é uma
    // fonte que falta cadastrar, e sem esta lista alguém teria de ir cavar no
    // banco para descobrir quais.
    paginasSemFonte: [...paginasSemFonte],
    duracaoMs: Date.now() - inicio,
  };
  logger.info("meta.sem_destino.ciclo", resultado);
  return NextResponse.json(resultado);
}
