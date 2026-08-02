import type { NextRequest } from "next/server";

import { apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  JANELA_DE_PROVEDOR_DIAS,
  medirContagem,
  medirRetornoDeFuncao,
  medirVariaveisDeAmbiente,
  resumirProntidaoParaLigar,
  type Medida,
} from "@/lib/ai/prontidao-para-ligar";
import { MODELO_DE_FALLBACK, PROVEDOR_DE_FALLBACK } from "@/lib/ai/prontidao-generativa";

/**
 * O QUE FALTA PARA LIGAR A IA — medido agora, na organização de quem pergunta.
 *
 * ── POR QUE ESTA ROTA NÃO DECIDE NADA ──────────────────────────────────────
 *
 * Ela mede e entrega. O veredito inteiro sai de `lib/ai/prontidao-para-ligar.ts`,
 * que é puro e alcançável pelo contrato. Se a decisão morasse aqui, a única
 * proteção possível seria procurar strings no fonte da rota — e este
 * repositório já viu duas vezes uma asserção assim sobreviver a `if (false)`.
 *
 * ── A DIFERENÇA ENTRE `0` E `null`, NO LUGAR ONDE ELA NASCE ────────────────
 *
 * Toda consulta abaixo passa por `medir()`, e `medir()` devolve `valor: null`
 * quando o PostgREST responde erro. Nunca `0`. É aqui que a mentira começaria:
 * um `count ?? 0` nesta linha faria a tela desenhar "0 templates — tudo calmo"
 * no dia em que o banco não respondesse, e ninguém abre chamado contra uma tela
 * que mostra zero.
 *
 * ── POR QUE `service_role` COM FILTRO EXPLÍCITO ────────────────────────────
 *
 * A afirmação desta tela é "não existe NENHUM template nesta organização".
 * Uma afirmação de inexistência não pode sair de uma leitura que a política de
 * RLS pode recortar em silêncio: lista vazia por falta de permissão e lista
 * vazia por falta de linha respondem 200 iguais, e foi assim que
 * `ai_shadow_decisions` mostrou 0 de 20 para um diretor real.
 *
 * A cerca não virou decoração: `organization_id` vem do contexto de acesso já
 * verificado, jamais do pedido, e só COUNT trafega — `head: true`, nenhuma
 * linha de dado sai daqui.
 *
 * ── O QUE ESTA ROTA NÃO FAZ ────────────────────────────────────────────────
 *
 * Não escreve, não envia mensagem, não chama a Meta e não chama provedor de
 * IA. É `GET` e só lê. A prontidão do provedor é medida pelo RASTRO em
 * `ai_usage_events` — não por uma chamada nova, que custaria dinheiro e ainda
 * mediria o instante em vez do estado.
 */

export const dynamic = "force-dynamic";

/** Quem lê o que falta para ligar a IA é quem responde por ligá-la. */
const PAPEIS_QUE_LEEM = ["admin", "director", "superintendent", "manager"] as const;

type Contagem = { count: number | null; error: unknown } | null;
type Retorno = { data: unknown; error: unknown } | null;

/**
 * Nenhuma leitura desta rota pode derrubar as outras.
 *
 * O cliente do Supabase resolve com `{ error }` em vez de rejeitar, mas uma
 * queda de rede ainda rejeita — e um `Promise.all` sem rede de proteção
 * transformaria UMA falha em seis medidas nulas. O painel diria "não consegui
 * ler nada" quando na verdade leu cinco itens de seis, e o dono perderia
 * bloqueios que estavam perfeitamente medidos.
 */
const protegido = async <T,>(promessa: PromiseLike<T>): Promise<T | null> => {
  try {
    return await promessa;
  } catch {
    return null;
  }
};

