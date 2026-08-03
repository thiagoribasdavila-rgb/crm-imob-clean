/**
 * FATOS DO EMPREENDIMENTO — o lastro numérico do criativo. Núcleo PURO.
 *
 * ── O buraco que isto fecha ────────────────────────────────────────────────
 *
 * `creative-studio.ts` monta a ficha técnica que vai ao modelo a partir de
 * `developments`: nome, bairro, cidade, total_units, áreas e tipologias. Três
 * defeitos nascem daí, e todos os três terminam em propaganda enganosa:
 *
 *   1. PREÇO NUNCA ENTRA. `carregarEmpreendimento` SELECIONA price_min/price_max
 *      e os usa apenas para calcular pendências — `fichaTecnica()` não imprime
 *      nenhum dos dois. Inside Perdizes tem faixa cadastrada (R$ 337.782 a
 *      R$ 757.400) e o modelo nunca a viu. A peça sai sem o argumento que mais
 *      converte, e a regra "não invente preço" vira "nunca fale de preço".
 *
 *   2. `total_units` NÃO É ESTOQUE. Medido na produção em 02/08/2026:
 *      Spin Mood tem total_units = 30, mas `properties` tem 24 disponíveis e
 *      6 reservadas. Um anúncio que diz "30 unidades" anuncia 6 apartamentos
 *      que não estão à venda.
 *
 *   3. A FAIXA DE `developments` PODE DIVERGIR DO ESTOQUE. price_min ali é um
 *      campo denormalizado; quem vende é a linha de `properties`. Hoje os dois
 *      batem — coincidência de uma carga recente, não garantia. O número que
 *      pode ir ao anúncio é o da unidade que existe e está disponível.
 *
 * Então aqui todo número nasce de `properties` com `status = 'available'`, e
 * cada um carrega ORIGEM (tabela, coluna, filtro, quantas linhas sustentam o
 * número). Procedência não é enfeite: é o que permite conferir a peça depois,
 * quando ninguém lembra de onde veio o "a partir de R$ 337.782".
 *
 * ── Por que PURO ───────────────────────────────────────────────────────────
 *
 * Sem banco, sem rede, sem relógio. A regra fica executável por contrato e por
 * script; quem lê o mundo é o gerador. A armadilha oposta já mordeu este repo:
 * regra trancada atrás de `import "server-only"` é regra que nenhum portão
 * consegue ver falhar.
 */

// Import relativo COM extensão, como `lib/compat/payload-de-lead.ts` já faz
// (`allowImportingTsExtensions`): o alias `@/` depende de resolvedor e o loader
// de `node --test` exige a extensão. Este módulo precisa carregar nos dois.
import { brl } from "../ai/creative-strategist.ts";

// ---------------------------------------------------------------------------
// Procedência
// ---------------------------------------------------------------------------

/** De onde o número veio. Sem isto, "a partir de R$ X" é palavra contra palavra. */
export type OrigemDoFato = {
  tabela: string;
  coluna: string;
  /** O recorte exato — `status='available'` é parte do fato, não detalhe. */
  filtro: string;
  /** Quantas linhas sustentam o número. 0 nunca vira fato. */
  linhas: number;
};

export type UnidadeDoFato = "BRL" | "m2" | "unidades" | "texto";

export type FatoDoCRM = {
  chave: string;
  rotulo: string;
  valor: number | string;
  unidade: UnidadeDoFato;
  origem: OrigemDoFato;
};

/**
 * FORMATO COMBINADO COM A FRENTE DA WEB — combinamos pelo formato, não pelo
 * arquivo. Quem pesquisa o mercado preenche esta forma; o gerador só aceita
 * fato de fora que venha com url, publicador e data. Fato sem os três não é
 * fonte, é boato, e boato em anúncio de imóvel é risco jurídico.
 */
export type FonteWeb = {
  url: string;
  publicador: string;
  /** ISO-8601 (AAAA-MM-DD). `null` = sem data → a fonte é recusada. */
  publicadoEm: string | null;
  /** O trecho que sustenta a afirmação, copiado da página. */
  trecho: string;
};

export type TipologiaDisponivel = {
  rotulo: string;
  unidades: number;
  areaM2: number | null;
  precoMin: number | null;
  precoMax: number | null;
};

