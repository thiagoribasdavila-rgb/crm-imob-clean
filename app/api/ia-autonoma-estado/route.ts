import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { catalogoDeAgentes, problemasDoCatalogo } from "@/lib/ai/niveis-de-autonomia";
import { acoesRetidas, sombraLigada } from "@/lib/ai/modo-sombra";
import {
  derivarEstadoDaIa,
  type LinhaDeAprovacao,
  type LinhaDeConsumo,
  type LinhaDeOrquestracao,
  type LinhaDeSombra,
} from "@/lib/ai/ia-autonoma-estado";

/**
 * O ESTADO DA IA, LIDO PELA CERCA DO USUÁRIO.
 *
 * Usa `access.supabase` — cliente com a chave pública e o token da pessoa, ou
 * seja, RLS ligada. Não é preciosismo: todas as tabelas lidas aqui têm política
 * de SELECT por organização, então a cerca do banco é a mesma da tela. Trocar
 * por `service_role` com filtro à mão faria a política virar decoração e
 * repetiria a classe de defeito que já vazou dado entre empresas neste produto.
 *
 * ── O FALSO ZERO, E POR QUE A CONTAGEM NÃO PODE VIR DAQUI ─────────────────
 *
 * Medido em 02/08/2026, executando as consultas com `set local role
 * authenticated` e o `sub` de um diretor real da Atlas One:
 *
 *     ai_orchestration_decisions ... 41 linhas · 41 visíveis
 *     approval_requests ............  4 linhas ·  4 visíveis
 *     ai_usage_events .............. 49 linhas · 49 visíveis
 *     ai_shadow_decisions .......... 20 linhas ·  0 VISÍVEIS
 *
 * A causa é precisa: `ai_shadow_decisions_org_fence` é a ÚNICA política da
 * tabela e é RESTRICTIVE. Política restritiva só ESTREITA o que uma permissiva
 * abriu; sem nenhuma permissiva, o padrão do Postgres é negar tudo. Varrendo o
 * schema, `ai_shadow_decisions` é a única tabela do banco nessa condição.
 *
 * O efeito na tela é a pior forma do defeito: a consulta responde 200, com
 * lista vazia e SEM ERRO. Uma tela ingênua escreveria "a IA não preparou nada",
 * quando a verdade é que ela preparou 20 e o diretor não pode enxergar
 * nenhuma. Ausência de PERMISSÃO desenhada como ausência de FATO.
 *
 * Consertar a política é trabalho de banco e não sai daqui. O que sai daqui é
 * a tela parar de mentir: as contagens vêm de uma leitura administrativa
 * FILTRADA PELA ORGANIZAÇÃO DO PRÓPRIO SOLICITANTE, e quando a contagem não
 * bate com a lista que a cerca devolveu, a diferença aparece escrita.
 *
 * A cerca não virou decoração: `organization_id` vem do contexto de acesso já
 * verificado, nunca do pedido; só COUNT trafega (head: true), nenhuma linha; e
 * o detalhe que a pessoa lê continua vindo pela cerca dela.
 */

export const dynamic = "force-dynamic";

/** Teto de leitura. Acima disso a resposta diz que truncou em vez de somar errado. */
const TETO_DE_LINHAS = 2_000;
const JANELA_DIAS = 30;

