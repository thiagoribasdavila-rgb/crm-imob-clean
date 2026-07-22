import { generateAIText } from "@/lib/ai/provider-router";
import {
  CAMPAIGN_QUALITY_MINIMUM_LEADS,
  type CampaignQualityRow,
} from "@/lib/atlas/campaign-quality";

// Conselheiro Pipeline × Andromeda — recomendações por campanha a partir de
// SOMENTE dados agregados (linhas do campaign-quality, distribuição do funil
// e quebra de descartes por metaCategory). NUNCA recebe nome, telefone ou
// e-mail de lead: o shape de entrada não tem campo de lead individual, e a
// chamada de IA roda com containsPersonalData: false por construção.
//
// Duas vias, padrão do repo (irmão de whatsapp-conversation-intelligence):
//   (a) generativa via provider-router (task "reasoning", zero PII, prompt
//       com guardrails: nunca inventar números, só usar os agregados,
//       nunca recomendar ação destrutiva automática);
//   (b) fallback determinístico com regras explícitas (ANDROMEDA_ADVISOR_RULES)
//       que roda sempre que não houver provedor configurado, a chamada falhar
//       ou o JSON voltar inválido — a IA nunca é ponto único de falha.
// A resposta carrega engine: "generative" | "deterministic" para o consumidor
// saber qual via gerou o conselho.
//
// Governança inegociável (aplicada MESMO sobre a saída generativa):
//   - campanha sem amostra suficiente (< 30 leads, mesmo gate do
//     director-daily) SEMPRE recebe "keep" — nunca decisão de verba;
//   - "scale" só existe com VENDA medida (>= 3 vendas, sem o OU por volume de
//     leads) E custo por qualificado medido e sob a mediana; faltando qualquer
//     perna a recomendação vira "scale_por_proxy", que diz no rótulo e no
//     rationale exatamente qual lastro está faltando. Custo desconhecido nunca
//     libera aumento de verba nem confiança "alta";
//   - ausência de venda só é acusada quando os leads tiveram tempo de comprar
//     (maturidade do lead mais antigo contra um piso DECLARADO de ciclo);
//   - nada aqui executa ação na Meta: é conselho para aprovação humana
//     (o envio de lead_status = disqualified segue sob o gate do diretor do
//     andromeda-loop, política negativeSignalsInternalOnly).

export const ANDROMEDA_ADVISOR_ACTIONS = [
  "scale",
  "scale_por_proxy",
  "adjust_targeting",
  "fix_form",
  "pause_review",
  "investigate_attribution",
  "keep",
] as const;
export type AndromedaAdvisorAction = (typeof ANDROMEDA_ADVISOR_ACTIONS)[number];

// Amostra mínima para JULGAR CONVERSÃO (não para julgar qualificação: esse gate
// continua sendo CAMPAIGN_QUALITY_MINIMUM_LEADS). Sem este piso, "escalar só com
// conversão acima da mediana" silenciaria o conselheiro no ciclo imobiliário,
// onde a venda demora — por isso existe o estado rotulado scale_por_proxy em vez
// de simplesmente suprimir a recomendação.
export const ANDROMEDA_ADVISOR_MIN_SALES_TO_JUDGE = 3;
export const ANDROMEDA_ADVISOR_MIN_LEADS_TO_JUDGE_CONVERSION = 100;

// Aumentar verba é o galho mais caro: ele exige VENDA de verdade, não o OU por
// volume. Com o OU, 150 leads e 2 vendas viravam "amostra de venda suficiente" e
// a recomendação saía rotulada como sustentada por venda.
export const ANDROMEDA_ADVISOR_MIN_SALES_TO_SCALE = ANDROMEDA_ADVISOR_MIN_SALES_TO_JUDGE;

// Mediana de conversão com uma única campanha julgável é a própria campanha:
// comparar-se consigo mesma é sempre verdadeiro. Sem este N a "mediana" não é
// referência, é espelho.
export const ANDROMEDA_ADVISOR_MIN_CAMPAIGNS_FOR_MEDIAN = 3;

// Piso DECLARADO (não medido) de maturidade para acusar ausência de venda: só
// faz sentido dizer "não vendeu" quando os leads tiveram tempo de comprar. O
// tempo mediano lead->venda da organização não é apurado neste módulo; enquanto
// não for, este é um piso conservador do ciclo imobiliário, e o rationale diz
// que é piso declarado.
export const ANDROMEDA_ADVISOR_MIN_LEAD_MATURITY_DAYS = 45;

