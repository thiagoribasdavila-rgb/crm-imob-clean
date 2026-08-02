import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { morningHandoff, nightlyWindow } from "@/lib/ai/governed-nightly-copilot";
export const dynamic = "force-dynamic";

/**
 * ENTREGA MATINAL AO CORRETOR.
 *
 * ── POR QUE ESTE ARQUIVO MUDOU EM 02/08/2026 ────────────────────────────────
 *
 * `nightly_broker_handoffs` estava em ZERO absoluto. Chamado à mão contra a
 * produção em 01/08, este vigia respondeu HTTP 200. Duzentos e nada escrito.
 *
 * A versão anterior tinha QUATRO caminhos que terminavam no mesmo `200
 * {created: 0}`, e três deles eram indistinguíveis entre si:
 *
 *   1. fora da janela de 7h–11h59  → dizia o motivo (este estava certo)
 *   2. nenhuma jornada elegível     → 200, silêncio
 *   3. a CONSULTA falhou            → 200, silêncio  ← `const { data: journeys }`
 *                                      jogava o `error` fora
 *   4. todos os INSERTs falharam    → 200, silêncio  ← `if (!error) created += 1`
 *                                      contava sucesso e engolia a falha
 *
 * Medido no banco em 02/08: `ai_sales_journeys` tem 0 linhas. Ou seja, hoje o
 * caso verdadeiro é o 2 — o zero é honesto no resultado. Mas o código não sabia
 * disso: ele responderia a mesma coisa se o banco estivesse fora do ar.
 *
 * Isso importa porque o agendador (.github/workflows/atlas-vigias.yml) só olha
 * o código HTTP, e o arquivo dele promete: "um vigia que falha em silêncio é um
 * alerta que não existe — por isso este job fica VERMELHO". O agendador foi
 * construído para ficar vermelho; o vigia foi construído para nunca falhar.
 *
 * Agora os quatro caminhos são distinguíveis, e os dois que são falha de
 * verdade devolvem 500 — que é o que faz o agendador acender.
 *
 * O padrão vem de `app/api/v2/crm/first-contact-sla/process`, que já fazia
 * certo: `throw` no erro da consulta, try/catch em volta, 500 na saída.
 */
export async function POST(request: Request) {
  if (!process.env.ATLAS_CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.ATLAS_CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  // O relógio começa ANTES de qualquer decisão: "recusei por horário" também é
  // execução, e é justamente a que hoje some sem deixar rastro.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "nightly-handoff", rota: "/api/v2/ai/nightly-handoff", origem, iniciadoEm, desfecho, resposta, erro });

  const window = nightlyWindow();
  if (!window.morningHandoff) {
    const corpo = { created: 0, motivo: "fora_da_janela", detalhe: "Handoff disponível entre 7h e 11h59 em São Paulo." };
    return NextResponse.json({ ...corpo, livro: await livro("fora_da_janela", corpo) });
  }

  try {
    const admin = getSupabaseAdmin();
    const jornadas = await admin
      .from("ai_sales_journeys")
      .select("id,organization_id,lead_id,broker_id,stage,status,last_message_id,updated_at")
      .eq("morning_handoff_required", true)
      .in("status", ["pending_approval", "active", "waiting_customer", "waiting_broker", "paused"])
      .limit(500);
    // Sem isto, banco fora do ar e fila vazia respondiam a mesma coisa.
    if (jornadas.error) throw jornadas.error;

    const elegiveis = jornadas.data ?? [];
    let created = 0;
    let jaExistiam = 0;
    const falhas: { journeyId: string; code?: string }[] = [];

    for (const journey of elegiveis) {
      const [{ data: qualification }, { data: simulation }, { data: existing }] = await Promise.all([
        admin.from("lead_qualification_profiles").select("answered_count").eq("organization_id", journey.organization_id).eq("lead_id", journey.lead_id).maybeSingle(),
        admin.from("commercial_simulations").select("id").eq("organization_id", journey.organization_id).eq("lead_id", journey.lead_id).gt("valid_until", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("nightly_broker_handoffs").select("id").eq("journey_id", journey.id).eq("status", "pending").maybeSingle(),
      ]);
      if (existing) {
        jaExistiam += 1;
        continue;
      }
      const summary = morningHandoff({
        stage: journey.stage,
        status: journey.status,
        qualificationPercent: Math.round((Number(qualification?.answered_count || 0) / 8) * 100),
        hasSimulation: Boolean(simulation),
        lastActivityAt: journey.updated_at,
      });
      const priority = journey.status === "waiting_broker" ? "urgent" : summary.qualificationPercent >= 75 ? "high" : "normal";
      const { error } = await admin.from("nightly_broker_handoffs").insert({
        organization_id: journey.organization_id,
        journey_id: journey.id,
        lead_id: journey.lead_id,
        broker_id: journey.broker_id,
        summary_snapshot: summary,
        priority,
      });
      // A entrega que não foi criada é trabalho perdido em silêncio: o corretor
      // simplesmente não recebe aquela lead de manhã, e ninguém fica sabendo.
      if (error) falhas.push({ journeyId: journey.id, code: error.code });
      else created += 1;
    }

    const corpo = {
      created,
      elegiveis: elegiveis.length,
      jaExistiam,
      falhas: falhas.length,
      // `motivo` existe para que "não fiz nada" nunca mais seja ambíguo.
      motivo: falhas.length ? "insercoes_falharam" : elegiveis.length === 0 ? "sem_jornadas_elegiveis" : created ? "ok" : "todas_ja_existiam",
      window: "07:00–11:59 America/Sao_Paulo",
      // Contrato auditável: este vigia não manda mensagem nem cria proposta.
      messagesSent: false,
      proposalsCreated: false,
    };

    if (falhas.length) {
      logger.error("ai.nightly_handoff_insercoes_falharam", { falhas: falhas.length, primeiroCode: falhas[0]?.code });
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo) }, { status: 500 });
    }
    // `sem_trabalho` NÃO é falha: o vigia acordou, olhou a fila e não havia
    // ninguém para entregar. É exatamente o desfecho que hoje se confunde com
    // "nunca rodou".
    return NextResponse.json({ ...corpo, livro: await livro(created ? "ok" : "sem_trabalho", corpo) });
  } catch (erro) {
    logger.error("ai.nightly_handoff_worker_failed", erro);
    const registro = await livro("falhou", {}, String(erro));
    return NextResponse.json({ error: "Falha ao preparar a entrega matinal.", motivo: "excecao", livro: registro }, { status: 500 });
  }
}
