/**
 * Checagem adversarial do estrategista de criativos (lib/ai/creative-strategist).
 *
 * Standalone, sem framework: node --experimental-strip-types scripts/check-creative-strategist.mts
 * Acumula falhas em pt-BR e sai com código 1 se qualquer caso reprovar.
 */

import {
  buildAdCopy,
  validateCopy,
  toAssetFeedSpec,
  leadCampaignSkeleton,
  type CreativeAngle,
  type FlexibleAdCopy,
  type ProductBrief,
} from "../lib/ai/creative-strategist.ts";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed += 1;
  else failures.push(name);
}
const rec = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

const perdizes: ProductBrief = {
  product: "Vertice Perdizes",
  developer: "Atlas Incorporadora",
  neighborhood: "Perdizes",
  city: "São Paulo",
  metroDistanceM: 700,
  areaM2: "25 a 40 m²",
  priceFrom: 289000,
  incomeMinSm: 6,
  incomeMaxSm: 10,
  delivered: true,
  differentials: ["rooftop com vista", "coworking"],
};

// 1) buildAdCopy — até 5 por campo, nenhum campo vazio
const copy = buildAdCopy(perdizes);
check(
  "caso 1: buildAdCopy respeita 1..5 itens por campo",
  copy.primaryTexts.length >= 1 && copy.primaryTexts.length <= 5 &&
  copy.headlines.length >= 1 && copy.headlines.length <= 5 &&
  copy.descriptions.length >= 1 && copy.descriptions.length <= 5,
);

// 2) limites de caracteres por campo
check(
  "caso 2: limites de caracteres (200/40/30) respeitados",
  copy.primaryTexts.every((t) => t.length <= 200) &&
  copy.headlines.every((t) => t.length <= 40) &&
  copy.descriptions.every((t) => t.length <= 30),
);

// 3) auto-limpo: validateCopy(buildAdCopy(...)) === []
check("caso 3: buildAdCopy nunca viola as próprias regras", validateCopy(copy).length === 0);

// 4) um primário por ângulo (1:1)
check("caso 4: angles 1:1 com primaryTexts", copy.angles.length === copy.primaryTexts.length);

// 5) diferenciais maliciosos não vazam para o copy final
const malicioso = buildAdCopy(
  { ...perdizes, differentials: ["valorização garantida", "exclusivo para solteiros"] },
  ["localizacao", "estilo_de_vida"],
);
const serial = JSON.stringify({ p: malicioso.primaryTexts, h: malicioso.headlines, d: malicioso.descriptions });
check(
  "caso 5: buildAdCopy auto-limpo contra diferenciais proibidos",
  validateCopy(malicioso).length === 0 && !/garantid/i.test(serial) && !/exclusivo\s+para/i.test(serial),
);

// 6) ângulos explícitos são respeitados (subconjunto e ordem)
const explicit = buildAdCopy(perdizes, ["investimento", "entrega_imediata"]);
check("caso 6: ângulos explícitos respeitados", explicit.angles.join(",") === "investimento,entrega_imediata");

// 7) mais de 5 ângulos → teto de 5
const todos: CreativeAngle[] = ["sair_do_aluguel", "investimento", "localizacao", "renda_alvo", "estilo_de_vida", "entrega_imediata"];
check("caso 7: teto de 5 ângulos/variações", buildAdCopy(perdizes, todos).angles.length <= 5);

// base sintética para os casos de validação
const base = (over: Partial<FlexibleAdCopy>): FlexibleAdCopy => ({
  product: "X",
  angles: ["sair_do_aluguel"],
  primaryTexts: ["Texto ok"],
  headlines: ["Headline ok"],
  descriptions: ["Descrição ok"],
  callToAction: "LEARN_MORE",
  complianceNotes: [],
  ...over,
});

// 8) estouro de quantidade (6 primários)
const seisPrimarios = validateCopy(base({ primaryTexts: ["a1", "a2", "a3", "a4", "a5", "a6"] }));
check("caso 8: 6 primaryTexts → limite_itens no índice 5", seisPrimarios.some((v) => v.rule === "limite_itens" && v.field === "primaryTexts" && v.index === 5));

// 9) estouro de caracteres (headline com 41 chars)
const headline41 = "x".repeat(41);
check(
  "caso 9: headline de 41 chars → limite_caracteres",
  validateCopy(base({ headlines: [headline41] })).some((v) => v.rule === "limite_caracteres" && v.field === "headlines"),
);

// 10) duplicata case-insensitive
check(
  "caso 10: duplicata case-insensitive detectada",
  validateCopy(base({ descriptions: ["Metrô a pé", "metrô a PÉ"] })).some((v) => v.rule === "duplicata" && v.index === 1),
);

// 11) padrão discriminatório ("ideal para famílias")
check(
  "caso 11: 'ideal para famílias' → discriminacao_housing",
  validateCopy(base({ primaryTexts: ["Apartamento ideal para famílias jovens no centro"] })).some((v) => v.rule === "discriminacao_housing"),
);

// 12) atributo pessoal em 2ª pessoa ("você ganha" / "sua renda é")
const atributos = validateCopy(base({ primaryTexts: ["Você ganha até 5 mil? Sua renda é suficiente para financiar."] }));
check("caso 12: pergunta de renda em 2ª pessoa → atributo_pessoal", atributos.some((v) => v.rule === "atributo_pessoal"));