export const ANDROMEDA_ADVISOR_CONFIDENCES = ["alta", "media", "baixa"] as const;
export type AndromedaAdvisorConfidence = (typeof ANDROMEDA_ADVISOR_CONFIDENCES)[number];

export type AndromedaFunnelStage = { stage: string; label: string; count: number };
export type AndromedaDiscardCategory = { category: string; count: number };

// Três estados do gasto — um booleano colapsava "não gastou", "ninguém lançou o
// gasto" e "não consegui ler" na mesma resposta.
export const ANDROMEDA_SPEND_COVERAGES = ["medido", "sem_lancamento", "indisponivel"] as const;
export type AndromedaSpendCoverage = (typeof ANDROMEDA_SPEND_COVERAGES)[number];

// Entrada 100% agregada — nenhum campo de lead individual existe neste shape.
export type AndromedaPipelineAggregates = {
  period: { start: string; end: string; days: number };
  ranking: CampaignQualityRow[]; // linhas do campaign-quality (já agregadas)
  funnel: AndromedaFunnelStage[]; // distribuição de leads por etapa canônica
  discardsByMetaCategory: AndromedaDiscardCategory[]; // quebra org-wide
  unattributedDiscards: number;
  spendMeasured: boolean; // true SÓ com linha de gasto lida na janela
  spendCoverage?: AndromedaSpendCoverage; // por que spendMeasured é false
};

export type AndromedaRecommendation = {
  campaignId: string;
  campaignName: string;
  action: AndromedaAdvisorAction;
  rationale: string; // pt-BR, explicável, cita os números dos agregados
  confidence: AndromedaAdvisorConfidence;
  metaFeedbackHint: string; // o que reportar à Meta para o Andromeda aprender
};

export type AndromedaAdvice = {
  engine: "generative" | "deterministic";
  model: string | null;
  recommendations: AndromedaRecommendation[];
};

// Regras explícitas do fallback determinístico — publicadas no payload do
// endpoint (padrão rules/formula do broker-daily) para explicabilidade.
export const ANDROMEDA_ADVISOR_RULES = {
  qualificationVocabulary:
    "qualificationRate = QUALIFICAÇÃO DE CADASTRO (score >= 70 ou temperature quente — proxy), calculada só sobre os leads com esse eixo MEDIDO e null quando não há base medida; conversionRate/sales = VENDA confirmada no CRM; commercialQualificationRate = evidência de funil (etapa >= visita). As três nunca são a mesma grandeza e o rationale sempre diz qual usou",
  conversionSample: `amostra para julgar conversão: >= ${ANDROMEDA_ADVISOR_MIN_SALES_TO_JUDGE} vendas na janela OU >= ${ANDROMEDA_ADVISOR_MIN_LEADS_TO_JUDGE_CONVERSION} leads`,
  keepInsufficientSample: `leads < ${CAMPAIGN_QUALITY_MINIMUM_LEADS} => keep (amostra insuficiente; nenhuma decisão de verba — mesmo gate do director-daily)`,
  investigateAttribution:
    "gasto lançado na janela e ZERO lead atribuído => investigate_attribution (a causa provável é atribuição quebrada, não campanha ruim; a linha não recebe nota nem entra nas medianas)",
  fixForm: "descartes >= 5 e (invalid_contact_info + spam) >= 40% dos descartes => fix_form (problema de captação, não de público)",
  adjustTargeting: "descartes >= 5 e (out_of_service_area + wrong_product + budget_mismatch) >= 40% dos descartes => adjust_targeting",
  pauseReviewNoSales: `amostra de conversão suficiente, 0 vendas e lead mais antigo com pelo menos ${ANDROMEDA_ADVISOR_MIN_LEAD_MATURITY_DAYS} dias (piso DECLARADO de ciclo de venda, não medido) => pause_review, independentemente da qualificação de cadastro. Abaixo dessa maturidade a campanha NÃO é acusada de não vender: a janela é menor que o ciclo`,
  pauseReview: "amostra suficiente e nota C e (discardRate >= 50% ou qualificationRate MEDIDA < 10% ou CPL qualificado > 2x a mediana) => pause_review (revisão humana antes de qualquer pausa)",
  scale: `amostra suficiente, nota A, CPL qualificado MEDIDO e <= mediana, >= ${ANDROMEDA_ADVISOR_MIN_SALES_TO_SCALE} vendas na janela e conversão >= mediana de conversão (mediana só existe com >= ${ANDROMEDA_ADVISOR_MIN_CAMPAIGNS_FOR_MEDIAN} campanhas comparáveis) => scale (verba sustentada por VENDA). Custo NÃO medido nunca libera scale`,
  scalePorProxy: `nota A sem um desses lastros (venda abaixo de ${ANDROMEDA_ADVISOR_MIN_SALES_TO_SCALE}, mediana sem campanhas comparáveis ou custo não medido) => scale_por_proxy com confiança baixa, declarando no rationale o que falta`,
  confidence: "confiança 'alta' em aumento de verba exige custo MEDIDO; sem custo medido, no máximo 'media'",
  keep: "demais casos => keep (seguir alimentando o ciclo de qualidade)",
} as const;

