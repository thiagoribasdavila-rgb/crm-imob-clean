import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { isMissingColumn } from "@/lib/compat/legacy-v2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * VIGIA DO SLA DE PRIMEIRO CONTATO — nível A1 (execução segura).
 *
 * Observa leads sem primeiro contato e cria tarefa para o corretor antes e
 * depois do vencimento. Escalona para o gerente quando vence.
 *
 * O QUE ELE NÃO FAZ, DE PROPÓSITO:
 * não reatribui lead, não pausa campanha, não envia nada para o cliente. A
 * reatribuição por SLA vencido é ação A2 e exige regra de distribuição
 * previamente aprovada — está atrás de ATLAS_SLA_AUTO_REASSIGN, desligada por
 * padrão. Enquanto isso o vigia avisa quem decide, em vez de decidir sozinho.
 *
 * Idempotência: a tarefa carrega uma chave por (lead, estágio) em metadata e o
 * worker não recria o que já existe. Rodar de 5 em 5 minutos não gera enxurrada.
 */

type Estagio = "aviso" | "vencido";

/**
 * Prefixos ESTÁVEIS de título. Existem porque a idempotência tem duas vias: a
 * chave em `metadata.slaKey`, precisa, e — quando o banco não tem a coluna
 * metadata em `tasks` — o prefixo do título, que é o que sobra para reconhecer
 * uma cobrança que já foi feita. Se mudarem, o worker volta a duplicar tarefa a
 * cada ciclo de 5 minutos.
 */
const PREFIXO_DE_TITULO: Record<Estagio, string> = {
  vencido: "SLA vencido",
  aviso: "Contatar em",
};

