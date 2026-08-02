import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { isMissingColumn, isMissingRelation } from "@/lib/compat/legacy-v2";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { loadWindowBatch, loadOrgCapiConfig } from "@/lib/integrations/meta/capi-window";
import { sendCapiBatch, type CapiSendOutcome } from "@/lib/integrations/meta/capi-feedback";

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
 *
 * ── POR QUE ESTE ARQUIVO MUDOU EM 02/08/2026 ────────────────────────────────
 *
 * O QUE FOI MEDIDO, rodando os portões deste repositório nesta data:
 *
 *   `npm run livro-execucoes:check` → 7 dos 13 vigias registram execução, e
 *   este está entre os 6 que não registravam. Ou seja: para o `capi-feedback`,
 *   "nunca rodou" e "rodou e não havia conversão para devolver" produziam
 *   exatamente a mesma evidência — nenhuma.
 *
 *   `npm run vigia-silencio:check` → 17 ocorrências, TODAS em `outbox/process`.
 *   Esta rota pontua ZERO naquele portão e ainda assim era muda. A varredura de
 *   lá conta duas FORMAS textuais: a desestruturação que fica só com o `data` e
 *   joga o `error` fora, e a gravação cujo retorno ninguém segura. Os três
 *   silêncios descritos abaixo não têm nenhuma das duas formas, e por isso
 *   passavam invisíveis. Portão verde não é ausência de silêncio.
 *
 *   (E este comentário não pode CITAR aquelas formas. A varredura é textual e
 *   percorre o arquivo inteiro, comentário incluído: a primeira versão deste
 *   cabeçalho as escreveu por extenso para explicar, e o próprio portão subiu de
 *   17 para 18. Descrever, nunca reproduzir.)
 *
 *   `.github/workflows/atlas-vigias.yml` → o agendador só enxerga o código HTTP,
 *   e nele SÓ `200` conta como ok. Então todo desfecho que respondia 200 era o
 *   mesmo desfecho aos olhos de quem vigia. O próprio arquivo do agendador
 *   registra que em 02/08/2026 este vigia ficou vermelho por `curl (28)` e que,
 *   conferido no banco, a fila dele estava em zero — o dia em que ninguém
 *   conseguiu dizer se ele tinha trabalhado.
 *
 * OS TRÊS SILÊNCIOS QUE ESTAVAM AQUI, e o que cada um virava:
 *
 *   1. `loadWindowBatch` devolvendo `ok:false` é ERRO DE LEITURA de `leads` ou
 *      de `lead_events` — banco fora do ar, permissão, tabela ausente. Ia para
 *      `bloqueados` e a rota respondia 200. "O banco não respondeu" e "não há
 *      lead na janela" eram a mesma resposta, e a segunda é a esperada quase
 *      todo dia — então a primeira nunca seria notada.
 *
 *   2. `sendCapiBatch` LANÇA quando a Meta devolve HTTP de erro, e esta rota não
 *      tinha try/catch nenhum. A exceção matava o laço na primeira organização
 *      que falhasse: as seguintes nunca eram processadas, e tudo o que já havia
 *      saído sumia junto com a resposta — o 500 do Next.js vem sem corpo. Envio
 *      parcial era exatamente o caso que não deixava rastro.
 *
 *   3. Falha ao gravar `meta_conversion_events` virava aviso e 200. O evento saiu
 *      para a Meta e o CRM não guardou memória de que saiu. Essa tabela VAZIA foi
 *      a medição que originou este worker; um 200 aqui devolve a mesma leitura
 *      falsa de "nunca saiu nada", agora com o dinheiro já gasto.
 *
 * OS QUATRO DESFECHOS, e por que agora são distinguíveis:
 *
 *   ok             → `eventosEnviados > 0`: a Meta aceitou pelo menos um lote.
 *   sem_trabalho   → acordou, olhou e não havia o que devolver. `motivo` diz
 *                    QUAL dos casos: nenhuma organização, ninguém participando,
 *                    ou nenhum evento elegível na janela de 7 dias.
 *   fora_da_janela → este vigia não tem janela de horário; a condição declarada
 *                    dele é a CHAVE GERAL do servidor. Quando todo bloqueio do
 *                    ciclo foi `flag_disabled`, o envio foi recusado por
 *                    configuração, não por ausência de trabalho. É DERIVADO do
 *                    que aconteceu, não de uma segunda leitura da variável de
 *                    ambiente: a decisão continua morando só em `sendCapiBatch`,
 *                    e duas leituras do mesmo interruptor é como nascem as duas
 *                    verdades que este repositório já pagou caro.
 *   falhou         → 500, para o agendador acender. É o único desfecho que muda
 *                    código HTTP em relação a antes, e muda só onde havia 200
 *                    cobrindo falha real (os três silêncios acima).
 *
 * O QUE CONTINUA AMBÍGUO, dito em voz alta em vez de escondido: `naoParticipam`
 * não distingue "esta organização não tem linha de configuração" de "a tabela de
 * configuração não pôde ser lida", porque `loadOrgCapiConfig` descarta o `error`
 * na desestruturação. Fechar isso exige mexer em
 * `lib/integrations/meta/capi-window.ts`, que está fora do alcance desta entrega
 * — e o contrato `tests/contracts/capi-worker.test.mjs` proíbe, com razão, que a
 * rota leia aquela tabela por conta própria para contornar.
 */

