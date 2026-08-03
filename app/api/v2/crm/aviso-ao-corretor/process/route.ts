import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
import { enviarAlertaTelegram, telegramConfigurado } from "@/lib/integrations/telegram";
import { marcaDagua, planejarAvisos, type AtribuicaoRecente, type CorretorAlcancavel } from "@/lib/crm/aviso-da-lead-nova";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * O AVISO DE QUE A LEAD CAIU NA CARTEIRA.
 *
 * ── O que faltava ───────────────────────────────────────────────────────────
 *
 * O vigia de SLA avisa quando o prazo está VENCENDO. Entre a lead chegar e o
 * prazo apertar existe uma janela em que ninguém chama o corretor — e o prazo
 * mais curto desta operação é de 5 minutos. A pastilha na barra lateral e o
 * aviso do navegador cobrem quem está com o Atlas aberto; este worker cobre
 * quem não está.
 *
 * ── DE ONDE VEM A LISTA, E POR QUE DAQUI ────────────────────────────────────
 *
 * `lead_distribution_history` é a ÚNICA tabela que todos os caminhos de
 * atribuição escrevem: a cascata de entrada automática (`recordDistribution`),
 * o motor governado da liderança (v5) e o laço em Node de emergência. Ler
 * daqui é o que garante que nenhuma porta de entrada fique sem aviso — e foi a
 * mesma escolha que fez o rodízio ter um ponteiro só.
 *
 * ── A MARCA D'ÁGUA ──────────────────────────────────────────────────────────
 *
 * Cada passagem processa o que entrou desde a passagem anterior, lida do próprio
 * livro de execuções. Um worker de 5 em 5 minutos olhando "os últimos 5 minutos"
 * duplicaria na sobreposição e perderia na lacuna; a regra está em
 * `lib/crm/aviso-da-lead-nova.ts`, testada, junto com o teto que impede um
 * worker parado por dias de voltar avisando sobre tudo.
 *
 * ── A LACUNA QUE ESTE WORKER DENUNCIA ───────────────────────────────────────
 *
 * Medido em 03/08/2026: 5 corretores ativos, ZERO com `telegram_chat_id`. Ligar
 * o recurso hoje responderia 200 e não avisaria ninguém. Por isso `semCanal` vai
 * no corpo da resposta e no livro: um recurso que roda e não entrega precisa
 * DIZER isso, senão vira a terceira ocorrência da classe que esta entrega
 * inteira perseguiu — os dois lados prontos e o fio no chão.
 */