const FORM_CATEGORIES = ["invalid_contact_info", "spam"];
const TARGETING_CATEGORIES = ["out_of_service_area", "wrong_product", "budget_mismatch"];
const MAX_PROMPT_CAMPAIGNS = 20;

const brl = (value: number) => `R$ ${value.toFixed(2)}`;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function categoryCount(row: CampaignQualityRow, categories: string[]) {
  return row.discardsByMetaCategory
    .filter((item) => categories.includes(item.category))
    .reduce((sum, item) => sum + item.count, 0);
}

/** A campanha já produziu evidência suficiente para a CONVERSÃO ser julgada? */
function conversionJudgeable(row: CampaignQualityRow) {
  return (
    row.sales >= ANDROMEDA_ADVISOR_MIN_SALES_TO_JUDGE
    || row.leads >= ANDROMEDA_ADVISOR_MIN_LEADS_TO_JUDGE_CONVERSION
  );
}

/**
 * Lastro de VENDA para aumentar verba — sem o OU por volume de leads.
 * O rótulo "scale" afirma, por contrato deste módulo, evidência de venda.
 */
function salesBackedForScale(row: CampaignQualityRow) {
  return row.sales >= ANDROMEDA_ADVISOR_MIN_SALES_TO_SCALE;
}

/** Gasto lançado e nenhum lead atribuído — o pior gasto possível. */
function spendWithoutAttributedLeads(row: CampaignQualityRow) {
  return row.leads === 0 && row.spend > 0;
}

const DAY_MS = 86_400_000;

/** Dias entre o lead mais antigo da campanha e o fim da janela. */
function leadMaturityDays(row: CampaignQualityRow, periodEnd: string): number | null {
  if (!row.oldestLeadAt) return null;
  const oldest = Date.parse(row.oldestLeadAt);
  const end = Date.parse(periodEnd);
  if (!Number.isFinite(oldest) || !Number.isFinite(end)) return null;
  return Math.floor((end - oldest) / DAY_MS);
}

/** Cadastro só é citado quando MEDIDO — null não vira 0%. */
function qualificationNote(row: CampaignQualityRow) {
  return row.qualificationRate === null
    ? `qualificação de cadastro NÃO medida (apenas ${row.qualificationBaseLeads} de ${row.leads} leads têm score_ia ou temperatura apurada)`
    : `${row.qualificationRate}% de qualificação de cadastro (${row.qualifiedLeads} de ${row.qualificationBaseLeads} leads com cadastro medido)`;
}

/** Evidência de funil — a base da nota desde a régua v2. */
function commercialNote(row: CampaignQualityRow) {
  return row.commercialQualificationRate === null
    ? `${row.commercialQualifiedLeads} lead(s) com evidência comercial (visita ou além)`
    : `${row.commercialQualificationRate}% de evidência comercial (${row.commercialQualifiedLeads} de ${row.leads} leads em visita ou além)`;
}

/** Trecho de venda citado em todo rationale — o número, nunca o adjetivo. */
function salesNote(row: CampaignQualityRow) {
  // conversionRate é null quando a campanha não bateu a amostra mínima do
  // campaign-quality: aí a conversão não é citada, nem como 0%.
  return conversionJudgeable(row) && row.conversionRate !== null
    ? `${row.sales} venda(s) em ${row.leads} leads (${row.conversionRate}% de conversão)`
    : `${row.sales} venda(s) em ${row.leads} leads — amostra ainda insuficiente para julgar conversão (mínimo ${ANDROMEDA_ADVISOR_MIN_SALES_TO_JUDGE} vendas ou ${ANDROMEDA_ADVISOR_MIN_LEADS_TO_JUDGE_CONVERSION} leads)`;
}

