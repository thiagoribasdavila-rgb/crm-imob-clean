import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { lerCartaMorta } from "@/lib/integrations/carta-morta";

export const dynamic = "force-dynamic";

/**
 * O VIGIA DA CARTA MORTA — o defeito por trás do defeito.
 *
 * ── O QUE FOI MEDIDO ────────────────────────────────────────────────────────
 *
 * 02/08/2026, banco vivo: `dead_letter_events` com 12 linhas, ZERO resolvidas,
 * a mais antiga de 31/07 01:50. Três dias. Ninguém soube.
 *
 * O buraco não é a fila ter enchido — fila morta existe para encher, é a última
 * linha de defesa. O buraco é ela ter enchido EM SILÊNCIO. Cada linha ali é uma
 * conversão que a Meta nunca soube, num algoritmo que otimiza com o que sabe; e
 * o custo cresce todo dia que ninguém olha.
 *
 * ── POR QUE O ALARME NÃO É SÓ "CRESCEU" ─────────────────────────────────────
 *
 * Um vigia que só acende quando a fila CRESCE deixaria as doze linhas de hoje
 * passarem caladas para sempre: elas já cresceram, em 31/07 e em 02/08, e
 * ninguém estava olhando. Amanhã a contagem estaria estável em 12 e o vigia
 * diria "tudo bem" sobre três dias de conversões perdidas. Estabilidade num
 * cemitério não é saúde.
 *
 * Então o alarme tem DUAS entradas, e qualquer uma acende:
 *
 *   1. CRESCEU desde a última passagem — chegou entrega nova morrendo;
 *   2. ENVELHECEU — existe linha operacional acima do teto de idade.
 *
 * O teto é 24 h, e o número tem origem: o worker do outbox roda a cada 2 min e
 * gasta 5 tentativas. O que continua morto 24 h depois não é transitório — é
 * uma causa de pé que ninguém derrubou.
 *
 * ── AS PROVAS SINTÉTICAS NÃO ACENDEM NADA ───────────────────────────────────
 *
 * O vigia conta `operacionais`, que já exclui o lixo de ensaio pelo critério
 * declarado em lib/integrations/causa-da-carta-morta.ts. Duas linhas de teste
 * mantendo um alarme aceso para sempre treinariam todo mundo a ignorá-lo — e
 * alarme ignorado é pior que alarme nenhum.
 *
 * ── ONDE O SINAL APARECE ────────────────────────────────────────────────────
 *
 * Em três lugares, e nenhum deles é log solto:
 *
 *   · o LIVRO (`atlas_worker_runs`), onde cada passagem grava a contagem — é
 *     dele que sai a tendência desenhada na tela de saúde operacional;
 *   · o AGENDADOR: .github/workflows/atlas-vigias.yml trata != 200 como falha,
 *     então o alarme deixa o job vermelho;
 *   · a TELA (/integrations/health), que lê a última passagem e diz há quanto
 *     tempo a fila está parada.
 *
 * O 500 com o vigia funcionando é deliberado: quem falhou é a fila que ele
 * vigia, e o `erro` gravado no livro diz exatamente isso. Responder 200 com a
 * fila morta parada seria a doença que este repositório mais paga — o vigia que
 * nunca dá motivo para ninguém olhar.
 */