export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (
    desfecho: "ok" | "sem_trabalho" | "falhou",
    resposta: Record<string, unknown>,
    erro?: string,
  ) => registrarExecucao({
    vigia: "aviso-ao-corretor",
    rota: "/api/v2/crm/aviso-ao-corretor/process",
    origem,
    iniciadoEm,
    desfecho,
    resposta,
    erro,
  });

  try {
    const admin = getSupabaseAdmin();

    // A passagem anterior. `desfecho` in (ok, sem_trabalho) de propósito: uma
    // passagem que FALHOU não moveu a marca, e o que ela deixou para trás
    // precisa ser considerado de novo.
    const ultima = await admin
      .from("atlas_worker_runs")
      .select("concluido_em")
      .eq("vigia", "aviso-ao-corretor")
      .in("desfecho", ["ok", "sem_trabalho"])
      .order("concluido_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const desde = marcaDagua(ultima.data?.concluido_em ? String(ultima.data.concluido_em) : null, Date.now());

    const historico = await admin
      .from("lead_distribution_history")
      .select("organization_id,lead_id,assigned_user_id,created_at")
      .gt("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(2000);

    if (historico.error) {
      // Lista ilegível NÃO vira "não houve atribuição": seria declarar silêncio
      // a partir de uma falha de leitura e deixar o corretor sem aviso.
      logger.error("aviso_ao_corretor.historico_ilegivel", historico.error, {});
      const corpo = { ok: false, motivo: "historico_ilegivel", erro: historico.error.message };
      return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, historico.error.message) }, { status: 503 });
    }

    const linhas = historico.data ?? [];
    if (!linhas.length) {
      const corpo = { ok: true, desde, consideradas: 0, motivo: "nenhuma_atribuicao_nova", duracaoMs: Date.now() - iniciadoEm };
      return NextResponse.json({ ...corpo, livro: await livro("sem_trabalho", corpo) });
    }

    const base = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
    const enviados: Array<Record<string, unknown>> = [];
    const lacunas: Array<Record<string, unknown>> = [];
    let consideradas = 0;

    // Por organização: o link da fila e os corretores são de cada inquilino, e
    // misturar aqui seria mandar alguém para a fila de outra empresa.
    const porOrganizacao = new Map<string, AtribuicaoRecente[]>();
    for (const linha of linhas) {
      const org = String(linha.organization_id);
      const lista = porOrganizacao.get(org) ?? [];
      lista.push({
        leadId: String(linha.lead_id),
        corretorId: String(linha.assigned_user_id ?? ""),
        em: String(linha.created_at),
      });
      porOrganizacao.set(org, lista);
    }

    for (const [organizationId, atribuicoes] of porOrganizacao) {
      const perfis = await admin
        .from("profiles")
        .select("id,full_name,name,telegram_chat_id")
        .eq("organization_id", organizationId)
        .eq("active", true);
      if (perfis.error) {
        logger.error("aviso_ao_corretor.perfis_ilegiveis", perfis.error, { organizationId });
        lacunas.push({ organizationId, motivo: "perfis_ilegiveis" });
        continue;
      }

      const corretores: CorretorAlcancavel[] = (perfis.data ?? []).map((p) => ({
        profileId: String(p.id),
        nome: String(p.full_name || p.name || p.id).slice(0, 60),
        telegramChatId: p.telegram_chat_id ? String(p.telegram_chat_id) : null,
      }));

      const plano = planejarAvisos(atribuicoes, corretores, `${base}/leads`);
      consideradas += plano.consideradas;

      if (plano.semCanal.length) {
        // Fica no log E no corpo. A operação precisa poder perguntar "por que o
        // corretor não foi avisado?" e receber "porque ninguém cadastrou o
        // canal dele", em vez de silêncio.
        logger.warn("aviso_ao_corretor.sem_canal", {
          organizationId,
          quantos: plano.semCanal.length,
          acao: "cadastre profiles.telegram_chat_id para o corretor receber aviso fora do Atlas",
        });
        lacunas.push({ organizationId, semCanal: plano.semCanal });
      }

      if (!telegramConfigurado()) {
        // Diferente de "sem canal": aqui é o BOT que falta, e é um ajuste de
        // ambiente, não de cadastro. Confundir os dois mandaria alguém cadastrar
        // chat id por horas sem nada chegar.
        lacunas.push({ organizationId, motivo: "telegram_nao_configurado", avisosPendentes: plano.enviar.length });
        continue;
      }

      for (const aviso of plano.enviar) {
        const resultado = await enviarAlertaTelegram(aviso.chatId, aviso.texto);
        enviados.push({ organizationId, profileId: aviso.profileId, quantas: aviso.quantas, status: resultado.status });
      }
    }

    const corpo = {
      ok: true,
      desde,
      consideradas,
      enviados: enviados.filter((e) => e.status === "enviado").length,
      tentativas: enviados.length,
      lacunas,
      duracaoMs: Date.now() - iniciadoEm,
    };
    return NextResponse.json({ ...corpo, livro: await livro("ok", corpo) });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida no aviso ao corretor.";
    logger.error("aviso_ao_corretor.falhou", erro instanceof Error ? erro : new Error(mensagem), {});
    const corpo = { ok: false, motivo: "worker_falhou", erro: mensagem };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, mensagem) }, { status: 500 });
  }
}
