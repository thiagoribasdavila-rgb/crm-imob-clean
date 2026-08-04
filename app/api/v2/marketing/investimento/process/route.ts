import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao, type DesfechoDaExecucao } from "@/lib/integrations/livro-de-execucoes";
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO MUDOU EM 2026-08-02 — o vigia funciona, e mesmo assim
 * não sabia dizer o que tinha feito.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O que foi MEDIDO agora (SQL contra o banco, 2026-08-02) ─────────────────
 *
 *   marketing_spend .......... 102 linhas, R$ 4.122,19, 7 campanhas,
 *                              de 2026-07-01 a 2026-08-01
 *   marketing_campaigns ...... 8 campanhas META, nenhuma sem id externo
 *   meta_conversion_configs ... 1 linha, 1 organização
 *   atlas_worker_runs ........ existe (o livro está instalado)
 *
 * Diferente dos vigias noturnos, aqui o zero acabou: este worker ESCREVEU. O
 * desfecho `ok` dele é real, e é justamente por isso que o silêncio dele é mais
 * perigoso — ninguém desconfia de um vigia que produz número.
 *
 * ── O silêncio que a medição revelou ────────────────────────────────────────
 *
 * Agrupando `marketing_spend` por `created_at` aparecem TRÊS execuções:
 *
 *   31/07 04:06  →  94 linhas criadas   (dias 01/07 a 23/07)
 *   01/08 19:46  →   4 linhas criadas   (dia 31/07)
 *   02/08 07:16  →   4 linhas criadas   (dia 01/08)
 *
 * e o `updated_at` das 102 linhas é o mesmo: 02/08 07:16. Isto é: cada execução
 * REESCREVE a janela inteira de 30 dias. `linhasGravadas` responde ~102 todo
 * dia — com a Meta tendo avançado um dia ou congelada há uma semana. "Importei
 * N dias" e "não havia dia novo" eram, literalmente, a mesma resposta.
 *
 * A mesma medição dá a saída: `created_at` é PRESERVADO no conflito (três
 * carimbos diferentes convivem com um `updated_at` só). Então as linhas criadas
 * dentro desta execução são exatamente as novas — e `diasNovos` passa a ser um
 * fato lido do banco, não uma inferência sobre um contador de upsert.
 *
 * ── Os caminhos de saída que existiam, e o que cada um escondia ─────────────
 *
 *   401                                   segredo ausente ou errado. Não muda.
 *   200 ok:true  motivo "sem_dado"        DOIS casos no mesmo corpo: a Meta não
 *                                         teve gasto no período, OU a credencial
 *                                         sumiu do ambiente. `fetchMetaDaily…`
 *                                         devolve `[]` nos dois. O dia em que o
 *                                         token expirar, este vigia vai
 *                                         responder 200 "sem gasto" para sempre.
 *   200 ok:true  (sem motivo)             o caminho normal — e também o caminho
 *                                         em que a Meta devolveu gasto e NENHUMA
 *                                         linha foi gravada, porque a campanha
 *                                         não resolveu (`linhasSemCampanha`).
 *                                         Dinheiro lido e descartado, com 200.
 *   200 ok:false "sem_organizacao"        recusa honesta… ou banco fora do ar:
 *                                         `organizacaoDaContaDeAnuncios` faz
 *                                         `if (error || !data || length === 0)`
 *                                         e devolve a MESMA coisa nos três.
 *   200 ok:false "organizacao_ambigua"    recusa honesta. Continua 200.
 *   500 ok:false "erro_no_banco"          falha real. Continua 500.
 *   500 ok:false "erro_na_meta"           falha real. Continua 500.
 *
 * ── Por que os quatro desfechos agora são distinguíveis ─────────────────────
 *
 *   ok             gravou. `linhasNovas`/`diasNovos` separam "chegou dia novo"
 *                  de "reescrevi a mesma janela" — a distinção que o contador de
 *                  upsert não conseguia fazer.
 *   sem_trabalho   a Meta respondeu, COM credencial, e não havia gasto no
 *                  período. Acordou, olhou, não havia nada. Não é falha.
 *   fora_da_janela recusa por condição declarada do ambiente: sem credencial da
 *                  Meta, sem organização (confirmada) ou organização ambígua.
 *                  Segue 200 de propósito — alarme que toca todo dia é alarme
 *                  que alguém desliga, e alarme desligado é pior que nenhum.
 *   falhou         500, que é a única coisa que o agendador enxerga.
 *
 * `iniciadoEm` é capturado antes de qualquer decisão: a recusa por ambiente
 * também é execução, e é exatamente a que sumia sem deixar rastro.
 *
 * ── O que virou 500 e antes era 200 (mudança consciente de comportamento) ───
 *
 *   · `linhasSemCampanha > 0` — a Meta cobrou por uma campanha que não resolveu
 *     para uuid interno, e aquelas linhas de gasto são DESCARTADAS por
 *     `linhasParaGravar`. Depois do upsert de campanhas, todo id externo deveria
 *     resolver; um que não resolve é dinheiro que a conta gastou e o CRM não
 *     registrou. É falha parcial de escrita, e responder 200 é o silêncio que
 *     este worker existe para acabar.
 *   · a Meta devolveu linhas e NENHUMA sobreviveu à normalização
 *     (`linhasDaMeta === 0` sem o motivo `sem_dado`): linha sem campanha ou sem
 *     data é descartada em `agrupaInvestimentoPorDia`. Zero sobreviventes não é
 *     "não havia gasto".
 *   · gravou zero com nada descartado (`linhasGravadas === 0`): o upsert não
 *     devolveu linha nenhuma. O módulo conta o que o banco DEVOLVEU, e devolver
 *     zero tendo enviado linhas é o banco recusando em silêncio.
 *   · `sem_organizacao` que a sondagem CONTRADIZ. `organizacaoDaContaDeAnuncios`
 *     engole o erro da consulta; a sondagem daqui relê `meta_conversion_configs`
 *     e separa os três casos que lá viram um só. Achar configuração onde o
 *     módulo não achou só pode ser erro engolido — e aí acende.
 *
 * Reexecutar é seguro em todos eles: o upsert é idempotente pela chave natural.
 */