export type FichaDeFatos = {
  developmentId: string;
  organizationId: string;
  nome: string;
  incorporadora: string | null;
  bairro: string | null;
  cidade: string | null;
  /** SÓ o que está disponível. Reservado e vendido não são estoque anunciável. */
  unidadesDisponiveis: number;
  precoMin: number | null;
  precoMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  tipologias: TipologiaDisponivel[];
  fatos: FatoDoCRM[];
  fontesWeb: FonteWeb[];
  /** O que NÃO pode ser citado porque não existe no CRM. */
  ausentes: string[];
  /** Divergência entre o cadastro de `developments` e o estoque de `properties`. */
  divergenciasDeCadastro: string[];
};

/** Linha de `properties` como o banco a entrega. */
export type PropriedadeCrua = {
  status: string | null;
  typology: string | null;
  area: number | string | null;
  price: number | string | null;
};

/** Linha de `developments` como o banco a entrega. */
export type EmpreendimentoCru = {
  id: string;
  organization_id: string;
  name: string;
  developer_name?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  total_units?: number | null;
  price_min?: number | string | null;
  price_max?: number | string | null;
};

/** O único status de `properties` que pode virar número de anúncio. */
export const STATUS_ANUNCIAVEL = "available";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Monta a ficha a partir das linhas cruas. PURA: recebe o que o banco devolveu.
 *
 * Fonte única do número: `properties` com status disponível. `developments`
 * entra apenas como identidade (nome, bairro, cidade, incorporadora) e como
 * TESTEMUNHA — a faixa cadastrada lá é comparada com o estoque e a diferença
 * vira `divergenciasDeCadastro`, visível em vez de silenciosa.
 */
export function montarFicha(
  dev: EmpreendimentoCru,
  propriedades: PropriedadeCrua[],
  fontesWeb: FonteWeb[] = [],
): FichaDeFatos {
  const disponiveis = (propriedades ?? []).filter(
    (p) => String(p.status ?? "").toLowerCase() === STATUS_ANUNCIAVEL,
  );
  const precos = disponiveis.map((p) => num(p.price)).filter((n): n is number => n !== null && n > 0);
  const areas = disponiveis.map((p) => num(p.area)).filter((n): n is number => n !== null && n > 0);

  const precoMin = precos.length ? Math.min(...precos) : null;
  const precoMax = precos.length ? Math.max(...precos) : null;
  const areaMin = areas.length ? Math.min(...areas) : null;
  const areaMax = areas.length ? Math.max(...areas) : null;

  // Tipologias reais: agrupadas pelo rótulo que a linha traz.
  const porTipologia = new Map<string, PropriedadeCrua[]>();
  for (const p of disponiveis) {
    const chave = String(p.typology ?? "").trim() || "sem tipologia";
    const lista = porTipologia.get(chave);
    if (lista) lista.push(p);
    else porTipologia.set(chave, [p]);
  }
  const tipologias: TipologiaDisponivel[] = [...porTipologia.entries()]
    .map(([rotulo, linhas]) => {
      const ps = linhas.map((l) => num(l.price)).filter((n): n is number => n !== null && n > 0);
      const as = linhas.map((l) => num(l.area)).filter((n): n is number => n !== null && n > 0);
      return {
        rotulo,
        unidades: linhas.length,
        areaM2: as.length ? Math.min(...as) : null,
        precoMin: ps.length ? Math.min(...ps) : null,
        precoMax: ps.length ? Math.max(...ps) : null,
      };
    })
    .sort((a, b) => (a.precoMin ?? Infinity) - (b.precoMin ?? Infinity));

  const filtro = `development_id = ${dev.id} AND status = '${STATUS_ANUNCIAVEL}'`;
  const fatos: FatoDoCRM[] = [];
  const push = (
    chave: string,
    rotulo: string,
    valor: number | string | null,
    unidade: UnidadeDoFato,
    coluna: string,
    linhas: number,
  ) => {
    // Fato sem linha que o sustente não é fato. Zero desenhado como saúde é
    // exatamente o que este `if` impede.
    if (valor === null || valor === "" || linhas <= 0) return;
    fatos.push({ chave, rotulo, valor, unidade, origem: { tabela: "properties", coluna, filtro, linhas } });
  };

  push("unidades_disponiveis", "Unidades disponíveis", disponiveis.length, "unidades", "id", disponiveis.length);
  push("preco_min", "Menor preço disponível", precoMin, "BRL", "price", precos.length);
  push("preco_max", "Maior preço disponível", precoMax, "BRL", "price", precos.length);
  push("area_min", "Menor área disponível", areaMin, "m2", "area", areas.length);
  push("area_max", "Maior área disponível", areaMax, "m2", "area", areas.length);
  for (const t of tipologias) {
    push(`tipologia:${t.rotulo}`, `Tipologia ${t.rotulo}`, t.unidades, "unidades", "typology", t.unidades);
  }

  // Identidade vem de `developments` — texto, não número. Não precisa de estoque.
  const identidade: Array<[string, string, string | null | undefined, string]> = [
    ["nome", "Nome do empreendimento", dev.name, "name"],
    ["incorporadora", "Incorporadora", dev.developer_name, "developer_name"],
    ["bairro", "Bairro", dev.neighborhood, "neighborhood"],
    ["cidade", "Cidade", dev.city, "city"],
  ];
  for (const [chave, rotulo, valor, coluna] of identidade) {
    if (!valor) continue;
    fatos.push({
      chave,
      rotulo,
      valor: String(valor),
      unidade: "texto",
      origem: { tabela: "developments", coluna, filtro: `id = ${dev.id}`, linhas: 1 },
    });
  }

  const ausentes: string[] = [];
  if (!disponiveis.length) ausentes.push("estoque disponível (nenhuma unidade com status available em properties)");
  if (precoMin === null) ausentes.push("preço (nenhuma unidade disponível com preço)");
  if (areaMin === null) ausentes.push("área privativa (nenhuma unidade disponível com área)");

  // O cadastro de `developments` como testemunha, nunca como fonte.
  const divergenciasDeCadastro: string[] = [];
  const totalCadastrado = num(dev.total_units);
  if (totalCadastrado !== null && totalCadastrado !== disponiveis.length) {
    divergenciasDeCadastro.push(
      `developments.total_units = ${totalCadastrado}, mas properties tem ${disponiveis.length} disponível(is). O anúncio usa ${disponiveis.length}.`,
    );
  }
  const precoCadastrado = num(dev.price_min);
  if (precoCadastrado !== null && precoMin !== null && precoCadastrado !== precoMin) {
    divergenciasDeCadastro.push(
      `developments.price_min = ${precoCadastrado}, mas a menor unidade disponível custa ${precoMin}. O anúncio usa ${precoMin}.`,
    );
  }

  return {
    developmentId: dev.id,
    organizationId: dev.organization_id,
    nome: dev.name,
    incorporadora: dev.developer_name ?? null,
    bairro: dev.neighborhood ?? null,
    cidade: dev.city ?? null,
    unidadesDisponiveis: disponiveis.length,
    precoMin,
    precoMax,
    areaMin,
    areaMax,
    tipologias,
    fatos,
    fontesWeb: fontesWeb.filter(fonteUtilizavel),
    ausentes,
    divergenciasDeCadastro,
  };
}

