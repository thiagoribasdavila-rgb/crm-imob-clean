/**
 * NOME DE CIDADE → CHAVE DE CIDADE DA META.
 *
 * ── O defeito que isto fecha ────────────────────────────────────────────────
 *
 * `housingTargetingSpec` recebe `cities: string[]` e monta `{ key }` — a Meta
 * espera uma CHAVE numérica ("269969"). Mas a rota de criação passava
 * `brief.city`, que é o NOME ("São Paulo").
 *
 * A campanha era criada normalmente; o CONJUNTO é que falhava, com:
 *
 *   A localização para direcionamento não pode ser usada
 *
 * Ninguém tinha visto porque a estrutura nunca foi criada de verdade — o
 * `META_AD_ACCOUNT_ID` apontava para uma conta fora do alcance do token, então
 * tudo parava antes, com uma mensagem falando de permissão. Um defeito
 * escondido atrás do outro.
 *
 * ── Por que resolver e não pedir a chave ao usuário ────────────────────────
 *
 * Ninguém sabe de cor que São Paulo é 269969. Exigir a chave transformaria
 * "subir campanha" numa consulta ao Gerenciador de Anúncios — e a tela existe
 * justamente para não precisar dele.
 */

import { metaGraphVersion } from "@/lib/meta/graph";

/** nome normalizado → chave. Vive pelo processo: cidade não muda de chave. */
const cache = new Map<string, string | null>();

const normalizar = (nome: string) =>
  nome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Resolve um nome de cidade para a chave da Meta.
 *
 * Devolve `null` quando não encontra — o chamador decide se cai para segmentação
 * mais ampla ou recusa. Inventar uma chave parecida seria anunciar na cidade
 * errada, gastando verba onde o imóvel não está.
 */
export async function chaveDaCidade(
  nome: string,
  paisISO2 = "BR",
): Promise<string | null> {
  const chaveCache = `${paisISO2}:${normalizar(nome)}`;
  if (cache.has(chaveCache)) return cache.get(chaveCache) ?? null;

  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token || !nome.trim()) return null;

  try {
    const url =
      `https://graph.facebook.com/${metaGraphVersion()}/search` +
      `?type=adgeolocation&location_types=${encodeURIComponent('["city"]')}` +
      `&q=${encodeURIComponent(nome)}&country_code=${paisISO2}&limit=10` +
      `&access_token=${token}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const corpo = await r.json();
    const candidatos = (corpo.data ?? []) as Array<{ key?: string; name?: string }>;

    // Exato antes de aproximado: buscar "Sao Paulo" devolve Campinas em
    // primeiro lugar. Pegar o primeiro da lista anunciaria na cidade errada.
    const alvo = normalizar(nome);
    const exato = candidatos.find((c) => c.name && normalizar(c.name) === alvo);
    const escolhido = exato?.key ?? null;

    cache.set(chaveCache, escolhido);
    return escolhido;
  } catch {
    return null;
  }
}

/** Resolve várias cidades, descartando as que a Meta não conhece. */
export async function chavesDasCidades(
  nomes: string[],
  paisISO2 = "BR",
): Promise<string[]> {
  const resolvidas = await Promise.all(nomes.map((n) => chaveDaCidade(n, paisISO2)));
  return resolvidas.filter((k): k is string => Boolean(k));
}

/** Já é uma chave da Meta (só dígitos) e não um nome? */
export function pareceChave(valor: string): boolean {
  return /^[0-9]{4,12}$/.test(valor.trim());
}
