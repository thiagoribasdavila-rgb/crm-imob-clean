import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { semanaFechadaAte } from "@/lib/developers/weekly-report";
import agenda from "@/config/workers-schedule.json";

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
 *
 * ── POR QUE ESTE ARQUIVO MUDOU EM 02/08/2026 ────────────────────────────────
 *
 * MEDIDO, lendo a versão anterior linha a linha: ela tinha SETE caminhos de
 * saída e CINCO deles terminavam no mesmo `200` — o código que o agendador
 * (.github/workflows/atlas-vigias.yml) lê, e a única coisa que ele lê.
 *
 *   1. `developers` não pôde ser lido            → 503, com log. Este estava certo.
 *   2. `profiles` (responsável) falhou           → `throw` SEM try/catch em volta.
 *                                                  O Next devolvia 500 sem corpo,
 *                                                  sem log e sem registro. O erro
 *                                                  existia e não deixava rastro.
 *   3. dedupe em `tasks` falhou                  → mesma coisa: `throw` órfão.
 *   4. o INSERT da tarefa falhou                 → `logger.error` + `continue`, e
 *                                                  a incorporadora sumia: não
 *                                                  entrava em `preparados`, nem em
 *                                                  `jaExistiam`, nem em
 *                                                  `semResponsavel`. Resposta 200,
 *                                                  listas vazias, relatório NENHUM
 *                                                  preparado. ← o silêncio caro
 *   5. nenhuma incorporadora ativa               → 200, três listas vazias.
 *   6. todas já tinham a tarefa da semana        → 200.
 *   7. nenhuma tinha liderança para receber      → 200.
 *
 * 4, 5, 6 e 7 devolviam corpos parecidos e o MESMO 200. Quem olha só o código
 * HTTP — que é o agendador — não conseguia separar "preparei tudo" de "o banco
 * recusou todas as escritas". E 4 é falha de verdade: a prestação de contas ao
 * parceiro simplesmente não acontece naquela semana, e ninguém fica sabendo.
 *
 * Agora cada um deles tem `motivo` próprio, o 4 devolve 500 (é o que acende o
 * agendador) e os 2 e 3 continuam devolvendo 500 — só que com corpo, com log e
 * com linha no livro de execuções.
 *
 * ── A JANELA, E POR QUE ELA NÃO É UM DETALHE ────────────────────────────────
 *
 * MEDIDO: a versão anterior não tinha janela nenhuma. Rodava em qualquer dia e
 * em qualquer hora. `config/workers-schedule.json` já dizia por que a hora
 * importa — "rodar à meia-noite em ponto arriscaria apurar antes de a última
 * escrita do domingo cair no banco" — mas essa razão vivia só no comentário do
 * JSON, sem nada no código a sustentando.
 *
 * A consequência é permanente, não passageira: `semanaFechadaAte` faz a semana
 * TERMINAR no domingo às 23:59. Uma chamada no domingo de madrugada apura uma
 * semana com 17 horas ainda por correr, cria a tarefa, e a chave
 * `weekly-report:<id>:<segunda>` fica QUEIMADA. O disparo legítimo das 7h
 * encontra `jaExistiam` e vai embora. O parceiro recebe, para sempre, o
 * relatório da semana pela metade.
 *
 * Por isso a recusa é estreita de propósito: só o dia do relatório, só antes da
 * hora declarada. Segunda a sábado NÃO são recusados — é o caminho de
 * recuperação de quando o disparo de domingo não aconteceu, e derrubá-lo
 * trocaria um defeito por outro.
 *
 * A janela é LIDA de `config/workers-schedule.json`, do mesmo `cadencia` que o
 * agendador usa. Cravar "domingo às 7h" aqui criaria uma segunda verdade sobre
 * o mesmo fato — a doença que este repositório mais paga. Se a cadência mudar
 * no JSON, esta rota passa a cobrar a janela nova sozinha.
 *
 * O relógio da janela é o MESMO de `semanaFechadaAte` (o do processo). Isso é
 * escolha, não descuido: dois relógios para a mesma decisão voltariam a ser
 * duas verdades. Sob os dois relógios plausíveis o disparo legítimo passa —
 * crontab `0 7 * * 0` em São Paulo dá hora 7, e o GitHub `0 10 * * 0` em UTC dá
 * hora 10; ambos ≥ 7.
 */

const PREFIXO = "Relatório semanal do parceiro";
const VIGIA = "developer-weekly-reports";
const ROTA = "/api/v2/developers/weekly-reports/process";
const OBSERVACAO = "O worker prepara a prestação de contas; o envio ao parceiro é ação humana.";
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * O dia e a hora declarados para este vigia, lidos da agenda.
 *
 * Devolve `null` — e a rota então NÃO recusa nada — quando a cadência não é um
 * dia e uma hora fixos (coringa, passo, lista). Falhar ABERTO é deliberado: uma
 * janela que ninguém conseguiu ler não pode virar motivo para o relatório
 * semanal nunca sair. Recusar por dúvida seria o mesmo silêncio de outro jeito.
 */
function janelaDeclarada(): { dia: number; hora: number } | null {
  const cadencia = agenda.workers.find((w) => w.nome === VIGIA)?.cadencia;
  const campos = cadencia?.trim().split(/\s+/) ?? [];
  if (campos.length < 5) return null;
  const hora = Number(campos[1]);
  const dia = Number(campos[4]);
  const valido = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
  return valido(hora, 23) && valido(dia, 6) ? { dia, hora } : null;
}

