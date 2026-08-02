import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";

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
 *
 * ── O QUE FOI MEDIDO EM 02/08/2026 ───────────────────────────────────────────
 *
 * Contado no banco que a aplicação usa de fato (o `NEXT_PUBLIC_SUPABASE_URL`
 * do .env.local aponta para o projeto `pozbrcsfthnhmnebfoxv`):
 *
 *     meta_leads_sem_destino ...... 0 linhas, 0 pendentes
 *     meta_lead_sources ........... 29 linhas, 16 ativas (13 INATIVAS)
 *     atlas_worker_runs ........... 7 linhas, ZERO do vigia `meta-sem-destino`
 *
 * Ou seja: hoje este vigia sai SEMPRE pela porta "fila vazia", e o zero da
 * tabela de efeito é honesto. Só que o código não tinha como provar isso. Zero
 * linha em `atlas_worker_runs` não significava "não rodou" — significava que
 * ele nunca soube dizer que rodou. "Chamado 24 vezes e nada a fazer" e "nunca
 * chamado" produziam exatamente o mesmo estado observável.
 *
 * ── OS SILÊNCIOS QUE EXISTIAM ────────────────────────────────────────────────
 *
 * A rota tinha SEIS saídas. Uma estava certa, uma era legítima porém muda, e
 * quatro não deixavam rastro nenhum:
 *
 *   1. 401 sem segredo ............ não é execução; fica antes do relógio.
 *   2. 503 fila ilegível .......... a ÚNICA que já distinguia "não consegui
 *                                   consultar" de "não havia nada". Preservada
 *                                   como está, inclusive o código 503.
 *   3. 200 {pendentes: 0} ......... desfecho legítimo, mas invisível: é o caso
 *                                   real medido acima e não deixava registro.
 *   4. `throw` na leitura das fontes e `throw` na marcação, SEM try/catch em
 *      volta: viravam 500 do framework — sem corpo, sem contador, sem dizer em
 *      que ponto do laço parou nem quantas leads já tinham sido resgatadas.
 *   5. `logger.warn` + `continue` quando o INSERT do evento falhava: a lead NÃO
 *      era resgatada, o contador não subia, e o ciclo terminava 200 {ok:true}.
 *      Trabalho perdido com resposta de sucesso.
 *   6. `logger.warn` quando o enfileiramento no outbox falhava: pior que o 5,
 *      porque a lead era marcada RESOLVIDA três linhas abaixo. Sem a linha no
 *      outbox ninguém busca o conteúdo dela na Meta — ela sai da fila sem ter
 *      sido buscada, e o ciclo respondia 200.
 *
 * Os casos 5 e 6 são 200 mascarando falha real, e por isso viram 500. O
 * agendador (.github/workflows/atlas-vigias.yml) trata qualquer código != 200
 * como FALHA, então 500 é o que faz o job acender.
 *
 * ── POR QUE CADA DESFECHO É DISTINGUÍVEL AGORA ───────────────────────────────
 *
 *   ok ............. `resgatadas > 0`. Acordou, achou trabalho, fez.
 *   sem_trabalho ... três motivos SEPARADOS, e nenhum é falha:
 *                      · `fila_vazia` .......... nenhuma lead pendente;
 *                      · `nenhuma_fonte_ativa` . há lead esperando e NENHUMA
 *                        fonte ativa cadastrada;
 *                      · `todas_sem_fonte` ..... há fonte ativa, mas nenhuma
 *                        casa com a página das leads que estão esperando.
 *   falhou ......... fila ilegível (503), exceção em qualquer ponto (500) ou
 *                    falha parcial de escrita (500, com `resgate_parcial`
 *                    quando parte das leads foi resgatada mesmo assim).
 *   fora_da_janela . NÃO OCORRE, e isso é declarado em vez de disfarçado: este
 *                    vigia não tem janela — roda de hora em hora e aceita
 *                    trabalho em qualquer horário. Inventar uma condição só
 *                    para preencher os quatro desfechos seria mentir no campo
 *                    que existe para dar certeza.
 *
 * `fontesAtivas` entrou no corpo por causa da medição: 13 das 29 fontes estão
 * INATIVAS, e uma lead cuja página só existe numa fonte inativa conta como
 * `aindaSemFonte` para sempre. Com o número na resposta dá para separar
 * "ninguém cadastrou a fonte" de "cadastraram e desligaram" sem abrir o banco.
 *
 * ── O QUE **NÃO** MUDOU, e é de propósito ────────────────────────────────────
 *
 * Quando o enfileiramento no outbox falha, a lead continua sendo marcada como
 * resolvida — mesmo efeito de antes. A diferença é que agora isso não passa
 * calado: entra em `falhas`, o ciclo sai 500 e a linha do livro grava o
 * desfecho. Desfazer a marcação seria mudar o comportamento, e mudar efeito
 * sem medir é como se chega a um defeito pior que o original.
 */