/**
 * A PONTE COM A FRENTE DA WEB — combinada pelo FORMATO, não pelo arquivo.
 *
 * `project_region_sources` (e o `FonteDeLastro` que a frente de pesquisa
 * produz) usa outros nomes de campo: `sourceUrl`, `publisher`, `referenceDate`,
 * `summary`, `reviewStatus`. Este adaptador aceita essa FORMA estruturalmente —
 * sem `import` do arquivo dela, que está sendo escrito agora. Se ela renomear
 * um módulo, isto continua compilando; se ela mudar o CONTRATO, isto quebra, que
 * é exatamente quando deve quebrar.
 *
 * `reviewStatus` é a trava: a coleta automática nasce `pending`, e pendente é o
 * estado de quem ainda não foi conferido por gente. Só `verified` vira lastro de
 * anúncio.
 */
export type FonteExterna = {
  sourceUrl?: string | null;
  publisher?: string | null;
  referenceDate?: string | null;
  summary?: string | null;
  reviewStatus?: string | null;
};

export function deFonteExterna(fontes: FonteExterna[] | null | undefined): FonteWeb[] {
  return (fontes ?? [])
    .filter((f) => String(f?.reviewStatus ?? "") === "verified")
    .map((f) => ({
      url: String(f.sourceUrl ?? ""),
      publicador: String(f.publisher ?? ""),
      publicadoEm: f.referenceDate ? String(f.referenceDate) : null,
      trecho: String(f.summary ?? ""),
    }))
    .filter(fonteUtilizavel);
}

