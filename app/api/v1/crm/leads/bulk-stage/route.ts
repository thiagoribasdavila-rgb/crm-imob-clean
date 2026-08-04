/**
 * MOVER VÁRIAS LEADS DE ETAPA DE UMA VEZ.
 *
 * ── Por que isto passou a ser necessário ────────────────────────────────────
 *
 * As 174 leads do Inside não estão em "novo" porque ninguém as trabalhou —
 * estão porque o CRM nunca soube. O histórico vive fora dele, com o corretor,
 * e amanhã ele vem trazer isso para dentro.
 *
 * Uma a uma, isso é abrir 174 telas. A meia hora de trabalho real vira uma
 * tarde de clique, e o que se perde no caminho não é tempo: é a vontade de
 * manter o CRM em dia, que nunca volta depois que se perde.
 *
 * Já existia ação em lote — `bulk-transfer` — mas só para trocar o corretor.
 * Este é o par que faltava.
 *
 * ── O que ele NÃO faz, de propósito ─────────────────────────────────────────
 *
 * Não fecha lead em massa. `ganho` e `perdido` estão fora: são os dois desfechos
 * que disparam evento de conversão para a Meta e alimentam o algoritmo. Marcar
 * 50 vendas por engano ensina a Meta a caçar o público errado, e não há desfazer
 * — o aprendizado já aconteceu. Fechar continua sendo uma lead por vez, com a
 * tela inteira na frente.
 *
 * Também não mexe em dono, em tarefa nem em consentimento. Uma ação em lote que
 * faz várias coisas é uma ação que ninguém consegue prever.
 *
 * ── POR QUE O LOTE NÃO TEM UPDATE PRÓPRIO ───────────────────────────────────
 *
 * Até 2026-08-02 esta rota fazia UM update em `leads` e nada mais. A etapa
 * mudava e o razão do funil — `pipeline_stage_moves`, a fonte canônica de
 * velocidade, envelhecimento, tempo por etapa e taxa de passagem — não ficava
 * sabendo. Movimento em lote era movimento invisível: some do "novo" e não
 * aparece em lugar nenhum como transição.
 *
 * Medido na produção em 2026-08-02, antes da correção: 456 leads fora de
 * "novo", 444 com linha no razão e 12 SEM NENHUMA (2,63%) — todas na
 * organização 7c8c71c1, todas de corretor, com `updated_at` de 30/07 e 01/08.
 *
 * A rota de movimento individual (PATCH /api/v1/pipeline) já resolve isso do
 * jeito certo: chama a função `move_pipeline_lead`, que insere no razão e muda
 * a etapa DENTRO DA MESMA TRANSAÇÃO. Ou as duas escritas acontecem, ou nenhuma.
 *
 * O lote passa a chamar EXATAMENTE essa função, uma vez por lead. Não é uma
 * segunda forma de mover: é a mesma, repetida. Consequências que vêm de graça
 * e que a versão anterior não tinha: `activities`, `atlas_events` e a checagem
 * de alçada dentro da transação (com `for update` na lead, sem a janela entre
 * ler e gravar).
 *
 * E se a função não existir no banco, o lote NÃO move nada: devolve 503. A
 * escrita compensatória que a rota individual mantém como plano B (muda a
 * etapa, tenta auditar, desfaz se falhar) é justamente a máquina que produz
 * lead movida sem rastro — repeti-la 200 vezes por chamada é multiplicar o
 * defeito que esta correção veio apagar. Falhar é melhor que mentir.
 */

import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Etapas que podem ser aplicadas em massa.
 *
 * `ganho` e `perdido` ficam fora: viram evento de conversão na Meta, e engano
 * em massa ali não tem desfazer.
 */
const ETAPAS_EM_LOTE = new Set(["novo", "contato", "qualificacao", "visita", "proposta", "contrato"]);

/** Teto por chamada. Acima disso, o operador confere o que selecionou. */
const MAXIMO = 200;

/**
 * Quantas transações em voo ao mesmo tempo.
 *
 * Uma transação por lead é o preço de ter rastro; 200 delas em fila indiana
 * estouram o tempo da função antes de terminar. Cada chamada tranca só a
 * PRÓPRIA lead (`for update` em uma linha), então não há disputa entre elas.
 * Quatro é o suficiente para 200 leads caberem em poucos segundos sem abrir
 * mais conexões do que o banco gosta.
 */
const PARALELO = 4;

/**
 * Códigos de "esta função não existe neste banco" — 42883 é do Postgres,
 * PGRST202 é do PostgREST quando não acha a função no cache de schema.
 */
