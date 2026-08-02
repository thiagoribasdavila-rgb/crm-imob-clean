import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { registrarDecisaoHumana } from "@/lib/ai/registro-de-sombra";
import { montarFila, normalizarDecisao, porqueNaoPodeDecidir, decisaoValida } from "@/lib/crm/fila-de-decisoes";
import { AGENTES_QUE_ESPERAM_PESSOA } from "@/lib/ai/quem-espera-uma-pessoa";

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
 * ── A ordem das duas escritas, e por que ela não é negociável ───────────────
 *
 * Aprovar faz DUAS coisas: muda o dono da lead e registra o julgamento. Se o
 * registro viesse primeiro e a mudança falhasse, ficaria gravado que um humano
 * aprovou uma redistribuição que não aconteceu — e a comparação de sombra
 * passaria a medir contra um mundo que não existe.
 *
 * Então: executa primeiro, CONFERE QUANTAS LINHAS CASARAM, e só então registra.
 * A conferência é a lição que este repositório já pagou na rota de
 * consentimento: no PostgREST, um `update` que não casa com linha nenhuma
 * devolve 200 sem erro. "Não deu erro" nunca foi sinônimo de "gravou".
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

  // ── APROVAR EXECUTA. E executar vem ANTES de registrar. ───────────────────
  if (decisao === "aprovada") {
    if (!pendente.leadId || !pendente.paraQuem) {
      return apiError("DECISAO_SEM_DESTINO", "A decisão não diz para quem passar a lead — não dá para aplicá-la.", identity.meta, { status: 422, headers: rate.headers });
    }

    const { data: aplicadas, error: erroAplicacao } = await admin
      .from("leads")
      // As DUAS colunas de dono — esta rota é minha, e nasceu com o defeito.
      .update({ assigned_to: pendente.paraQuem, assigned_user_id: pendente.paraQuem, updated_at: new Date().toISOString() })
      .eq("id", pendente.leadId)
      .eq("organization_id", organizationId)
      .select("id");

    if (erroAplicacao) {
      return apiError("REDISTRIBUICAO_FALHOU", "Não foi possível passar a lead. Nada foi registrado.", identity.meta, { status: 503, headers: rate.headers });
    }
    if (!aplicadas || aplicadas.length === 0) {
      // O caso que o 200 do PostgREST esconde: nenhuma linha casou.
      return apiError(
        "REDISTRIBUICAO_NAO_CASOU",
        "A lead dessa decisão não foi encontrada nesta organização — ela NÃO foi passada e nada foi registrado.",
        identity.meta,
        { status: 409, headers: rate.headers },
      );
    }
  }

  const registrou = await registrarDecisaoHumana({
    registroId,
    decisao,
    decididoPor: identity.access.profile.id,
  });

  if (!registrou) {
    // Só alcança aqui no caso aprovado se a lead JÁ mudou de dono. Dizer isso é
    // obrigatório: silenciar deixaria a pessoa achando que nada aconteceu e
    // clicar de novo — e o segundo clique passaria pela guarda, porque o mundo
    // realmente mudou.
    return apiError(
      "DECISAO_APLICADA_SEM_REGISTRO",
      decisao === "aprovada"
        ? "A lead FOI passada, mas o julgamento não pôde ser registrado. Não clique de novo: confira a lead antes."
        : "A recusa não pôde ser registrada.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  return apiSuccess(
    {
      registroId,
      decisao,
      leadId: pendente.leadId,
      aplicada: decisao === "aprovada",
      // A frase que a tela repete de volta: confirmar com o texto da decisão
      // evita o "confirmado" genérico que não prova qual item foi tocado.
      frase: pendente.frase,
    },
    identity.meta,
    { headers: rate.headers },
  );
}