export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // O relógio começa ANTES da decisão de janela: "recusei por horário" também é
  // execução, e é justamente a que some sem deixar rastro nenhum.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (
    desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou",
    resposta: Record<string, unknown>,
    erro?: string,
  ) => registrarExecucao({ vigia: VIGIA, rota: ROTA, origem, iniciadoEm, desfecho, resposta, erro });

  const agora = new Date();
  const semana = semanaFechadaAte(agora);
  const janela = janelaDeclarada();

  if (janela && agora.getDay() === janela.dia && agora.getHours() < janela.hora) {
    const corpo = {
      semana: semana.rotulo,
      preparados: [] as string[],
      jaExistiam: [] as string[],
      semResponsavel: [] as string[],
      falhas: [] as string[],
      // `fora_da_janela` NÃO é falha, e por isso sai 200. O que ele não pode
      // mais ser é confundido com "nenhum incorporador ativo": são o mesmo
      // "não fiz nada" com causas opostas — uma é horário, a outra é cadastro.
      motivo: "fora_da_janela",
      detalhe:
        `A cadência declarada é ${DIAS[janela.dia]} às ${janela.hora}h. São ${agora.getHours()}h e a semana ` +
        `${semana.rotulo} ainda está correndo — apurar agora queimaria a chave da semana com números pela metade.`,
      envioAutomatico: false,
      observacao: OBSERVACAO,
    };
    return NextResponse.json({ ...corpo, livro: await livro("fora_da_janela", corpo) });
  }

  try {
    const admin = getSupabaseAdmin();

    const listagem = await admin
      .from("developers")
      .select("id,organization_id,trade_name,legal_name,commercial_email")
      .eq("status", "active");

    if (listagem.error) {
      logger.error("developers.weekly_reports_leitura_falhou", { erro: listagem.error.message });
      // 503 preservado: é o código que esta rota já devolvia para este caso.
      // O que muda é que agora ele deixa linha no livro em vez de sumir.
      const corpo = { error: "Falha ao listar incorporadoras.", motivo: "leitura_falhou", semana: semana.rotulo };
      return NextResponse.json(
        { ...corpo, livro: await livro("falhou", corpo, listagem.error.message) },
        { status: 503 },
      );
    }

    const incorporadores = listagem.data ?? [];
    const preparados: string[] = [];
    const jaExistiam: string[] = [];
    const semResponsavel: string[] = [];
    const falhas: { nome: string; code?: string }[] = [];

    for (const incorporador of incorporadores) {
      const chave = `weekly-report:${incorporador.id}:${semana.inicio.slice(0, 10)}`;
      const nome = incorporador.trade_name || incorporador.legal_name || incorporador.id;

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
        semResponsavel.push(nome);
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
        jaExistiam.push(nome);
        continue;
      }

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
        // O `continue` fica: uma incorporadora que falha não pode impedir as
        // outras. O que NÃO fica é a falha sumir — antes ela não entrava em
        // nenhuma das listas da resposta, e a rota respondia 200 como se o
        // relatório daquele parceiro tivesse sido preparado.
        falhas.push({ nome, code: erroDeInsercao.code });
        continue;
      }
      preparados.push(nome);
    }

    logger.info("developers.weekly_reports_preparados", {
      semana: semana.rotulo,
      preparados: preparados.length,
      jaExistiam: jaExistiam.length,
      semResponsavel: semResponsavel.length,
      falhas: falhas.length,
    });

    const corpo = {
      semana: semana.rotulo,
      preparados,
      jaExistiam,
      semResponsavel,
      falhas: falhas.map((f) => f.nome),
      primeiroErro: falhas[0]?.code ?? null,
      // `motivo` existe para que "não fiz nada" nunca mais seja ambíguo: cada
      // causa tem nome, e nenhuma delas se parece com outra.
      motivo: falhas.length
        ? "insercoes_falharam"
        : preparados.length
          ? "ok"
          : incorporadores.length === 0
            ? "sem_incorporador_ativo"
            : semResponsavel.length === incorporadores.length
              ? "sem_responsavel_para_receber"
              : jaExistiam.length === incorporadores.length
                ? "todos_ja_existiam"
                : "nada_novo_a_preparar",
      incorporadoresAtivos: incorporadores.length,
      // Dito no corpo da resposta para não restar dúvida em quem for auditar o cron.
      envioAutomatico: false,
      observacao: OBSERVACAO,
    };

    if (falhas.length) {
      // 200 aqui era o silêncio caro: nenhum relatório preparado, agendador
      // verde. 500 é o que faz o job acender.
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo) }, { status: 500 });
    }

    // `sem_trabalho` NÃO é falha: o vigia acordou, olhou a lista e não havia
    // relatório novo a preparar. É exatamente o desfecho que se confundia com
    // "nunca rodou" enquanto `tasks` era a única evidência.
    return NextResponse.json({ ...corpo, livro: await livro(preparados.length ? "ok" : "sem_trabalho", corpo) });
  } catch (erro) {
    // Os dois `throw` do laço caíam aqui sem ninguém embaixo: o Next devolvia
    // 500 sem corpo e sem log. O 500 é o mesmo; o rastro é novo.
    logger.error("developers.weekly_reports_worker_failed", erro);
    const registro = await livro("falhou", { semana: semana.rotulo }, String(erro));
    return NextResponse.json(
      { error: "Falha ao preparar os relatórios semanais.", motivo: "excecao", semana: semana.rotulo, livro: registro },
      { status: 500 },
    );
  }
}
