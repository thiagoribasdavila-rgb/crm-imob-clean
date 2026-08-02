import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { nightlyWindow } from "@/lib/ai/governed-nightly-copilot";
import { compararSombra, registrarEmSombra, registrarGestoObservado } from "@/lib/ai/registro-de-sombra";
import {
  ACAO,
  AGENTE,
  JANELA_DE_OBSERVACAO_HORAS,
  TETO_DE_INTENCOES_PENDENTES,
  gestoDoEventoDeLead,
  gestoDoMovimentoDeEtapa,
  observarGestoDoHumano,
  planejarSombraDoDia,
  type LeadNaFila,
  type SinalDoHumano,
} from "@/lib/ai/sombra-do-atendimento";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * O VIGIA DO MODO SOMBRA — a IA trabalha hoje, e nada sai.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A CADEIA QUE TRAVA, MEDIDA NO BANCO DE PRODUÇÃO EM 02/08/2026
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   message_templates ......... 0 linhas de QUALQUER status
 *   ai_sales_journeys ......... 0
 *   atlas_agent_runs .......... 0
 *   nightly_broker_handoffs ... 0
 *   ai_shadow_decisions ....... 20, TODAS com decisao_humana nula
 *   corretores ativos ......... 3, nenhum jamais disparou uma chamada de LLM
 *
 * Sem template aprovado a IA não envia; sem envio não nasce jornada; sem jornada
 * não há entrega matinal. O template depende do dono — e enquanto ele não vier,
 * a IA não faz nada, nem o que não precisa dele.
 *
 * Este vigia é o degrau 1 de `docs/design/ATENDIMENTO_AUTONOMO_MODELO.md`: a IA
 * PREPARA a fila do dia — qual lead, qual gesto, qual mensagem, qual prioridade
 * — e REGISTRA a intenção. Não precisa de template, nem de número, nem de
 * aprovação, porque não envia coisa alguma.
 *
 * ── O QUE ELE FAZ QUE A SOMBRA AINDA NÃO FAZIA ──────────────────────────────
 *
 * O modo sombra existe desde 30/07 e as 20 linhas que ele produziu têm
 * `decisao_humana` NULA. `compararSombraComHumano` responde, e responderia para
 * sempre: "nenhum caso com decisão humana registrada: não há o que comparar".
 * Sombra sem o segundo lado é opinião da IA sobre si mesma.
 *
 * Este vigia fecha os dois lados na MESMA execução:
 *
 *   1. CONCILIA — para cada intenção que ainda espera, lê o rastro que o
 *      trabalho humano já deixou no banco (primeiro contato, movimento de etapa,
 *      evento de lead) e grava o que a pessoa DE FATO fez depois. Ninguém
 *      precisa digitar nada; se dependesse de digitação, dependeria dos mesmos
 *      3 corretores que não contatam 466 leads.
 *
 *   2. PREPARA — monta a fila do dia para as vagas que a conciliação abriu.
 *
 * A ordem importa: conciliar primeiro é o que devolve vaga na fila. Invertido, o
 * teto ficaria cheio de registros já respondidos e a sombra pararia de aprender.
 *
 * ── AS TRÊS TRAVAS QUE FAZEM "NADA SAI" NÃO DEPENDER DE MIM ─────────────────
 *
 *   1. `ACAO = "enviar_mensagem"` está em `ACOES_RETIDAS_PADRAO` → o modo sombra
 *      RETÉM;
 *   2. a mesma ação exige nível 4 + aprovação registrada, e o agente é nível 2 →
 *      `avaliarAcaoDeAgente` RECUSA;
 *   3. esta rota não importa nenhum cliente de envio. Não há WhatsApp, não há
 *      Meta, não há `integration_outbox`. Não é que ela decide não enviar: ela
 *      não tem com o que.
 *
 * Qualquer uma sozinha bastaria. Três porque a primeira é configuração (alguém
 * edita um JSON), a segunda é catálogo (alguém sobe um nível) e a terceira é
 * estrutura (alguém teria que escrever um import novo, e isso aparece na
 * revisão).
 *
 * ── OS QUATRO DESFECHOS, TODOS ALCANÇÁVEIS ──────────────────────────────────
 *
 *   ok ............... preparou intenção nova ou concluiu observação.
 *   sem_trabalho ..... acordou, olhou e não havia o que preparar nem o que
 *                      observar. `motivo` diz qual dos casos foi.
 *   fora_da_janela ... 07h–11h59 em São Paulo. A janela é a mesma da entrega
 *                      matinal, e o motivo é o mesmo: a fila do dia tem de ser
 *                      preparada ANTES de o corretor trabalhar o dia, senão a
 *                      comparação vira "a IA propôs depois de ele já ter feito".
 *   falhou ........... 500. Consulta com erro (throw) ou gravação de sombra não
 *                      confirmada.
 *
 * ── O QUE ELE NÃO CONSERTA, e fica nomeado ──────────────────────────────────
 *
 * As 20 linhas do agente `sla-primeiro-contato` continuam sem segundo lado. A
 * conciliação aqui é escopada ao PRÓPRIO agente de propósito: preencher
 * `decisao_humana` na evidência de outro agente é escrita irreversível em
 * produção, com uma régua que o autor daquele agente não desenhou. Medido para o
 * dono decidir: dos 20, 15 foram movidos para `perdido`, 1 para `qualificacao`,
 * 1 recebeu primeiro contato e 3 seguem intocados. Ligar isso é trocar
 * `AGENTES_CONCILIADOS` abaixo, e a consequência — a fila do outro vigia volta a
 * repor — está escrita lá.
 */

