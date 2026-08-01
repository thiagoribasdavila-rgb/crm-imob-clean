import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import {
  decidirSobreOTeto,
  orcamentoEmVigor,
  consumoNaoMedido,
  type ConsumoMedido,
  type PedidoDeIA,
  type VeredictoDeTeto,
} from "@/lib/ai/orcamento-de-ia";

/**
 * O LADO SERVIDOR DO TETO — lê o consumo medido e pergunta ao módulo puro.
 *
 * ── Por que a decisão NÃO mora aqui ───────────────────────────────────────
 *
 * Este arquivo tem `import "server-only"`: nenhum script nem teste consegue
 * carregá-lo. Foi exatamente essa armadilha que fez o portão de tarifas raspar
 * `provider-router.ts` com regex, acusar um modelo que só existia num comentário
 * e nunca ver o modelo que de fato rodava.
 *
 * Então aqui só existe I/O: buscar o consumo e registrar a recusa. A REGRA vive
 * em `orcamento-de-ia.ts`, que é puro — e por isso o contrato consegue chamar o
 * limitador e VER recusar, em vez de procurar a palavra "teto" no fonte.
 */

export type ResultadoDoLimitador = VeredictoDeTeto & {
  /** Falso quando o consumo não pôde ser lido. Vai para o log e o relatório. */
  consumoLido: boolean;
};

/**
 * Consumo do dia por (org, usuário, agente) numa ida ao banco.
 *
 * `p_user_id` nulo NÃO significa "todos": significa o balde das chamadas sem
 * atribuição, que são 35% do tráfego medido. A função SQL trata isso; ver o
 * comentário dela na migration 20260730050000.
 */
async function lerConsumo(
  organizationId: string,
  usuarioId: string | null | undefined,
  agente: string,
): Promise<{ consumo: ConsumoMedido; lido: boolean }> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("consumo_de_ia_do_dia", {
      p_organization_id: organizationId,
      p_user_id: usuarioId && String(usuarioId).trim() ? usuarioId : null,
      p_agent: agente || null,
    });
    if (error) throw new Error(error.message);
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha) return { consumo: consumoNaoMedido(), lido: false };
    const inteiro = (valor: unknown) => {
      const numero = Number(valor);
      return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 0;
    };
    return {
      consumo: {
        chamadasDoDia: inteiro(linha.chamadas_do_dia),
        tokensDoDia: inteiro(linha.tokens_do_dia),
        // NULL vindo do banco significa "nenhuma tarifa cadastrada". Preservar o
        // null é o que impede o teto de dólar de afirmar "gastou zero" para as
        // 28,6% de chamadas cobráveis sem custo medido.
        usdDoDia: linha.usd_do_dia === null || linha.usd_do_dia === undefined ? null : Number(linha.usd_do_dia),
        cobraveisSemCustoMedido: inteiro(linha.cobraveis_sem_custo_medido),
        chamadasDoUsuario: inteiro(linha.chamadas_do_usuario),
        tokensDoUsuario: inteiro(linha.tokens_do_usuario),
        chamadasDoAgente: inteiro(linha.chamadas_do_agente),
        tokensDoAgente: inteiro(linha.tokens_do_agente),
      },
      lido: true,
    };
  } catch (erro) {
    // A migration pode não estar aplicada no ambiente. O teto absoluto embutido
    // no código continua valendo, o modo sombra continua retendo, e o aviso
    // aparece — em vez de a IA cair porque o freio não conseguiu ler.
    logger.warn("ia.consumo_nao_lido", {
      organizationId,
      agente,
      reason: erro instanceof Error ? erro.message : String(erro),
    });
    return { consumo: consumoNaoMedido(), lido: false };
  }
}

/**
 * PERGUNTA AO TETO ANTES DE GASTAR.
 *
 * Devolve o veredicto graduado do §8: seguir · usar cache · trocar para modelo
 * econômico · reduzir processamento · pausar rotina não crítica · recusar.
 *
 * Quem chama decide o que fazer com o degrau. A recusa é registrada aqui porque
 * teto que recusa em silêncio produz o pior sintoma possível: "a IA parou de
 * funcionar" sem nenhuma pista de que foi o orçamento.
 */
export async function pedirPermissaoDeIA(pedido: PedidoDeIA & { organizationId: string }): Promise<ResultadoDoLimitador> {
  const orcamento = orcamentoEmVigor();
  const { consumo, lido } = await lerConsumo(pedido.organizationId, pedido.usuarioId, pedido.agente);
  const veredicto = decidirSobreOTeto(pedido, consumo, orcamento);

  if (orcamento.aparos.length) {
    // O operador escreveu um número e outro está valendo. Ele precisa saber.
    logger.warn("ia.teto_aparado", { aparos: orcamento.aparos, origem: orcamento.origem });
  }

  if (!veredicto.permitido) {
    logger.error("ia.recusada_por_teto", {
      organizationId: pedido.organizationId,
      feature: pedido.feature,
      agente: pedido.agente,
      essencial: veredicto.essencial,
      tetosEstourados: veredicto.tetosEstourados,
      motivos: veredicto.motivos,
      consumoLido: lido,
    });
  } else if (veredicto.degraus.length) {
    logger.warn("ia.degradada_por_teto", {
      organizationId: pedido.organizationId,
      feature: pedido.feature,
      agente: pedido.agente,
      degraus: veredicto.degraus,
      acao: veredicto.acao,
    });
  }

  return { ...veredicto, consumoLido: lido };
}

/**
 * O agente por trás de uma feature. `creative-studio.briefing` → `creative-studio`.
 *
 * A mesma regra que a migration usou para preencher o histórico das 43 linhas
 * medidas. Divergir daqui faria o teto contar um agente e o histórico outro —
 * a classe de defeito "caminhos divergentes" que já mordeu este repositório.
 */
export function agenteDaFeature(feature: string): string {
  return String(feature || "").trim().split(".")[0] || "desconhecido";
}