/** Fonte web só entra com url, publicador, data e trecho. Sem os quatro, é boato. */
export function fonteUtilizavel(f: FonteWeb | null | undefined): boolean {
  if (!f) return false;
  const url = String(f.url ?? "").trim();
  return (
    /^https?:\/\/\S+$/i.test(url) &&
    String(f.publicador ?? "").trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}/.test(String(f.publicadoEm ?? "")) &&
    String(f.trecho ?? "").trim().length > 0
  );
}

// ---------------------------------------------------------------------------
// A conferência — o número do anúncio contra o estoque
// ---------------------------------------------------------------------------

export type Divergencia = {
  campo: string;
  trecho: string;
  valorCitado: number;
  unidade: UnidadeDoFato;
  motivo: string;
};

/** "R$ 337.782" → 337782 ; "R$ 337 mil" → 337000 ; "R$ 1,2 milhão" → 1200000 */
function valorEmReais(bruto: string, escala: string | undefined): number | null {
  const limpo = bruto.replace(/\s/g, "");
  // pt-BR: ponto é milhar, vírgula é decimal.
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : /\.\d{3}(\.|$)/.test(limpo)
      ? limpo.replace(/\./g, "")
      : limpo;
  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  const e = String(escala ?? "").toLowerCase();
  if (e.startsWith("mil")) return n * 1_000;
  if (e.startsWith("milh")) return n * 1_000_000;
  return n;
}

/** Tolerância de arredondamento de copy: "a partir de R$ 338 mil" para 337.782. */
const TOLERANCIA_BRL = 0.02; // 2%
const TOLERANCIA_M2 = 0.5; // meio metro

/**
 * Confere CADA número citado no texto contra a ficha. Devolve as divergências.
 *
 * A regra é a mais dura possível de propósito: um número que a ficha não
 * sustenta é divergência, e a peça com divergência não nasce. É mais barato
 * descartar uma variação boa do que publicar "a partir de R$ 250 mil" num
 * estoque cuja menor unidade custa R$ 337.782.
 */
export function conferirNumeros(campo: string, texto: string, ficha: FichaDeFatos): Divergencia[] {
  const out: Divergencia[] = [];
  const t = String(texto ?? "");

  // ── Dinheiro ─────────────────────────────────────────────────────────────
  const reBrl = /R\$\s*([\d.,]+)\s*(milh(?:ão|ões|ao|oes)|mil)?/gi;
  for (const m of t.matchAll(reBrl)) {
    const valor = valorEmReais(m[1], m[2]);
    if (valor === null) continue;
    if (ficha.precoMin === null || ficha.precoMax === null) {
      out.push({
        campo,
        trecho: m[0],
        valorCitado: valor,
        unidade: "BRL",
        motivo: "o CRM não tem preço de unidade disponível — nenhum valor pode ser citado",
      });
      continue;
    }
    const piso = ficha.precoMin * (1 - TOLERANCIA_BRL);
    const teto = ficha.precoMax * (1 + TOLERANCIA_BRL);
    if (valor < piso || valor > teto) {
      out.push({
        campo,
        trecho: m[0],
        valorCitado: valor,
        unidade: "BRL",
        motivo: `fora da faixa disponível em properties (${ficha.precoMin} a ${ficha.precoMax})`,
      });
      continue;
    }
    // "a partir de R$ X" afirma que X é o MENOR preço. Não basta estar na faixa.
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0).toLowerCase();
    if (/(a partir de|desde|por apenas|entrada de)\s*$/.test(antes)) {
      const distancia = Math.abs(valor - ficha.precoMin) / ficha.precoMin;
      if (distancia > TOLERANCIA_BRL) {
        out.push({
          campo,
          trecho: m[0],
          valorCitado: valor,
          unidade: "BRL",
          motivo: `"a partir de" exige o MENOR preço disponível (${ficha.precoMin}), não um valor qualquer da faixa`,
        });
      }
    }
  }

  // ── Metragem ─────────────────────────────────────────────────────────────
  const reArea = /(\d+(?:[.,]\d+)?)\s*(?:m²|m2|metros quadrados)/gi;
  for (const m of t.matchAll(reArea)) {
    const valor = Number(m[1].replace(",", "."));
    if (!Number.isFinite(valor)) continue;
    if (ficha.areaMin === null || ficha.areaMax === null) {
      out.push({ campo, trecho: m[0], valorCitado: valor, unidade: "m2", motivo: "o CRM não tem área de unidade disponível" });
      continue;
    }
    if (valor < ficha.areaMin - TOLERANCIA_M2 || valor > ficha.areaMax + TOLERANCIA_M2) {
      out.push({
        campo,
        trecho: m[0],
        valorCitado: valor,
        unidade: "m2",
        motivo: `fora da faixa disponível em properties (${ficha.areaMin} a ${ficha.areaMax} m²)`,
      });
    }
  }

  // ── Contagem de unidades ─────────────────────────────────────────────────
  const reUnidades = /(\d+)\s*(unidades?|apartamentos?|aptos?|studios?|st[úu]dios?)\b/gi;
  for (const m of t.matchAll(reUnidades)) {
    const valor = Number(m[1]);
    if (!Number.isFinite(valor)) continue;
    if (valor > ficha.unidadesDisponiveis) {
      out.push({
        campo,
        trecho: m[0],
        valorCitado: valor,
        unidade: "unidades",
        motivo: `o estoque disponível é de ${ficha.unidadesDisponiveis} unidade(s) — anunciar mais é vender o que não existe`,
      });
    }
  }

  return out;
}

