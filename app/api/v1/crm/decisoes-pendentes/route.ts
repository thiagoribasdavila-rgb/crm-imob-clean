import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { montarFila, normalizarDecisao, porqueNaoPodeDecidir, decisaoValida } from "@/lib/crm/fila-de-decisoes";
import { AGENTES_QUE_ESPERAM_PESSOA } from "@/lib/ai/quem-espera-uma-pessoa";
import { julgarDecisao } from "@/lib/crm/corrida-pela-lead";
import { portaDaDecisaoSupabase } from "@/lib/crm/porta-da-decisao-supabase";

export const dynamic = "force-dynamic";

/**
 * O LAÇO QUE ESTAVA ABERTO: a IA decide, o humano julga, o produto executa.
 *
 * ── O que foi medido antes desta rota existir ───────────────────────────────
 *
 * `ai_shadow_decisions` tinha 20 linhas, todas `retido=true`,
 * `executado=false`, `decisao_humana=null`. Nenhum arquivo sob `app/` ou
 * `components/` lia a tabela — só o worker que escreve, uma lib e o registro.
 * `registrarDecisaoHumana`, `registrarResultado` e `compararSombra` existiam
 * com zero chamadores.
 *
 * O modo sombra grava, no próprio campo `motivo`, a condição de saída: *"para
 * sair da sombra, olhe a comparação recomendação × decisão × resultado"*. Sem
 * decisão humana coletada, essa comparação nunca teria um caso, e a IA ficaria
 * na sombra para sempre — não por cautela, por falta de porta.
 *
 * ── A ordem das duas escritas, e por que ela MUDOU em 2026-08-02 ────────────
 *
 * Aprovar faz DUAS coisas: muda o dono da lead e registra o julgamento. A regra
 * original era executar primeiro, para nunca deixar gravado que um humano
 * aprovou uma redistribuição que não aconteceu. A regra continua valendo — mas
 * a ordem que a cumpria abria uma corrida.
 *
 * Medido: 20 decisões retidas na fila, 3 pessoas (2 gerentes + 1 diretor) com
 * acesso ao painel. Duas delas no mesmo card, no mesmo segundo: as duas liam
 * `decisao_humana = null`, as duas passavam pela guarda, as duas moviam a lead
 * (o `update` não prendia o dono) e as duas gravavam o julgamento (o `update`
 * não prendia `decisao_humana is null`). AS DUAS RECEBIAM "Feito". E se uma
 * aprovasse enquanto a outra recusava, a que recusou lia *"A lead continua com
 * o dono atual"* depois de a lead já ter mudado de mãos.
 *
 * Agora quem arbitra é `julgarDecisao`: REIVINDICA com escrita condicional,
 * executa com o dono esperado preso, e DEVOLVE a reivindicação se a execução
 * não casar — o que preserva a regra original por outro caminho. A perdedora
 * recebe 409 com o NOME de quem chegou primeiro.
 *
 * A conferência de linhas casadas é a lição que este repositório já pagou na
 * rota de consentimento: no PostgREST, um `update` que não casa com linha
 * nenhuma devolve 200 sem erro. "Não deu erro" nunca foi sinônimo de "gravou" —
 * e era esse 200 mudo que deixava as duas pessoas vencerem.
 */