// 13) promessa financeira ("renda garantida" / "sem risco")
const promessas = validateCopy(base({ primaryTexts: ["Invista com renda garantida"], headlines: ["Investimento sem risco"] }));
check(
  "caso 13: 'garantida'/'sem risco' → promessa_financeira nos dois campos",
  promessas.filter((v) => v.rule === "promessa_financeira").length >= 2,
);

// 14) falar do PRODUTO/programa é permitido ("para renda de 6 a 10 salários mínimos")
check(
  "caso 14: descrever o programa de crédito não é violação",
  validateCopy(base({ primaryTexts: ["Unidades do programa para renda de 6 a 10 salários mínimos"] })).length === 0,
);

// 15) asset_feed_spec — campos e mapeamentos
const feed = toAssetFeedSpec(copy, { imageHashes: ["abc123", "def456"], linkUrl: "https://atlas.example/vertice", pageId: "999" });
const bodies = feed.bodies as Array<{ text: string }>;
const titles = feed.titles as Array<{ text: string }>;
const descs = feed.descriptions as Array<{ text: string }>;
const links = feed.link_urls as Array<{ website_url: string }>;
const imgs = feed.images as Array<{ hash: string }>;
check(
  "caso 15: asset_feed_spec com bodies/titles/descriptions/ad_formats/link_urls corretos",
  bodies.length === copy.primaryTexts.length && bodies[0]?.text === copy.primaryTexts[0] &&
  titles.length === copy.headlines.length &&
  descs.length === copy.descriptions.length &&
  JSON.stringify(feed.ad_formats) === '["SINGLE_IMAGE"]' &&
  links[0]?.website_url === "https://atlas.example/vertice" &&
  imgs.length === 2 && imgs[0]?.hash === "abc123" &&
  JSON.stringify(feed.call_to_action_types) === JSON.stringify([copy.callToAction]),
);

// 16) asset_feed_spec — só vídeo → SINGLE_VIDEO
const feedVideo = toAssetFeedSpec(copy, { videoIds: ["v1"], linkUrl: "https://atlas.example/vertice" });
check("caso 16: só vídeos → ad_formats SINGLE_VIDEO", JSON.stringify(feedVideo.ad_formats) === '["SINGLE_VIDEO"]');

// 17) esqueleto de campanha — HOUSING, OUTCOME_LEADS, AUCTION, PAUSED, CBO diário
const skeleton = leadCampaignSkeleton(perdizes, 1400);
const camp = rec(rec(skeleton).campaign);
check(
  "caso 17: skeleton com HOUSING + OUTCOME_LEADS + AUCTION + PAUSED",
  camp.objective === "OUTCOME_LEADS" &&
  JSON.stringify(camp.special_ad_categories) === '["HOUSING"]' &&
  camp.buying_type === "AUCTION" &&
  camp.status === "PAUSED" &&
  camp.daily_budget === Math.round((1400 / 7) * 100),
);

// 18) governança: tudo é proposta, nada executa contra a Meta
const gov = rec(rec(skeleton).governance);
check(
  "caso 18: governança — proposta com aprovação humana, sem execução",
  gov.proposta === true && gov.aprovacaoHumanaObrigatoria === true && gov.executaContraMeta === false,
);

// 19) notas de compliance mencionam HOUSING e diversidade Andromeda
check(
  "caso 19: complianceNotes citam HOUSING e Andromeda",
  copy.complianceNotes.some((n) => n.includes("HOUSING")) && copy.complianceNotes.some((n) => n.includes("Andromeda")),
);

// 20) brief mínimo (só o nome do produto) ainda gera copy limpo e completo
const minimo = buildAdCopy({ product: "Residencial Aurora" });
check(
  "caso 20: brief mínimo gera copy válido",
  validateCopy(minimo).length === 0 && minimo.primaryTexts.length >= 1 && minimo.headlines.length >= 1 && minimo.descriptions.length >= 1,
);

// 21) renda_alvo NÃO expõe faixa de renda no criativo (HOUSING — evita sinalizar grupo econômico)
const rendaCopy = buildAdCopy(perdizes, ["renda_alvo"]);
const rendaSerial = JSON.stringify(rendaCopy);
check(
  "caso 21: renda_alvo não nomeia faixa de renda no criativo",
  validateCopy(rendaCopy).length === 0 &&
  !/\d\s*a\s*\d\s*sal[áa]rios/i.test(rendaSerial) &&
  !/renda\s+(familiar\s+)?de\s+\d/i.test(rendaSerial),
);

// 22) investimento NÃO inventa vizinhança ('universidades/polo gastronômico') nem promete 'curta estadia'
const invCopy = buildAdCopy(perdizes, ["investimento"]);
check(
  "caso 22: investimento sem fatos inventados (universidades/gastronomia/curta estadia)",
  !/universidades|polo\s+gastron[oô]mico|curta\s+(e\s+longa\s+)?estadia/i.test(JSON.stringify(invCopy)),
);

// 23) sair_do_aluguel NÃO afirma equivalência categórica parcela=aluguel (alegação financeira não substanciada)
const alugCopy = buildAdCopy(perdizes, ["sair_do_aluguel"]);
check(
  "caso 23: sair_do_aluguel sem equivalência categórica parcela=aluguel",
  !/parcela.{0,40}(faixa de um|no lugar do|que substitui o)\s+aluguel/i.test(JSON.stringify(alugCopy)),
);

if (failures.length) {
  console.error(`Estrategista de criativos: falhou (${failures.length} de ${failures.length + passed})\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Estrategista de criativos: aprovado — ${passed} casos adversariais (limites asset_feed_spec, política HOUSING/atributos pessoais, auto-limpeza, skeleton OUTCOME_LEADS).`);