function insufficientSampleRecommendation(row: CampaignQualityRow): AndromedaRecommendation {
  return {
    campaignId: row.id,
    campaignName: row.name,
    action: "keep",
    rationale: `Apenas ${row.leads} leads na janela (mínimo ${CAMPAIGN_QUALITY_MINIMUM_LEADS}) — sem nota de qualidade e sem decisão de verba até amostra suficiente.`,
    confidence: "alta",
    metaFeedbackHint:
      "Ainda não reportar lote de qualidade à Meta: amostra pequena distorce o aprendizado do Andromeda. Aguardar a amostra mínima.",
  };
}

function attributionGapRecommendation(row: CampaignQualityRow): AndromedaRecommendation {
  return {
    campaignId: row.id,
    campaignName: row.name,
    action: "investigate_attribution",
    rationale: `${brl(row.spend)} de gasto lançado na janela e ZERO lead ATRIBUÍDO a esta campanha no CRM — o número diz que nenhum lead foi atribuído, não que nenhum lead foi gerado. Verificar a atribuição (leads.campaign_id) antes de qualquer conclusão sobre a campanha; sem lead atribuído não há nota nem decisão de verba.`,
    confidence: "media",
    metaFeedbackHint:
      "Não reportar qualidade desta campanha à Meta enquanto a atribuição não fechar: reportar lote vazio ensina o Andromeda que a campanha não gera lead.",
  };
}

/**
 * Recomendação que a governança impõe ANTES de qualquer julgamento — vale
 * igualmente para a via determinística e para a saída da IA generativa.
 */
function governedRecommendation(row: CampaignQualityRow): AndromedaRecommendation | null {
  if (spendWithoutAttributedLeads(row)) return attributionGapRecommendation(row);
  if (!row.sampleSufficient) return insufficientSampleRecommendation(row);
  return null;
}

