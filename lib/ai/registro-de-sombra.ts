import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { prepararEmSombra, compararSombraComHumano, type ResultadoDeSombra, type ComparacaoDeSombra } from "@/lib/ai/modo-sombra";
import type { AprovacaoRegistrada } from "@/lib/ai/niveis-de-autonomia";

/**
 * O LADO SERVIDOR DO MODO SOMBRA — grava o que a IA faria e lê a comparação.
 *
 * ── Por que existe separado de `modo-sombra.ts` ───────────────────────────
 *
 * A decisão (reter ou não) é pura e vive lá, onde o contrato consegue
 * exercitá-la. Aqui fica só o I/O. Misturar os dois foi o que, em outros pontos
 * deste repositório, forçou os testes a raspar o fonte com regex em vez de
 * chamar a função.
 *
 * ── "PREPARA e REGISTRA" precisa das duas metades ─────────────────────────
 *
 * Sombra que decide reter e não grava nada é um "não" silencioso: o humano nunca
 * vê o que a IA teria feito, e a comparação de 4.8 nunca acumula caso algum —
 * então nunca se sai da sombra, porque não há evidência para sair.
 */

export type ResultadoRegistrado = ResultadoDeSombra & {
  /** Id da linha em ai_shadow_decisions. `null` quando a gravação falhou. */
  registroId: string | null;
};

/**
 * Prepara, decide e GRAVA. É o caminho que as features de IA devem usar.
 *
 * A gravação nunca derruba o atendimento: se a tabela não existir (migration não
 * aplicada), a retenção continua valendo e o aviso vai para o log. Retenção é a
 * proteção; o registro é a evidência. Perder a evidência é ruim; perder a
 * proteção seria inaceitável, e não acontece.
 */
export async function registrarEmSombra(input: {
  organizationId: string;
  agente: string;
  acao: string;
  preparado: Record<string, unknown>;
  recomendacao: string;
  confianca?: number | null;
  entidade?: { tipo: string; id: string } | null;
  aprovacao?: AprovacaoRegistrada | null;
}): Promise<ResultadoRegistrado> {
  const resultado = prepararEmSombra(input);
  let registroId: string | null = null;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("ai_shadow_decisions")
      .insert({
        organization_id: input.organizationId,
        agent: input.agente,
        acao: input.acao,
        autonomy_level: resultado.autonomia.nivel,
        preparado: resultado.registro.preparado,
        recomendacao: resultado.registro.recomendacao,
        confianca: resultado.registro.confianca,
        entidade_tipo: resultado.registro.entidade?.tipo ?? null,
        entidade_id: resultado.registro.entidade?.id ?? null,
        retido: resultado.retido,
        executado: resultado.executado,
        aprovado_por: input.aprovacao?.approvedBy ?? null,
        aprovado_em: input.aprovacao?.approvedAt ?? null,
        aprovacao_motivo: input.aprovacao?.reason ?? null,
        motivo: resultado.motivo,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    registroId = data?.id ?? null;
  } catch (erro) {
    logger.warn("ia.sombra_nao_registrada", {
      organizationId: input.organizationId,
      agente: input.agente,
      acao: input.acao,
      retido: resultado.retido,
      reason: erro instanceof Error ? erro.message : String(erro),
    });
  }

  return { ...resultado, registroId };
}

/**
 * A DECISÃO HUMANA sobre um registro de sombra. É a segunda coluna da comparação.
 *
 * Sem este caminho, `decisao_humana` fica sempre nula e a comparação de 4.8
 * reporta "nenhum caso comparável" para sempre — verdadeiro, e inútil.
 */
export async function registrarDecisaoHumana(input: {
  registroId: string;
  decisao: string;
  decididoPor: string;
}): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("ai_shadow_decisions")
      .update({ decisao_humana: input.decisao, decidido_por: input.decididoPor, decidido_em: new Date().toISOString() })
      .eq("id", input.registroId);
    if (error) throw new Error(error.message);
    return true;
  } catch (erro) {
    logger.warn("ia.decisao_humana_nao_registrada", { registroId: input.registroId, reason: erro instanceof Error ? erro.message : String(erro) });
    return false;
  }
}

/** O DESFECHO. Terceira coluna: sem ela dá para medir concordância, não acerto. */
export async function registrarResultado(input: { registroId: string; resultado: string }): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("ai_shadow_decisions")
      .update({ resultado: input.resultado, resultado_em: new Date().toISOString() })
      .eq("id", input.registroId);
    if (error) throw new Error(error.message);
    return true;
  } catch (erro) {
    logger.warn("ia.resultado_nao_registrado", { registroId: input.registroId, reason: erro instanceof Error ? erro.message : String(erro) });
    return false;
  }
}

/**
 * A COMPARAÇÃO de 4.8, lida do banco: recomendação × decisão humana × resultado.
 *
 * Devolve `null` quando a leitura falha — e `null` significa "não medido", que é
 * diferente de uma comparação com zero casos. O relatório precisa saber qual dos
 * dois aconteceu para não afirmar "a IA nunca concordou" quando a verdade é "não
 * consegui ler".
 */
export async function compararSombra(input: {
  organizationId: string;
  agente?: string;
  minimoParaConcluir?: number;
}): Promise<(ComparacaoDeSombra & { agente: string | null }) | null> {
  try {
    let consulta = getSupabaseAdmin()
      .from("ai_shadow_decisions")
      .select("recomendacao, decisao_humana, resultado")
      .eq("organization_id", input.organizationId);
    if (input.agente) consulta = consulta.eq("agent", input.agente);
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    const confrontos = (data ?? []).map((linha) => ({
      recomendacaoDaIA: String(linha.recomendacao ?? ""),
      decisaoHumana: linha.decisao_humana ?? null,
      resultado: linha.resultado ?? null,
    }));
    return { ...compararSombraComHumano(confrontos, input.minimoParaConcluir ?? 20), agente: input.agente ?? null };
  } catch (erro) {
    logger.warn("ia.comparacao_de_sombra_nao_lida", { organizationId: input.organizationId, reason: erro instanceof Error ? erro.message : String(erro) });
    return null;
  }
}
