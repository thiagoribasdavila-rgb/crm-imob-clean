/**
 * Estrategista de criativos — descritivos no formato flexível da Meta (era Andromeda).
 *
 * Núcleo determinístico e puro: a partir do brief de um produto imobiliário,
 * gera variações de copy — UMA por ÂNGULO conceitual, porque o Andromeda premia
 * diversidade real (Entity IDs distintos), não edições cosméticas — valida
 * contra os limites do asset_feed_spec e contra as políticas de HOUSING e
 * Personal Attributes da Meta, e monta o JSON do asset_feed_spec + o esqueleto
 * de campanha OUTCOME_LEADS.
 *
 * Tudo aqui é PROPOSTA: nada executa contra a Meta. O payload vai à Caixa de
 * Aprovações (governança "autônomo, sob supervisão") antes de qualquer POST.
 */


// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export type CreativeAngle =
  | "sair_do_aluguel"
  | "investimento"
  | "localizacao"
  | "renda_alvo"
  | "estilo_de_vida"
  | "entrega_imediata";

export type ProductBrief = {
  product: string;
  developer?: string | null;
  neighborhood?: string;
  city?: string;
  metroDistanceM?: number;
  areaM2?: string;          // ex.: "25 a 40 m²"
  priceFrom?: number;       // R$ (a partir de)
  incomeMinSm?: number;     // faixa do programa de crédito, em salários mínimos
  incomeMaxSm?: number;
  delivered?: boolean;      // entrega imediata / pronto para morar
  differentials?: string[]; // ex.: ["rooftop com vista", "coworking"]
};

export type FlexibleAdCopy = {
  product: string;
  angles: CreativeAngle[];          // 1:1 com primaryTexts (um primário por ângulo)
  primaryTexts: string[];           // bodies — máx. 5, cada ≤200 chars
  headlines: string[];              // titles — máx. 5, cada ≤40 chars
  descriptions: string[];           // descriptions — máx. 5, cada ≤30 chars
  callToAction: "LEARN_MORE" | "SIGN_UP" | "CONTACT_US";
  complianceNotes: string[];
};

export type CopyViolation = {
  field: "primaryTexts" | "headlines" | "descriptions";
  index: number;
  rule: string;
  detail: string;
};

// ---------------------------------------------------------------------------
// Limites (asset_feed_spec) e política de texto (HOUSING / Personal Attributes)
// ---------------------------------------------------------------------------

const LIMITS = {
  primaryTexts: { maxItems: 5, maxChars: 200, recommendedChars: 125 },
  headlines: { maxItems: 5, maxChars: 40 },
  descriptions: { maxItems: 5, maxChars: 30 },
} as const;

/**
 * Padrões proibidos no copy. Regra de ouro da política: descrever o PRODUTO e o
 * lugar, nunca a pessoa que vê o anúncio. Falar do programa de crédito é ok
 * ("para renda de 6 a 10 salários mínimos" descreve o programa, não o leitor).
 */
