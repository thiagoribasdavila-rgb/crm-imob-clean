/**
 * AS CONTAS DE ANÚNCIO QUE ESTE TOKEN ALCANÇA.
 *
 * ── Por que a conta virou escolha por campanha ──────────────────────────────
 *
 * `META_AD_ACCOUNT_ID` era um valor único, e apontava para uma conta que o
 * token não alcança — o que fazia toda chamada voltar com "(#200) Ad account
 * owner has NOT grant ads_management", uma mensagem que manda conferir
 * permissões quando o problema é o ID. Meses de diagnóstico errado.
 *
 * O dono do produto tem quatro contas ativas e usa todas: uma por
 * empreendimento. Então a conta passou a ser escolhida na hora de subir a
 * campanha, e o env é só o padrão.
 *
 * ── A lista vem da Meta, não de uma lista nossa ─────────────────────────────
 *
 * Uma lista mantida por nós envelheceria: conta nova não apareceria, conta
 * removida continuaria oferecida, e a campanha falharia na criação em vez de
 * na escolha. Perguntando à Meta, o que a tela oferece é sempre o que existe.
 *
 * É também a validação: criar campanha numa conta que não está nesta lista
 * significaria gastar verba de outra pessoa.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { metaGraphVersion } from "@/lib/meta/graph";

export const dynamic = "force-dynamic";

export type ContaDeAnuncio = {
  id: string;      // act_...
  nome: string;
  ativa: boolean;
  moeda: string | null;
};

/**
 * Busca as contas alcançáveis pelo token.
 *
 * Exportada para a rota de criação validar contra a MESMA fonte que a tela
 * ofereceu — duas fontes divergiriam justamente no caso que importa.
 */
export async function contasAlcancaveis(): Promise<ContaDeAnuncio[] | null> {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(
      `https://graph.facebook.com/${metaGraphVersion()}/me/adaccounts` +
      `?fields=account_id,name,account_status,currency&limit=50&access_token=${token}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!r.ok) return null;
    const corpo = await r.json();
    return (corpo.data ?? []).map((c: Record<string, unknown>) => ({
      id: `act_${c.account_id}`,
      nome: String(c.name ?? "sem nome"),
      ativa: c.account_status === 1,
      moeda: (c.currency as string) ?? null,
    }));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 30, scope: "meta-ad-accounts" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  // Escolher onde a verba sai é decisão de liderança.
  const papel = identity.access.profile.commercialRole
    || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!["director", "superintendent", "manager"].includes(String(papel))) {
    return apiError("FORBIDDEN", "Escolher a conta de anúncios pertence à liderança.", identity.meta, { status: 403 });
  }

  const contas = await contasAlcancaveis();
  if (contas === null) {
    return apiError("META_UNREACHABLE",
      "Não foi possível listar as contas na Meta. Confira META_ADS_ACCESS_TOKEN.",
      identity.meta, { status: 503 });
  }

  const padrao = process.env.META_AD_ACCOUNT_ID ?? null;
  const padraoValido = padrao ? contas.some((c) => c.id === padrao) : false;

  return apiSuccess({
    contas,
    padrao,
    // Dito na resposta para a tela poder avisar em vez de falhar na criação.
    padraoValido,
    aviso: padrao && !padraoValido
      ? "META_AD_ACCOUNT_ID aponta para uma conta que este token não alcança. Escolha uma da lista — a mensagem da Meta para esse caso fala de permissão, não de ID, e leva o diagnóstico para o lado errado."
      : null,
  }, identity.meta, { headers: limited.headers });
}
