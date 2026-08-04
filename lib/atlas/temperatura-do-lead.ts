/**
 * ── A TEMPERATURA DA LEAD: UM número, escrito em cinco lugares ──────────────
 *
 * O cartão "Leads quentes" do diretor anuncia o critério "Score alto OU
 * temperatura quente", como se fossem dois testes independentes. Não são.
 *
 * MEDIDO POR EXECUÇÃO em 2026-08-02 (`calculateLeadScore` chamada com o payload
 * máximo da porta de criação por API):
 *
 *     calculateLeadScore({ email, phone, budgetMax, preferredRegions,
 *                          bedrooms, purpose, status: "novo" })
 *       => { score: 70, temperature: "quente" }
 *
 * No INSTANTE em que o score encosta em 70, o próprio scorer já grava
 * `temperature: "quente"` — porque 70 é, literalmente, a fronteira de "quente"
 * do scorer (`lib/atlas/scoring.ts`) E a fronteira de "quente" do qualificador
 * de IA (`lib/ai/lead-qualification.ts`). O corte que o leitor usa para dizer
 * "qualificado" (`CAMPAIGN_QUALITY_QUALIFIED_SCORE`) é ESSE MESMO 70, escolhido
 * por outra pessoa, em outro arquivo, como literal solto.
 *
 * Consequência: `score_ia >= 70 OU temperature === "quente"` é `X OU X`. A
 * metade "score alto" não pode acrescentar UMA lead que a metade "temperatura
 * quente" já não acrescente — sempre que a temperatura tiver sido DERIVADA.
 * Não é uma metade morta por azar de dados: é a mesma metade escrita duas
 * vezes.
 *
 * MEDIDO NO BANCO VIVO em 2026-08-02 (490 leads, org de produção):
 *   · máximo de `score_ia` na organização inteira ............ 63
 *   · leads com `score_ia >= 70` ............................. 0
 *   · leads com `temperature = 'quente'` ..................... 3
 *   · score_ia dessas 3 ................................ 45, 50, 50
 *
 * As três acendem pela temperatura DECLARADA por humano na Lead 360 (o valor
 * enviado vence, `lib/compat/payload-de-lead.ts`), a scores de 45 a 50 — bem
 * abaixo de 70. Zero acenderam pelo score, nunca.
 *
 * E o teto alcançável por porta de entrada, MEDIDO chamando o scorer (o
 * contrato `tests/contracts/uma-fronteira-de-quente.test.mjs` refaz esta conta
 * a cada execução, não confia neste comentário):
 *   · ingestão Meta/portal (email+phone) ..................... 25
 *   · importação de planilha (email+phone+etapa) ............. 45
 *   · criação por API (cadastro impecável, 6 campos) ......... 70  ← empate
 *   · PATCH com etapa avançada .............................. 90
 *
 * Por isso a correção NÃO é baixar o limiar: 70 não é um número arbitrário do
 * leitor, é a definição de "quente" do produto inteiro. Baixá-lo para acender
 * o cartão redefiniria "quente" para o CRM todo em silêncio. A correção é
 * PARAR DE ESCOLHER O NÚMERO DUAS VEZES: uma constante só, exportada daqui,
 * importada pelo scorer, pelo qualificador de IA, pelos sinais de atenção e
 * pelo leitor de qualidade de campanha. Quem quiser mudar o que é "quente"
 * muda aqui, e muda para todo mundo ao mesmo tempo — que é o único jeito de as
 * duas metades do critério continuarem concordando.
 *
 * Módulo PURO e sem NENHUM import, de propósito: ele é carregado por
 * `lib/atlas/scoring.ts`, por `lib/atlas/campaign-quality.ts` (que roda em
 * `node --test`), por `lib/atlas/attention-signals.ts` (que arrasta
 * `server-only`) e por telas de cliente. Qualquer import aqui dentro
 * contaminaria os quatro.
 */

/**
 * A fronteira de "quente". É simultaneamente:
 *   · o corte em que `calculateLeadScore` passa a devolver temperature "quente";
 *   · o corte em que `qualifyRealEstateLead` passa a devolver "quente";
 *   · o corte que `isQualifiedLead` usa para dizer "qualificado de cadastro";
 *   · o corte de `hotLeads` em broker-daily, manager-daily e director-daily.
 *
 * Eram cinco literais 70 independentes. Agora é um.
 */
export const HOT_SCORE_THRESHOLD = 70;

/** Fronteira de "morno" do scorer de cadastro (`lib/atlas/scoring.ts`). */
export const WARM_SCORE_THRESHOLD = 35;

/** Minúsculas sem acento — a base tem "MORNO", "FRIO" e "quente" convivendo. */
export function normalizeTemperature(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** A temperatura GRAVADA na coluna diz "quente"? (declarada por humano ou derivada na criação) */
export function isDeclaredHotTemperature(value: unknown): boolean {
  return normalizeTemperature(value) === "quente";
}

/**
 * Score numérico declarado, ou `null` quando não há medição.
 *
 * `Number(null) === 0`: tratar ausência como zero fazia lead nunca pontuada
 * entrar nas contas como "pontuada mal". Ausência de medição não é medição.
 */
export function readScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A lead está quente?
 *
 * Mantém as DUAS provas de propósito, e a razão é medida: `temperature` congela
 * no valor do nascimento (o PATCH preserva o atual e só recalcula a derivada
 * quando a coluna está vazia — `lib/compat/payload-de-lead.ts`), enquanto
 * `score_ia` é recalculado a cada escrita. Uma lead que esquentou DEPOIS de
 * nascer só aparece pelo score; uma lead que um humano marcou como quente à
 * mão só aparece pela coluna. São duas PROVENIÊNCIAS do mesmo fato, não dois
 * fatos — e é assim que o critério tem de ser anunciado.
 *
 * O que NÃO pode voltar a acontecer é o corte do score ser um número diferente
 * da fronteira de "quente" do scorer: aí sim as duas provas passariam a falar
 * de coisas diferentes com o mesmo nome.
 */
export function isHotLead(lead: { score_ia?: unknown; temperature?: unknown }): boolean {
  if (isDeclaredHotTemperature(lead.temperature)) return true;
  const score = readScore(lead.score_ia);
  return score !== null && score >= HOT_SCORE_THRESHOLD;
}

/**
 * O critério, escrito UMA vez, para as telas imprimirem em vez de redigirem.
 *
 * A frase antiga ("Score alto ou temperatura quente") vendia dois caminhos
 * independentes. Esta diz o que o produto de fato testa: um fato, duas
 * proveniências — e o número que define "quente" sai da constante, não de um
 * "70" digitado no meio do JSX.
 */
export const HOT_LEAD_CRITERION =
  `Temperatura quente: declarada na Lead 360 ou derivada pelo scorer (score_ia >= ${HOT_SCORE_THRESHOLD}). `
  + `${HOT_SCORE_THRESHOLD} é a MESMA fronteira que faz o scorer gravar "quente" — não é um segundo critério.`;

/** Versão curta para caber em rodapé de cartão. */
export const HOT_LEAD_CRITERION_SHORT =
  `Temperatura quente (declarada ou derivada de score_ia >= ${HOT_SCORE_THRESHOLD})`;