const RPC_AUSENTE = new Set(["42883", "PGRST202"]);

/**
 * As recusas de REGRA que `move_pipeline_lead` levanta — lidas do corpo da
 * função na produção em 2026-08-02, uma a uma. Elas dizem "esta lead não devia
 * mover", e são resposta legítima.
 *
 * Tudo que NÃO está aqui é falha técnica, e a mais importante delas é a escrita
 * do razão falhando. A lista é explícita porque a primeira versão classificava
 * pelo prefixo `pipeline_` — e a mensagem de erro da inserção que falha CITA a
 * tabela `pipeline_stage_moves`. O prefixo dava certo por acidente e chamava a
 * falha do razão de "regra de negócio", escondendo do operador exatamente a
 * coisa que ele precisa saber. Medido: com o prefixo, a chamada de prova
 * mostrou 0 recusas técnicas onde havia 1.
 */
const RECUSAS_DE_REGRA = new Set([
  "pipeline_stage_invalid",
  "pipeline_lead_not_found",
  "pipeline_move_out_of_scope",
  "pipeline_stage_conflict",
  "pipeline_buyer_reason_required",
  "pipeline_undo_invalid",
  "pipeline_already_reversed",
  "pipeline_undo_stale",
]);

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 15, windowMs: 60_000, scope: "crm.leads.bulk-stage" });
  if (!rate.ok) return rate.response;

  // ── QUEM MOVE EM LOTE ─────────────────────────────────────────────────────
  //
  // Era só liderança, pela mesma alçada do bulk-transfer. Só que TRANSFERIR
  // muda o dono da lead — ato de quem responde pela carteira — e MOVER DE ETAPA
  // é o trabalho diário de quem atende.
  //
  // Medido em 2026-07-28: o corretor tem 174 leads em "novo" e movia uma a uma.
  // Um dia inteiro de cliques para registrar o que ele já sabe. O lote é a
  // ferramenta certa para isso, e negá-la a quem tem o volume é negar a
  // ferramenta a quem precisa dela.
  //
  // O corretor entra, com DUAS travas que já existiam e continuam valendo:
  //   · `ETAPAS_EM_LOTE` exclui "ganho" e "perdido" — fechar 50 leads por
  //     engano ensina a Meta a caçar o público errado e não tem desfazer;
  //   · o update prende `organization_id`, e abaixo prendemos também o DONO:
  //     lote de corretor só alcança lead dele.
  const access = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!access.ok) return access.response;
  const papel = access.access.profile.commercialRole || access.access.profile.role;
  const soAsMinhas = !["admin", "director", "superintendent", "manager"].includes(String(papel || ""));

  let body: { leadIds?: unknown; stage?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("INVALID_JSON", "Envie os dados em formato válido.", access.meta, { status: 400 });
  }

  const leadIds = Array.isArray(body.leadIds)
    ? [...new Set(body.leadIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
    : [];
  const stage = canonicalPipelineStage(body.stage);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!leadIds.length) {
    return apiError("NO_LEADS", "Selecione ao menos uma lead.", access.meta, { status: 422 });
  }
  if (leadIds.length > MAXIMO) {
    return apiError("TOO_MANY",
      `São ${leadIds.length} leads de uma vez. O limite é ${MAXIMO} — divida a seleção e confira o que está movendo.`,
      access.meta, { status: 422 });
  }
  if (!stage) {
    return apiError("STAGE_INVALID", "Etapa desconhecida.", access.meta, { status: 422 });
  }
  if (!ETAPAS_EM_LOTE.has(stage)) {
    return apiError("STAGE_NOT_BULKABLE",
      `"${stage}" não pode ser aplicada em massa: fechar lead dispara evento de conversão para a Meta, e engano em massa ali não tem desfazer. Feche uma por vez.`,
      access.meta, { status: 422 });
  }

  const admin = getSupabaseAdmin();
  const organizationId = access.access.organization.id;
  const ator = access.access.user.id;

  // ── A ETAPA DE ORIGEM É LIDA, NÃO ADIVINHADA ──────────────────────────────
  //
  // O razão do funil guarda a TRANSIÇÃO (`from_stage` → `to_stage`), e não o
  // efeito colateral "agora está em X". Sem a etapa de origem não existe linha
  // de razão possível — e é a origem que faz a leitura de tempo por etapa e de
  // taxa de passagem valer alguma coisa.
  //
  // A organização entra no WHERE, não só na leitura: sem isso um id de outra
  // organização passaria batido no meio de 200.
  let consulta = admin
    .from("leads")
    .select("id,status")
    .in("id", leadIds)
    .eq("organization_id", organizationId);

  // O DONO entra no WHERE pelo mesmo motivo que a organização: o lote do
  // corretor alcança só a carteira dele. Liderança segue vendo o funil inteiro.
  // Continua no WHERE (e não numa checagem prévia) porque conferir antes e
  // gravar depois é a corrida clássica — a lead muda de dono entre as duas
  // consultas. Aqui a corrida deixou de importar de vez: a mesma alçada é
  // reconferida DENTRO da transação de `move_pipeline_lead`, com a lead
  // travada. Este filtro é a primeira porta; a do banco é a que decide.
  // O que não pertence não é bloqueado com erro: sai da lista de movidas e é
  // relatado abaixo, junto com o resto que não moveu.
  //
  // `user.id` e não `profile.id`: a coluna guarda o id do usuário. Medido em
  // 2026-07-28 que os dois coincidem hoje (18/18 profiles com id = id do auth,
  // 196/196 leads batendo), e reconferido em 2026-08-02: das 490 leads da base,
  // ZERO têm `assigned_to` diferente de `assigned_user_id`. É por isso que este
  // filtro (que olha as duas colunas) e a função do banco (que olha só
  // `assigned_to`) respondem igual hoje. No dia em que divergirem, quem decide
  // é a função — e a lead sobra como "não movida", nunca como movida sem dono.
  if (soAsMinhas) {
    const dono = access.access.user.id;
    consulta = consulta.or(`assigned_user_id.eq.${dono},assigned_to.eq.${dono}`);
  }

  const { data: alcancadas, error } = await consulta;

  if (error) {
    return apiError("BULK_STAGE_FAILED", "Não foi possível mover as leads.", access.meta, { status: 503 });
  }

  const linhas = (alcancadas ?? []) as Array<{ id: string; status: string | null }>;
  // Lead que já está na etapa não é transição: escrever `contato → contato` no
  // razão inventaria um movimento que não houve e zeraria o tempo dela na
  // etapa. Sai da conta de movidas e é declarada à parte.
  const jaNaEtapa = linhas.filter((l) => (l.status ?? "novo") === stage).map((l) => l.id);
  const aMover = linhas.filter((l) => (l.status ?? "novo") !== stage);

  const movidasIds: string[] = [];
  /** Por que cada lead não moveu — vai para o log e vira número na resposta. */
  const recusas: Array<{ leadId: string; motivo: string }> = [];
  /**
   * Quando o razão não pode ser escrito, o lote inteiro para.
   *
   * Não é preciosismo: uma escrita muda aqui é EXATAMENTE o que produziu as 12
   * leads sem rastro. Se a primeira lead já revela que este banco não tem a
   * transação, seguir para as outras 199 é fabricar 199 movimentos invisíveis.
   */
  let semRazao: string | null = null;

  const fila = [...aMover];
  const trabalhador = async () => {
    for (;;) {
      if (semRazao) return;
      const lead = fila.shift();
      if (!lead) return;

      // A MESMA função que a rota de movimento individual chama. Ela insere em
      // `pipeline_stage_moves` e muda `leads.status` na mesma transação: ou as
      // duas escritas acontecem, ou nenhuma. É isso que garante que nenhuma
      // lead deste lote termine movida sem rastro.
      //
      // `p_expected_from_stage` recebe o status CRU lido acima (a função compara
      // com `coalesce(leads.status,'novo')`, também cru). Se alguém mover a
      // mesma lead entre a leitura e esta chamada, a função levanta
      // `pipeline_stage_conflict` e a lead entra em "não movidas" — que é a
      // resposta certa: o lote não passa por cima de trabalho alheio.
      const movimento = await admin.rpc("move_pipeline_lead", {
        p_actor_id: ator,
        p_organization_id: organizationId,
        p_lead_id: lead.id,
        p_to_stage: stage,
        p_expected_from_stage: lead.status ?? "novo",
        p_reason: reason || null,
        p_reversal_of: null,
      });

      // ── O RETORNO DE CADA ESCRITA É CONFERIDO ───────────────────────────
      if (movimento.error) {
        const codigo = String(movimento.error.code || "");
        if (RPC_AUSENTE.has(codigo)) {
          semRazao = "sem_transacao";
          return;
        }
        const mensagem = String(movimento.error.message || "");
        const regra = [...RECUSAS_DE_REGRA].find((nome) => mensagem.includes(nome)) ?? null;
        // `codigo` vem de String(...): quando o driver não manda código ele é
        // "", e "" não é falha conhecida nenhuma — precisa cair em "erro" para
        // ser contado como falha técnica, não sumir como recusa sem nome.
        recusas.push({ leadId: lead.id, motivo: regra ?? (codigo || "erro") });
        continue;
      }

      // Silêncio não é sucesso. A função devolve `{moveId,...}` com o id da
      // linha do razão; sem esse id não há prova de que a linha existe, e sem
      // prova a lead não entra na conta de movidas.
      const dados = (movimento.data ?? {}) as Record<string, unknown>;
      const moveId = typeof dados.moveId === "string" ? dados.moveId : null;
      if (!moveId) {
        semRazao = "resposta_sem_rastro";
        return;
      }
      movidasIds.push(lead.id);
    }
  };

  await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, () => trabalhador()));

  // O que não moveu importa tanto quanto o que moveu: silenciar a diferença
  // faria o operador achar que 200 foram e conferir só na semana seguinte.
  const naoMovidas = leadIds.filter((id) => !movidasIds.includes(id) && !jaNaEtapa.includes(id));
  // Recusa de regra tem nome próprio e está na lista fechada acima. O resto é
  // falha técnica — na prática, o razão não pôde ser gravado — e essa tem de
  // chegar ao operador com o nome dela.
  const recusasTecnicas = recusas.filter((r) => !RECUSAS_DE_REGRA.has(r.motivo)).length;

  if (semRazao) {
    // As que entraram em `movidasIds` moveram COM rastro — cada uma devolveu o
    // id da linha do razão. O que se recusa aqui é CONTINUAR sem essa prova.
    //
    // A frase não promete que as demais ficaram paradas: com transações em
    // voo em paralelo, alguma pode ter completado (e, se completou, completou
    // com rastro — é uma transação). Prometer o que não se sabe é a mesma
    // classe de defeito que esta correção apaga.
    structuredApiLog("error", "crm.leads.bulk_stage_sem_razao", request, access.meta, {
      organizationId,
      actorId: access.access.profile.id,
      stage,
      causa: semRazao,
      solicitadas: leadIds.length,
      movidas: movidasIds.length,
      restantes: fila.length,
    });
    return apiError(
      "BULK_STAGE_NO_LEDGER",
      `O lote parou: ${movidasIds.length} lead(s) mudaram de etapa com registro confirmado no histórico do funil. A partir daí o registro deixou de ser possível e o lote não continuou — mover sem histórico apagaria a medição do funil. Confira o funil e tente de novo.`,
      access.meta,
      {
        status: 503,
        details: { movidas: movidasIds.length, naoMovidas: naoMovidas.length, causa: semRazao },
      },
    );
  }

  structuredApiLog("info", "crm.leads.bulk_stage_success", request, access.meta, {
    organizationId,
    actorId: access.access.profile.id,
    stage,
    solicitadas: leadIds.length,
    movidas: movidasIds.length,
    jaNaEtapa: jaNaEtapa.length,
    naoMovidas: naoMovidas.length,
    recusas: recusas.slice(0, 20),
    reason,
  });

  return apiSuccess({
    stage,
    solicitadas: leadIds.length,
    movidas: movidasIds.length,
    jaNaEtapa: jaNaEtapa.length,
    naoMovidas: naoMovidas.length,
    // Uma linha de razão por lead movida. É a prova de que o funil enxergou o
    // lote, e o nome da tabela vai junto para que a auditoria não precise ler
    // este arquivo para saber onde conferir.
    rastro: { tabela: "pipeline_stage_moves", linhas: movidasIds.length },
    aviso: naoMovidas.length
      ? `${naoMovidas.length} lead(s) não mudaram — fora desta organização, fora da sua carteira, já removidas ou movidas por outra pessoa enquanto isto rodava.${
        // A recusa por falha técnica é dita com o nome dela. Escondê-la na
        // lista de motivos comuns faria o operador procurar um problema de
        // permissão que não existe.
        recusasTecnicas ? ` Dessas, ${recusasTecnicas} lead(s) ficaram onde estavam porque o histórico do funil não pôde ser gravado — mover sem histórico apagaria a medição.` : ""
      }`
      : jaNaEtapa.length
        ? `${jaNaEtapa.length} lead(s) já estavam nesta etapa.`
        : null,
  }, access.meta, { headers: rate.headers });
}