export async function POST(request: Request) {
  // Falha FECHADA, e `!esperado` PRIMEIRO: escrito na ordem inversa, a rota
  // ficaria aberta justamente onde o segredo não foi configurado.
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // O relógio começa ANTES de qualquer decisão: "recusei porque o ambiente não
  // tem credencial" também é execução, e é a que some sem rastro.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: DesfechoDaExecucao, resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "investimento-de-midia", rota: "/api/v2/marketing/investimento/process", origem, iniciadoEm, desfecho, resposta, erro });

  // Os MESMOS nomes que `lib/meta/insights.ts` lê. A duplicação é consciente e
  // tem limite: isto é RÓTULO, nunca decisão. A importação roda igual e o
  // resultado dela é que manda; este booleano só serve para dizer QUAL dos dois
  // "a Meta não devolveu nada" aconteceu.
  const credencialDaMeta = Boolean((process.env.META_AD_ACCOUNT_ID || "").trim() && (process.env.META_ADS_ACCESS_TOKEN || "").trim());

  const admin = getSupabaseAdmin();

  // De onde veio a exceção. Antes desta variável o `catch` carimbava TUDO como
  // `erro_na_meta` — e a partir daqui existem exceções que não são da Meta.
  // Carimbo errado é a mesma doença de nome trocado que este arquivo persegue.
  let motivoDaExcecao = "erro_na_meta";

  try {
    const resultado = await importaInvestimentoDaMeta(admin, { dias: 30 });

    if (!resultado.ok) {
      // Integração não configurada e organização ambígua NÃO são falha do
      // worker: são estado do ambiente. Devolver 500 faria o alarme tocar todo
      // dia até alguém desligar o alarme — e alarme desligado é pior que
      // ausência de alarme.
      if (resultado.motivo === "sem_organizacao") {
        // `organizacaoDaContaDeAnuncios` responde "sem_organizacao" também
        // quando a CONSULTA falha. Sem esta releitura, banco fora do ar e
        // "ninguém configurou a Meta" continuariam sendo o mesmo 200.
        const confirmacao = await admin.from("meta_conversion_configs").select("organization_id").limit(1);
        if (confirmacao.error) {
          const corpo = { ok: false, motivo: "erro_ao_confirmar_organizacao", mensagem: `Falha ao reler meta_conversion_configs: ${confirmacao.error.message}`, credencialDaMeta, duracaoMs: Date.now() - iniciadoEm };
          logger.error("investimento.confirmacao_de_organizacao_falhou", { code: confirmacao.error.code });
          return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, confirmacao.error.message) }, { status: 500 });
        }
        if ((confirmacao.data ?? []).length > 0) {
          // Contradição: existe configuração, e o módulo disse que não existe.
          // Só resta uma explicação — o erro da consulta dele foi engolido.
          const corpo = { ok: false, motivo: "leitura_da_organizacao_divergiu", mensagem: "A importação recusou por 'sem organização', mas meta_conversion_configs tem linha. A consulta do módulo falhou e o erro foi descartado.", credencialDaMeta, duracaoMs: Date.now() - iniciadoEm };
          logger.error("investimento.organizacao_divergiu", { mensagem: resultado.mensagem });
          return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo) }, { status: 500 });
        }
      }

      const recusaDeAmbiente =
        resultado.motivo === "sem_organizacao" || resultado.motivo === "organizacao_ambigua" || resultado.motivo === "sem_credencial";
      const corpo = { ok: false, motivo: resultado.motivo, mensagem: resultado.mensagem, credencialDaMeta, duracaoMs: Date.now() - iniciadoEm };
      if (recusaDeAmbiente) {
        logger.warn("investimento.importacao_recusada", { motivo: resultado.motivo, mensagem: resultado.mensagem });
        return NextResponse.json({ ...corpo, livro: await livro("fora_da_janela", corpo) }, { status: 200 });
      }
      logger.error("investimento.importacao_falhou_no_banco", { motivo: resultado.motivo, mensagem: resultado.mensagem });
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, resultado.mensagem) }, { status: 500 });
    }

    // ── A Meta não devolveu linha nenhuma ─────────────────────────────────
    // `fetchMetaDailyCampaignInsights` devolve `[]` tanto sem credencial quanto
    // sem gasto. O módulo carimba os dois com `sem_dado`; aqui eles se separam.
    if (resultado.motivo === "sem_dado") {
      const corpo = {
        ...resultado,
        credencialDaMeta,
        linhasNovas: 0,
        diasNovos: 0,
        motivo: credencialDaMeta ? "sem_gasto_no_periodo" : "sem_credencial_da_meta",
        mensagem: credencialDaMeta
          ? "A conta de anúncios está configurada e a Meta não devolveu gasto no período."
          : "META_AD_ACCOUNT_ID e/ou META_ADS_ACCESS_TOKEN ausentes no ambiente — não houve leitura da Meta.",
        duracaoMs: Date.now() - iniciadoEm,
      };
      if (!credencialDaMeta) {
        logger.warn("investimento.sem_credencial_da_meta", { origem });
        return NextResponse.json({ ...corpo, livro: await livro("fora_da_janela", corpo) });
      }
      // Acordou, olhou a conta, não havia gasto. Desfecho legítimo — e era
      // exatamente o que se confundia com "nunca rodou".
      logger.info("investimento.sem_gasto_no_periodo", { organizationId: resultado.organizationId, diasLidos: resultado.diasLidos });
      return NextResponse.json({ ...corpo, livro: await livro("sem_trabalho", corpo) });
    }

    const organizationId = resultado.organizationId;
    if (!organizationId) {
      motivoDaExcecao = "importacao_ok_sem_organizacao";
      // Contrato do módulo: `ok: true` fora do `sem_dado` sempre traz a
      // organização. Sem ela não há como conferir o que foi gravado, e seguir
      // adiante seria publicar um número que não dá para auditar.
      throw new Error("A importação respondeu ok sem organização — impossível conferir o que foi gravado.");
    }

    if (resultado.linhasDaMeta === 0) {
      // A Meta respondeu com linhas e NENHUMA sobreviveu à normalização
      // (`agrupaInvestimentoPorDia` descarta linha sem campanha ou sem data).
      // Zero sobreviventes não é "não havia gasto" — é leitura ilegível.
      const corpo = { ...resultado, ok: false, credencialDaMeta, linhasNovas: 0, diasNovos: 0, motivo: "linhas_da_meta_ilegiveis", mensagem: "A Meta devolveu resposta e nenhuma linha tinha campanha e data válidas. Nada foi gravado.", duracaoMs: Date.now() - iniciadoEm };
      logger.error("investimento.linhas_da_meta_ilegiveis", { organizationId, diasLidos: resultado.diasLidos });
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo) }, { status: 500 });
    }

    // ── O que esta execução criou de fato ────────────────────────────────
    // `created_at` sobrevive ao conflito do upsert (medido: três carimbos de
    // execução convivendo com um único `updated_at`), então as linhas criadas
    // dentro da janela desta execução são exatamente as novas. Sem isto,
    // "importei um dia novo" e "reescrevi os mesmos 30 dias" são o mesmo 102.
    // A folga de 60s protege contra desvio de relógio entre o app e o banco; o
    // worker roda uma vez por dia, então ela não confunde uma execução com outra.
    const janelaDeNovidade = new Date(iniciadoEm - 60_000).toISOString();
    const criadas = await admin
      .from("marketing_spend")
      .select("spend_date")
      .eq("organization_id", organizationId)
      .gte("created_at", janelaDeNovidade);
    // Erro aqui vira `throw` de propósito: é a MESMA tabela e o MESMO cliente
    // que acabaram de gravar. Se a releitura falha, o número que eu publicaria
    // não foi conferido por ninguém — e publicar número não conferido é como
    // este arquivo começou.
    if (criadas.error) {
      motivoDaExcecao = "erro_ao_reler_marketing_spend";
      throw criadas.error;
    }
    const novas = (criadas.data ?? []) as Array<{ spend_date: string | null }>;
    const linhasNovas = novas.length;
    const diasNovos = new Set(novas.map((linha) => String(linha.spend_date ?? ""))).size;

    // Falha PARCIAL de escrita entra numa lista, e lista não vazia devolve 500.
    const falhas: string[] = [];
    if (resultado.linhasSemCampanha > 0) falhas.push("gasto_sem_campanha");
    if (resultado.linhasGravadas === 0) falhas.push("upsert_nao_devolveu_linha");

    const corpo = {
      ...resultado,
      ok: falhas.length === 0,
      credencialDaMeta,
      linhasNovas,
      diasNovos,
      janelaDeNovidade,
      falhas,
      // `motivo` existe para que "não fiz nada" nunca seja ambíguo.
      motivo: falhas.length
        ? falhas.join("+")
        : linhasNovas > 0
          ? "importado_com_dia_novo"
          : "reimportado_sem_dia_novo",
      duracaoMs: Date.now() - iniciadoEm,
    };

    if (falhas.length) {
      logger.error("investimento.gravacao_incompleta", {
        organizationId,
        falhas,
        linhasDaMeta: resultado.linhasDaMeta,
        linhasGravadas: resultado.linhasGravadas,
        linhasSemCampanha: resultado.linhasSemCampanha,
      });
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo) }, { status: 500 });
    }

    logger.info("investimento.importado", {
      organizationId,
      linhasGravadas: resultado.linhasGravadas,
      linhasNovas,
      diasNovos,
      campanhasCriadas: resultado.campanhasCriadas,
      investimentoTotal: resultado.investimentoTotal,
      linhasSemCampanha: resultado.linhasSemCampanha,
    });

    return NextResponse.json({ ...corpo, livro: await livro("ok", corpo) });
  } catch (erro) {
    // A Graph API pode devolver erro de token, de permissão ou de limite. Isso é
    // falha real e precisa aparecer como falha.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("investimento.importacao_falhou", { motivo: motivoDaExcecao, mensagem });
    const corpo = { ok: false, motivo: motivoDaExcecao, mensagem, credencialDaMeta, duracaoMs: Date.now() - iniciadoEm };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, mensagem) }, { status: 500 });
  }
}