/**
 * A ficha em texto, do jeito que o modelo lê. Cada linha é um fato conferível.
 *
 * O bloco de PROIBIÇÕES não é decoração: `lib/ai/niveis-de-autonomia.ts` declara
 * `garantir_preco_ou_estoque` e `prometer_financiamento` como ações proibidas
 * de forma autônoma, e o texto do anúncio é onde essas promessas apareceriam.
 */
export function fichaEmTexto(ficha: FichaDeFatos): string {
  const linhas: string[] = [`Empreendimento: ${ficha.nome}`];
  if (ficha.incorporadora) linhas.push(`Incorporadora: ${ficha.incorporadora}`);
  const local = [ficha.bairro, ficha.cidade].filter(Boolean).join(", ");
  if (local) linhas.push(`Localização: ${local}`);

  if (ficha.unidadesDisponiveis > 0) {
    linhas.push(`Unidades DISPONÍVEIS agora: ${ficha.unidadesDisponiveis} (estoque real, não o total do empreendimento)`);
  }
  if (ficha.precoMin !== null && ficha.precoMax !== null) {
    // Formatado em pt-BR de propósito: o modelo COPIA o formato que lê. Com o
    // número cru, a peça sai "R$ 337782" — valor certo, escrita que nenhum
    // anúncio brasileiro usa.
    linhas.push(`Faixa de preço das unidades disponíveis: ${brl(ficha.precoMin)} a ${brl(ficha.precoMax)}`);
    linhas.push(`ÚNICO valor que pode seguir "a partir de": ${brl(ficha.precoMin)}`);
  }
  if (ficha.areaMin !== null && ficha.areaMax !== null) {
    linhas.push(`Áreas privativas disponíveis: ${ficha.areaMin} a ${ficha.areaMax} m²`);
  }
  if (ficha.tipologias.length) {
    linhas.push("Tipologias disponíveis (rótulo · unidades · área · menor preço):");
    for (const t of ficha.tipologias) {
      linhas.push(
        `  - ${t.rotulo} · ${t.unidades} unid. · ${t.areaM2 ?? "?"} m² · ${t.precoMin !== null ? brl(t.precoMin) : "sem preço"}`,
      );
    }
  }
  if (ficha.fontesWeb.length) {
    linhas.push("Fatos de mercado COM FONTE (só estes podem ser citados como mercado):");
    for (const f of ficha.fontesWeb) {
      linhas.push(`  - ${f.trecho} [${f.publicador}, ${f.publicadoEm} — ${f.url}]`);
    }
  }
  if (ficha.ausentes.length) {
    linhas.push(`DADOS QUE NÃO EXISTEM (não cite, não estime, não arredonde): ${ficha.ausentes.join("; ")}`);
  }

  linhas.push("");
  linhas.push("PROIBIÇÕES ABSOLUTAS:");
  linhas.push("- Não cite NENHUM número que não esteja acima. Nem arredondado, nem 'cerca de'.");
  linhas.push("- Não garanta preço, disponibilidade, reserva ou 'últimas unidades' além do estoque listado.");
  linhas.push("- Não prometa aprovação de crédito, financiamento aprovado, entrada zero ou parcela fixa.");
  linhas.push("- Não prometa valorização, rentabilidade ou retorno.");
  linhas.push("- Não descreva quem lê (renda, idade, estado civil, família): descreva o imóvel e o lugar.");
  return linhas.join("\n");
}