export async function GET(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 60, scope: "ia.autonoma.estado" });
  if (!limite.ok) return limite.response;

  const acesso = await requireAccessContext(request);
  if (!acesso.ok) return acesso.response;

  const { supabase, access, meta } = acesso;
  const organizacao = access.profile.organizationId;
  const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString();

  /** Contagem por organização — sempre `.eq('organization_id', …)` com o id já verificado. */
  const contarNaOrganizacao = (tabela: string, coluna = "id") =>
    getSupabaseAdmin().from(tabela).select(coluna, { count: "exact", head: true }).eq("organization_id", organizacao);

  const [orquestracaoRes, sombraRes, aprovacoesRes, consumoRes, corridasRes, metaRes, jornadasRes, handoffsRes, retratosRes, sombraOrgRes] =
    await Promise.all([
      supabase
        .from("ai_orchestration_decisions")
        .select("feature,selected_provider,selected_model,routing_reasons,human_review_required,fallback_used,created_at")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(TETO_DE_LINHAS),
      supabase
        .from("ai_shadow_decisions")
        .select("agent,acao,autonomy_level,retido,executado,decisao_humana,created_at")
        .order("created_at", { ascending: false })
        .limit(TETO_DE_LINHAS),
      supabase
        .from("approval_requests")
        .select("id,request_type,status,created_at,expires_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(TETO_DE_LINHAS),
      supabase
        .from("ai_usage_events")
        .select("agent,provider,created_at")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(TETO_DE_LINHAS),
      // As cinco contagens de EXECUÇÃO são a afirmação central desta tela ("ela
      // nunca agiu"). Uma afirmação dessas não pode depender de política que
      // recorta por pessoa: `atlas_agent_runs` nem tem GRANT para
      // `authenticated`, e um recorte silencioso viraria a mesma mentira ao
      // contrário. Contadas pela organização inteira, e só contadas.
      contarNaOrganizacao("atlas_agent_runs"),
      contarNaOrganizacao("meta_executions", "idempotency_key"),
      contarNaOrganizacao("ai_sales_journeys"),
      contarNaOrganizacao("nightly_broker_handoffs"),
      contarNaOrganizacao("integration_health_snapshots"),
      contarNaOrganizacao("ai_shadow_decisions"),
    ]);

  // Erro de leitura vira `null`, jamais lista vazia: lista vazia significaria
  // "consultei e não havia nada", e é a afirmação que eu não posso fazer.
  const linhas = <T,>(resultado: { data: unknown; error: unknown } | null): T[] | null =>
    !resultado || resultado.error ? null : ((resultado.data ?? []) as T[]);
  const contagem = (resultado: { count: number | null; error: unknown } | null): number | null =>
    !resultado || resultado.error ? null : (resultado.count ?? null);

  const orquestracao = linhas<LinhaDeOrquestracao>(orquestracaoRes);
  const sombra = linhas<LinhaDeSombra>(sombraRes);
  const aprovacoes = linhas<LinhaDeAprovacao>(aprovacoesRes);
  const consumo = linhas<LinhaDeConsumo>(consumoRes);

  if (!orquestracao && !sombra && !aprovacoes && !consumo) {
    return apiError("IA_ESTADO_INDISPONIVEL", "Nenhuma tabela de evidência da IA respondeu.", meta, { status: 503 });
  }

  const estado = derivarEstadoDaIa({
    agora: new Date(),
    orquestracao,
    sombra,
    aprovacoes,
    consumo,
    sombraNaOrganizacao: contagem(sombraOrgRes),
    execucao: {
      corridasDeAgente: contagem(corridasRes),
      execucoesNaMeta: contagem(metaRes),
      jornadasDeVenda: contagem(jornadasRes),
      passagensParaCorretor: contagem(handoffsRes),
      retratosDeIntegracao: contagem(retratosRes),
    },
    catalogo: catalogoDeAgentes(),
    problemasDoCatalogo: problemasDoCatalogo().map((item) => `${item.agente}: ${item.problema}`),
    acoesRetidasEmSombra: acoesRetidas(),
    modoSombraLigado: sombraLigada(),
  });

  return apiSuccess(
    {
      ...estado,
      /** Quantas linhas a cerca do usuário devolveu de cada fonte de detalhe. */
      lidoPelaCerca: {
        orquestracao: orquestracao?.length ?? null,
        sombra: sombra?.length ?? null,
        aprovacoes: aprovacoes?.length ?? null,
        consumo: consumo?.length ?? null,
      },
      janelaDias: JANELA_DIAS,
      // Truncou = a soma abaixo é um piso, não o total. Quem lê precisa saber.
      truncado: [orquestracao, sombra, aprovacoes, consumo].some((lista) => (lista?.length ?? 0) >= TETO_DE_LINHAS),
      lidoEm: new Date().toISOString(),
    },
    meta,
    { headers: { ...limite.headers, "Cache-Control": "no-store" } },
  );
}