// Fallback determinístico — regras de ANDROMEDA_ADVISOR_RULES, na mesma ordem
// de precedência documentada lá. Sem custo externo, sem IA, 100% explicável.
export function deterministicAndromedaAdvice(
  aggregates: AndromedaPipelineAggregates,
): AndromedaRecommendation[] {
  const cpqlMedian = median(
    aggregates.ranking
      .filter((row) => row.sampleSufficient && row.costPerQualifiedLead !== null)
      .map((row) => row.costPerQualifiedLead as number),
  );
  // Mediana de conversão calculada SÓ sobre campanhas cuja conversão é
  // julgável — incluir campanhas sem amostra rebaixaria a mediana a zero e
  // faria qualquer campanha parecer boa.
  const conversionSamples = aggregates.ranking
    .filter((row) => row.sampleSufficient && conversionJudgeable(row))
    .flatMap((row) => (row.conversionRate === null ? [] : [row.conversionRate]));
  const conversionMedian = conversionSamples.length >= ANDROMEDA_ADVISOR_MIN_CAMPAIGNS_FOR_MEDIAN
    ? median(conversionSamples)
    : null;

  return aggregates.ranking.map((row): AndromedaRecommendation => {
    const governed = governedRecommendation(row);
    if (governed) return governed;

    const discardRate = row.discardRate ?? 0;
    const cpql = row.costPerQualifiedLead;
    // qualificationRate agora é null tanto sem amostra quanto sem base de
    // cadastro MEDIDA (lead da Meta nasce sem score_ia). Tratar null como 0
    // aqui condenaria por não-medição toda campanha da Meta.
    const qualificationRate = row.qualificationRate;
    const conversionRate = row.conversionRate;
    const maturityDays = leadMaturityDays(row, aggregates.period.end);
    const cycleCovered = maturityDays !== null
      && maturityDays >= ANDROMEDA_ADVISOR_MIN_LEAD_MATURITY_DAYS;

    if (row.discarded >= 5) {
      const formCount = categoryCount(row, FORM_CATEGORIES);
      const formShare = formCount / row.discarded;
      if (formShare >= 0.4) {
        return {
          campaignId: row.id,
          campaignName: row.name,
          action: "fix_form",
          rationale: `${formCount} de ${row.discarded} descartes (${Math.round(formShare * 100)}%) são contato inválido ou spam — o problema está na captação do formulário, não no público da campanha.`,
          confidence: formShare >= 0.6 ? "alta" : "media",
          metaFeedbackHint:
            "Reportar estes descartes como disqualified (invalid_contact_info/spam) para o Andromeda filtrar cadastros falsos; revisar validação de telefone/e-mail no formulário.",
        };
      }
      const targetingCount = categoryCount(row, TARGETING_CATEGORIES);
      const targetingShare = targetingCount / row.discarded;
      if (targetingShare >= 0.4) {
        return {
          campaignId: row.id,
          campaignName: row.name,
          action: "adjust_targeting",
          rationale: `${targetingCount} de ${row.discarded} descartes (${Math.round(targetingShare * 100)}%) indicam público errado (fora de área, produto errado ou orçamento incompatível), com ${commercialNote(row)} e ${qualificationNote(row)}.`,
          confidence: targetingShare >= 0.6 ? "alta" : "media",
          metaFeedbackHint:
            "Reportar disqualified com as categorias out_of_service_area/wrong_product/budget_mismatch para o Andromeda afastar perfis semelhantes; revisar segmentação geográfica e de renda.",
        };
      }
    }

    // Gasto que não vende: com amostra de conversão julgável e ZERO vendas, a
    // verba não pode ser sustentada por qualificação de cadastro — a regra
    // publicada (pauseReviewNoSales) nunca mencionou corte de cadastro, e o
    // código exigia qualificationRate >= 40 para chegar aqui.
    // A maturidade é a condição que falta nas duas pontas: acusar de "não
    // vender" uma campanha cujos leads são mais novos que o ciclo de venda
    // transformaria o conselho em monocultura de pausa.
    if (conversionJudgeable(row) && row.sales === 0 && cycleCovered) {
      return {
        campaignId: row.id,
        campaignName: row.name,
        action: "pause_review",
        rationale: `${salesNote(row)}, com ${commercialNote(row)} e ${qualificationNote(row)} — lead mais antigo com ${maturityDays} dias, acima do piso declarado de ${ANDROMEDA_ADVISOR_MIN_LEAD_MATURITY_DAYS} dias de ciclo de venda (piso declarado, não medido nesta organização). Levar à revisão do gestor. Nada é pausado automaticamente.`,
        confidence: "media",
        metaFeedbackHint:
          "Reportar à Meta as VENDAS do CRM, não só o cadastro qualificado: enquanto o sinal enviado for cadastro, o Andromeda otimiza para lead bem preenchido, não para comprador.",
      };
    }

    if (
      row.qualityGrade === "C"
      && (discardRate >= 50
        // Cadastro não medido NÃO é cadastro ruim: só condena quando medido.
        || (qualificationRate !== null && qualificationRate < 10)
        || (cpql !== null && cpqlMedian !== null && cpql > cpqlMedian * 2))
    ) {
      const costNote = cpql !== null && cpqlMedian !== null
        ? ` e CPL qualificado de ${brl(cpql)} (mediana ${brl(cpqlMedian)})`
        : "";
      return {
        campaignId: row.id,
        campaignName: row.name,
        action: "pause_review",
        rationale: `Nota C (régua v${row.qualityGradeRuleVersion}) com ${commercialNote(row)}, ${qualificationNote(row)}, ${discardRate}% de descarte${costNote} e ${salesNote(row)} — levar à revisão do gestor antes de qualquer pausa. Nada é pausado automaticamente.`,
        confidence: "media",
        metaFeedbackHint:
          "Antes de decidir, reportar o lote acumulado de disqualified categorizados para fechar o ciclo de aprendizado do Andromeda sobre esta campanha.",
      };
    }

    if (row.qualityGrade === "A") {
      const cheapEnough = cpql !== null && cpqlMedian !== null && cpql <= cpqlMedian;
      const costUnmeasured = cpql === null || cpqlMedian === null;
      if (cheapEnough || costUnmeasured) {
        const costNote = cheapEnough
          ? ` e CPL qualificado de ${brl(cpql as number)} (mediana ${brl(cpqlMedian as number)})`
          : " — custo por qualificado NÃO medido (marketing_spend indisponível ou sem investimento lançado), por isso a escalada não pode ser afirmada como eficiente";
        const salesBacked = salesBackedForScale(row);
        const convertsAtLeastMedian =
          conversionMedian !== null && conversionRate !== null && conversionRate >= conversionMedian;

        // Escalar por VENDA exige as TRÊS pernas: venda de verdade (sem o OU
        // por volume), custo medido e sob a mediana, e mediana que exista com
        // campanhas comparáveis. Custo desconhecido nunca libera scale — era o
        // galho mais caro do módulo saindo com a condição de custo dispensada.
        if (salesBacked && cheapEnough && convertsAtLeastMedian) {
          return {
            campaignId: row.id,
            campaignName: row.name,
            action: "scale",
            rationale: `Nota A (régua v${row.qualityGradeRuleVersion}) com ${commercialNote(row)}${costNote} e ${salesNote(row)} — conversão na mediana ou acima (mediana ${conversionMedian}%, sobre ${conversionSamples.length} campanhas comparáveis). Candidata a receber mais verba, sob aprovação do diretor.`,
            confidence: "alta",
            metaFeedbackHint:
              "Reportar as VENDAS do CRM além dos qualificados — é a venda que ensina o Andromeda a procurar comprador — antes de escalar a verba.",
          };
        }

        // Lastro de venda existe, custo medido, e a conversão está ABAIXO da
        // mediana: nota A não compra escalada de verba.
        if (salesBacked && cheapEnough && conversionMedian !== null && !convertsAtLeastMedian) {
          return {
            campaignId: row.id,
            campaignName: row.name,
            action: "keep",
            rationale: `Nota A (régua v${row.qualityGradeRuleVersion}) com ${commercialNote(row)}${costNote}, mas ${salesNote(row)} — abaixo da mediana de conversão (${conversionMedian}%). Manter a verba como está.`,
            confidence: "media",
            metaFeedbackHint:
              "Reportar vendas e descartes categorizados para o Andromeda separar cadastro bom de comprador antes de qualquer aumento de verba.",
          };
        }

        // Falta pelo menos uma perna: a escalada é rotulada como apoiada em
        // proxy e o rationale diz QUAL lastro está faltando — "sem amostra, sem
        // recomendação" honrado pela rotulagem, não pelo silêncio.
        const missing = [
          salesBacked ? null : `menos de ${ANDROMEDA_ADVISOR_MIN_SALES_TO_SCALE} vendas na janela`,
          costUnmeasured ? "custo por qualificado não medido" : null,
          conversionMedian === null
            ? `mediana de conversão indisponível (menos de ${ANDROMEDA_ADVISOR_MIN_CAMPAIGNS_FOR_MEDIAN} campanhas comparáveis)`
            : null,
        ].filter((item): item is string => item !== null);
        return {
          campaignId: row.id,
          campaignName: row.name,
          action: "scale_por_proxy",
          rationale: `Nota A (régua v${row.qualityGradeRuleVersion}) com ${commercialNote(row)}${costNote} — escalada NÃO sustentada por venda medida: ${missing.join("; ")}. ${salesNote(row)}.`,
          // Aumento de verba com custo desconhecido nunca sai como "alta".
          confidence: "baixa",
          metaFeedbackHint:
            "Antes de escalar, acumular vendas atribuídas e lançar o gasto da campanha: sem venda e sem custo medidos, o aumento de verba é aposta, não decisão.",
        };
      }
    }

    // Quando a campanha só escapou do pause_review por imaturidade, o keep diz
    // isso na cara — senão o diretor lê "manter" sem saber que a ausência de
    // venda existe e apenas não é julgável ainda.
    const cycleNote = conversionJudgeable(row) && row.sales === 0 && !cycleCovered
      ? ` Ausência de venda ainda NÃO é julgada: ${maturityDays === null ? "não há data do lead mais antigo para medir maturidade" : `o lead mais antigo tem ${maturityDays} dias`}, abaixo do piso declarado de ${ANDROMEDA_ADVISOR_MIN_LEAD_MATURITY_DAYS} dias de ciclo de venda.`
      : "";
    return {
      campaignId: row.id,
      campaignName: row.name,
      action: "keep",
      rationale: `Nota ${row.qualityGrade ?? "—"} (régua v${row.qualityGradeRuleVersion}) com ${commercialNote(row)}, ${qualificationNote(row)}, ${discardRate}% de descarte e ${salesNote(row)} — manter como está e seguir alimentando o ciclo de qualidade.${cycleNote}`,
      confidence: "media",
      metaFeedbackHint:
        "Manter o envio contínuo de status de qualidade (qualified/disqualified categorizado) para o Andromeda continuar calibrando a entrega.",
    };
  });
}

