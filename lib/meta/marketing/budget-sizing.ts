/**
 * Recomendador de tamanho de conjunto × verba — o cérebro que estuda a estrutura
 * IDEAL de conjuntos de anúncios pela matemática da FASE DE APRENDIZADO da Meta.
 *
 * Fundamento (aprendizado da Meta): cada conjunto de anúncios precisa de ~50
 * eventos de otimização em 7 dias para SAIR do aprendizado. Abaixo disso a
 * entrega fica instável e cara. Logo a verba mínima por conjunto tem piso =
 * 50 × CPL. Fragmentar demais divide o sinal entre conjuntos que nunca amadurecem
 * (o sistema Andromeda premia CONSOLIDAÇÃO). Sob a categoria HOUSING não dá para
 * micro-segmentar público, então o padrão honesto é concentrar a verba.
 *
 * Núcleo puro e determinístico: só aritmética, sem rede, sem banco, sem efeito
 * externo. Toda suposição vai para `assumptions`; todo número concreto vai para
 * `reasoning` em PT-BR — nada de veredito sem a conta que o sustenta.
 */

export type SizingInput = {
  weeklyBudgetBrl: number;         // verba semanal disponível para o conjunto/campanha (R$)
  expectedCplBrl: number | null;   // CPL histórico esperado (R$) — null se não houver
  audienceSplits?: number;         // quantos públicos distintos a diretoria quer testar
};

export type AdSetSizing = {
  maxAdSetsThatLearn: number;          // quantos conjuntos a verba sustenta acima do piso de aprendizado
  recommendedAdSets: number;           // recomendação final de conjuntos
  dailyBudgetPerAdSetBrl: number;      // verba diária por conjunto recomendado (R$)
  expectedConversionsPerWeek: number;  // conversões/semana projetadas com a verba total
  exitsLearning: boolean;              // a estrutura recomendada sai do aprendizado?
  minWeeklyToExitLearningBrl: number;  // verba semanal mínima p/ 1 conjunto sair do aprendizado (R$)
  verdict: "verba_insuficiente" | "consolidar" | "ok" | "pode_dividir";
  reasoning: string[];                 // a conta, em PT-BR
  assumptions: string[];               // toda suposição assumida
};

export type SizingOpts = {
  learningEventsPerWeek?: number; // piso de eventos/semana para sair do aprendizado (Meta ~50)
  maxAdSets?: number;             // teto de conjuntos recomendados (consolidação)
  fallbackCplBrl?: number;        // CPL assumido quando não há histórico (R$)
};