/**
 * De quem esta rota preenche o segundo lado. Um nome só, e é o dela.
 * Ver o parágrafo "O QUE ELE NÃO CONSERTA" acima antes de somar outro.
 */
const AGENTES_CONCILIADOS = [AGENTE] as const;

/** Teto de organizações por execução. Recorte declarado, igual ao do baseline. */
const LIMITE_DE_ORGS = 200;

/** Teto de intenções pendentes lidas por organização. */
const LIMITE_DE_PENDENTES = 500;

type LinhaPendente = { id: string; entidade_id: string | null; created_at: string };

export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  // O relógio começa ANTES de qualquer decisão: "recusei por horário" também é
  // execução, e é justamente a que some sem deixar rastro.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "sombra-do-atendimento", rota: "/api/v2/ai/sombra-do-atendimento/process", origem, iniciadoEm, desfecho, resposta, erro });

  const janela = nightlyWindow();
  if (!janela.morningHandoff) {
    const corpo = {
      preparadas: 0,
      observadas: 0,
      motivo: "fora_da_janela",
      detalhe:
        "A fila em sombra é preparada entre 7h e 11h59 em São Paulo, antes de o corretor trabalhar o dia. " +
        "Preparar depois compararia a IA com um dia que já aconteceu.",
    };
    return NextResponse.json({ ...corpo, livro: await livro("fora_da_janela", corpo) });
  }

  // Contadores FORA do try: quando algo estoura no meio, o 500 ainda diz quanto
  // já tinha sido feito. Exceção que zera o placar apaga trabalho real.
  const agora = new Date().toISOString();
  let organizacoes = 0;
  let pendentesLidas = 0;
  let observadas = 0;
  let seguemPendentes = 0;
  let elegiveis = 0;
  let jaAmostradas = 0;
  let preparadas = 0;
  let retidas = 0;
  let executadas = 0;
  let recusadasPeloTeto = 0;
  let foraDoTeto = 0;
  let rascunhosComRisco = 0;
  const porGestoDoHumano: Record<string, number> = {};
  const porGestoDaIA: Record<string, number> = {};
  const falhas: Array<{ organizacao: string; oQue: string; detalhe: string }> = [];
  const recortes: string[] = [];
  const porqueVazio: string[] = [];
  const comparacoes: Record<string, unknown> = {};

  try {
    // Dentro do try de propósito: sem as variáveis de ambiente isto lança, e do
    // lado de fora a exceção subiria sem corpo JSON e sem linha no livro.
    const admin = getSupabaseAdmin();

    const orgs = await admin.from("organizations").select("id").limit(LIMITE_DE_ORGS);
    if (orgs.error) throw new Error(`falha ao ler organizações: ${orgs.error.message}`);
    const organizacoesLidas = (orgs.data ?? []) as Array<{ id: string }>;
    organizacoes = organizacoesLidas.length;
    if (organizacoes >= LIMITE_DE_ORGS) recortes.push(`organizations:limite-${LIMITE_DE_ORGS}`);

    for (const org of organizacoesLidas) {
      // ── 1. CONCILIAR — o segundo lado, lido do rastro ─────────────────────
      const pendentes = await admin
        .from("ai_shadow_decisions")
        .select("id,entidade_id,created_at")
        .eq("organization_id", org.id)
        .in("agent", [...AGENTES_CONCILIADOS])
        .eq("entidade_tipo", "lead")
        .is("decisao_humana", null)
        .order("created_at", { ascending: true })
        .limit(LIMITE_DE_PENDENTES);
      if (pendentes.error) throw new Error(`falha ao ler intenções pendentes de ${org.id}: ${pendentes.error.message}`);
      const linhasPendentes = ((pendentes.data ?? []) as LinhaPendente[]).filter((linha) => Boolean(linha.entidade_id));
      pendentesLidas += linhasPendentes.length;
      if (linhasPendentes.length >= LIMITE_DE_PENDENTES) recortes.push(`pendentes:${org.id}`);

      // As leads que ainda esperam observação. Quem for observado agora sai da
      // fila; quem não for continua ocupando vaga, e é isso que o teto conta.
      const leadsPendentes = [...new Set(linhasPendentes.map((linha) => String(linha.entidade_id)))];
      const aindaPendentes = new Set(leadsPendentes);

      if (linhasPendentes.length > 0) {
        // O corte é o instante da intenção MAIS ANTIGA: nenhum rastro anterior a
        // ele interessa, e sem o corte esta consulta traria o histórico inteiro.
        const corte = linhasPendentes[0].created_at;

        const leadsDoLote = await admin
          .from("leads")
          .select("id,first_contacted_at")
          .eq("organization_id", org.id)
          .in("id", leadsPendentes);
        if (leadsDoLote.error) throw new Error(`falha ao ler leads observadas de ${org.id}: ${leadsDoLote.error.message}`);

        const movimentos = await admin
          .from("pipeline_stage_moves")
          .select("lead_id,to_stage,occurred_at,actor_id")
          .eq("organization_id", org.id)
          .in("lead_id", leadsPendentes)
          .gte("occurred_at", corte);
        if (movimentos.error) throw new Error(`falha ao ler movimentos de etapa de ${org.id}: ${movimentos.error.message}`);

        const eventos = await admin
          .from("lead_events")
          .select("lead_id,type,event_type,created_at,created_by")
          .eq("organization_id", org.id)
          .in("lead_id", leadsPendentes)
          .gte("created_at", corte);
        if (eventos.error) throw new Error(`falha ao ler eventos de lead de ${org.id}: ${eventos.error.message}`);

        const sinaisPorLead = new Map<string, SinalDoHumano[]>();
        const anota = (leadId: string, sinal: SinalDoHumano) => {
          const lista = sinaisPorLead.get(leadId) ?? [];
          lista.push(sinal);
          sinaisPorLead.set(leadId, lista);
        };

        for (const linha of (leadsDoLote.data ?? []) as Array<{ id: string; first_contacted_at: string | null }>) {
          if (linha.first_contacted_at) {
            anota(String(linha.id), {
              gesto: "contatar",
              em: linha.first_contacted_at,
              // Esta coluna guarda QUANDO, nunca QUEM. Preencher com o dono da
              // lead seria inventar quem trabalhou.
              porQuem: null,
              fonte: "leads.first_contacted_at",
            });
          }
        }
        for (const linha of (movimentos.data ?? []) as Array<{ lead_id: string; to_stage: string | null; occurred_at: string | null; actor_id: string | null }>) {
          const gesto = gestoDoMovimentoDeEtapa(canonicalPipelineStage(linha.to_stage) ?? linha.to_stage);
          if (!gesto || !linha.occurred_at) continue;
          anota(String(linha.lead_id), { gesto, em: linha.occurred_at, porQuem: linha.actor_id, fonte: "pipeline_stage_moves" });
        }
        for (const linha of (eventos.data ?? []) as Array<{ lead_id: string; type: string | null; event_type: string | null; created_at: string | null; created_by: string | null }>) {
          const gesto = gestoDoEventoDeLead(linha.event_type ?? linha.type);
          if (!gesto || !linha.created_at) continue;
          anota(String(linha.lead_id), { gesto, em: linha.created_at, porQuem: linha.created_by, fonte: "lead_events" });
        }

        for (const linha of linhasPendentes) {
          const leadId = String(linha.entidade_id);
          const observacao = observarGestoDoHumano({
            sombraEm: linha.created_at,
            agora,
            sinais: sinaisPorLead.get(leadId) ?? [],
            janelaHoras: JANELA_DE_OBSERVACAO_HORAS,
          });
          if (!observacao.concluido) continue;

          const gravacao = await registrarGestoObservado({
            registroId: linha.id,
            gesto: observacao.gesto,
            decididoEm: observacao.em,
            decididoPor: observacao.porQuem,
          });
          // Observação que não grava é evidência perdida em silêncio — e o
          // silêncio é a doença inteira que este vigia existe para tratar.
          if (!gravacao.gravado) {
            falhas.push({ organizacao: org.id, oQue: "observacao_nao_gravada", detalhe: gravacao.detalhe });
            continue;
          }
          observadas += 1;
          aindaPendentes.delete(leadId);
          porGestoDoHumano[observacao.gesto] = (porGestoDoHumano[observacao.gesto] ?? 0) + 1;
        }
      }
      seguemPendentes += aindaPendentes.size;

      // ── 2. PREPARAR — a fila do dia, nas vagas que sobraram ───────────────
      //
      // ── UMA INTENÇÃO POR LEAD, PARA SEMPRE — e o motivo foi MEDIDO ────────
      //
      // A dedupe natural seria contra as intenções PENDENTES, como faz o
      // `sla-primeiro-contato`. Rodando a fila real de 02/08/2026 (67 leads
      // abertas), o resultado foi este:
      //
      //   as 20 vagas foram TODAS para leads com probabilidade mais alta —
      //   8 agendar_visita, 7 qualificar, 5 contatar — e 47 ficaram fora.
      //
      // As de probabilidade alta são justamente as que JÁ receberam primeiro
      // contato (o baseline dá peso 3 a isso contra 0,35). Com dedupe só do
      // pendente, assim que a observação de uma delas concluísse ela voltaria a
      // ser a mais bem colocada e reentraria na fila — as mesmas 20 girando para
      // sempre, e as 466 leads sem primeiro contato NUNCA entrando na comparação.
      //
      // Seria uma comparação que só olha para quem já está sendo atendido:
      // exatamente o pedaço em que a operação não tem problema.
      //
      // Com uma intenção por lead, a fila ANDA. Cada observação concluída abre
      // vaga para alguém que ainda não foi amostrado, e em poucos ciclos a
      // sombra cobre a base inteira. Degrau 1 é AMOSTRA, não operação: olhar a
      // mesma lead duas vezes não acrescenta caso à comparação.
      const jaVistas = await fetchAllRows<{ entidade_id: string | null }>((de, ate) =>
        admin
          .from("ai_shadow_decisions")
          .select("entidade_id")
          .eq("organization_id", org.id)
          .eq("agent", AGENTE)
          .eq("entidade_tipo", "lead")
          .order("entidade_id", { ascending: true })
          .range(de, ate),
      );
      if (jaVistas.error) throw new Error(`falha ao ler intenções já registradas de ${org.id}: ${jaVistas.error.message ?? jaVistas.error.code ?? "sem detalhe"}`);
      if (jaVistas.truncated) recortes.push(`ja-vistas:${org.id}`);
      const amostradas = new Set(jaVistas.rows.map((linha) => String(linha.entidade_id)));
      jaAmostradas += amostradas.size;

      const vagas = Math.max(0, TETO_DE_INTENCOES_PENDENTES - aindaPendentes.size);
      // Fila cheia NÃO pula a organização, e isso já foi um defeito meu nesta
      // mesma sessão: com `continue`, a comparação lá embaixo não era lida
      // justamente quando havia 20 intenções esperando — o momento em que ela é
      // mais informativa. Sair sem publicar a comparação por estar ocupado é o
      // mesmo silêncio de sempre, com outra roupa.
      if (vagas === 0) {
        porqueVazio.push(
          `${org.id}: ${aindaPendentes.size} intenção(ões) ainda esperando o humano agir. A fila só repõe quando a ` +
            "observação conclui — empilhar mais transformaria evidência em ruído.",
        );
        recusadasPeloTeto += 1;
      } else {

        const leads = await fetchAllRows<{
          id: string; name: string | null; project: string | null; status: string | null;
          created_at: string | null; first_contacted_at: string | null; source: string | null;
          assigned_to: string | null; assigned_user_id: string | null;
        }>((de, ate) =>
          admin
            .from("leads")
            .select("id,name,project,status,created_at,first_contacted_at,source,assigned_to,assigned_user_id")
            .eq("organization_id", org.id)
            .order("id", { ascending: true })
            .range(de, ate),
        );
        if (leads.error) throw new Error(`falha ao ler leads de ${org.id}: ${leads.error.message ?? leads.error.code ?? "sem detalhe"}`);
        if (leads.truncated) recortes.push(`leads:${org.id}`);

        // A fila do dia é o que está ABERTO e ainda não foi amostrado.
        // O filtro de fechadas fica aqui e NÃO no módulo puro por economia de
        // ruído: 419 das 490 leads estão perdidas, e devolver 419 recusas por
        // execução afogaria as recusas que importam (as acima do teto da IA).
        const fila: LeadNaFila[] = leads.rows
          .filter((lead) => {
            const etapa = canonicalPipelineStage(lead.status);
            return etapa !== "ganho" && etapa !== "perdido" && etapa !== "comprou_outro";
          })
          .filter((lead) => !amostradas.has(String(lead.id)))
          .map((lead) => ({
            id: String(lead.id),
            nome: lead.name,
            empreendimento: lead.project,
            etapa: canonicalPipelineStage(lead.status),
            origem: lead.source,
            criadaEm: lead.created_at,
            primeiroContatoEm: lead.first_contacted_at,
            temDono: Boolean(lead.assigned_to || lead.assigned_user_id),
          }));
        elegiveis += fila.length;

        const plano = planejarSombraDoDia(fila, { agora, teto: vagas });
        foraDoTeto += plano.foraDoTeto;
        if (plano.porqueVazio) porqueVazio.push(`${org.id}: ${plano.porqueVazio}`);

        for (const intencao of plano.intencoes) {
          if (!intencao.rascunhoSeguro) rascunhosComRisco += 1;
          const registro = await registrarEmSombra({
            organizationId: org.id,
            agente: AGENTE,
            acao: ACAO,
            // O verbo vai em `recomendacao` (é ele que a comparação confronta com
            // a decisão humana); TODA a prosa vai aqui, onde não atrapalha.
            preparado: {
              gesto: intencao.gesto,
              prioridade: intencao.prioridade,
              canal: intencao.canal,
              mensagem: intencao.mensagem,
              rascunhoSeguro: intencao.rascunhoSeguro,
              avisosDoRascunho: intencao.avisosDoRascunho,
              probabilidadeBaseline: intencao.probabilidadeBaseline,
              porque: intencao.porque,
              janelaDeObservacaoHoras: JANELA_DE_OBSERVACAO_HORAS,
            },
            recomendacao: intencao.gesto,
            // Confiança NÃO é a probabilidade de conversão: são coisas diferentes,
            // e ninguém mediu a segunda. `null` diz "não medida".
            confianca: null,
            entidade: { tipo: "lead", id: intencao.leadId },
          });
          if (!registro.registroId) {
            falhas.push({ organizacao: org.id, oQue: "intencao_nao_gravada", detalhe: `lead ${intencao.leadId}` });
            continue;
          }
          preparadas += 1;
          if (registro.retido) retidas += 1;
          if (registro.executado) executadas += 1;
          porGestoDaIA[intencao.gesto] = (porGestoDaIA[intencao.gesto] ?? 0) + 1;
        }

      }

      // A comparação lida do banco, por organização. É o produto final do
      // degrau 1, e ela viaja na resposta com as ressalvas junto — número sem
      // ressalva é como esta base já publicou 33% de acerto sobre 3 casos.
      comparacoes[org.id] = await compararSombra({ organizationId: org.id, agente: AGENTE });
    }

    const motivo = falhas.length
      ? "gravacao_nao_confirmada"
      : organizacoes === 0
        ? "sem_organizacoes"
        : preparadas > 0 || observadas > 0
          ? recortes.length
            ? "ok_parcial"
            : "ok"
          : elegiveis === 0
            ? "sem_leads_elegiveis"
            : recusadasPeloTeto > 0
              ? "fila_pendente_cheia"
              : "nada_novo_a_preparar";

    const corpo: Record<string, unknown> = {
      ok: !falhas.length,
      motivo,
      agente: AGENTE,
      acao: ACAO,
      janela: "07:00–11:59 America/Sao_Paulo",
      organizacoes,
      conciliacao: {
        pendentesLidas,
        observadas,
        seguemPendentes,
        porGesto: porGestoDoHumano,
        janelaDeObservacaoHoras: JANELA_DE_OBSERVACAO_HORAS,
        escopo: [...AGENTES_CONCILIADOS],
      },
      preparacao: {
        elegiveis,
        // Quantas leads já foram amostradas alguma vez. É por ele que se
        // enxerga a fila ANDANDO — sem isso, "20 preparadas" todo dia poderia
        // ser a mesma lead vinte vezes.
        jaAmostradas,
        preparadas,
        retidas,
        executadas,
        foraDoTeto,
        tetoDaFilaPendente: TETO_DE_INTENCOES_PENDENTES,
        porGesto: porGestoDaIA,
        rascunhosComRisco,
        porqueVazio,
      },
      comparacao: comparacoes,
      // Contrato auditável, e ele é verificável lendo os imports deste arquivo:
      // não há cliente de WhatsApp, de Meta nem de outbox aqui.
      naoExecutado: {
        mensagensEnviadas: false,
        jornadasCriadas: false,
        leadsRedistribuidas: false,
        etapasMovidas: false,
        porque:
          `"${ACAO}" está nas ações retidas do modo sombra E exige nível 4 com aprovação registrada, e o agente ` +
          `"${AGENTE}" é nível 2 (prepara e deixa salvo). As duas recusas são independentes.`,
      },
      // Rule of the house: zero desenhado como saúde é proibido. Quando a IA não
      // pode operar, a resposta diz o MOTIVO e QUEM resolve.
      paraSairDaSombra: [
        {
          bloqueio: "Nenhum template de WhatsApp aprovado (message_templates: 0 linhas de qualquer status).",
          quemResolve: "O DONO — submeter o template à Meta. Nenhum degrau acima de sombra é alcançável sem isso.",
        },
        {
          bloqueio: `Evidência insuficiente: a comparação só sustenta decisão com amostra declarada, e a janela de observação é de ${JANELA_DE_OBSERVACAO_HORAS}h.`,
          quemResolve: "O TEMPO — cada execução acumula um caso. Antes disso, tirar a IA da sombra é decidir sem dado.",
        },
      ],
      parcial: recortes.length > 0,
      recortes,
      duracaoMs: Date.now() - iniciadoEm,
    };

    // O livro leva CONTADORES, não o corpo: `comparacao` carrega texto de
    // ressalva por organização, e isso viraria custo de banco cobrado por
    // observabilidade — trocar um problema por outro.
    const paraOLivro: Record<string, unknown> = {
      motivo,
      organizacoes,
      pendentesLidas,
      observadas,
      seguemPendentes,
      elegiveis,
      jaAmostradas,
      preparadas,
      retidas,
      foraDoTeto,
      rascunhosComRisco,
      falhas: falhas.length,
      parcial: recortes.length > 0,
    };

    if (falhas.length) {
      logger.error("ia.sombra_do_atendimento_gravacao_nao_confirmada", { falhas: falhas.length, primeira: falhas[0] });
      return NextResponse.json({ ...corpo, falhas, livro: await livro("falhou", paraOLivro) }, { status: 500 });
    }

    logger.info("ia.sombra_do_atendimento_concluido", { preparadas, observadas, motivo });
    // `sem_trabalho` NÃO é falha: o vigia acordou, olhou a fila e não havia o
    // que preparar nem o que observar. É exatamente o desfecho que se confunde
    // com "nunca rodou".
    return NextResponse.json({ ...corpo, livro: await livro(preparadas > 0 || observadas > 0 ? "ok" : "sem_trabalho", paraOLivro) });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("ia.sombra_do_atendimento_falhou", { mensagem });
    const corpo: Record<string, unknown> = {
      ok: false,
      motivo: "excecao",
      mensagem,
      organizacoes,
      pendentesLidas,
      observadas,
      elegiveis,
      preparadas,
      falhas: falhas.length,
      parcial: recortes.length > 0,
      recortes,
      duracaoMs: Date.now() - iniciadoEm,
    };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, mensagem) }, { status: 500 });
  }
}