function coerce<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** "scale" só é permitido com venda de verdade E custo por qualificado medido. */
function scaleAllowed(row: CampaignQualityRow) {
  return salesBackedForScale(row) && row.costPerQualifiedLead !== null;
}

const BUDGET_INCREASING_ACTIONS: readonly AndromedaAdvisorAction[] = ["scale", "scale_por_proxy"];

function demoteConfidenceWhenCostUnmeasured(
  confidence: AndromedaAdvisorConfidence,
  action: AndromedaAdvisorAction,
  row: CampaignQualityRow,
): AndromedaAdvisorConfidence {
  if (!BUDGET_INCREASING_ACTIONS.includes(action)) return confidence;
  if (row.costPerQualifiedLead !== null) return confidence;
  return confidence === "alta" ? "media" : confidence;
}

const SYSTEM = [
  "Você é o conselheiro Pipeline × Andromeda do Atlas, CRM imobiliário brasileiro.",
  "Você recebe SOMENTE agregados por campanha (volumes, taxas, custos, descartes por categoria e funil) — nunca dados pessoais de lead.",
  "NUNCA invente números: cite apenas valores presentes nos agregados fornecidos.",
  "NUNCA recomende ação destrutiva automática: toda recomendação é conselho para aprovação humana; nada é aplicado na Meta automaticamente.",
  "Ações permitidas: scale (mais verba, sustentada por VENDA), scale_por_proxy (mais verba sem lastro de venda medido — diga no rationale o que falta), adjust_targeting (ajustar público), fix_form (corrigir captação/formulário), pause_review (levar à revisão humana antes de pausar), investigate_attribution (gasto lançado e zero lead atribuído), keep (manter).",
  `Campanha com menos de ${CAMPAIGN_QUALITY_MINIMUM_LEADS} leads (sampleSufficient=false): sempre keep — amostra insuficiente não sustenta decisão de verba.`,
  "qualificationRate é QUALIFICAÇÃO DE CADASTRO (score alto ou lead quente) — é proxy, não é venda; quando vier null significa NÃO MEDIDA (o lead nunca foi pontuado) e nunca deve ser lida nem citada como 0%. commercialQualificationRate é evidência de funil (visita ou além). sales e conversionRate são VENDA confirmada no CRM. Sempre diga no rationale qual grandeza sustentou a recomendação.",
  `Só use scale quando houver >= ${ANDROMEDA_ADVISOR_MIN_SALES_TO_SCALE} vendas na janela (volume de leads NÃO substitui venda neste caso), o custo por qualificado estiver MEDIDO e a conversão estiver na mediana ou acima; faltando qualquer um desses, use scale_por_proxy e declare o que falta.`,
  "Nunca use confiança 'alta' para aumentar verba quando costPerQualifiedLead vier null: custo não medido não sustenta certeza.",
  `Campanha com amostra de venda e ZERO vendas só vira pause_review quando o lead mais antigo tiver pelo menos ${ANDROMEDA_ADVISOR_MIN_LEAD_MATURITY_DAYS} dias (piso declarado de ciclo de venda); abaixo disso use keep dizendo que a janela é menor que o ciclo.`,
  "Campanha com gasto lançado e ZERO lead atribuído: investigate_attribution, dizendo que zero leads foram ATRIBUÍDOS (não necessariamente gerados).",
  "Cite sempre o número de vendas (sales) no rationale — o objetivo do investimento é venda, não cadastro.",
  "Em metaFeedbackHint, diga o que reportar à Meta (CRM lead status qualified/disqualified e categorias) para o Andromeda aprender — o CRM é a verdade da conversão.",
  'Responda SOMENTE com um JSON válido, sem texto fora do JSON, no formato: {"recommendations":[{"campaignId":"<id existente nos agregados>","action":"scale|scale_por_proxy|adjust_targeting|fix_form|pause_review|keep","rationale":"pt-BR citando os números, inclusive vendas","confidence":"alta|media|baixa","metaFeedbackHint":"o que reportar à Meta"}]}',
].join("\n");