const EPS = 1e-9;
const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => r2(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
/** Sanitiza número > 0; devolve null se inválido (não-finito ou ≤ 0). */
const posOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Estuda a estrutura ideal de conjuntos para a verba semanal informada.
 * Determinístico: mesma entrada, mesma saída. Não decide sozinho ativar nada —
 * só recomenda a matemática do aprendizado.
 */
export function recommendAdSetSizing(input: SizingInput, opts?: SizingOpts): AdSetSizing {
  const learningEventsPerWeek = posOrNull(opts?.learningEventsPerWeek) ?? 50;
  const maxAdSets = Math.max(1, Math.floor(posOrNull(opts?.maxAdSets) ?? 3));
  const fallbackCplBrl = posOrNull(opts?.fallbackCplBrl) ?? 8;

  const assumptions: string[] = [];
  const reasoning: string[] = [];

  // Verba semanal sanitizada (≥ 0; verba inválida vira 0 e cai em insuficiente).
  const weeklyBudget = (() => {
    const n = Number(input.weeklyBudgetBrl);
    return Number.isFinite(n) && n > 0 ? r2(n) : 0;
  })();
  if (weeklyBudget <= 0) {
    reasoning.push("Verba semanal ausente ou não positiva — sem verba não há entrega para dimensionar.");
  }

  // CPL: histórico quando existe; senão o fallback, registrado como suposição.
  const cplHist = posOrNull(input.expectedCplBrl);
  const cpl = cplHist ?? fallbackCplBrl;
  if (cplHist === null) {
    assumptions.push(`Sem CPL histórico, assumindo R$ ${brl(fallbackCplBrl)} por lead.`);
  }

  const minWeeklyToExitLearningBrl = r2(learningEventsPerWeek * cpl);
  const convPerWeekRaw = weeklyBudget / cpl;
  const convPerWeek = r2(convPerWeekRaw);
  const expectedConversionsPerWeek = Math.round(convPerWeekRaw);
  const maxAdSetsThatLearn = Math.floor((convPerWeekRaw + EPS) / learningEventsPerWeek);

  const splitsRequested = (() => {
    const n = Number(input.audienceSplits);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  })();

  let recommendedAdSets: number;
  let verdict: AdSetSizing["verdict"];

  if (convPerWeekRaw + EPS < learningEventsPerWeek) {
    // Verba insuficiente: nem um único conjunto broad atinge o piso de aprendizado.
    recommendedAdSets = 1;
    verdict = "verba_insuficiente";
    reasoning.push(
      `Com R$ ${brl(weeklyBudget)}/semana ao CPL de R$ ${brl(cpl)}, a projeção é ~${convPerWeek} conversões/semana — abaixo das ~${learningEventsPerWeek} que um conjunto precisa para sair do aprendizado.`,
    );
    reasoning.push(
      `Suba a verba para pelo menos R$ ${brl(minWeeklyToExitLearningBrl)}/semana (${learningEventsPerWeek} × CPL) ou mantenha 1 conjunto único e broad para concentrar o pouco sinal disponível.`,
    );
  } else {
    // A verba sustenta ao menos 1 conjunto aprendendo. Sob HOUSING o padrão é CONSOLIDAR.
    const cap = Math.min(maxAdSetsThatLearn, maxAdSets);
    recommendedAdSets = clamp(splitsRequested, 1, cap);

    reasoning.push(
      `Com R$ ${brl(weeklyBudget)}/semana ao CPL de R$ ${brl(cpl)}, a projeção é ~${convPerWeek} conversões/semana; a verba sustenta ${maxAdSetsThatLearn} conjunto(s) acima do piso de ~${learningEventsPerWeek}/semana.`,
    );

    if (splitsRequested > recommendedAdSets) {
      // Pedido de mais públicos do que a verba (ou o teto de consolidação) sustenta.
      verdict = "consolidar";
      const limitedByBudget = maxAdSetsThatLearn < splitsRequested && maxAdSetsThatLearn <= maxAdSets;
      if (limitedByBudget) {
        reasoning.push(
          `Foram pedidos ${splitsRequested} públicos, mas a verba só sustenta ${maxAdSetsThatLearn} conjunto(s) acima do piso de aprendizado — cortando para ${recommendedAdSets} para não fragmentar o sinal.`,
        );
      } else {
        reasoning.push(
          `Foram pedidos ${splitsRequested} públicos, acima do teto de consolidação de ${maxAdSets} — cortando para ${recommendedAdSets}; o Andromeda premia concentrar a verba.`,
        );
      }
    } else if (maxAdSetsThatLearn > recommendedAdSets) {
      // Há folga de verba, mas consolidar segue sendo a aposta padrão.
      verdict = "pode_dividir";
      reasoning.push(
        `Há folga: a verba sustentaria ${maxAdSetsThatLearn} conjuntos, mas manter ${recommendedAdSets} concentra o aprendizado — o Andromeda ainda prefere 1 conjunto broad. Dividir só se houver hipótese real de público.`,
      );
    } else {
      verdict = "ok";
      reasoning.push(
        `${recommendedAdSets} conjunto(s) é o ponto de equilíbrio: cada um fica acima do piso de aprendizado sem fragmentar o sinal.`,
      );
    }
  }

  const budgetPerAdSetWeekly = weeklyBudget / recommendedAdSets;
  const dailyBudgetPerAdSetBrl = r2(budgetPerAdSetWeekly / 7);
  const exitsLearning = budgetPerAdSetWeekly / cpl + EPS >= learningEventsPerWeek;

  reasoning.push(
    `Distribuindo R$ ${brl(weeklyBudget)} em ${recommendedAdSets} conjunto(s): R$ ${brl(dailyBudgetPerAdSetBrl)}/dia por conjunto (~${Math.round(budgetPerAdSetWeekly / cpl)} conversões/semana cada).`,
  );

  return {
    maxAdSetsThatLearn,
    recommendedAdSets,
    dailyBudgetPerAdSetBrl,
    expectedConversionsPerWeek,
    exitsLearning,
    minWeeklyToExitLearningBrl,
    verdict,
    reasoning,
    assumptions,
  };
}