const PAPEIS_QUE_DECIDEM = ["admin", "director", "superintendent", "manager"] as const;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "crm.decisoes-pendentes" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: [...PAPEIS_QUE_DECIDEM] });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_shadow_decisions")
    .select("id,agent,acao,recomendacao,motivo,entidade_tipo,entidade_id,retido,executado,decisao_humana,created_at,preparado")
    .eq("organization_id", identity.access.organization.id)
    .is("decisao_humana", null)
    .eq("retido", true)
    // ── SÓ O QUE ESPERA UMA PESSOA ENTRA NA FILA DE UMA PESSOA ───────────────
    //
    // `ai_shadow_decisions` ganhou um SEGUNDO escritor em 02/08/2026 — o vigia
    // `sombra-do-atendimento` — e ele grava exatamente a forma que esta fila
    // procura: `retido = true`, `decisao_humana = null`.
    //
    // Só que a semântica é OPOSTA. O que o SLA registra aqui é uma proposta
    // esperando alguém decidir. O que a sombra registra é um ensaio: ela prepara
    // o que faria e retém POR DESENHO, para sempre — nenhuma decisão humana muda
    // aquilo, porque nada será enviado.
    //
    // Sem este recorte as linhas da sombra entrariam na fila de aprovação. E
    // como a consulta ordena por `created_at desc` com teto de 50, elas não
    // apenas apareceriam: sendo as mais novas, EXPULSARIAM as decisões reais. O
    // gestor abriria a fila e veria trabalho que ninguém pediu para aprovar,
    // enquanto o que esperava por ele sumia por baixo do corte.
    //
    // O recorte é por LISTA DECLARADA, e não por exclusão do nome da sombra: um
    // terceiro agente de ensaio inundaria a fila do mesmo jeito. A lista obriga
    // quem somar um escritor a dizer de qual lado ele está.
    .in("agent", [...AGENTES_QUE_ESPERAM_PESSOA])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    // 503 e não 200-com-lista-vazia. Fila vazia significa "a IA não tem nada a
    // propor" — uma tranquilidade que não pode ser fabricada por falha de
    // leitura. É o mesmo cuidado da rota de alertas.
    return apiError("DECISOES_READ_FAILED", "Não foi possível ler a fila de decisões agora.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  const fila = montarFila(data ?? []);
  return apiSuccess(
    { ...fila, medidoEm: new Date().toISOString() },
    identity.meta,
    { headers: rate.headers },
  );
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "crm.decisoes-pendentes.decidir" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: [...PAPEIS_QUE_DECIDEM] });
  if (!identity.ok) return identity.response;

  const corpo = (await request.json().catch(() => null)) as { registroId?: unknown; decisao?: unknown } | null;
  const registroId = typeof corpo?.registroId === "string" ? corpo.registroId.trim() : "";
  const decisao = corpo?.decisao;

  if (!registroId) {
    return apiError("REGISTRO_AUSENTE", "Diga qual decisão está sendo julgada.", identity.meta, { status: 400, headers: rate.headers });
  }
  if (!decisaoValida(decisao)) {
    return apiError("DECISAO_INVALIDA", 'A resposta precisa ser "aprovada" ou "recusada".', identity.meta, { status: 400, headers: rate.headers });
  }

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;

  // Relê a linha AGORA. O estado que a tela viu pode ter mudado — outra pessoa
  // pode ter decidido no intervalo, e a fila do navegador não sabe disso.
  const { data: linha, error: erroLeitura } = await admin
    .from("ai_shadow_decisions")
    .select("id,agent,acao,recomendacao,motivo,entidade_tipo,entidade_id,retido,executado,decisao_humana,created_at,preparado")
    .eq("id", registroId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (erroLeitura) {
    return apiError("DECISAO_READ_FAILED", "Não foi possível conferir a decisão antes de aplicá-la.", identity.meta, { status: 503, headers: rate.headers });
  }
  if (!linha) {
    return apiError("DECISAO_NAO_ENCONTRADA", "Essa decisão não existe nesta organização.", identity.meta, { status: 404, headers: rate.headers });
  }

  const impedimento = porqueNaoPodeDecidir(linha);
  if (impedimento) {
    // 409 e não 400: o pedido está bem formado; o mundo é que mudou.
    return apiError("DECISAO_JA_RESOLVIDA", `Esta decisão ${impedimento}.`, identity.meta, { status: 409, headers: rate.headers });
  }

  const pendente = normalizarDecisao(linha);

  // ── O ÁRBITRO DA CORRIDA ──────────────────────────────────────────────────
  //
  // A guarda acima (`porqueNaoPodeDecidir`) continua valendo, mas ela sozinha
  // nunca foi suficiente: entre a leitura dela e a escrita cabe outra pessoa.
  // Quem decide de verdade é a escrita condicional lá dentro.
  const veredito = await julgarDecisao(portaDaDecisaoSupabase(admin, organizationId), {
    registroId,
    decisao,
    decididoPor: identity.access.profile.id,
    leadId: pendente.leadId,
    deQuem: pendente.deQuem,
    paraQuem: pendente.paraQuem,
  });

  if (veredito.desfecho === "corrida-perdida") {
    // 409 e não 400: o pedido está bem formado; outra pessoa é que chegou antes.
    // A mensagem traz o NOME de quem ganhou — "conflito" mandaria a pessoa
    // recarregar a tela, e o que ela precisa é falar com quem pegou a lead.
    return apiError(veredito.codigo, veredito.mensagem, identity.meta, {
      status: 409,
      headers: rate.headers,
      // `corridaPerdida` deixa a tela distinguir "outra pessoa chegou primeiro"
      // de qualquer outro 409, sem precisar interpretar a frase.
      details: { corridaPerdida: true, registroId },
    });
  }

  if (veredito.desfecho === "falha") {
    return apiError(veredito.codigo, veredito.mensagem, identity.meta, {
      status: veredito.codigo === "DECISAO_SEM_DESTINO" ? 422 : 503,
      headers: rate.headers,
    });
  }

  return apiSuccess(
    {
      registroId,
      decisao,
      leadId: pendente.leadId,
      aplicada: veredito.desfecho === "aplicada",
      // A frase que a tela repete de volta: confirmar com o texto da decisão
      // evita o "confirmado" genérico que não prova qual item foi tocado.
      frase: pendente.frase,
    },
    identity.meta,
    { headers: rate.headers },
  );
}
