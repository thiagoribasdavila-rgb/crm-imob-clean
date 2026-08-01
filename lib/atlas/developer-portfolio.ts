/**
 * Rol de incorporadoras e produtos — a fonte que CALIBRA as IAs.
 *
 * Pré-Fase 0 o banco vivo não tem developments/developers populados; este
 * registro em código é a verdade operacional: liga nome de campanha da Meta a
 * produto e incorporadora (aliases) e fornece o brief que alimenta a IA de
 * criativos, a rotação criativa e o enriquecimento dos relatórios
 * (byProject/byDeveloper). Na Fase 0 ele vira seed das tabelas canônicas e o
 * banco passa a ter precedência — o registro permanece como fallback.
 *
 * Regra de honestidade: só entra vínculo COM EVIDÊNCIA (ex.: o anúncio
 * "Kallas-Arvo-video" prova Arvo→Kallas). Produto sem incorporadora conhecida
 * fica sem vínculo até o dono confirmar — a IA nunca inventa atribuição.
 */

import type { ProductBrief } from "@/lib/ai/creative-strategist";

export type PortfolioProduct = {
  name: string;
  aliases: string[];       // casam contra o nome da campanha (case-insensitive)
  brief?: ProductBrief;    // calibra criativos/rotação; parcial é ok
};

export type PortfolioDeveloper = {
  name: string;
  aliases: string[];
  products: PortfolioProduct[];
};

/** O rol definido pelo dono (2026-07): SPIN + Shpaisman, Paladin, Kallas, Teixeira Duarte. */
export const DEVELOPER_PORTFOLIO: PortfolioDeveloper[] = [
  {
    name: "SPIN Empreendimentos",
    aliases: ["spin"],
    products: [
      {
        name: "Spin Mood",
        aliases: ["spin mood", "spinmood"],
        brief: {
          product: "Spin Mood",
          developer: "SPIN Empreendimentos",
          neighborhood: "Perdizes",
          city: "São Paulo",
          metroDistanceM: 700,
          areaM2: "27 a 29 m²",
          incomeMinSm: 6,
          incomeMaxSm: 10,
          delivered: true,
          differentials: ["rooftop com vista", "a 700 m do metrô Vila Madalena"],
        },
      },
    ],
  },
  {
    name: "Kallas Incorporações",
    aliases: ["kallas", "kalas"],
    products: [
      {
        // Evidência: anúncio real "Kallas-Arvo-video" na conta + book oficial
        // "Arvo Teixeira da Silva" (Kallas Incorporadora + Paladin Realty,
        // 2026-07): ficha técnica, plantas e apresentação. Endereço Rua Mário
        // Amaral, 267 — Paraíso/SP; 1 torre, 262 unidades; 1 dorm + terraço de
        // 24 e 29 m². priceFrom R$ 399 mil vem da peça aprovada ("a partir de
        // R$ 399 mil"). Sem faixa de renda no material (parte do estoque é
        // HMP/HIS-2, mas o book não traz SM) — incomeMinSm/Max ficam de fora
        // até o dono confirmar; a IA nunca inventa faixa de crédito.
        name: "Arvo",
        aliases: ["arvo", "arvo teixeira da silva", "arvo teixeira"],
        brief: {
          product: "Arvo",
          developer: "Kallas Incorporações",
          neighborhood: "Paraíso",
          city: "São Paulo",
          metroDistanceM: 800,
          areaM2: "24 e 29 m²",
          priceFrom: 399000,
          delivered: false,
          differentials: [
            "a 400 m da Av. Paulista",
            "a 10 minutos do Parque Ibirapuera",
            "1 dormitório + terraço, plantas de 24 e 29 m²",
            "lazer completo: piscina, sauna, fitness, coworking, sport bar, salão de festas, pet care e minimercado",
            "churrasqueira com vista para a Av. Paulista",
            "projeto de Marcos Gavião Arquitetos, paisagismo Núcleo e interiores DP Barros",
          ],
        },
      },
    ],
  },
  {
    name: "Construtora Shpaisman",
    aliases: ["shpaisman"],
    products: [
      {
        // Evidência: book oficial "Tiê Aclimação" (Shpaisman, 2026-07) — ficha
        // técnica + apresentação. Pré-lançamento (delivered:false); sem tabela
        // de preço/renda-alvo no material — não inventado, incomeMinSm/Max e
        // priceFrom ficam de fora até o dono confirmar.
        name: "Tiê Aclimação",
        aliases: ["tiê aclimação", "tie aclimacao", "tiê aclimacao", "tie aclimação"],
        brief: {
          product: "Tiê Aclimação",
          developer: "Construtora Shpaisman",
          neighborhood: "Aclimação",
          city: "São Paulo",
          areaM2: "24 m² a 61 m²",
          delivered: false,
          differentials: [
            "10 minutos a pé da Estação Vergueiro (Metrô)",
            "a poucos minutos da Av. Paulista",
            "arquitetura MCAA, paisagismo Martha Gavião e decoração Consuelo Jorge",
            "lazer completo: piscina com solarium, spa com sauna, salão de festas com espaço gourmet e snooker, coworking, pet place e brinquedoteca",
            "Construtora Shpaisman — mais de 45 anos de tradição e 2.000 famílias atendidas",
          ],
        },
      },
    ],
  },
  {
    name: "Paladin",
    aliases: ["paladin"],
    products: [],
  },
  {
    name: "Teixeira Duarte",
    aliases: ["teixeira duarte", "teixeira-duarte"],
    products: [],
  },
];

