import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { importaInvestimentoDaMeta } from "@/lib/marketing/importa-investimento";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * REGISTRAR O DINHEIRO QUE JÁ SAIU.
 *
 * ── Por que este worker existe ──────────────────────────────────────────────
 *
 * Medido em 2026-07-31: a conta de anúncios da Meta acumula **R$ 3.612,01 em 30
 * dias**, em 7 campanhas, e `marketing_spend` tem **0 linhas**. Sete leitores no
 * produto — custo, stop-loss, desempenho de anúncio, briefing do diretor,
 * contexto de campanha da lead, qualidade de campanha e relatório do
 * incorporador — respondem R$ 0 com toda a confiança.
 *
 * Sem investimento gravado não existe CPL, não existe ROAS e não existe
 * comparação entre campanhas. É a fundação que faltava, e ela não é uma tela: é
 * uma linha por campanha por dia, gravada todo dia.
 *
 * ── O que ele toca ──────────────────────────────────────────────────────────
 *
 * Na Meta: **GET** de insights e nada mais. Não cria campanha, não altera
 * orçamento, não pausa, não movimenta verba.
 * No banco: `marketing_campaigns` (registro do id externo) e `marketing_spend`
 * (upsert pela chave natural). Não escreve em `leads`.
 *
 * ── Idempotência não é detalhe, é o requisito ───────────────────────────────
 *
 * Cron reexecuta — por retentativa, por reboot, por alguém rodando à mão. Sem
 * chave natural única, cada reexecução somaria gasto que não aconteceu, e o
 * número continuaria plausível. O índice único
 * (organization_id, campaign_id, spend_date) veio na migration
 * `20260731120000` ANTES deste worker, exatamente por isso.
 *
 * ── Cadência: uma vez por dia, de madrugada ─────────────────────────────────
 *
 * A Meta consolida o gasto do dia com atraso, e o número do dia corrente muda ao
 * longo do dia. Rodar a cada 5 minutos gastaria chamada de API para reescrever a
 * mesma linha. A janela padrão de 30 dias reimporta o passado recente a cada
 * execução, o que corrige sozinho qualquer ajuste retroativo que a Meta faça.
 */
export async function POST(request: Request) {
  // Falha FECHADA, e `!esperado` PRIMEIRO: escrito na ordem inversa, a rota
  // ficaria aberta justamente onde o segredo não foi configurado.
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const inicio = Date.now();
  const admin = getSupabaseAdmin();

  try {
    const resultado = await importaInvestimentoDaMeta(admin, { dias: 30 });

    if (!resultado.ok) {
      // Integração não configurada e organização ambígua NÃO são falha do
      // worker: são estado do ambiente. Devolver 500 faria o alarme tocar todo
      // dia até alguém desligar o alarme — e alarme desligado é pior que
      // ausência de alarme.
      const configuracao = resultado.motivo === "sem_organizacao" || resultado.motivo === "organizacao_ambigua";
      logger.warn("investimento.importacao_recusada", { motivo: resultado.motivo, mensagem: resultado.mensagem });
      return NextResponse.json(
        { ok: false, motivo: resultado.motivo, mensagem: resultado.mensagem, duracaoMs: Date.now() - inicio },
        { status: configuracao ? 200 : 500 },
      );
    }

    logger.info("investimento.importado", {
      organizationId: resultado.organizationId,
      linhasGravadas: resultado.linhasGravadas,
      campanhasCriadas: resultado.campanhasCriadas,
      investimentoTotal: resultado.investimentoTotal,
      linhasSemCampanha: resultado.linhasSemCampanha,
    });

    return NextResponse.json({ ...resultado, duracaoMs: Date.now() - inicio });
  } catch (erro) {
    // A Graph API pode devolver erro de token, de permissão ou de limite. Isso é
    // falha real e precisa aparecer como falha — é o único caso em que este
    // worker devolve 500.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("investimento.importacao_falhou", { mensagem });
    return NextResponse.json({ ok: false, motivo: "erro_na_meta", mensagem, duracaoMs: Date.now() - inicio }, { status: 500 });
  }
}