export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  // O relógio começa ANTES da primeira decisão e ANTES do cliente do banco:
  // `getSupabaseAdmin()` lança quando falta a chave de serviço, e essa é
  // exatamente a execução que sumia sem rastro — o vigia não chegava nem a
  // olhar a fila.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "meta-sem-destino", rota: "/api/v2/marketing/meta-sem-destino/process", origem, iniciadoEm, desfecho, resposta, erro });

  // Contadores fora do `try` porque o `throw` da marcação ABORTA o laço: sem
  // isto, uma falha na décima lead apagaria o rastro das nove já resgatadas.
  let pendentesLidas = 0;
  let resgatadas = 0;
  let aindaSemFonte = 0;
  let fontesAtivas: number | null = null;
  const paginasSemFonte = new Set<string>();
  const falhas: { leadgenId: string; etapa: "evento" | "fila"; code?: string }[] = [];

  try {
    const admin = getSupabaseAdmin();

    const fila = await admin
      .from("meta_leads_sem_destino")
      .select("id,leadgen_id,page_id,form_id,ad_id,campaign_external_id,payload,received_at")
      .eq("resolvido", false)
      .order("received_at", { ascending: true })
      .limit(200);
    // "Não consegui consultar" tem código próprio desde sempre, e continua 503.
    if (fila.error) {
      logger.error("meta.sem_destino.leitura_falhou", fila.error, {});
      const corpo = { ok: false, error: fila.error.message, motivo: "fila_ilegivel" };
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, fila.error.message) }, { status: 503 });
    }

    const pendentes = fila.data ?? [];
    pendentesLidas = pendentes.length;
    // Fila vazia é o caso REAL medido hoje. Ele não é falha e nunca foi — o que
    // faltava era ele deixar linha no livro para parar de se confundir com
    // "este vigia nunca foi chamado".
    if (!pendentes.length) {
      const corpo = { ok: true, pendentes: 0, resgatadas: 0, aindaSemFonte: 0, motivo: "fila_vazia", duracaoMs: Date.now() - iniciadoEm };
      return NextResponse.json({ ...corpo, livro: await livro("sem_trabalho", corpo) });
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
    const fontes = fontesQuery.data ?? [];
    fontesAtivas = fontes.length;

    for (const lead of pendentes) {
      // Casa pela página primeiro (é o que o webhook usa) e depois pelo
      // formulário; a fonte "curinga" (form_id nulo) atende qualquer formulário
      // daquela página.
      const daPagina = fontes.filter((f) => String(f.page_id) === String(lead.page_id));
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
        // A lead FICA na fila e nada a resgatou. Antes isto era só um warn e o
        // ciclo terminava 200: falha de banco lida como "ciclo bem-sucedido".
        logger.warn("meta.sem_destino.evento_nao_criado", { leadgenId: lead.leadgen_id, erro: erroEvento.message });
        falhas.push({ leadgenId: String(lead.leadgen_id), etapa: "evento", code: erroEvento.code });
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
        // caminho de recuperação para as linhas que EXISTEM. A linha que nem
        // chegou a ser criada, não — e a lead é marcada resolvida logo abaixo.
        // Por isso ela entra em `falhas` e o ciclo sai 500: é a única forma de
        // alguém ficar sabendo que aquela lead saiu da fila sem ser buscada.
        if (erroFila && erroFila.code !== "23505") {
          logger.warn("meta.sem_destino.fila_nao_enfileirada", { leadgenId: lead.leadgen_id, erro: erroFila.message });
          falhas.push({ leadgenId: String(lead.leadgen_id), etapa: "fila", code: erroFila.code });
        }
      }

      // A lead so esta REALMENTE resolvida se a marcacao gravou. Sem conferir,
      // o contador subia e a lead continuava orfa na proxima rodada. O `throw`
      // aborta o laço de propósito — se o banco recusa a marcação, insistir nas
      // 199 leads seguintes só multiplica escrita que não vai gravar.
      const marcou = await admin.from("meta_leads_sem_destino")
        .update({ resolvido: true, resolvido_em: new Date().toISOString() })
        .eq("id", lead.id);
      if (marcou.error) throw marcou.error;
      resgatadas += 1;
    }

    const resultado = {
      ok: falhas.length === 0,
      pendentes: pendentes.length,
      resgatadas,
      aindaSemFonte,
      // 13 das 29 fontes cadastradas estão inativas: sem este número, "nenhuma
      // fonte casou" não separa falta de cadastro de cadastro desligado.
      fontesAtivas,
      falhas: falhas.length,
      falhasEvento: falhas.filter((f) => f.etapa === "evento").length,
      falhasFila: falhas.filter((f) => f.etapa === "fila").length,
      // As páginas aparecem na resposta porque são ACIONÁVEIS: cada uma é uma
      // fonte que falta cadastrar, e sem esta lista alguém teria de ir cavar no
      // banco para descobrir quais.
      paginasSemFonte: [...paginasSemFonte],
      // `motivo` existe para que "não fiz nada" nunca seja ambíguo.
      motivo: falhas.length
        ? (resgatadas ? "resgate_parcial" : "resgates_falharam")
        : resgatadas
          ? "ok"
          : fontesAtivas === 0
            ? "nenhuma_fonte_ativa"
            : "todas_sem_fonte",
      duracaoMs: Date.now() - iniciadoEm,
    };

    if (falhas.length) {
      logger.error("meta.sem_destino.resgates_falharam", { falhas: falhas.length, primeiroCode: falhas[0]?.code });
      return NextResponse.json({ ...resultado, livro: await livro("falhou", resultado) }, { status: 500 });
    }
    logger.info("meta.sem_destino.ciclo", resultado);
    // `sem_trabalho` aqui é a fila que existe e não tem destino possível: o
    // vigia acordou, olhou cada lead e nenhuma tinha fonte. Não é falha dele —
    // é cadastro que falta, e `paginasSemFonte` diz qual.
    return NextResponse.json({ ...resultado, livro: await livro(resgatadas ? "ok" : "sem_trabalho", resultado) });
  } catch (erro) {
    // Antes daqui, a exceção virava 500 do framework: sem corpo, sem contador e
    // sem linha no livro. O agendador acendia sem dizer onde parou.
    logger.error("meta.sem_destino.ciclo_falhou", erro);
    const corpo = {
      ok: false,
      pendentes: pendentesLidas,
      resgatadas,
      aindaSemFonte,
      fontesAtivas,
      falhas: falhas.length,
      paginasSemFonte: [...paginasSemFonte],
      motivo: "excecao",
      duracaoMs: Date.now() - iniciadoEm,
    };
    return NextResponse.json(
      { ...corpo, error: "Falha ao resgatar leads sem destino.", livro: await livro("falhou", corpo, String(erro)) },
      { status: 500 },
    );
  }
}
