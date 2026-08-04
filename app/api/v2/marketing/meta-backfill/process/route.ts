/**
 * O VIGIA QUE BUSCA AS LEADS DA META — porque nem toda Página tem webhook.
 *
 * ── Por que este worker existe ────────────────────────────────────────────
 *
 * Medido em 03/08/2026: a Página `1115087091694606` ("Inside Smart Apartment
 * Perdizes") concentra 85 dos anúncios ativos e produz de 5 a 15 leads POR DIA.
 * Ela NÃO tem inscrição `leadgen` — inscrever exige a tarefa MANAGE, e a
 * tentativa foi recusada com (#200) porque é Página de CLIENTE: só o dono (a
 * agência) concede administração.
 *
 * Sem webhook, o backfill deixa de ser resgate ocasional e vira a ÚNICA entrada.
 * E backfill que ninguém agenda é backfill que não roda — as 15 cadências
 * declaradas em `config/workers-schedule.json` não incluíam nenhuma que
 * buscasse lead na Meta. As leads da Inside dependiam de alguém lembrar de
 * clicar num botão, todo dia.
 *
 * ── Por que uma rota nova em vez de agendar a do diretor ─────────────────
 *
 * A rota de diretor exige `requireAccessContext` — sessão de usuário. Um cron
 * não tem sessão, e afrouxar aquela porta para o cron passar abriria a operação
 * inteira. Autenticações diferentes, mesma esteira: a lógica mora em
 * `lib/meta/backfill.ts` e as duas portas a chamam.
 *
 * ── A JANELA, e por que ela olha para trás ───────────────────────────────
 *
 * Puxa as últimas 48 horas, de hora em hora. A sobreposição é DE PROPÓSITO:
 * uma execução que falha não deixa buraco, porque a próxima cobre o mesmo
 * período. O custo da sobreposição é zero em lead nova — a unique de
 * `external_lead_id` transforma repetição em `duplicadas`, e um duplicado cuja
 * tarefa faltava ainda é REPARADO.
 *
 * Não puxa "tudo desde sempre": isso varreria 200+ leads históricas a cada
 * hora, gastaria cota da Graph sem necessidade e faria a operação achar que há
 * movimento onde não há. Represa histórica é decisão da diretoria, pela tela.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { executarBackfillMeta } from "@/lib/meta/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 48h de janela para 1h de cadência: falhar uma vez não abre buraco. */
const HORAS_DE_JANELA = 48;

export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  // O relógio começa ANTES da primeira decisão: `getSupabaseAdmin()` lança
  // quando falta a chave de serviço, e essa é exatamente a execução que sumiria
  // sem rastro.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "meta-backfill", rota: "/api/v2/marketing/meta-backfill/process", origem, iniciadoEm, desfecho, resposta, erro });

  const accessToken = process.env.META_LEAD_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!accessToken) {
    // Sem token não há como olhar. Isto é "não consegui", nunca "nada novo" — e
    // a diferença é o que separa um vigia honesto de um que nunca acende.
    const corpo = { ok: false, motivo: "token_ausente", error: "META_LEAD_ACCESS_TOKEN ausente no servidor." };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, "META_LEAD_ACCESS_TOKEN ausente") }, { status: 503 });
  }

  try {
    const admin = getSupabaseAdmin();

    // Todas as organizações que têm fonte Meta ativa. O worker é global: uma
    // organização nova não pode depender de alguém acrescentar uma linha aqui.
    const { data: fontes, error: erroDasFontes } = await admin
      .from("meta_lead_sources")
      .select("organization_id")
      .eq("active", true)
      .not("form_id", "is", null)
      .limit(1000);
    if (erroDasFontes) {
      logger.error("meta.backfill.vigia.fontes_ilegiveis", erroDasFontes, {});
      const corpo = { ok: false, motivo: "fontes_ilegiveis", error: erroDasFontes.message };
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, erroDasFontes.message) }, { status: 503 });
    }

    const organizacoes = [...new Set((fontes ?? []).map((f) => String(f.organization_id)))];
    if (!organizacoes.length) {
      // Nenhuma fonte ativa é estado LEGÍTIMO — e precisa deixar linha no livro,
      // senão "chamado 24 vezes e nada a fazer" fica idêntico a "nunca chamado".
      const corpo = { ok: true, organizacoes: 0, motivo: "nenhuma_fonte_ativa", duracaoMs: Date.now() - iniciadoEm };
      return NextResponse.json({ ...corpo, livro: await livro("sem_trabalho", corpo) });
    }

    const desde = Math.floor((Date.now() - HORAS_DE_JANELA * 3_600_000) / 1000);
    const porOrganizacao: Array<Record<string, unknown>> = [];
    let lidas = 0, enfileiradas = 0, duplicadas = 0, reparadas = 0, naoEnfileiradas = 0, comFalha = 0;

    for (const organizationId of organizacoes) {
      const r = await executarBackfillMeta({ admin, organizationId, sinceUnix: desde, accessToken, apiVersion });
      if ("erro" in r) {
        // Uma organização que falha não pode zerar as outras, nem sumir.
        porOrganizacao.push({ organizationId, erro: r.erro });
        comFalha += 1;
        continue;
      }
      lidas += r.lidas; enfileiradas += r.enfileiradas; duplicadas += r.duplicadas;
      reparadas += r.reparadas; naoEnfileiradas += r.naoEnfileiradas;
      comFalha += r.formulariosComFalha.length;
      porOrganizacao.push({
        organizationId, formularios: r.formularios, lidas: r.lidas, enfileiradas: r.enfileiradas,
        duplicadas: r.duplicadas, reparadas: r.reparadas, naoEnfileiradas: r.naoEnfileiradas,
        formulariosComFalha: r.formulariosComFalha,
      });
    }

    const corpo = {
      ok: true,
      janelaHoras: HORAS_DE_JANELA,
      desde: new Date(desde * 1000).toISOString(),
      organizacoes: organizacoes.length,
      lidas, enfileiradas, duplicadas, reparadas, naoEnfileiradas,
      // Sobreposição de janela faz `duplicadas` ser ALTO por desenho. O número
      // que diz se algo novo entrou é `enfileiradas`.
      comFalha,
      porOrganizacao,
      duracaoMs: Date.now() - iniciadoEm,
    };
    // "sem_trabalho" quando nada novo entrou: a sobreposição garante que a
    // maioria das execuções seja assim, e confundir isso com "ok" faria o livro
    // parecer movimentado quando está parado.
    const desfecho = enfileiradas > 0 ? "ok" : "sem_trabalho";
    return NextResponse.json({ ...corpo, livro: await livro(desfecho, corpo) });
  } catch (erro) {
    logger.error("meta.backfill.vigia.falhou", erro as Error, {});
    const corpo = { ok: false, motivo: "excecao", error: (erro as Error).message };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, (erro as Error).message) }, { status: 500 });
  }
}