/** Teto de idade. Acima disto não é transitório, é causa de pé. */
const TETO_DE_IDADE_HORAS = 24;

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
    desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou",
    resposta: Record<string, unknown>,
    erro?: string,
  ) =>
    registrarExecucao({
      vigia: "carta-morta",
      rota: "/api/v2/integrations/carta-morta/vigia",
      origem,
      iniciadoEm,
      desfecho,
      resposta,
      erro,
    });

  try {
    const admin = getSupabaseAdmin();

    // Quais organizações têm carta morta aberta. Ler as organizações a partir
    // da PRÓPRIA tabela evita varrer inquilino que não tem nada preso.
    const orgQuery = await admin
      .from("dead_letter_events")
      .select("organization_id")
      .eq("resolved", false)
      .limit(2000);

    if (orgQuery.error) {
      // "Não consegui consultar" tem código próprio. Zero aqui seria fila
      // vazia — e fila vazia é exatamente a mentira mais cara desta tabela.
      logger.error("carta_morta.leitura_das_organizacoes_falhou", orgQuery.error, {});
      const corpo = { ok: false, motivo: "organizacoes_ilegiveis", erro: orgQuery.error.message };
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, orgQuery.error.message) }, { status: 503 });
    }

    const organizacoes = [...new Set((orgQuery.data ?? []).map((l) => String(l.organization_id)))];

    if (!organizacoes.length) {
      const corpo = {
        ok: true,
        organizacoes: 0,
        operacionais: 0,
        motivo: "nenhuma_carta_morta_aberta",
        duracaoMs: Date.now() - iniciadoEm,
      };
      return NextResponse.json({ ...corpo, livro: await livro("sem_trabalho", corpo) });
    }

    let operacionais = 0;
    let reprocessaveis = 0;
    let lixoDeTeste = 0;
    let maisAntigaHoras: number | null = null;
    const ilegiveis: string[] = [];
    const porOrganizacao: Array<{ organizationId: string; operacionais: number; reprocessaveis: number; maisAntigaHoras: number | null }> = [];

    for (const organizationId of organizacoes) {
      const leitura = await lerCartaMorta(admin, organizationId, { incluirResolvidas: false });
      if (!leitura.ok) {
        // Organização ilegível NÃO soma zero. Somar zero seria dizer "esta aqui
        // está limpa" sobre algo que não foi lido.
        logger.error("carta_morta.leitura_da_organizacao_falhou", { organizationId, motivo: leitura.motivo });
        ilegiveis.push(organizationId);
        continue;
      }
      operacionais += leitura.contagem.operacionais;
      reprocessaveis += leitura.contagem.reprocessaveis;
      lixoDeTeste += leitura.contagem.lixoDeTeste;
      if (leitura.contagem.maisAntigaHoras !== null) {
        maisAntigaHoras = Math.max(maisAntigaHoras ?? 0, leitura.contagem.maisAntigaHoras);
      }
      porOrganizacao.push({
        organizationId,
        operacionais: leitura.contagem.operacionais,
        reprocessaveis: leitura.contagem.reprocessaveis,
        maisAntigaHoras: leitura.contagem.maisAntigaHoras,
      });
    }

    // A passagem anterior, lida do próprio livro. É o que transforma uma
    // contagem em TENDÊNCIA — sem ela, 12 hoje e 12 ontem são indistinguíveis
    // de 12 que acabaram de chegar.
    const anteriorQuery = await admin
      .from("atlas_worker_runs")
      .select("resposta,concluido_em")
      .eq("vigia", "carta-morta")
      .order("iniciado_em", { ascending: false })
      .limit(1);

    let anterior: number | null = null;
    let anteriorEm: string | null = null;
    let tendenciaMedida = true;
    if (anteriorQuery.error) {
      // Não conseguir ler a passagem anterior não pode virar "não cresceu".
      logger.warn("carta_morta.passagem_anterior_ilegivel", { code: anteriorQuery.error.code });
      tendenciaMedida = false;
    } else if (anteriorQuery.data?.length) {
      const resposta = anteriorQuery.data[0].resposta;
      const valor = resposta && typeof resposta === "object" ? (resposta as Record<string, unknown>).operacionais : undefined;
      if (typeof valor === "number") {
        anterior = valor;
        anteriorEm = anteriorQuery.data[0].concluido_em ? String(anteriorQuery.data[0].concluido_em) : null;
      }
    }

    const cresceu = anterior !== null && operacionais > anterior;
    const envelheceu = maisAntigaHoras !== null && maisAntigaHoras >= TETO_DE_IDADE_HORAS;
    const alarme = cresceu || envelheceu || ilegiveis.length > 0;

    const motivos: string[] = [];
    if (cresceu) motivos.push(`a fila morta CRESCEU de ${anterior} para ${operacionais} desde a última passagem`);
    if (envelheceu) motivos.push(`há entrega morta há ${Math.floor((maisAntigaHoras ?? 0) / 24)} dia(s) — teto é ${TETO_DE_IDADE_HORAS} h`);
    if (ilegiveis.length) motivos.push(`${ilegiveis.length} organização(ões) não puderam ser lidas`);

    const corpo = {
      ok: !alarme,
      alarme,
      motivos,
      operacionais,
      reprocessaveis,
      lixoDeTeste,
      maisAntigaHoras: maisAntigaHoras === null ? null : Math.round(maisAntigaHoras),
      anterior,
      anteriorEm,
      tendenciaMedida,
      organizacoes: organizacoes.length,
      ilegiveis: ilegiveis.length,
      porOrganizacao,
      tetoDeIdadeHoras: TETO_DE_IDADE_HORAS,
      duracaoMs: Date.now() - iniciadoEm,
    };

    if (alarme) {
      logger.error("carta_morta.alarme", {
        operacionais,
        anterior,
        maisAntigaHoras: corpo.maisAntigaHoras,
        reprocessaveis,
        motivos,
      });
      // 500 com o vigia intacto: quem está falhando é a fila vigiada. O livro
      // recebe o mesmo veredito para que agendador e livro não contem histórias
      // diferentes sobre a mesma passagem.
      return NextResponse.json(
        { ...corpo, livro: await livro("falhou", corpo, motivos.join("; ")) },
        { status: 500 },
      );
    }

    return NextResponse.json({ ...corpo, livro: await livro("ok", corpo) });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("carta_morta.vigia_falhou", erro);
    const corpo = { ok: false, motivo: "excecao", erro: mensagem };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, mensagem) }, { status: 500 });
  }
}