/** Janela de leitura. 7 dias cobre o ciclo de qualificação sem reprocessar meses. */
const JANELA_DIAS = 7;

/**
 * Teto de organizações por ciclo. Nomeado (era literal) porque bater no teto
 * significa que existem organizações que este ciclo NÃO olhou — e isso precisa
 * aparecer no corpo, senão vira mais um zero que parece completo.
 */
const LIMITE_ORGS = 200;

export async function POST(request: Request) {
  // ── QUEM PODE DISPARAR ISTO ───────────────────────────────────────────────
  //
  // Este worker era `POST()` — sem `request`. Sem o objeto da requisição ele não
  // tinha COMO conferir cabeçalho: qualquer um que alcançasse a URL disparava
  // envio de conversões à Meta para até 200 organizações de uma vez. Medido em
  // 2026-07-29: dos 12 workers agendados em config/workers-schedule.json, era o
  // único sem trava — os outros 11 já exigiam o segredo.
  //
  // FALHA FECHADA, e a ordem importa: `!esperado` vem PRIMEIRO. Escrito como
  // `esperado && token !== esperado`, a rota ficaria ABERTA justamente onde o
  // segredo não foi configurado — que é todo ambiente novo, incluindo o primeiro
  // dia de uma homologação.
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // O relógio começa ANTES de qualquer decisão. Uma recusa também é execução, e
  // é justamente a que some sem rastro: o ciclo que não enviou nada é o mais
  // comum aqui, e era o indistinguível de "o cron nunca chamou".
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "capi-feedback", rota: "/api/v2/marketing/capi-feedback/process", origem, iniciadoEm, desfecho, resposta, erro });

  try {
    const admin = getSupabaseAdmin();

    const { data: orgs, error: erroOrgs } = await admin
      .from("organizations")
      .select("id")
      .limit(LIMITE_ORGS);

    if (erroOrgs) {
      logger.error("capi-feedback: não foi possível listar organizações", { erro: erroOrgs.message });
      // 503 preservado: já era o código daqui, e o agendador trata QUALQUER
      // código diferente de 200 como FALHA. Trocá-lo por 500 não acenderia nada
      // a mais e apagaria a distinção entre "dependência fora" e "eu quebrei".
      const corpoDoErro = { ok: false, error: erroOrgs.message, motivo: "organizacoes_ilegiveis" };
      return NextResponse.json(
        { ...corpoDoErro, livro: await livro("falhou", corpoDoErro, erroOrgs.message) },
        { status: 503 },
      );
    }

    const resultado = {
      organizacoes: 0,
      eventosMontados: 0,
      eventosEnviados: 0,
      // Por que NÃO saiu — o número que evita o diagnóstico errado.
      bloqueados: [] as Array<{ organizationId: string; motivo: string }>,
      /** Supressões parciais: o lote saiu, mas alguém ficou de fora. */
      avisos: [] as Array<{ organizationId: string; motivo: string }>,
      /** Sem meta_conversion_configs: fora do ciclo por escolha, não por falha. */
      naoParticipam: 0,
      semConsentimento: 0,
      /**
       * ── AS TRÊS LISTAS DE FALHA ─────────────────────────────────────────
       *
       * Separadas de `bloqueados` de propósito: bloqueio é recusa declarada e
       * segue 200; estas três são erro de verdade e qualquer uma não-vazia leva
       * a rota a 500. Misturá-las de novo devolveria a ambiguidade inteira, que
       * é a única coisa que este arquivo veio tirar.
       */
      falhasDeLeitura: [] as Array<{ organizationId: string; passo: string; erro: string }>,
      falhasDeEnvio: [] as Array<{ organizationId: string; eventos: number; erro: string }>,
      falhasDeRegistro: [] as Array<{ organizationId: string; eventos: number; erro: string }>,
      /**
       * Eventos cuja entrega ficou INDETERMINADA. `sendCapiBatch` fatia em 500
       * por requisição e lança na primeira fatia que a Meta recusa, sem dizer
       * quantas passaram antes — então afirmar "enviados" ou "não enviados" seria
       * inventar. O número honesto é este, e ele é diferente de zero.
       */
      eventosSemConfirmacao: 0,
      /**
       * Organizações cuja janela não pôde ser lida porque a TABELA ou a COLUNA
       * não existe neste banco (42P01/42703). É lacuna de ambiente, não falha de
       * operação: transformá-la em 500 faria o alarme tocar de 4 em 4 horas para
       * sempre, e alarme que toca sempre é alarme que alguém desliga.
       */
      lacunasDeEsquema: 0,
      /**
       * `dataset_unreachable`: o token NÃO alcança o dataset. Contado à parte
       * porque é o oposto de `flag_disabled` — aqui alguém LIGOU o envio e nada
       * chega, que é o caso caro (o painel diz "CAPI ativado" e o custo por lead
       * sobe sem explicação). Empilhado junto dos outros bloqueios, some.
       */
      credencialInalcancavel: 0,
      /** Bateu o teto: existem organizações que este ciclo não olhou. */
      organizacoesNoTeto: (orgs?.length ?? 0) >= LIMITE_ORGS,
    };

    for (const org of orgs ?? []) {
      const organizationId = String(org.id);
      resultado.organizacoes += 1;

      // ── NÃO PARTICIPAR NÃO É ESTAR BLOQUEADO ──────────────────────────────
      //
      // A config era carregada só DEPOIS de montar a janela. Consequência: toda
      // organização sem ciclo de conversão — no banco de homologação, a
      // "Atlas AI" com 0 leads — montava a janela inteira à toa e aparecia como
      // BLOQUEADA em todas as execuções do cron, com uma mensagem sobre
      // consentimento presumido que não descreve problema nenhum.
      //
      // Ruído permanente é pior do que silêncio: quem lê "bloqueado" toda hora
      // para de ler, e o dia em que houver bloqueio de verdade ele passa batido.
      // Quem não tem configuração simplesmente não participa — sai contado em
      // separado, sem alarme e sem trabalho desperdiçado.
      const config = await loadOrgCapiConfig(admin, organizationId);
      if (!config) {
        resultado.naoParticipam += 1;
        continue;
      }

      const janela = await loadWindowBatch(admin, organizationId, JANELA_DIAS);
      if (!janela.ok) {
        // ── SILÊNCIO 1 ────────────────────────────────────────────────────
        //
        // `ok:false` aqui só sai de erro de CONSULTA em leads/lead_events. Antes
        // virava `bloqueados` e 200 — o mesmo 200 de "não havia lead na janela",
        // que é o resultado normal quase todo dia. A falha nunca apareceria.
        //
        // A separação é por CÓDIGO, não por adivinhação: tabela/coluna que não
        // existe neste banco é lacuna declarada e segue 200; qualquer outro erro
        // é banco/permissão e derruba o ciclo com 500 no fim.
        const erro = janela.error.message ?? "erro";
        resultado.bloqueados.push({ organizationId, motivo: `${janela.step}: ${erro}` });
        if (isMissingRelation(janela.error) || isMissingColumn(janela.error)) {
          resultado.lacunasDeEsquema += 1;
          continue;
        }
        logger.error("capi-feedback: leitura da janela falhou", { organizationId, passo: janela.step, erro });
        resultado.falhasDeLeitura.push({ organizationId, passo: janela.step, erro });
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

      // ── SILÊNCIO 2: A EXCEÇÃO QUE MATAVA O LAÇO ─────────────────────────
      //
      // `sendCapiBatch` lança quando a Meta devolve HTTP de erro. Sem este
      // try/catch a exceção subia até o Next.js: 500 sem corpo, e — pior — as
      // organizações seguintes nunca eram processadas. Uma credencial ruim numa
      // imobiliária parava a devolução de conversão de todas as outras, e nada
      // na resposta dizia isso porque não havia resposta.
      //
      // Capturar por organização mantém o ciclo inteiro andando; a falha vai
      // para a lista e a rota devolve 500 no fim, com os números.
      //
      // A config já foi lida no topo do laço — sem linha, a organização nem chega
      // aqui. Ausência nunca vira permissão: num produto multi-organização, um
      // dataset global mandaria a conversão de uma imobiliária para o dataset de
      // outra.
      let envio: CapiSendOutcome | null = null;
      let erroDeEnvio = "";
      try {
        envio = await sendCapiBatch(batch.events, config);
      } catch (erro) {
        erroDeEnvio = erro instanceof Error ? erro.message : String(erro);
      }
      if (!envio) {
        logger.error("capi-feedback: envio à Meta estourou", { organizationId, eventos: batch.events.length, erro: erroDeEnvio });
        resultado.falhasDeEnvio.push({
          organizationId,
          eventos: batch.events.length,
          erro: erroDeEnvio || "exceção sem mensagem",
        });
        resultado.eventosSemConfirmacao += batch.events.length;
        continue;
      }
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
            // ── SILÊNCIO 3 ────────────────────────────────────────────────
            //
            // Falhar o registro NÃO desfaz o envio (já aconteceu) nem derruba o
            // laço: as outras organizações seguem. Mas deixou de sair com 200.
            //
            // O motivo é a própria origem deste worker: `meta_conversion_events`
            // VAZIA foi a medição que provou que nenhuma conversão jamais saíra.
            // Se a gravação falha e a rota responde 200, a tabela continua vazia
            // e a próxima leitura conclui de novo "nunca saiu nada" — só que
            // agora com o dinheiro gasto e a Meta já otimizando com o sinal.
            // Aviso não conserta isso: ninguém lê o corpo de um 200.
            logger.error("capi-feedback: evento enviado sem registro local", {
              organizationId, eventos: linhas.length, erro: registro.error.message,
            });
            resultado.avisos.push({
              organizationId,
              motivo: `envio_sem_registro_local: ${linhas.length} evento(s) saíram para a Meta mas não foram gravados em meta_conversion_events (${registro.error.message}).`,
            });
            resultado.falhasDeRegistro.push({
              organizationId,
              eventos: linhas.length,
              erro: registro.error.message,
            });
          }
        }
      } else {
        // `flag_disabled` e `missing_token` são configuração ausente, não falha:
        // registram e seguem. O worker não pode virar alarme que toca todo dia.
        //
        // `dataset_unreachable` também não estoura — a lib recusa de propósito,
        // e o contrato `capi-nao-falha-em-silencio` exige que ela recuse em vez
        // de lançar. Mas ele é contado à parte: é a recusa que significa "está
        // ligado e mesmo assim nada chega", e essa merece ser vista.
        if (envio.reason === "dataset_unreachable") resultado.credencialInalcancavel += 1;
        resultado.bloqueados.push({ organizationId, motivo: envio.reason ?? "envio recusado" });
      }
    }

    const falhas = resultado.falhasDeLeitura.length + resultado.falhasDeEnvio.length + resultado.falhasDeRegistro.length;

    // A chave geral do servidor recusou TODO envio deste ciclo. Derivado do que
    // aconteceu — `sendCapiBatch` continua sendo o único lugar que decide — e não
    // de uma segunda leitura da variável de ambiente, que seria uma segunda
    // verdade sobre o mesmo interruptor.
    const recusadoPelaChaveGeral =
      resultado.bloqueados.length > 0 && resultado.bloqueados.every((b) => b.motivo === "flag_disabled");

    // `motivo` existe para que "não fiz nada" nunca seja ambíguo: cada resposta
    // sem envio precisa dizer QUAL dos casos ela é.
    const motivoDoCiclo = () => {
      if (falhas > 0) return "envio_ou_registro_falhou";
      if (resultado.eventosEnviados > 0) return "ok";
      if (recusadoPelaChaveGeral) return "envio_desligado_no_servidor";
      if (resultado.organizacoes === 0) return "nenhuma_organizacao";
      if (resultado.naoParticipam === resultado.organizacoes) return "nenhuma_organizacao_participa";
      if (resultado.eventosMontados === 0) return "nenhum_evento_elegivel_na_janela";
      if (resultado.bloqueados.length > 0) return `bloqueado: ${resultado.bloqueados[0].motivo.slice(0, 160)}`;
      return "montou_mas_nada_saiu";
    };
    const motivo = motivoDoCiclo();
    const duracaoMs = Date.now() - iniciadoEm;

    if (falhas > 0) {
      logger.error("capi-feedback: ciclo com falha", { ...resultado, motivo, duracaoMs });
      const corpoDaFalha = { ok: false, ...resultado, motivo, duracaoMs };
      return NextResponse.json(
        { ...corpoDaFalha, livro: await livro("falhou", corpoDaFalha, motivo) },
        { status: 500 },
      );
    }

    logger.info("capi-feedback: ciclo concluído", { ...resultado, motivo, duracaoMs });

    // `sem_trabalho` NÃO é falha, e `fora_da_janela` também não: o vigia acordou,
    // olhou a fila e ou não havia conversão para devolver, ou o servidor recusou
    // por configuração declarada. Os dois eram o mesmo 200 mudo de antes.
    const desfecho = resultado.eventosEnviados > 0
      ? "ok"
      : recusadoPelaChaveGeral
        ? "fora_da_janela"
        : "sem_trabalho";
    const corpo = { ok: true, ...resultado, motivo, duracaoMs };
    return NextResponse.json({ ...corpo, livro: await livro(desfecho, corpo) });
  } catch (erro) {
    // Rede de segurança para o que não foi previsto. Ela existe para que NENHUM
    // caminho saia daqui sem uma linha no livro — inclusive o caminho que eu não
    // enxerguei ao escrever isto.
    logger.error("capi-feedback: ciclo interrompido", erro);
    const registro = await livro("falhou", {}, String(erro));
    return NextResponse.json(
      { ok: false, error: "Falha no ciclo de devolução de conversões à Meta.", motivo: "excecao", livro: registro },
      { status: 500 },
    );
  }
}