export async function GET(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "ai.prontidao-para-ligar" });
  if (!limite.ok) return limite.response;

  const acesso = await requireAccessContext(request, { roles: [...PAPEIS_QUE_LEEM] });
  if (!acesso.ok) return acesso.response;

  const { access, meta } = acesso;
  const organizacao = access.profile.organizationId;
  const admin = getSupabaseAdmin();
  const desde = new Date(Date.now() - JANELA_DE_PROVEDOR_DIAS * 86_400_000).toISOString();

  const naOrganizacao = (tabela: string, coluna = "id") =>
    admin.from(tabela).select(coluna, { count: "exact", head: true }).eq("organization_id", organizacao);

  const [
    templatesAprovados,
    templatesQualquerStatus,
    jornadas,
    chamadasReais,
    consentimentoQueOTrabalhadorLe,
    consentimentoDeclaradoNaEntrada,
  ] = await Promise.all([
    // As duas contagens de template existem porque respondem perguntas
    // diferentes: "aprovado" diz se dá para enviar, e "qualquer status" diz se
    // alguém CHEGOU A SUBMETER. Zero nas duas é "ninguém começou"; zero só na
    // primeira seria "está na fila da Meta". A ação do dono muda com isso.
    protegido(naOrganizacao("message_templates").eq("channel", "whatsapp").eq("status", "approved")),
    protegido(naOrganizacao("message_templates")),
    protegido(naOrganizacao("ai_sales_journeys")),
    protegido(
      admin
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizacao)
        .gte("created_at", desde)
        // A exclusão dupla — provedor E modelo — porque o roteador grava o
        // fallback determinístico como uso normal. Contar "houve linha" declararia
        // a IA viva justamente quando nenhuma respondeu.
        .neq("provider", PROVEDOR_DE_FALLBACK)
        .neq("model", MODELO_DE_FALLBACK),
    ),
    // O predicado EXATO do trabalhador noturno vive numa função SQL
    // (20260802160000_consentimento_como_o_worker_le.sql), NÃO num filtro
    // reescrito aqui. Reescrevê-lo criaria uma segunda versão do mesmo
    // predicado — a classe de defeito que este painel existe para denunciar.
    //
    // A migration ainda NÃO foi aplicada. Enquanto não for, a chamada devolve
    // erro, o item vira `nao_medido` com motivo, e a tela diz que não sabe.
    // Jamais zero: "função ausente" não pode ser lido como "ninguém consentiu".
    protegido(admin.rpc("count_leads_com_consentimento_do_worker", { p_organization_id: organizacao })),
    protegido(admin.rpc("count_leads_com_consentimento_declarado", { p_organization_id: organizacao })),
  ]);

  /**
   * As três conversões vivem em `lib/ai/prontidao-para-ligar.ts`, não aqui.
   *
   * É nesta fronteira que o zero falso nasce, e código guardado dentro da rota
   * é código que o contrato não consegue executar. `medirContagem`,
   * `medirRetornoDeFuncao` e `medirVariaveisDeAmbiente` são exercitados por
   * `tests/contracts/prontidao-para-ligar.test.mjs` com resposta de erro,
   * `data: null`, string vazia e ausência de rede.
   */
  const ONDE_SE_INSTALA =
    "a migration 20260802160000_consentimento_como_o_worker_le.sql ainda não foi aplicada";
  const medir = (resultado: Contagem, comoFoiMedido: string, oQue: string): Medida =>
    medirContagem(resultado, comoFoiMedido, oQue);
  const medirRetorno = (resultado: Retorno, comoFoiMedido: string, oQue: string): Medida =>
    medirRetornoDeFuncao(resultado, comoFoiMedido, oQue, ONDE_SE_INSTALA);
  const medirAmbiente = (nomes: string[], comoFoiMedido: string): Medida =>
    medirVariaveisDeAmbiente(nomes, process.env, comoFoiMedido);

  const templateAprovado = medir(
    templatesAprovados as Contagem,
    "message_templates com channel='whatsapp' e status='approved' nesta organização",
    "os templates aprovados",
  );
  const templateQualquer = medir(
    templatesQualquerStatus as Contagem,
    "message_templates de qualquer status nesta organização",
    "os templates submetidos",
  );

  const medidas: Record<string, Medida> = {
    consentimento_legivel: medirRetorno(
      consentimentoQueOTrabalhadorLe as Retorno,
      "leads cujo metadata satisfaz o MESMO predicado do trabalhador noturno " +
        "(reactivation.consentBasis, ou messagingConsent.whatsapp=true com basis)",
      "as leads com consentimento legível pelo trabalhador",
    ),
    template_aprovado: templateAprovado,
    numero_oficial: medirAmbiente(
      ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"],
      "presença de WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN no servidor " +
        "(presença, nunca o valor)",
    ),
    nome_do_template_no_servidor: medirAmbiente(
      ["WHATSAPP_NIGHTLY_APPROACH_TEMPLATE"],
      "presença de WHATSAPP_NIGHTLY_APPROACH_TEMPLATE no servidor",
    ),
    // Não é leitura de banco e a rota diz isso em voz alta: `fonte: "codigo"`.
    // O percentual do diretor não tem onde ser guardado — não há coluna, não há
    // arquivo de configuração e não há rota que o receba. Varredura feita no
    // repositório em 02/08/2026. Publicar isto como se fosse um SELECT daria ao
    // número uma autoridade que ele não tem.
    percentual_do_diretor: {
      valor: 0,
      fonte: "codigo",
      comoFoiMedido:
        "varredura do repositório: nenhuma coluna, arquivo de configuração ou rota recebe " +
        "o percentual da IA nem grava o braço da lead",
    },
    provedor_generativo: medir(
      chamadasReais as Contagem,
      `chamadas em ai_usage_events nos últimos ${JANELA_DE_PROVEDOR_DIAS} dias, excluindo ` +
        `provider='${PROVEDOR_DE_FALLBACK}' e model='${MODELO_DE_FALLBACK}'`,
      "as chamadas reais de IA",
    ),
    jornadas_de_venda: medir(
      jornadas as Contagem,
      "ai_sales_journeys nesta organização",
      "as jornadas de venda",
    ),
  };

  const veredito = resumirProntidaoParaLigar(medidas);

  /**
   * O CONTRASTE QUE MUDA A CONVERSA SOBRE CONSENTIMENTO.
   *
   * `legivel` usa o predicado do trabalhador; `declarado` usa a chave que a
   * entrada da Meta realmente grava (`metadata.meta.consentBasis`). Quando o
   * segundo é maior que o primeiro, o consentimento EXISTE e o motor não o
   * enxerga — e essa é uma frase completamente diferente de "não temos
   * consentimento". Sem os dois números lado a lado, o painel mandaria a
   * operação coletar de novo algo que já está coletado.
   */
  const declarado = medirRetorno(
    consentimentoDeclaradoNaEntrada as Retorno,
    "leads com metadata.meta.consentBasis preenchido (a chave que a entrada da Meta grava)",
    "as leads com consentimento declarado na entrada",
  );
  const legivel = medidas.consentimento_legivel;
  const consentimentoInvisivel =
    legivel.valor !== null && declarado.valor !== null && declarado.valor > legivel.valor
      ? {
          legivelPeloTrabalhador: legivel.valor,
          declaradoNaEntrada: declarado.valor,
          diferenca: declarado.valor - legivel.valor,
          frase:
            `${declarado.valor - legivel.valor} lead(s) TÊM base de consentimento declarada e o ` +
            "trabalhador noturno não a enxerga: a entrada grava em `metadata.meta.consentBasis` e " +
            "ele lê `metadata.reactivation.consentBasis`. Duas chaves para o mesmo fato. " +
            "Isto não se resolve coletando consentimento de novo — resolve-se no código.",
        }
      : null;

  return apiSuccess(
    {
      geradoEm: new Date().toISOString(),
      organizacao,
      veredito,
      /** Contexto que não decide, mas muda a ação de quem lê. */
      contexto: {
        templatesDeQualquerStatus: templateQualquer,
        consentimentoInvisivel,
        janelaDoProvedorEmDias: JANELA_DE_PROVEDOR_DIAS,
      },
    },
    meta,
  );
}
