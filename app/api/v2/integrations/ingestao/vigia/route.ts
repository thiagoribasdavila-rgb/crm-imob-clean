import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { avaliarIngestao, historicoPorHora } from "@/lib/integrations/ingestao-parada";

export const dynamic = "force-dynamic";

/**
 * O VIGIA DA INGESTÃO — a integração que parou de produzir.
 *
 * ── O que foi medido em 03/08/2026 ──────────────────────────────────────────
 *
 * `meta_lead_events` recebeu a última linha às 15:29. Seis leads reais chegaram
 * na Meta entre 16:16 e 21:52 e NENHUMA entrou no CRM. Seis horas, e o silêncio
 * só foi percebido porque o dono do produto colou a lista da Meta no chat e
 * perguntou onde estavam as leads.
 *
 * O produto tinha painel de saúde de integrações. Ele media integração
 * CONFIGURADA — token presente, Página conectada, fonte ativa. Uma integração
 * perfeitamente configurada que parou de trazer lead passava por saudável em
 * todos os indicadores que existiam. Configurar não é o mesmo que funcionar.
 *
 * ── A REGRA MORA FORA DAQUI ─────────────────────────────────────────────────
 *
 * `lib/integrations/ingestao-parada.ts` decide, pura e testada: silêncio anômalo
 * (comparado com o histórico da MESMA faixa de horário, para não tocar toda
 * madrugada) ou evento entrando e não virando lead. Esta rota só busca os fatos
 * e grava o desfecho.
 *
 * ── ONDE O SINAL APARECE ────────────────────────────────────────────────────
 *
 * Três lugares, nenhum deles log solto — a mesma disciplina do vigia da carta
 * morta:
 *
 *   · o LIVRO (`atlas_worker_runs`), onde cada passagem grava o veredicto;
 *   · o AGENDADOR, que trata != 200 como falha e deixa o job vermelho;
 *   · o corpo da resposta, com a frase que diz O QUE conferir e em que ordem.
 *
 * O 500 com o vigia funcionando é deliberado: quem falhou é a ingestão que ele
 * vigia. Responder 200 com a entrada parada há seis horas seria exatamente a
 * doença que este vigia existe para curar.
 */

/** Dias de histórico usados para decidir se ESTA faixa de horário costuma ter movimento. */
const DIAS_OBSERVADOS = 14;

/** Janela para a taxa de falha: o suficiente para ter amostra, curto o bastante para ser "agora". */
const JANELA_DE_FALHA_HORAS = 6;

/**
 * O fuso da operação. A faixa de horário só significa alguma coisa no relógio de
 * quem trabalha: às 4h de São Paulo ninguém preenche formulário, e é isso que o
 * vigia precisa saber para não tocar de madrugada.
 */
const FUSO = "America/Sao_Paulo";
const horaLocal = (ms: number) =>
  Number(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: FUSO }).format(new Date(ms)));

