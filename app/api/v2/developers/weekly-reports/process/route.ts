import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { semanaFechadaAte } from "@/lib/developers/weekly-report";

export const dynamic = "force-dynamic";

/**
 * DOMINGO: PREPARA O RELATÓRIO SEMANAL DE CADA INCORPORADOR PARCEIRO.
 *
 * Roda uma vez por semana e deixa, para cada incorporadora ativa, uma tarefa
 * para a liderança comercial com o relatório da semana que fechou.
 *
 * ── POR QUE TAREFA, E NÃO E-MAIL PARA O PARCEIRO ────────────────────────────
 *
 * Porque este documento sai da casa em nome da empresa. Um relatório que diz
 * "174 leads, 0 atendidas" é verdade e é exatamente o que a incorporadora
 * precisa saber — mas quem escolhe o momento e as palavras dessa conversa é
 * gente, não cron. Disparo automático para parceiro externo é a categoria de
 * automação que só se descobre errada depois de enviada.
 *
 * Então o worker faz o trabalho chato — apurar as sete tabelas, montar o texto,
 * detectar o que não deu para medir — e para na porta. A tarefa aparece na
 * segunda de manhã com o book pronto para conferir e mandar.
 *
 * ── IDEMPOTÊNCIA ───────────────────────────────────────────────────────────
 *
 * A chave é (incorporador, semana). Rodar duas vezes no mesmo domingo não cria
 * duas tarefas; roda de novo na semana seguinte e cria a da semana seguinte.
 */

const PREFIXO = "Relatório semanal do parceiro";

export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const semana = semanaFechadaAte(new Date());

  const { data: incorporadores, error: erroDeLeitura } = await admin
    .from("developers")
    .select("id,organization_id,trade_name,legal_name,commercial_email")
    .eq("status", "active");

  if (erroDeLeitura) {
    logger.error("developers.weekly_reports_leitura_falhou", { erro: erroDeLeitura.message });
    return NextResponse.json({ error: "Falha ao listar incorporadoras." }, { status: 503 });
  }

  const preparados: string[] = [];
  const jaExistiam: string[] = [];
  const semResponsavel: string[] = [];

  for (const incorporador of incorporadores ?? []) {
    const chave = `weekly-report:${incorporador.id}:${semana.inicio.slice(0, 10)}`;

    // A liderança comercial da organização recebe a tarefa. Sem ninguém para
    // receber, a tarefa não é criada — tarefa órfã é lixo que ninguém vê e que
    // depois faz o painel mentir sobre trabalho pendente.
    const responsavelQuery = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", incorporador.organization_id)
      .eq("active", true)
      .in("commercial_role", ["director", "superintendent", "manager"])
      .order("commercial_role")
      .limit(1)
      .maybeSingle();
    // Sem isto, falha de consulta virava "nao ha responsavel" e o relatorio
    // semanal do incorporador nascia sem dono -- ou nao nascia.
    if (responsavelQuery.error) throw responsavelQuery.error;
    const responsavel = responsavelQuery.data;

    if (!responsavel) {
      semResponsavel.push(incorporador.trade_name || incorporador.id);
      continue;
    }

    // Dedupe: mesma doenca do outbox. Erro virava "nao existe" e o relatorio
    // semanal era criado DE NOVO -- toda semana, para sempre, sem ninguem ver.
    const existenteQuery = await admin
      .from("tasks")
      .select("id")
      .eq("organization_id", incorporador.organization_id)
      .contains("metadata", { weeklyReportKey: chave })
      .limit(1);
    if (existenteQuery.error) throw existenteQuery.error;
    const existente = existenteQuery.data;

    if (existente?.length) {
      jaExistiam.push(incorporador.trade_name || incorporador.id);
      continue;
    }

    const nome = incorporador.trade_name || incorporador.legal_name;
    const { error: erroDeInsercao } = await admin.from("tasks").insert({
      organization_id: incorporador.organization_id,
      user_id: responsavel.id,
      title: `${PREFIXO}: ${nome} · ${semana.rotulo}`,
      description:
        `Abra Incorporadoras → ${nome} → "Relatório da semana", confira os números e envie.\n` +
        `O Atlas apura e monta o book; o envio é seu.`,
      status: "OPEN",
      priority: "NORMAL",
      // Vence na terça: dá segunda inteira para conferir, e não deixa a semana
      // virar sem a prestação de contas ao parceiro.
      due_date: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      metadata: {
        weeklyReportKey: chave,
        developerId: incorporador.id,
        semana: semana.rotulo,
        // O e-mail fica registrado para a tela abrir o cliente já preenchido —
        // e para ficar evidente quando o cadastro do parceiro está incompleto.
        emailDoParceiro: incorporador.commercial_email ?? null,
      },
    });

    if (erroDeInsercao) {
      logger.error("developers.weekly_report_tarefa_falhou", {
        developerId: incorporador.id, erro: erroDeInsercao.message,
      });
      continue;
    }
    preparados.push(nome);
  }

  logger.info("developers.weekly_reports_preparados", {
    semana: semana.rotulo,
    preparados: preparados.length,
    jaExistiam: jaExistiam.length,
    semResponsavel: semResponsavel.length,
  });

  return NextResponse.json({
    semana: semana.rotulo,
    preparados,
    jaExistiam,
    semResponsavel,
    // Dito no corpo da resposta para não restar dúvida em quem for auditar o cron.
    envioAutomatico: false,
    observacao: "O worker prepara a prestação de contas; o envio ao parceiro é ação humana.",
  });
}