export type CampaignMatch = {
  developer: string | null;
  product: string | null;
  brief: ProductBrief | null;
};

const norm = (s: string) => s.toLowerCase();

/**
 * Casa um nome de campanha da Meta com o rol. Prioridade: alias de PRODUTO
 * (mais específico) > alias de incorporadora; alias mais longo vence empate
 * (evita "spin" roubar de "spin mood").
 */
export function matchCampaign(campaignName: string): CampaignMatch {
  const name = norm(campaignName);

  let best: { len: number; developer: string; product: string | null; brief: ProductBrief | null } | null = null;
  for (const dev of DEVELOPER_PORTFOLIO) {
    for (const prod of dev.products) {
      for (const alias of prod.aliases) {
        if (name.includes(norm(alias)) && (!best || alias.length > best.len || best.product === null)) {
          best = { len: alias.length, developer: dev.name, product: prod.name, brief: prod.brief ?? null };
        }
      }
    }
  }
  if (best) return { developer: best.developer, product: best.product, brief: best.brief };

  for (const dev of DEVELOPER_PORTFOLIO) {
    for (const alias of dev.aliases) {
      if (name.includes(norm(alias)) && (!best || alias.length > best.len)) {
        best = { len: alias.length, developer: dev.name, product: null, brief: null };
      }
    }
  }
  return best
    ? { developer: best.developer, product: best.product, brief: best.brief }
    : { developer: null, product: null, brief: null };
}

/** Brief de um produto pelo nome (para a rota de criativos completar campos). */
export function productBrief(productName: string): ProductBrief | null {
  const name = norm(productName);
  for (const dev of DEVELOPER_PORTFOLIO) {
    for (const prod of dev.products) {
      if (norm(prod.name) === name || prod.aliases.some((a) => norm(a) === name)) {
        return prod.brief ?? { product: prod.name, developer: dev.name };
      }
    }
  }
  return null;
}

/** Mapa produto→brief para a rotação criativa (só produtos com brief). */
export function briefsForRotation(): Record<string, ProductBrief> {
  const out: Record<string, ProductBrief> = {};
  for (const dev of DEVELOPER_PORTFOLIO) {
    for (const prod of dev.products) {
      if (prod.brief) out[prod.name] = prod.brief;
    }
  }
  return out;
}

/** Resumo do rol para telas/briefing (quem está cadastrado e o que falta). */
export function portfolioSummary(): { developers: number; products: number; pendentes: string[] } {
  const pendentes = DEVELOPER_PORTFOLIO.filter((d) => d.products.length === 0).map((d) => d.name);
  return {
    developers: DEVELOPER_PORTFOLIO.length,
    products: DEVELOPER_PORTFOLIO.reduce((s, d) => s + d.products.length, 0),
    pendentes,
  };
}