export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  // O relógio começa antes do cliente do banco: `getSupabaseAdmin()` lança
  // quando falta a chave de serviço, e essa é justamente a execução que sumiria
  // sem rastro.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (
    desfecho: "ok" | "sem_trabalho" | "falhou",
    resposta: Record<string, unknown>,
    erro?: string,
  ) => registrarExecucao({
    vigia: "ingestao-parada",
    rota: "/api/v2/integrations/ingestao/vigia",
    origem,
    iniciadoEm,
    desfecho,
    resposta,
    erro,
  });

  try {
    const admin = getSupabaseAdmin();
    const agora = Date.now();
    const desde = new Date(agora - DIAS_OBSERVADOS * 24 * 60 * 60_000).toISOString();

    // Quais organizações têm fonte de lead da Meta cadastrada. Perguntar à
    // tabela de FONTES e não à de eventos é o ponto: uma organização cuja
    // ingestão nunca produziu não tem linha em `meta_lead_events` e sumiria da
    // varredura — que é exatamente o caso "nunca produziu" que precisa acender.
    const fontes = await admin
      .from("meta_lead_sources")
      .select("organization_id,active")
      .eq("active", true)
      .limit(2000);

    if (fontes.error) {
      logger.error("ingestao.fontes_ilegiveis", fontes.error, {});
      const corpo = { ok: false, motivo: "fontes_ilegiveis", erro: fontes.error.message };
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, fontes.error.message) }, { status: 503 });
    }

    const organizacoes = [...new Set((fontes.data ?? []).map((linha) => String(linha.organization_id)))];
    if (!organizacoes.length) {
      const corpo = { ok: true, organizacoes: 0, motivo: "nenhuma_fonte_meta_ativa", duracaoMs: Date.now() - iniciadoEm };
      return NextResponse.json({ ...corpo, livro: await livro("sem_trabalho", corpo) });
    }

    const acesos: Array<Record<string, unknown>> = [];
    const avaliadas: Array<Record<string, unknown>> = [];

    for (const organizationId of organizacoes) {
      // Os carimbos dos últimos 14 dias servem a DUAS perguntas: o último evento
      // (silêncio) e o histórico por faixa (se o silêncio é anômalo). Uma
      // consulta só para as duas.
      const eventos = await admin
        .from("meta_lead_events")
        .select("created_at,status")
        .eq("organization_id", organizationId)
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (eventos.error) {
        // Não conseguir ler NÃO vira "não há evento": seria declarar silêncio a
        // partir de uma falha de rede e acender um alarme falso — ou, pior,
        // apagar um verdadeiro.
        logger.error("ingestao.eventos_ilegiveis", eventos.error, { organizationId });
        avaliadas.push({ organizationId, ok: false, motivo: "eventos_ilegiveis" });
        continue;
      }

      const linhas = eventos.data ?? [];
      const carimbos = linhas.map((linha) => Date.parse(String(linha.created_at))).filter(Number.isFinite);
      const janela = agora - JANELA_DE_FALHA_HORAS * 60 * 60_000;
      const naJanela = linhas.filter((linha) => Date.parse(String(linha.created_at)) >= janela);

      const veredicto = avaliarIngestao({
        agora,
        ultimoEventoEm: carimbos.length ? Math.max(...carimbos) : null,
        horaAgora: horaLocal(agora),
        historico: historicoPorHora(carimbos, agora, DIAS_OBSERVADOS, horaLocal),
        processados: naJanela.length,
        falhados: naJanela.filter((linha) => String(linha.status) === "failed").length,
      });

      const resumo = {
        organizationId,
        acende: veredicto.acende,
        motivo: veredicto.motivo,
        porque: veredicto.porque,
        silencioEmMinutos: veredicto.silencioEmMinutos,
        eventosNaJanela: naJanela.length,
      };
      avaliadas.push(resumo);
      if (veredicto.acende) {
        acesos.push(resumo);
        logger.error("ingestao.parada", new Error(veredicto.porque), { organizationId, motivo: veredicto.motivo });
      }
    }

    const corpo = {
      ok: acesos.length === 0,
      organizacoes: organizacoes.length,
      acesos: acesos.length,
      alarmes: acesos,
      avaliadas,
      duracaoMs: Date.now() - iniciadoEm,
    };
    // 500 quando acende: é assim que o agendador transforma o alarme em job
    // vermelho. Um 200 aqui devolveria a ingestão ao silêncio de onde ela veio.
    return NextResponse.json(
      { ...corpo, livro: await livro(acesos.length ? "falhou" : "ok", corpo, acesos[0]?.porque as string | undefined) },
      { status: acesos.length ? 500 : 200 },
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida no vigia da ingestão.";
    logger.error("ingestao.vigia_falhou", erro instanceof Error ? erro : new Error(mensagem), {});
    const corpo = { ok: false, motivo: "vigia_falhou", erro: mensagem };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, mensagem) }, { status: 500 });
  }
}