export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const admin = getSupabaseAdmin();
  const agora = Date.now();
  // Janela de aviso: 60% do prazo decorrido. Em lead da Meta (5 min) o corretor
  // é avisado aos 3; em lead de portal (15 min), aos 9.
  const FRACAO_DE_AVISO = 0.6;

  // SLA é sobre VELOCIDADE DE RESPOSTA. Passado certo ponto, a lead deixou de
  // ser um problema de SLA e virou um problema de reativação — e cobrar o
  // corretor por ela só polui a fila e a métrica. O limite existe porque a base
  // real tinha 210 leads vencidas com atraso médio de 20 dias: sem ele, a
  // primeira execução criaria 207 tarefas de uma vez e soterraria a equipe.
  const LIMITE_DE_RECUPERACAO_MIN = Number(process.env.ATLAS_SLA_JANELA_RECUPERACAO_MIN || 2880); // 48h
  const MAX_TAREFAS_POR_EXECUCAO = Number(process.env.ATLAS_SLA_MAX_TAREFAS || 25);

  try {
    const leads = await admin
      .from("leads")
      .select("id,name,organization_id,assigned_user_id,created_at,first_contact_due_at,first_contact_sla_minutes,source,status")
      .is("first_contacted_at", null)
      .not("first_contact_due_at", "is", null)
      .not("status", "in", "(ganho,perdido,arquivado,GANHO,PERDIDO,ARQUIVADO)")
      .order("first_contact_due_at", { ascending: true })
      .limit(500);

    if (leads.error) {
      // Banco sem a fase 34: o vigia não tem o que vigiar. Não é falha.
      if (isMissingColumn(leads.error)) {
        logger.info("crm.first_contact_sla_worker_skipped", { reason: "colunas de SLA ausentes neste banco" });
        return NextResponse.json({ status: "skipped", reason: "sla-columns-unavailable" });
      }
      throw leads.error;
    }

    const pendentes: Array<{ lead: Record<string, unknown>; estagio: Estagio; atrasoMin: number }> = [];
    let foraDaJanela = 0;
    for (const lead of leads.data ?? []) {
      const prazo = Date.parse(String(lead.first_contact_due_at));
      if (!Number.isFinite(prazo)) continue;
      const criada = lead.created_at ? Date.parse(String(lead.created_at)) : prazo;
      const limiteDeAviso = criada + (prazo - criada) * FRACAO_DE_AVISO;

      if (agora >= prazo) {
        const atrasoMin = Math.floor((agora - prazo) / 60_000);
        // Fora da janela de recuperação: não vira tarefa de SLA. Continua
        // contabilizada e reportada como acervo para reativação.
        if (atrasoMin <= LIMITE_DE_RECUPERACAO_MIN) {
          pendentes.push({ lead, estagio: "vencido", atrasoMin });
        } else {
          foraDaJanela += 1;
        }
      } else if (agora >= limiteDeAviso) {
        pendentes.push({ lead, estagio: "aviso", atrasoMin: Math.max(0, Math.ceil((prazo - agora) / 60_000)) });
      }
    }

    if (!pendentes.length) {
      return NextResponse.json({ status: "completed", avaliadas: leads.data?.length ?? 0, criadas: 0, jaExistiam: 0 });
    }

    // Uma consulta só para saber o que já foi avisado — evita N queries.
    const chaves = pendentes.map((p) => `sla:${p.lead.id}:${p.estagio}`);
    const jaAvisado = new Set<string>();
    let metadataDisponivel = true;

    const existentes = await admin
      .from("tasks")
      .select("id,metadata")
      .in("metadata->>slaKey", chaves)
      .limit(1000);

    if (existentes.error) {
      // Banco sem a coluna metadata em tasks (PGRST204/42703). Sem ela não há
      // chave precisa, e a alternativa honesta é reconhecer a cobrança pelo
      // prefixo do título. Menos preciso, mas ainda impede a enxurrada — que é o
      // que importa quando o worker roda de 5 em 5 minutos.
      if (!isMissingColumn(existentes.error) && existentes.error.code !== "PGRST204") throw existentes.error;
      metadataDisponivel = false;
      const porTitulo = await admin
        .from("tasks")
        .select("lead_id,title,status")
        .in("lead_id", pendentes.map((p) => String(p.lead.id)))
        .limit(1000);
      if (porTitulo.error) throw porTitulo.error;
      for (const tarefa of porTitulo.data ?? []) {
        const titulo = String(tarefa.title ?? "");
        for (const estagio of ["vencido", "aviso"] as Estagio[]) {
          if (titulo.startsWith(PREFIXO_DE_TITULO[estagio])) jaAvisado.add(`sla:${tarefa.lead_id}:${estagio}`);
        }
      }
      logger.info("crm.first_contact_sla_worker_degraded", { reason: "tasks.metadata ausente; idempotência por título" });
    } else {
      for (const tarefa of (existentes.data ?? []) as Array<{ metadata?: { slaKey?: string } }>) {
        if (tarefa.metadata?.slaKey) jaAvisado.add(tarefa.metadata.slaKey);
      }
    }

    const novas = pendentes
      .filter((p) => !jaAvisado.has(`sla:${p.lead.id}:${p.estagio}`))
      // Menor atraso primeiro: lead vencida há 10 minutos ainda se recupera;
      // vencida há 10 horas, quase não. A fila do corretor recebe o que tem
      // chance de virar conversa hoje.
      .sort((a, b) => a.atrasoMin - b.atrasoMin)
      .slice(0, MAX_TAREFAS_POR_EXECUCAO)
      .map((p) => {
        const vencido = p.estagio === "vencido";
        return {
          organization_id: p.lead.organization_id,
          user_id: p.lead.assigned_user_id,
          lead_id: p.lead.id,
          title: vencido
            ? `${PREFIXO_DE_TITULO.vencido} há ${p.atrasoMin} min — ${String(p.lead.name ?? "lead")}`
            : `${PREFIXO_DE_TITULO.aviso} ${p.atrasoMin} min — ${String(p.lead.name ?? "lead")}`,
          description: vencido
            ? `Primeiro contato não registrado. Origem ${p.lead.source ?? "não informada"}, prazo de ${p.lead.first_contact_sla_minutes ?? "?"} min. Registre o contato assim que falar com a pessoa.`
            : `Prazo de primeiro contato encerra em ${p.atrasoMin} min. Origem ${p.lead.source ?? "não informada"}.`,
          priority: vencido ? "alta" : "media",
          status: "pendente",
          due_date: new Date(vencido ? agora : Date.parse(String(p.lead.first_contact_due_at))).toISOString(),
          metadata: {
            slaKey: `sla:${p.lead.id}:${p.estagio}`,
            origem: "vigia-sla-primeiro-contato",
            estagio: p.estagio,
            // Escalonamento é informativo: quem recebe a tarefa é o dono da lead.
            // Notificar gerência é decisão da tela, não deste worker.
            escalarParaGestao: vencido,
          },
        };
      })
      // Lead sem dono não gera tarefa: não há para quem atribuir. Ela aparece na
      // fila de distribuição, que é onde o problema dela se resolve.
      .filter((t) => Boolean(t.user_id));

    let criadas = 0;
    if (novas.length) {
      // Sem a coluna metadata, mandar o campo derrubaria o insert inteiro.
      const carga = metadataDisponivel
        ? novas
        : novas.map((tarefa) => {
          const copia: Record<string, unknown> = { ...tarefa };
          delete copia.metadata;
          return copia;
        });
      const inseridas = await admin.from("tasks").insert(carga).select("id");
      if (inseridas.error) throw inseridas.error;
      criadas = inseridas.data.length;
    }

    const semDono = pendentes.filter((p) => !p.lead.assigned_user_id).length;
    logger.info("crm.first_contact_sla_worker_completed", {
      avaliadas: leads.data?.length ?? 0,
      pendentes: pendentes.length,
      criadas,
      jaExistiam: pendentes.length - novas.length - semDono,
      semDono,
    });

    return NextResponse.json({
      status: "completed",
      avaliadas: leads.data?.length ?? 0,
      vencidas: pendentes.filter((p) => p.estagio === "vencido").length,
      proximasDoVencimento: pendentes.filter((p) => p.estagio === "aviso").length,
      criadas,
      semDono,
      foraDaJanelaDeRecuperacao: foraDaJanela,
      limitePorExecucao: MAX_TAREFAS_POR_EXECUCAO,
      // Quem lê o log precisa saber por qual chave a idempotência está passando.
      idempotencia: metadataDisponivel ? "metadata.slaKey" : "prefixo-de-titulo",
      // Diz explicitamente o que NÃO foi feito, para ninguém supor autonomia
      // que o worker não tem.
      naoExecutado: {
        acervoAntigo: foraDaJanela
          ? `${foraDaJanela} lead(s) vencidas há mais de ${Math.round(LIMITE_DE_RECUPERACAO_MIN / 60)}h não viraram tarefa de SLA: passaram do ponto de recuperação por velocidade e precisam de campanha de reativação.`
          : null,
        reatribuicao: process.env.ATLAS_SLA_AUTO_REASSIGN === "true"
          ? "habilitada por ambiente, mas ainda não implementada — exige regra de distribuição aprovada"
          : "desligada: reatribuir por SLA é ação A2 e exige regra aprovada",
      },
    });
  } catch (erro) {
    logger.error("crm.first_contact_sla_worker_failed", erro);
    return NextResponse.json({ error: "Falha ao processar o SLA de primeiro contato." }, { status: 500 });
  }
}