const FORBIDDEN: ReadonlyArray<{ rule: string; re: RegExp; detail: string }> = [
  {
    rule: "discriminacao_housing",
    re: /\b(exclusiv[oa]s?|apenas|somente|s[óo])\s+para\b/i,
    detail: "Restringir o público ('exclusivo/apenas para') indica preferência por grupo — vetado pela política de Housing.",
  },
  {
    rule: "discriminacao_housing",
    re: /\bideal\s+para\s+(fam[íi]lias?|solteir[oa]s?|casad[oa]s?|jovens|idos[oa]s?|homens|mulheres)\b/i,
    detail: "'Ideal para <grupo>' descreve a pessoa, não o imóvel — vetado (status familiar/idade/gênero são atributos protegidos).",
  },
  {
    rule: "discriminacao_housing",
    re: /\bn[ãa]o\s+(alugamos|vendemos|atendemos)\s+(para|a)\b/i,
    detail: "Desencorajar grupos ('não alugamos para...') é prática discriminatória vetada.",
  },
  {
    rule: "atributo_pessoal",
    re: /\bpara\s+voc[êe]\s+que\b/i,
    detail: "'Para você que...' implica conhecer característica pessoal de quem vê — vetado pela política de Personal Attributes.",
  },
  {
    rule: "atributo_pessoal",
    re: /\bvoc[êe]\s+(ganha|recebe|tem\s+\d+\s*anos|est[áa]\s+(endividad|negativad)\w*)/i,
    detail: "Pergunta/afirmação de atributo pessoal em 2ª pessoa (renda, idade, dívida) — vetado.",
  },
  {
    rule: "atributo_pessoal",
    re: /\bsua\s+(renda|idade|d[íi]vida)\s*(é|e\b|est[áa]|de\b)?/i,
    detail: "'Sua renda/idade/dívida...' atribui condição pessoal ao leitor — vetado.",
  },
  {
    rule: "promessa_financeira",
    re: /\bgarantid[oa]s?\b/i,
    detail: "Promessa de resultado ('garantido', 'renda garantida', 'valorização garantida') — vetada.",
  },
  {
    rule: "promessa_financeira",
    re: /\bsem\s+riscos?\b/i,
    detail: "'Sem risco' promete resultado financeiro certo — vetado.",
  },
  {
    rule: "promessa_financeira",
    re: /\b(retorno|lucro)\s+cert[oa]\b/i,
    detail: "'Retorno/lucro certo' promete resultado financeiro — vetado.",
  },
];

// Fallbacks à prova de política — usados se todo candidato de um campo cair na validação.
const SAFE_PRIMARY =
  "Condições direto com a incorporadora: simule o financiamento sem compromisso e conheça a planta, o lazer e a vizinhança do empreendimento.";
