/**
 * TESTE REAL DA OPENAI — e a causa, quando ele falha.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * O `catch` devolvia `details: error instanceof Error ? error.name : "Error"`.
 * `error.name` de um `new Error(...)` é a string "Error" — literalmente. Toda
 * falha desta rota, qualquer que fosse a causa, respondia a mesma palavra vazia,
 * e a mensagem mandava "consultar os logs seguros da Hostinger": um lugar que
 * quem opera não alcança.
 *
 * Medido no banco em 02/08/2026: `openai-homologation` tem ZERO linha em
 * ai_usage_events, enquanto `perplexity-homologation` tem 8. A rota feita para
 * diagnosticar a OpenAI era a que menos deixava rastro dela.
 *
 * Agora a causa vem CLASSIFICADA (credencial, cota, rede, configuração, recusa
 * do modelo) com a frase de QUEM resolve, e a tentativa falha vira linha em
 * ai_orchestration_decisions com status 'failed'.
 *
 * ── O QUE NÃO SAI DAQUI ─────────────────────────────────────────────────────
 *
 * Nenhum segredo. `lib/ai/falha-de-ia.ts` redige chave, bearer, JWT e e-mail na
 * origem, antes de a frase chegar ao log ou à resposta.
 */
import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { FalhaDeHomologacao, testOpenAIConnection } from "@/lib/ai/provider-router";
import { classificarFalhaDeIa } from "@/lib/ai/falha-de-ia";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 5, windowMs: 15 * 60_000, scope: "openai-homologation" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director"))
    return apiError("FORBIDDEN", "Teste real da OpenAI é exclusivo da diretoria.", identity.meta, { status: 403 });
  // Chave ausente é CREDENCIAL, e a rota já sabia disso antes de chamar ninguém.
  // Responder no mesmo vocabulário do caminho de falha evita que a tela precise
  // tratar dois formatos para a mesma classe de problema.
  if (!process.env.OPENAI_API_KEY)
    return apiError("OPENAI_NOT_CONFIGURED", "Configure OPENAI_API_KEY na Hostinger.", identity.meta, {
      status: 503,
      details: {
        classe: "credencial",
        codigo: "OPENAI_API_KEY_AUSENTE",
        provedor: "openai",
        mensagem: "A variável OPENAI_API_KEY não está definida no ambiente do servidor.",
        quemResolve:
          "Dono da conta: a chave do provedor está ausente ou foi recusada. Repor a variável de ambiente no servidor.",
        registrado: false,
      },
    });
  try {
    const result = await testOpenAIConnection({
      organizationId: identity.access.organization.id,
      userId: identity.access.profile.id,
    });
    // Respondeu, mas não com o que o teste de integridade exige. Isso NÃO é rede
    // nem saldo: é resposta inesperada do modelo, e dizer isso por extenso evita
    // mandar o dono procurar crédito quando o problema é outro.
    if (result.provider !== "openai" || result.text.trim() !== "ATLAS_OPENAI_OK")
      return apiError(
        "OPENAI_UNEXPECTED_RESPONSE",
        "A OpenAI respondeu, mas o teste de integridade não conferiu.",
        identity.meta,
        {
          status: 502,
          details: {
            classe: "recusa_do_modelo",
            codigo: "RESPOSTA_INESPERADA",
            provedor: result.provider,
            mensagem: `Esperado "ATLAS_OPENAI_OK" do provedor openai; veio ${result.text.trim().slice(0, 120) || "(vazio)"} do provedor ${result.provider}.`,
            quemResolve:
              "Time técnico: o provedor respondeu fora do combinado. Conferir modelo e prompt de homologação — não é saldo nem rede.",
            registrado: true,
          },
        },
      );
    return apiSuccess(
      {
        status: "passed",
        provider: result.provider,
        model: result.model,
        providerRequestId: result.providerRequestId || null,
        latencyMs: result.latencyMs,
        usage: result.usage,
        measured: true,
        fallbackUsed: false,
        testedAt: new Date().toISOString(),
      },
      identity.meta,
      { headers: rate.headers },
    );
  } catch (error) {
    // `FalhaDeHomologacao` já vem com a causa classificada E já foi gravada pelo
    // roteador. Qualquer outro erro é classificado aqui para que nenhum caminho
    // volte a responder a palavra "Error".
    const falha =
      error instanceof FalhaDeHomologacao ? error.falha : classificarFalhaDeIa(error, "openai");
    return apiError("OPENAI_TEST_FAILED", `A chamada real da OpenAI falhou: ${falha.mensagem}`, identity.meta, {
      status: 502,
      details: {
        classe: falha.classe,
        codigo: falha.codigo,
        provedor: falha.provedor,
        httpStatus: falha.httpStatus,
        mensagem: falha.mensagem,
        quemResolve: falha.quemResolve,
        // Diz se a falha ficou registrada no banco. Quando `false`, quem lê sabe
        // que o rastro só existe nesta resposta — e não vai procurar linha que
        // não foi gravada.
        registrado: error instanceof FalhaDeHomologacao,
      },
    });
  }
}
