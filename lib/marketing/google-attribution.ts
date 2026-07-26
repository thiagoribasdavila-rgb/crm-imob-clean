/**
 * ATRIBUIÇÃO DO GOOGLE — a porta de entrada que faltava.
 *
 * Três dos quatro empreendimentos que a operação atende anunciam no Google:
 *
 *   Inside Perdizes   gclid + gad_campaignid=24038824067
 *   Kallas / Arvo     gclid + utm_source=uselink&utm_medium=google
 *   Tiê Aclimação     gclid + utm_campaign=pmax
 *
 * E o CRM tinha **2 leads** de `google_ads` contra 201 da Meta. Não porque o
 * Google traz menos: porque não havia nada lendo o que ele manda.
 *
 * ── POR QUE ISTO NÃO PRECISA DA API DO GOOGLE ADS ───────────────────────────
 *
 * A atribuição do Google viaja na URL da landing page e chega ao CRM dentro do
 * payload de qualquer origem — webhook de portal, formulário do site,
 * importação de planilha. É texto que já está entrando e ninguém lia.
 *
 * A API do Google Ads é necessária para GASTO e para conversão offline. Para
 * saber DE QUAL CAMPANHA a lead veio, basta ler o que já chegou — e é isso que
 * transforma o Google de invisível em mensurável.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
 *
 * Não adivinha. Sem identificador reconhecido, devolve `null` — e null vira
 * "origem não identificada", que é diferente de carimbar `google_ads` em toda
 * lead que tiver a palavra "google" em algum campo. Atribuição errada é pior
 * que atribuição ausente: ela move verba.
 *
 * Função pura: sem rede, sem banco, sem relógio.
 */

/** Identificadores de clique do Google. Cada um vem de um contexto diferente. */
const IDENTIFICADORES_DE_CLIQUE = [
  "gclid",   // clique padrão
  "gbraid",  // iOS, campanha de app/web sem cookie
  "wbraid",  // iOS, web
  "dclid",   // Display / Campaign Manager
] as const;

export type AtribuicaoDoGoogle = {
  /** O identificador de clique encontrado, sem inventar qual. */
  clickId: string;
  clickIdTipo: (typeof IDENTIFICADORES_DE_CLIQUE)[number];
  /** Id numérico da campanha, quando a URL o traz (`gad_campaignid`). */
  campaignExternalId: string | null;
  /** Nome da campanha por UTM. É o que o anunciante escreveu, não um id. */
  utmCampaign: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  /** `google_ads` sempre — se chegou aqui, houve clique pago identificado. */
  source: "google_ads";
  /** Página onde o clique aterrissou, sem query string. Ajuda a mapear projeto. */
  landingPage: string | null;
};

const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

/**
 * Extrai os parâmetros de uma URL. Aceita URL completa ou só a query string.
 * Não lança: entrada malformada devolve mapa vazio, porque um lead com URL
 * quebrada não pode derrubar a ingestão inteira.
 */
function parametrosDaUrl(entrada: string): { params: URLSearchParams; landing: string | null } {
  const bruto = texto(entrada);
  if (!bruto) return { params: new URLSearchParams(), landing: null };
  try {
    const url = new URL(bruto);
    return { params: url.searchParams, landing: `${url.origin}${url.pathname}` };
  } catch {
    // Não era URL completa: pode ser "?a=1&b=2" ou "a=1&b=2".
    return { params: new URLSearchParams(bruto.replace(/^\?/, "")), landing: null };
  }
}

/**
 * Lê a atribuição de um payload de lead.
 *
 * Procura em ordem: campos diretos do payload (portais mandam `gclid` solto),
 * depois dentro de uma URL de origem, depois dentro de `metadata`. Assim o mesmo
 * parser serve webhook de portal, formulário do site e importação.
 */
export function lerAtribuicaoDoGoogle(payload: Record<string, unknown>): AtribuicaoDoGoogle | null {
  if (!payload || typeof payload !== "object") return null;

  // Campos que costumam carregar a URL de origem, em qualquer das grafias que os
  // portais usam. Não é adivinhação: é o conjunto conhecido de nomes.
  const camposDeUrl = ["url", "landing_page", "landingPage", "page_url", "pageUrl", "source_url", "sourceUrl", "referrer", "origem_url"];
  let params = new URLSearchParams();
  let landing: string | null = null;
  for (const campo of camposDeUrl) {
    const valor = texto(payload[campo]);
    if (!valor) continue;
    const lido = parametrosDaUrl(valor);
    if ([...lido.params.keys()].length) {
      params = lido.params;
      landing = lido.landing;
      break;
    }
  }

  const direto = (chave: string) => {
    const noPayload = texto(payload[chave]);
    if (noPayload) return noPayload;
    const daUrl = texto(params.get(chave));
    if (daUrl) return daUrl;
    const meta = payload.metadata;
    if (meta && typeof meta === "object") return texto((meta as Record<string, unknown>)[chave]);
    return "";
  };

  let clickId = "";
  let clickIdTipo: AtribuicaoDoGoogle["clickIdTipo"] | null = null;
  for (const tipo of IDENTIFICADORES_DE_CLIQUE) {
    const valor = direto(tipo);
    if (valor) {
      clickId = valor;
      clickIdTipo = tipo;
      break;
    }
  }

  // Sem identificador de clique não há prova de que veio do Google pago. UTM
  // sozinha pode ser link de e-mail, de post orgânico ou colada à mão.
  if (!clickId || !clickIdTipo) return null;

  return {
    clickId,
    clickIdTipo,
    campaignExternalId: direto("gad_campaignid") || direto("campaignid") || null,
    utmCampaign: direto("utm_campaign") || null,
    utmSource: direto("utm_source") || null,
    utmMedium: direto("utm_medium") || null,
    utmContent: direto("utm_content") || null,
    utmTerm: direto("utm_term") || null,
    source: "google_ads",
    landingPage: landing,
  };
}

/**
 * Nome legível da campanha para registro.
 *
 * Prefere o que o anunciante escreveu (`utm_campaign`); cai para o id numérico;
 * e deixa explícito quando só há o clique. Nunca inventa um nome bonito —
 * "[sem nome] clique 123" é honesto e rastreável.
 */
export function nomeDaCampanhaDoGoogle(atribuicao: AtribuicaoDoGoogle): string {
  if (atribuicao.utmCampaign) return atribuicao.utmCampaign;
  if (atribuicao.campaignExternalId) return `[auto] Google ${atribuicao.campaignExternalId}`;
  return `[auto] Google — clique ${atribuicao.clickId.slice(0, 12)} (sem campanha declarada)`;
}

/**
 * Chave de campanha para deduplicar registro.
 *
 * O id numérico é o identificador estável; o nome de UTM muda quando o
 * anunciante renomeia. Usar o nome como chave criaria uma campanha nova a cada
 * renomeação — e o histórico se partiria ao meio.
 */
export function chaveDaCampanhaDoGoogle(atribuicao: AtribuicaoDoGoogle): string | null {
  return atribuicao.campaignExternalId
    ?? (atribuicao.utmCampaign ? `utm:${atribuicao.utmCampaign}` : null);
}