export async function adviseAndromedaPipeline(input: {
  organizationId: string;
  userId?: string;
  aggregates: AndromedaPipelineAggregates;
}): Promise<AndromedaAdvice> {
  const { aggregates } = input;
  if (!aggregates.ranking.length) {
    return { engine: "deterministic", model: null, recommendations: [] };
  }

  const deterministic = deterministicAndromedaAdvice(aggregates);
  const fallback = (): AndromedaAdvice => ({
    engine: "deterministic",
    model: null,
    recommendations: deterministic,
  });

  const rowById = new Map(aggregates.ranking.map((row) => [row.id, row]));
  const deterministicById = new Map(deterministic.map((item) => [item.campaignId, item]));

  try {
    // Prompt só com agregados — nenhum campo de lead individual existe aqui.
    const promptPayload = {
      period: aggregates.period,
      minimumLeadsForDecision: CAMPAIGN_QUALITY_MINIMUM_LEADS,
      spendMeasured: aggregates.spendMeasured,
      spendCoverage: aggregates.spendCoverage ?? null,
      funnel: aggregates.funnel,
      discardsByMetaCategory: aggregates.discardsByMetaCategory,
      unattributedDiscards: aggregates.unattributedDiscards,
      // Linha de gasto sem lead atribuído tem resposta imposta pela governança
      // (investigate_attribution): mandá-la ao modelo só gastaria a cota do
      // prompt e empurraria campanha real para fora do teto.
      campaigns: aggregates.ranking
        .filter((row) => !spendWithoutAttributedLeads(row))
        .slice(0, MAX_PROMPT_CAMPAIGNS),
    };
    const result = await generateAIText({
      task: "reasoning",
      containsPersonalData: false,
      organizationId: input.organizationId,
      userId: input.userId,
      feature: "andromeda-pipeline-advisor",
      system: SYSTEM,
      prompt: `Agregados Pipeline × Andromeda (JSON):\n${JSON.stringify(promptPayload)}\n\nResponda apenas com o JSON de recomendações.`,
    });
    if (result.provider === "local") return fallback();
    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return fallback();
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const items = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

    const generativeById = new Map<string, AndromedaRecommendation>();
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const campaignId = typeof raw.campaignId === "string" ? raw.campaignId : "";
      const row = rowById.get(campaignId);
      if (!row) continue; // nunca aceitar campanha inventada pela IA
      // Governança inegociável sobre a saída generativa: sem amostra
      // suficiente não existe decisão de verba, e gasto sem lead atribuído é
      // investigação de atribuição — a IA não escolhe nenhum dos dois.
      const governed = governedRecommendation(row);
      if (governed) {
        generativeById.set(row.id, governed);
        continue;
      }
      const rationale = typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 500) : "";
      const hint = typeof raw.metaFeedbackHint === "string" ? raw.metaFeedbackHint.trim().slice(0, 300) : "";
      if (!rationale || !hint) continue; // recomendação sem explicação não entra
      const action = coerce(raw.action, ANDROMEDA_ADVISOR_ACTIONS, "keep");
      const resolvedAction: AndromedaAdvisorAction =
        action === "scale" && !scaleAllowed(row) ? "scale_por_proxy" : action;
      generativeById.set(row.id, {
        campaignId: row.id,
        campaignName: row.name, // nome sempre dos agregados, nunca da IA
        // Governança sobre a saída generativa: "scale" afirma lastro de VENDA
        // com custo MEDIDO. Sem uma das duas pernas a IA não promove proxy a
        // evidência — o rótulo é rebaixado, a recomendação não é silenciada.
        action: resolvedAction,
        rationale,
        // Confiança "alta" em aumento de verba exige custo medido, valha a
        // recomendação da IA ou do fallback.
        confidence: demoteConfidenceWhenCostUnmeasured(
          coerce(raw.confidence, ANDROMEDA_ADVISOR_CONFIDENCES, "media"),
          resolvedAction,
          row,
        ),
        metaFeedbackHint: hint,
      });
    }
    if (!generativeById.size) return fallback();

    // Cobertura completa na ordem do ranking: campanhas que a IA não cobriu
    // (ou além do teto do prompt) recebem a recomendação determinística.
    const recommendations = aggregates.ranking
      .map((row) => generativeById.get(row.id) ?? deterministicById.get(row.id))
      .filter((item): item is AndromedaRecommendation => Boolean(item));
    return { engine: "generative", model: result.model, recommendations };
  } catch {
    return fallback();
  }
}