const SAFE_HEADLINE = "Simule sem compromisso";
const SAFE_DESCRIPTION = "Fale com a incorporadora";

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/** Formata inteiro como moeda BRL simples (sem depender de Intl/locale). */
function brl(n: number): string {
  return `R$ ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Lugar preferido do brief (bairro > cidade). */
function placeOf(brief: ProductBrief): string | null {
  return brief.neighborhood ?? brief.city ?? null;
}

/** " em Perdizes" — vazio se o nome do produto já contém o lugar (evita "Vertice Perdizes em Perdizes"). */
function locOf(brief: ProductBrief): string {
  const place = placeOf(brief);
  if (!place) return "";
  if (brief.product.toLowerCase().includes(place.toLowerCase())) return "";
  return ` em ${place}`;
}

/** Diferenciais saneados (trim, não-vazios, no máx. 2 no copy). */
function diffsOf(brief: ProductBrief): string[] {
  return (brief.differentials ?? []).map((d) => d.trim()).filter(Boolean).slice(0, 2);
}

function violatesPolicy(text: string): boolean {
  return FORBIDDEN.some((f) => f.re.test(text));
}

/** Primeiro candidato que respeita tamanho, política e não duplica (case-insensitive). */
function firstValid(candidates: Array<string | null>, maxChars: number, used: Set<string>): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const text = c.replace(/\s+/g, " ").trim();
    if (!text || text.length > maxChars) continue;
    if (violatesPolicy(text)) continue;
    const key = text.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    return text;
  }
  return null;
}

/** Faixa de renda do programa em texto ("6 a 10", "a partir de 6", "até 10"). */
function incomeRange(brief: ProductBrief): string | null {
  const { incomeMinSm: min, incomeMaxSm: max } = brief;
  if (min != null && max != null) return `${min} a ${max}`;
  if (min != null) return `a partir de ${min}`;
  if (max != null) return `até ${max}`;
  return null;
}

// ---------------------------------------------------------------------------
// Geração de copy por ângulo — candidatos em ordem de preferência; o último de
// cada lista é sempre um fallback curto, sem interpolação, garantidamente limpo.
// ---------------------------------------------------------------------------

type AngleCandidates = { primaries: Array<string | null>; headlines: Array<string | null>; descriptions: Array<string | null> };

function angleCandidates(angle: CreativeAngle, brief: ProductBrief): AngleCandidates {
  const loc = locOf(brief);
  const place = placeOf(brief);
  const price = brief.priceFrom != null ? brl(brief.priceFrom) : null;
  const metro = brief.metroDistanceM != null ? brief.metroDistanceM : null;
  const diffs = diffsOf(brief);
  const faixa = incomeRange(brief);

  switch (angle) {
    case "sair_do_aluguel":
      return {
        primaries: [
          `No ${brief.product}${loc}, a parcela do financiamento fica na faixa de um aluguel da região — com a diferença de que o imóvel é seu.${price ? ` Unidades a partir de ${price}.` : ""} Simule sem compromisso.`,
          "A parcela que substitui o aluguel: financiamento na faixa do aluguel da região e escritura no seu nome. Condições direto com a incorporadora, sem compromisso.",
        ],
        headlines: ["Parcela na faixa do aluguel", "Do aluguel para o imóvel próprio"],
        descriptions: ["Parcela no lugar do aluguel", "Simule sem compromisso"],
      };
    case "investimento":
      return {
        primaries: [
          `Studios${loc} com forte demanda de locação: metrô próximo, universidades e polo gastronômico na vizinhança.${price ? ` Unidades a partir de ${price}.` : ""} Potencial de renda em curta e longa estadia.`,
          "Ativo real em bairro de alta demanda de locação, com liquidez de revenda. Estude os números com a incorporadora antes de decidir — sem promessa, com dados.",
        ],
        headlines: [place ? `Studio para investir em ${place}` : null, "Studio compacto para investir"],
        descriptions: ["Alta demanda de locação", "Ativo real, bairro líquido"],
      };
    case "localizacao":
      return {
        primaries: [
          metro != null || place
            ? `O ${brief.product} fica${metro != null ? ` a ${metro} m do metrô` : ""}${loc}: padaria, feira e parque na rotina, tudo a pé.${brief.areaM2 ? ` Plantas de ${brief.areaM2}` : " Planta inteligente"}${diffs[0] ? ` e ${diffs[0]}` : " e lazer completo"}.`
            : null,
          "Endereço que resolve a rotina: metrô, comércio e serviços a poucos minutos a pé. Conheça a planta e as áreas comuns do empreendimento.",
        ],
        headlines: [
          metro != null ? `A ${metro} m do metrô${place ? ` — ${place}` : ""}` : null,
          "Bem localizado, rotina a pé",
        ],
        descriptions: [metro != null ? `A ${metro} m do metrô` : null, "Metrô e comércio a pé"],
      };
    case "renda_alvo":
      return {
        primaries: [
          faixa
            ? `Unidades enquadradas em programa habitacional para renda familiar de ${faixa} salários mínimos — subsídio e entrada facilitada conforme as regras do programa. Simulação gratuita e sem compromisso.`
            : null,
          "Condições de financiamento com subsídio do programa habitacional, conforme regras vigentes. Simulação gratuita direto com a incorporadora.",
        ],
        headlines: [faixa ? `Programa para renda de ${faixa} SM` : null, "Subsídio do programa habitacional"],
        descriptions: ["Subsídio e entrada facilitada", "Simulação gratuita"],
      };
    case "estilo_de_vida":
      return {
        primaries: [
          place
            ? `Morar${loc || ` em ${place}`} é ter café, parque e vida cultural a poucos passos. O ${brief.product} soma ${diffs.length ? diffs.join(" e ") : "áreas comuns pensadas para o dia a dia"} — a cidade como extensão de casa.`
            : null,
          "Vida de bairro de verdade: café na esquina, parque no fim da tarde e a cidade a pé. Conheça o empreendimento e as áreas comuns pensadas para o dia a dia.",
        ],
        headlines: [place ? `Viva ${place} no dia a dia` : null, "Um bairro para viver a pé"],
        descriptions: ["Vida de bairro a pé", "A cidade como quintal"],
      };
    case "entrega_imediata":
      return {
        primaries: [
          `Pronto para morar: o ${brief.product}${loc} tem unidades de entrega imediata. Visite a unidade real, confira o acabamento e mude sem esperar obra.`,
          "Entrega imediata: visite a unidade pronta, confira o acabamento real e mude sem esperar obra. Agende a visita com a incorporadora.",
        ],
        headlines: [place ? `Pronto para morar em ${place}` : null, "Pronto para morar e mudar já"],
        descriptions: ["Entrega imediata", "Visite a unidade pronta"],
      };
  }
}

/** Ângulos default derivados do brief (no máx. 5 — um primário por ângulo). */
function defaultAngles(brief: ProductBrief): CreativeAngle[] {
  const angles: CreativeAngle[] = [];
  if (brief.metroDistanceM != null || brief.neighborhood) angles.push("localizacao");
  angles.push("sair_do_aluguel");
  if (brief.incomeMinSm != null || brief.incomeMaxSm != null) angles.push("renda_alvo");
  if (brief.delivered) angles.push("entrega_imediata");
  angles.push("investimento", "estilo_de_vida");
  return angles.slice(0, LIMITS.primaryTexts.maxItems);
}

function normalizeAngles(brief: ProductBrief, angles?: CreativeAngle[]): CreativeAngle[] {
  if (!angles || !angles.length) return defaultAngles(brief);
  const unique: CreativeAngle[] = [];
  for (const a of angles) if (!unique.includes(a)) unique.push(a);
  return unique.slice(0, LIMITS.primaryTexts.maxItems);
}

function buildNotes(copy: FlexibleAdCopy): string[] {
  const notes: string[] = [
    'Campanha imobiliária: special_ad_categories ["HOUSING"] obrigatório — idade (18-65+), gênero e CEP travados pela Meta; a diferenciação acontece 100% no criativo.',
    `${copy.angles.length} ângulos conceituais distintos — o Andromeda premia diversidade real; edições cosméticas não contam como criativo novo (refresh de conceito a cada 1-3 semanas).`,
    "Copy descreve o produto, o lugar e o programa de crédito — nunca atributos de quem vê (política Housing / Personal Attributes).",
  ];
  copy.primaryTexts.forEach((text, i) => {
    if (text.length > LIMITS.primaryTexts.recommendedChars) {
      notes.push(`primaryTexts[${i}] com ${text.length} caracteres — recomendado ≤${LIMITS.primaryTexts.recommendedChars} para evitar truncamento no feed.`);
    }
  });
  return notes;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Gera o copy flexível: até 5 variações por campo, UMA por ângulo conceitual.
 * NUNCA retorna copy que viole as próprias regras — valida internamente e
 * descarta/substitui qualquer texto reprovado (inclusive diferenciais do brief
 * que tragam padrões proibidos).
 */
export function buildAdCopy(brief: ProductBrief, angles?: CreativeAngle[]): FlexibleAdCopy {
  const chosen = normalizeAngles(brief, angles);
  const usedPrimary = new Set<string>();
  const usedHeadline = new Set<string>();
  const usedDescription = new Set<string>();

  const effective: CreativeAngle[] = [];
  const primaryTexts: string[] = [];
  const headlines: string[] = [];
  const descriptions: string[] = [];

  for (const angle of chosen) {
    const c = angleCandidates(angle, brief);
    const primary = firstValid(c.primaries, LIMITS.primaryTexts.maxChars, usedPrimary);
    if (!primary) continue; // ângulo sem primário limpo não entra (mantém angles 1:1 com primaryTexts)
    effective.push(angle);
    primaryTexts.push(primary);
    const headline = firstValid(c.headlines, LIMITS.headlines.maxChars, usedHeadline);
    if (headline) headlines.push(headline);
    const description = firstValid(c.descriptions, LIMITS.descriptions.maxChars, usedDescription);
    if (description) descriptions.push(description);
  }

  if (!primaryTexts.length) {
    primaryTexts.push(SAFE_PRIMARY);
    effective.push("sair_do_aluguel");
  }
  if (!headlines.length) headlines.push(SAFE_HEADLINE);
  if (!descriptions.length) descriptions.push(SAFE_DESCRIPTION);

  const copy: FlexibleAdCopy = {
    product: brief.product,
    angles: effective,
    primaryTexts,
    headlines,
    descriptions,
    // renda_alvo pede cadastro para simulação → SIGN_UP; demais, LEARN_MORE.
    callToAction: effective.includes("renda_alvo") ? "SIGN_UP" : "LEARN_MORE",
    complianceNotes: [],
  };
  copy.complianceNotes = buildNotes(copy);
  return scrub(copy);
}

/** Trava final: remove qualquer item que ainda viole regra (nunca deveria sobrar nada). */
function scrub(copy: FlexibleAdCopy): FlexibleAdCopy {
  const out: FlexibleAdCopy = { ...copy, angles: [...copy.angles], primaryTexts: [...copy.primaryTexts], headlines: [...copy.headlines], descriptions: [...copy.descriptions] };
  for (let guard = 0; guard < 20; guard += 1) {
    const violations = validateCopy(out);
    if (!violations.length) break;
    // remove do maior índice para o menor, para não deslocar os demais
    const sorted = [...violations].sort((a, b) => b.index - a.index);
    for (const v of sorted) {
      if (v.index >= out[v.field].length) continue;
      out[v.field].splice(v.index, 1);
      if (v.field === "primaryTexts") out.angles.splice(v.index, 1); // preserva 1:1 ângulo↔primário
    }
    if (!out.primaryTexts.length) {
      out.primaryTexts.push(SAFE_PRIMARY);
      out.angles = out.angles.length ? out.angles.slice(0, 1) : ["sair_do_aluguel"];
    }
    if (!out.headlines.length) out.headlines.push(SAFE_HEADLINE);
    if (!out.descriptions.length) out.descriptions.push(SAFE_DESCRIPTION);
  }
  out.complianceNotes = buildNotes(out);
  return out;
}

/** Valida limites do asset_feed_spec + política de texto. Vazio = copy aprovado. */
export function validateCopy(copy: FlexibleAdCopy): CopyViolation[] {
  const violations: CopyViolation[] = [];
  const fields: Array<{ field: CopyViolation["field"]; items: string[]; maxItems: number; maxChars: number }> = [
    { field: "primaryTexts", items: copy.primaryTexts, maxItems: LIMITS.primaryTexts.maxItems, maxChars: LIMITS.primaryTexts.maxChars },
    { field: "headlines", items: copy.headlines, maxItems: LIMITS.headlines.maxItems, maxChars: LIMITS.headlines.maxChars },
    { field: "descriptions", items: copy.descriptions, maxItems: LIMITS.descriptions.maxItems, maxChars: LIMITS.descriptions.maxChars },
  ];
  for (const { field, items, maxItems, maxChars } of fields) {
    const seen = new Set<string>();
    items.forEach((text, index) => {
      if (index >= maxItems) {
        violations.push({ field, index, rule: "limite_itens", detail: `Máximo de ${maxItems} itens em ${field} — item ${index + 1} excede o limite.` });
      }
      if (text.length > maxChars) {
        violations.push({ field, index, rule: "limite_caracteres", detail: `${text.length} caracteres — máximo de ${maxChars} em ${field}.` });
      }
      const key = text.trim().toLowerCase();
      if (seen.has(key)) {
        violations.push({ field, index, rule: "duplicata", detail: `Texto repetido (case-insensitive): "${text}". Andromeda trata como redundância.` });
      }
      seen.add(key);
      for (const f of FORBIDDEN) {
        const match = text.match(f.re);
        if (match) {
          violations.push({ field, index, rule: f.rule, detail: `${f.detail} Trecho: "${match[0]}".` });
        }
      }
    });
  }
  return violations;
}

/**
 * Monta o JSON no shape asset_feed_spec da Marketing API (POST /adcreatives).
 * Limites da API respeitados: bodies/titles/descriptions ≤5, images/videos ≤10,
 * UM ad_format por feed. Quando pageId vem no input, devolvemos também o
 * object_story_spec — na API real ele é IRMÃO do asset_feed_spec dentro do
 * AdCreative; o chamador (V4.7) separa os dois blocos no POST.
 */
export function toAssetFeedSpec(
  copy: FlexibleAdCopy,
  media: { imageHashes?: string[]; videoIds?: string[]; linkUrl: string; pageId?: string },
): Record<string, unknown> {
  const images = (media.imageHashes ?? []).slice(0, 10).map((hash) => ({ hash }));
  const videos = (media.videoIds ?? []).slice(0, 10).map((id) => ({ video_id: id }));
  const adFormat = videos.length && images.length ? "AUTOMATIC_FORMAT" : videos.length ? "SINGLE_VIDEO" : "SINGLE_IMAGE";
  const spec: Record<string, unknown> = {
    images,
    videos,
    bodies: copy.primaryTexts.slice(0, 5).map((text) => ({ text })),
    titles: copy.headlines.slice(0, 5).map((text) => ({ text })),
    descriptions: copy.descriptions.slice(0, 5).map((text) => ({ text })),
    ad_formats: [adFormat],
    call_to_action_types: [copy.callToAction],
    link_urls: [{ website_url: media.linkUrl }],
  };
  if (media.pageId) spec.object_story_spec = { page_id: media.pageId };
  return spec;
}

/**
 * Esqueleto de campanha de leads imobiliária — o que o V4.7 envia à Caixa de
 * Aprovações. Estrutura pós-Andromeda: 1 campanha CBO (Advantage+ campaign
 * budget), 1 ad set broad, diversidade no nível do CRIATIVO. Nasce PAUSED:
 * nada sobe ativo sem aprovação humana.
 */
export function leadCampaignSkeleton(
  brief: ProductBrief,
  weeklyBudgetBrl: number,
  /** Targeting HOUSING-compatível injetado pelo chamador (a rota usa
   *  housingTargetingSpec de lib/meta/marketing/housing-audience) — o núcleo
   *  fica puro e executável em node sem resolver alias. */
  targeting?: Record<string, unknown>,
): Record<string, unknown> {
  const weekly = Math.max(0, weeklyBudgetBrl);
  const dailyBudgetCents = Math.round((weekly / 7) * 100); // Meta usa unidade mínima (centavos)
  return {
    campaign: {
      name: `[Atlas] Leads — ${brief.product}${brief.city ? ` — ${brief.city}` : ""}`,
      objective: "OUTCOME_LEADS",
      status: "PAUSED", // proposta nunca nasce ativa
      special_ad_categories: ["HOUSING"], // obrigatório em imobiliário — omitir = reprovação/risco de bloqueio
      special_ad_category_country: ["BR"],
      buying_type: "AUCTION",
      daily_budget: dailyBudgetCents, // CBO — Advantage+ campaign budget
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    },
    adSets: [
      {
        name: `Broad — ${brief.neighborhood ?? brief.city ?? "região"}`,
        optimization_goal: "LEAD_GENERATION",
        billing_event: "IMPRESSIONS",
        destination_type: "ON_AD", // formulário instantâneo (lead form)
        // Targeting REAL (quando injetado): idade travada, sem gênero, geo da
        // cidade, Advantage+ com controle só de geo — vem da trava de política.
        ...(targeting ? { targeting } : {}),
        targetingNotes: {
          geo: `${brief.city ?? "cidade do produto"} + raio amplo (HOUSING impõe raio mínimo; hipersegmentação por bairro/CEP é bloqueada)`,
          idade: "18-65+ (travado pela categoria HOUSING)",
          genero: "todos (travado pela categoria HOUSING)",
          interesses: "broad — segmentação fina bloqueada; a diferenciação acontece no criativo",
        },
      },
    ],
    creativeStrategy: {
      conceitos: "5 a 10 criativos conceitualmente distintos por ad set (Andromeda pune similaridade >60%)",
      refresh: "revisar conceitos a cada 1-3 semanas; refresh proativo antes da fadiga",
      formato: "asset_feed_spec (Advantage+ creative) — flexible format não suporta OUTCOME_LEADS",
    },
    learningNote: `Saída do learning pede ~50 conversões/ad set em 7 dias — com R$ ${weekly}/semana, o CPL alvo viável é ~R$ ${Math.round(weekly / 50)} ou menos; acima disso, manter 1 ad set único.`,
    governance: {
      proposta: true,
      aprovacaoHumanaObrigatoria: true,
      executaContraMeta: false,
      developer: brief.developer ?? null,
    },
    weeklyBudgetBrl: weekly,
  };
}
