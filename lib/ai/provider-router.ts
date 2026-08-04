import "server-only";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { assessAIComplexity } from "@/lib/ai/complexity";
import { planCommercialAI, type AIExecutionPlan, type RoutedProvider } from "@/lib/ai/commercial-orchestrator";
import { AI_GUARD_SYSTEM_POLICY, assessAIInput, inspectAndSanitizeAIOutput } from "@/lib/ai/instruction-output-guard";
import { pedirPermissaoDeIA, agenteDaFeature } from "@/lib/ai/limitador-de-ia";
import { tentativaFalhaDe, type TentativaFalha } from "@/lib/ai/falha-de-ia";

export type AITask = "fast" | "commercial" | "reasoning" | "research";
export type GenerateInput = {
  task: AITask;
  system: string;
  prompt: string;
  containsPersonalData?: boolean;
  timeoutMs?: number;
  organizationId: string;
  userId?: string;
  feature: string;
  signal?: AbortSignal;
};
export type AIProviderResult = {
  text: string;
  provider: "openai" | "anthropic" | "perplexity" | "local" | EconomyProvider;
  model: string;
  latencyMs: number;
  citations: string[];
  providerRequestId?: string;
  // cachedInputTokens/cacheWriteTokens: sem capturá-los, todo token de entrada é
  // precificado à tarifa cheia e nenhuma economia de cache de prompt é verificável.
  /**
   * `providerReportedCostUsd`: o custo que o PRÓPRIO provedor informou na
   * resposta. Não é preço inventado — é número medido, e ganha de qualquer
   * tarifa cadastrada.
   *
   * Medido em 2026-07-30 contra a API real: a Perplexity devolve
   * `usage.cost.request_cost = 0.005` — uma taxa POR REQUISIÇÃO, além dos
   * tokens. `usageCost()` só sabia tarifa por milhão de tokens, então gravava
   * US$ 0,011459 para as 21 chamadas cobráveis quando o mínimo informado pela
   * própria API era US$ 0,1198: subestimativa de 10,5x.
   *
   * É exatamente por isso que o teto principal do orçamento é em CHAMADAS e
   * TOKENS, e não em dinheiro. Ver lib/ai/orcamento-de-ia.ts.
   */
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number; cacheWriteTokens?: number; providerReportedCostUsd?: number | null };
  cost?: {
    inputUsd: number | null;
    outputUsd: number | null;
    estimatedUsd: number | null;
    pricingConfigured: boolean;
    pricingSource: string;
  };
  guardrail?: { risk: "low" | "medium" | "high"; blocked: boolean; humanReviewRequired: boolean; findingCodes: string[] };
  /**
   * Provedores que falharam ANTES do que respondeu, em ordem de tentativa.
   *
   * Vazio (ou ausente) significa "nenhuma falha no caminho". Não-vazio com
   * `provider: "local"` é o caso caro: a IA não atendeu e isto é a única
   * resposta a "por que?" — antes ela existia apenas no PM2 da Hostinger.
   * Presente mesmo em sucesso: failover que dá certo escondia a falha do meio.
   */
  falhas?: TentativaFalha[];
};

export type EconomyProvider =
  | "deepseek" | "qwen" | "kimi" | "glm"
  | "gemini" | "groq" | "cerebras" | "mistral" | "openrouter" | "ollama";

/**
 * Provedores compatíveis com a API da OpenAI (mesmo corpo /chat/completions).
 * Todos passam pelo MESMO caminho de chamada, com os mesmos guardrails: bloqueio
 * para dado pessoal, timeout, retry e registro de uso.
 *
 * `gratuito: true` marca os que têm camada sem custo. Isso NÃO significa "sem
 * limite": significa que a tarifa é zero até o teto do provedor, e o teto é
 * deles, não nosso. Por isso o custo continua sendo registrado como medido = 0
 * em vez de "não precificado" — zero conhecido é diferente de preço ausente.
 *
 * `requerChave: false` existe para o Ollama, que roda no próprio servidor e não
 * tem chave. Sem esse campo o guard de configuração o bloquearia para sempre.
 */
type ProvedorCompativel = {
  key: string;
  model: string;
  baseUrl: string;
  gratuito?: boolean;
  requerChave?: boolean;
  /** Onde obter a credencial. Aparece no diagnóstico, não em log de execução. */
  origem: string;
};

const economyProviders: Record<EconomyProvider, ProvedorCompativel> = {
  deepseek: { key: "DEEPSEEK_API_KEY", model: "ATLAS_DEEPSEEK_MODEL", baseUrl: "https://api.deepseek.com/chat/completions", origem: "platform.deepseek.com" },
  qwen: { key: "QWEN_API_KEY", model: "ATLAS_QWEN_MODEL", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", origem: "dashscope.aliyun.com" },
  kimi: { key: "KIMI_API_KEY", model: "ATLAS_KIMI_MODEL", baseUrl: "https://api.moonshot.ai/v1/chat/completions", origem: "platform.moonshot.ai" },
  glm: { key: "GLM_API_KEY", model: "ATLAS_GLM_MODEL", baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions", origem: "open.bigmodel.cn" },

  // ── Camada gratuita ────────────────────────────────────────────────────────
  // Entram porque a camada paga está parada: OpenAI sem saldo e Anthropic com
  // chave inválida, medidos em 2026-07-26. Sem alternativa sem custo, briefing,
  // copy e qualificação simplesmente não rodam.
  gemini: { key: "GEMINI_API_KEY", model: "ATLAS_GEMINI_MODEL", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", gratuito: true, origem: "aistudio.google.com/apikey" },
  groq: { key: "GROQ_API_KEY", model: "ATLAS_GROQ_MODEL", baseUrl: "https://api.groq.com/openai/v1/chat/completions", gratuito: true, origem: "console.groq.com/keys" },
  cerebras: { key: "CEREBRAS_API_KEY", model: "ATLAS_CEREBRAS_MODEL", baseUrl: "https://api.cerebras.ai/v1/chat/completions", gratuito: true, origem: "cloud.cerebras.ai" },
  mistral: { key: "MISTRAL_API_KEY", model: "ATLAS_MISTRAL_MODEL", baseUrl: "https://api.mistral.ai/v1/chat/completions", gratuito: true, origem: "console.mistral.ai" },
  openrouter: { key: "OPENROUTER_API_KEY", model: "ATLAS_OPENROUTER_MODEL", baseUrl: "https://openrouter.ai/api/v1/chat/completions", gratuito: true, origem: "openrouter.ai/keys (modelos com sufixo :free)" },
  // Roda no próprio servidor. Custo zero de verdade e nenhum dado sai da
  // máquina — é o único da lista que pode receber dado pessoal sem contrato.
  ollama: { key: "", model: "ATLAS_OLLAMA_MODEL", baseUrl: "http://127.0.0.1:11434/v1/chat/completions", gratuito: true, requerChave: false, origem: "ollama.com (auto-hospedado)" },
};

/** Provedores com camada sem custo, na ordem em que costumam responder melhor. */
export const provedoresGratuitos = (Object.keys(economyProviders) as EconomyProvider[])
  .filter((nome) => economyProviders[nome].gratuito === true);

export function catalogoDeProvedoresGratuitos() {
  return provedoresGratuitos.map((nome) => {
    const config = economyProviders[nome];
    return {
      provedor: nome,
      variavelDeChave: config.key || null,
      variavelDeModelo: config.model,
      requerChave: config.requerChave !== false,
      configurado: (config.requerChave === false || Boolean(process.env[config.key])) && Boolean(process.env[config.model]),
      origem: config.origem,
    };
  });
}

// Os modelos padrão vivem em `model-profiles.ts`, fora deste arquivo, porque
// aqui há `import "server-only"` e nenhum script consegue carregá-lo — foi por
// isso que o portão de tarifas raspava o fonte com regex em vez de perguntar.
// Reexportado para os 40 módulos que já importavam daqui não precisarem mudar.
export { aiModelProfiles } from "./model-profiles";
import { aiModelProfiles } from "./model-profiles";

export function selectCopilotTask(prompt: string): Exclude<AITask, "research"> {
  return assessAIComplexity(prompt).task;
}

type TierPrefix = "FAST" | "COMMERCIAL" | "REASONING" | "RESEARCH";
function tierPrefix(task: AITask): TierPrefix {
  return task === "fast" ? "FAST" : task === "commercial" ? "COMMERCIAL" : task === "research" ? "RESEARCH" : "REASONING";
}

// `ModelFamily`/`modelFamily` vivem em `model-profiles.ts`: são conhecimento
// sobre MODELO, não sobre transporte, e o portão de tarifas precisa deles.
export { modelFamily, type ModelFamily } from "./model-profiles";
import { modelFamily, problemaNoNomeDoModelo } from "./model-profiles";


/**
 * O padrão da OpenAI para um tier, quando a variável do tier não serve.
 *
 * Deriva de `aiModelProfiles()` em vez de repetir os nomes: eram duas cópias da
 * mesma verdade, e a segunda continuaria em `gpt-5.2` (modelo que já não
 * aparece na lista da OpenAI) depois de a primeira ser corrigida. Esta função é
 * chamada justamente no caminho de recuperação — o pior lugar para servir um
 * modelo aposentado, porque já se está tratando outro erro.
 */
const openAIDefaultModel = (task: AITask) => {
  const perfis = aiModelProfiles();
  return task === "fast" ? perfis.fast : task === "commercial" ? perfis.commercial : perfis.reasoning;
};

export type ResolvedModel = { model: string; source: string; problem: string | null };

/**
 * O modelo é função do par (tier, provedor), não do tier: o mesmo tier pode ser
 * servido por OpenAI ou Anthropic conforme a ordem configurada, e o caminho de
 * dado pessoal força OpenAI ignorando a ordem. Uma única variável por tier é o
 * que fazia um nome de modelo Anthropic ser enviado à API da OpenAI.
 */
export function resolveProviderModel(task: AITask, provider: "openai" | "anthropic"): ResolvedModel {
  const prefix = tierPrefix(task);
  /**
   * Nome truncado é recusado ANTES da chamada. `OPENAI_MODEL=gpt-5.6-` existia no
   * ambiente real e devolvia HTTP 400 model_not_found: uma chamada gasta para
   * descobrir o que o nome já dizia. Devolver `model: ""` faz o provedor lançar e
   * o roteador seguir para o próximo da ordem — que aqui é a Perplexity, viva.
   */
  const recusarForma = (model: string, source: string): ResolvedModel | null => {
    const problema = problemaNoNomeDoModelo(model);
    return problema
      ? { model: "", source, problem: `Tier ${task}: ${source}=${problema}. Nenhuma chamada foi gasta para descobrir isso.` }
      : null;
  };
  if (provider === "anthropic") {
    const candidates: Array<[string, string | undefined]> = [
      [`ATLAS_AI_${prefix}_MODEL_ANTHROPIC`, process.env[`ATLAS_AI_${prefix}_MODEL_ANTHROPIC`]],
      ["ATLAS_ANTHROPIC_MODEL", process.env.ATLAS_ANTHROPIC_MODEL],
      ["ATLAS_CLAUDE_MODEL", process.env.ATLAS_CLAUDE_MODEL],
    ];
    const chosen = candidates.find(([, value]) => Boolean(value && value.trim()));
    // Sem default implícito: o tier mais caro jamais deve ser servido pelo modelo
    // mais caro por omissão de variável.
    if (!chosen) return { model: "", source: "ausente", problem: `Tier ${task}: nenhum modelo Anthropic configurado — defina ATLAS_ANTHROPIC_MODEL.` };
    const model = String(chosen[1]).trim();
    const forma = recusarForma(model, chosen[0]);
    if (forma) return forma;
    const family = modelFamily(model);
    if (family !== "anthropic" && family !== "desconhecida") return { model: "", source: chosen[0], problem: `Tier ${task}: ${chosen[0]}="${model}" é da família ${family} e não pode ser enviado à API da Anthropic.` };
    return { model, source: chosen[0], problem: null };
  }
  const explicit = process.env[`ATLAS_AI_${prefix}_MODEL_OPENAI`]?.trim();
  if (explicit) {
    const forma = recusarForma(explicit, `ATLAS_AI_${prefix}_MODEL_OPENAI`);
    if (forma) return forma;
    const explicitFamily = modelFamily(explicit);
    if (explicitFamily === "openai" || explicitFamily === "desconhecida") return { model: explicit, source: `ATLAS_AI_${prefix}_MODEL_OPENAI`, problem: null };
    return { model: openAIDefaultModel(task), source: "padrao_openai", problem: `Tier ${task}: ATLAS_AI_${prefix}_MODEL_OPENAI="${explicit}" é da família ${explicitFamily}; servindo ${openAIDefaultModel(task)} para não derrubar o tier.` };
  }
  // O tier research é servido pela Perplexity; quando o caminho de dado pessoal
  // força OpenAI, o modelo correto é o de raciocínio — nunca "sonar".
  const baseTask: AITask = task === "research" ? "reasoning" : task;
  const basePrefix = tierPrefix(baseTask);
  const tierModel = String(aiModelProfiles()[baseTask] || "").trim();
  if (!tierModel) return { model: openAIDefaultModel(baseTask), source: "padrao_openai", problem: null };
  const forma = recusarForma(tierModel, `ATLAS_AI_${basePrefix}_MODEL`);
  if (forma) return forma;
  const family = modelFamily(tierModel);
  if (family === "openai" || family === "desconhecida") return { model: tierModel, source: `ATLAS_AI_${basePrefix}_MODEL`, problem: null };
  return { model: openAIDefaultModel(baseTask), source: "padrao_openai", problem: `Tier ${task}: ATLAS_AI_${basePrefix}_MODEL="${tierModel}" é da família ${family} e estava sendo enviado à API da OpenAI. Defina ATLAS_AI_${basePrefix}_MODEL_OPENAI ou corrija a variável — declaração duplicada no .env vence pela última ocorrência.` };
}

/* A regra de preço mudou de casa em 01/08/2026, sem mudar de comportamento.
   Ela morava aqui, e aqui nenhum teste conseguia carregá-la: este arquivo abre
   com `import "server-only"` e puxa mais nove módulos com alias `@/`. A regra
   mais importante do FinOps — "sem tarifa, o custo é NULO, não zero" — não
   tinha contrato nenhum, e só se sabia que funcionava lendo o código.
   Agora mora em `lib/ai/tarifa-de-ia.ts`, sem dependência, com contrato em
   tests/contracts/tarifa-de-ia.test.mjs. Aqui fica a porta, para nenhum
   chamador precisar mudar. */
import { usageCost, priceTable, tariffFor, type AITariff } from "./tarifa-de-ia";
export { usageCost, priceTable, tariffFor, type AITariff };

// Herança: tarifa por tier. Mantida apenas para AVISAR que foi ignorada — o
// operador que preencheu ATLAS_AI_<TIER>_INPUT_USD_PER_MILLION precisa saber que
// o preço passou a ser por par (provedor, modelo).
function legacyTierPricingDeclared(task: AITask) {
  const prefix = tierPrefix(task);
  return Boolean(String(process.env[`ATLAS_AI_${prefix}_INPUT_USD_PER_MILLION`] || "").trim() || String(process.env[`ATLAS_AI_${prefix}_OUTPUT_USD_PER_MILLION`] || "").trim());
}

function isRoutedProvider(value: string): value is RoutedProvider {
  return value === "openai" || value === "anthropic" || value === "perplexity" || value === "local" || value in economyProviders;
}

function parseProviderOrder(task: AITask) {
  const raw = String(process.env[`ATLAS_AI_${tierPrefix(task)}_PROVIDER_ORDER`] || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return { order: raw.filter(isRoutedProvider), discarded: raw.filter((value) => !isRoutedProvider(value)) };
}

function providerModelFor(task: AITask, provider: RoutedProvider): ResolvedModel {
  if (provider === "openai" || provider === "anthropic") return resolveProviderModel(task, provider);
  if (provider === "perplexity") return { model: aiModelProfiles().research, source: "ATLAS_RESEARCH_MODEL", problem: null };
  if (provider === "local") return { model: "deterministic-safe-fallback", source: "local", problem: null };
  const variable = economyProviders[provider].model;
  const configured = String(process.env[variable] || "").trim();
  return configured ? { model: configured, source: variable, problem: null } : { model: "", source: variable, problem: `Tier ${task}: ${provider} está na ordem de provedores mas ${variable} não está definida.` };
}

export type AIRoutingDiagnostic = {
  tier: AITask;
  providerOrder: RoutedProvider[];
  discardedOrderTokens: string[];
  models: Array<{ provider: RoutedProvider; model: string | null; source: string; tariffConfigured: boolean }>;
  problems: string[];
  pricingNotes: string[];
  ready: boolean;
  pricingConfigured: boolean;
};

/**
 * Validação de arranque do roteamento: falha ALTO (log estruturado + readiness
 * false do tier) quando o modelo não casa com a família do provedor da vez ou
 * quando um token da ordem de provedores é descartado pelo filtro — hoje o token
 * inválido some em silêncio e ninguém percebe que o tier caiu de pé no chão.
 * Nunca derruba o processo: diagnóstico é observabilidade, não gate de boot.
 */
export function aiRoutingDiagnostics(): AIRoutingDiagnostic[] {
  const readiness = aiProviderReadiness();
  return (["fast", "commercial", "reasoning", "research"] as AITask[]).map((tier) => {
    const { order, discarded } = parseProviderOrder(tier);
    const plan = planCommercialAI({ task: tier, feature: "routing-diagnostics", configuredOrder: order, available: readiness });
    // OpenAI entra sempre na verificação: o caminho de dado pessoal força
    // providerOrder ["openai","local"] e ignora a ordem configurada do tier.
    const checked = [...new Set<RoutedProvider>([...plan.providerOrder, "openai"])];
    const problems: string[] = [];
    const pricingNotes: string[] = [];
    if (discarded.length) problems.push(`Tier ${tier}: token inválido descartado da ordem de provedores: ${discarded.join(", ")}.`);
    const models = checked.map((provider) => {
      const resolved = providerModelFor(tier, provider);
      if (resolved.problem) problems.push(resolved.problem);
      const tariffConfigured = provider === "local" ? true : Boolean(tariffFor(provider, resolved.model).tariff);
      if (!tariffConfigured) pricingNotes.push(`Sem tarifa cadastrada para ${provider}/${resolved.model || "modelo_desconhecido"} em ATLAS_AI_PRICE_TABLE.`);
      return { provider, model: resolved.model || null, source: resolved.source, tariffConfigured };
    });
    if (legacyTierPricingDeclared(tier)) pricingNotes.push(`Tier ${tier}: ATLAS_AI_${tierPrefix(tier)}_INPUT_USD_PER_MILLION / _OUTPUT_USD_PER_MILLION foram ignoradas — a tarifa agora é por par (provedor, modelo).`);
    return { tier, providerOrder: plan.providerOrder, discardedOrderTokens: discarded, models, problems, pricingNotes, ready: problems.length === 0, pricingConfigured: models.every((item) => item.tariffConfigured) };
  });
}

export function aiRoutingReadiness() {
  const diagnostics = aiRoutingDiagnostics();
  const ready = (task: AITask) => diagnostics.find((item) => item.tier === task)?.ready ?? false;
  return { fast: ready("fast"), commercial: ready("commercial"), reasoning: ready("reasoning"), research: ready("research"), diagnostics };
}

export function aiPricingReadiness() {
  const diagnostics = aiRoutingDiagnostics();
  const priced = (task: AITask) => diagnostics.find((item) => item.tier === task)?.pricingConfigured ?? false;
  return { fast: priced("fast"), commercial: priced("commercial"), reasoning: priced("reasoning"), research: priced("research") };
}

let routingDiagnosticsLogged = false;
export function logAIRoutingDiagnosticsOnce() {
  if (routingDiagnosticsLogged) return;
  routingDiagnosticsLogged = true;
  try {
    for (const diagnostic of aiRoutingDiagnostics()) {
      if (diagnostic.problems.length) logger.error("ai.routing_misconfigured", { tier: diagnostic.tier, providerOrder: diagnostic.providerOrder, discardedOrderTokens: diagnostic.discardedOrderTokens, problems: diagnostic.problems });
      if (diagnostic.pricingNotes.length) logger.warn("ai.pricing_unconfigured", { tier: diagnostic.tier, pricingNotes: diagnostic.pricingNotes });
    }
  } catch {
    // Diagnóstico jamais impede o atendimento comercial.
  }
}

// Enquanto a migration de cache/procedência não é aplicada, o insert estendido
// falha uma vez, é avisado uma vez e as chamadas seguintes já vão diretas ao
// payload base — telemetria preservada sem round-trip desperdiçado por chamada.
let usageCacheColumnsMissing = false;

async function recordUsage(input: GenerateInput, result: AIProviderResult) {
  const cost = usageCost(result.provider, result.model, result.usage);
  try {
    const base = {
      organization_id: input.organizationId,
      user_id: input.userId || null,
      feature: input.feature,
      task: input.task,
      provider: result.provider,
      model: result.model,
      provider_request_id: result.providerRequestId || null,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
      latency_ms: result.latencyMs,
      input_cost_usd: cost.inputUsd,
      output_cost_usd: cost.outputUsd,
      estimated_cost_usd: cost.estimatedUsd,
    };
    if (usageCacheColumnsMissing) {
      await getSupabaseAdmin().from("ai_usage_events").insert(base);
      return { ...result, cost };
    }
    // `agent` viaja no payload estendido junto das colunas de cache porque
    // compartilha o mesmo destino de falha: ambiente sem a migration aplicada.
    // Sem a coluna, o teto POR AGENTE não tem o que contar — e é por isso que a
    // migration 20260730050000 também preencheu o histórico já medido.
    const { error } = await getSupabaseAdmin()
      .from("ai_usage_events")
      .insert({ ...base, agent: agenteDaFeature(input.feature), cached_input_tokens: result.usage.cachedInputTokens ?? 0, cache_write_tokens: result.usage.cacheWriteTokens ?? 0, pricing_source: cost.pricingSource });
    if (error) {
      // Só desliga a captura estendida quando o erro é de schema; falha
      // transitória não pode aposentar a telemetria de cache até o próximo deploy.
      if (/column|schema cache|PGRST204/i.test(`${error.code || ""} ${error.message || ""}`)) usageCacheColumnsMissing = true;
      logger.warn("ai.usage_cache_columns_missing", { reason: error.message });
      await getSupabaseAdmin().from("ai_usage_events").insert(base);
    }
  } catch {
    // Telemetria nunca deve impedir a resposta comercial.
  }
  return { ...result, cost };
}

// ── O DESFECHO, INCLUSIVE QUANDO É FALHA ──────────────────────────────────────
//
// Enquanto a migration 20260802140000 não é aplicada, o insert com as colunas de
// causa falha UMA vez, avisa UMA vez, e as chamadas seguintes já vão direto ao
// payload base — mesmo padrão de `usageCacheColumnsMissing`, e pela mesma razão:
// telemetria não pode gastar round-trip por chamada nem sumir por completo.
let orchestrationErrorColumnsMissing = false;

/**
 * Grava a decisão de roteamento COM o desfecho.
 *
 * `tentativas` são os provedores que falharam no caminho. Sem elas, um failover
 * bem-sucedido apagava a falha: a Perplexity respondia, a linha saía como
 * `completed`, e as 48 falhas de OpenAI medidas em 02/08/2026 não deixavam
 * rastro nenhum no banco.
 *
 * `status` agora distingue o que 'fallback' confundia:
 *   · 'failed'   — havia provedor externo na ordem, TODOS falharam, sobrou o local;
 *   · 'fallback' — o plano escolheu o local sem que nada falhasse (operação normal);
 *   · 'completed'— um provedor externo atendeu (mesmo que outro tenha falhado antes).
 */
async function recordOrchestration(input:GenerateInput,plan:AIExecutionPlan,result:AIProviderResult,tentativas:TentativaFalha[]=[],nadaFoiServido=false){
  const caiuNoLocal=result.provider==="local";
  const status=caiuNoLocal?(tentativas.length?"failed":"fallback"):"completed";
  const principal=tentativas[0]??null;
  // `nadaFoiServido` separa dois casos que a coluna `selected_provider` confundiria:
  //   · roteador: todos falharam, mas o texto determinístico FOI entregue ao
  //     corretor — 'local' é verdade, alguém serviu;
  //   · homologação: o erro subiu para a rota e NINGUÉM serviu — gravar 'local'
  //     ali afirmaria uma entrega que não houve.
  // A coluna é nulável exatamente para poder dizer "nada foi selecionado".
  const servidoPor=nadaFoiServido?null:result.provider;
  const base={organization_id:input.organizationId,user_id:input.userId||null,feature:input.feature,requested_task:plan.requestedTask,resolved_task:plan.resolvedTask,data_class:plan.dataClass,risk_level:plan.riskLevel,provider_order:plan.providerOrder,selected_provider:servidoPor,selected_model:nadaFoiServido?null:result.model,token_budget:plan.tokenBudget,routing_reasons:plan.routingReasons,human_review_required:plan.humanReviewRequired,fallback_used:caiuNoLocal&&!nadaFoiServido,status,latency_ms:result.latencyMs,total_tokens:result.usage.totalTokens,estimated_cost_usd:usageCost(result.provider,result.model,result.usage).estimatedUsd,completed_at:new Date().toISOString()};
  try{
    const admin=getSupabaseAdmin();
    if(orchestrationErrorColumnsMissing||!tentativas.length){await admin.from("ai_orchestration_decisions").insert(base);return}
    const {error}=await admin.from("ai_orchestration_decisions").insert({...base,error_class:principal?.classe??null,error_code:principal?.codigo??null,error_message:principal?.mensagem??null,who_resolves:principal?.quemResolve??null,provider_attempts:tentativas});
    if(error){
      // Só aposenta a captura quando o erro é de ESQUEMA; falha transitória não
      // pode desligar o registro de causa até o próximo deploy.
      if(/column|schema cache|PGRST204/i.test(`${error.code||""} ${error.message||""}`))orchestrationErrorColumnsMissing=true;
      logger.warn("ai.orchestration_error_columns_missing",{reason:error.message,migration:"20260802140000_causa_da_falha_de_ia.sql"});
      await admin.from("ai_orchestration_decisions").insert(base);
    }
  }catch{/* Auditoria indisponível não derruba o atendimento. */}
}

function openAIText(output: unknown) {
  if (!output || typeof output !== "object") return "";
  const items =
    (
      output as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      }
    ).output ?? [];
  return items
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("")
    .trim();
}

async function generateOpenAI(input: GenerateInput): Promise<AIProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
  const profile =
    input.task === "fast"
      ? {
          effort: "none",
          verbosity: "low",
          maxOutputTokens: 600,
        }
      : input.task === "commercial"
        ? {
            effort: "low",
            verbosity: "low",
            maxOutputTokens: 1200,
          }
        : {
            effort: "medium",
            verbosity: "medium",
            maxOutputTokens: 2400,
          };
  const resolved = resolveProviderModel(input.task, "openai");
  if (resolved.problem) logger.error("ai.model_family_mismatch", { provider: "openai", task: input.task, feature: input.feature, problem: resolved.problem, effectiveModel: resolved.model });
  // Sem modelo válido a chamada NÃO é feita: o failover segue para o próximo
  // provedor da ordem. A Anthropic já fazia isso; a OpenAI seguia com `model: ""`
  // e queimava uma chamada (mais o retry) para receber model_not_found.
  if (!resolved.model) throw new Error(resolved.problem || "Modelo OpenAI não configurado.");
  const model = resolved.model;
  const startedAt = Date.now();
  const chamar = (effort: string) => resilientFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: input.system,
      input: input.prompt,
      reasoning: { effort },
      text: { verbosity: profile.verbosity },
      max_output_tokens: profile.maxOutputTokens,
      prompt_cache_key: `atlas:${input.feature}:${input.task}:v1`,
    }),
    signal: input.signal,
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: "OpenAI" });

  type CorpoOpenAI = {
    id?: string;
    error?: { message?: string; code?: string };
    output?: unknown[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };

  let response = await chamar(profile.effort);
  let body = (await response.json()) as CorpoOpenAI;

  // ── O VOCABULÁRIO DE `effort` MUDA ENTRE GERAÇÕES DE MODELO ───────────────
  //
  // Medido contra a API real em 2026-07-27:
  //
  //   gpt-5.6-luna  aceita  none, low, medium, high, xhigh   (NÃO aceita minimal)
  //   gpt-5-mini    aceita  minimal, low, medium, high       (NÃO aceita none)
  //
  // Os conjuntos são disjuntos nas pontas. O tier rápido mandava `none` enquanto
  // o padrão era `gpt-5-mini`: HTTP 400 em 100% das chamadas rápidas, com ou sem
  // saldo, e o corretor via só "IA temporariamente indisponível".
  //
  // Fixar uma tabela modelo→vocabulário aqui envelheceria igual: foi assim que
  // o defeito nasceu. Em vez disso, a própria mensagem de erro da OpenAI lista
  // os valores aceitos ("Supported values are: 'none', 'low', ...") — dá para
  // ler e repetir uma vez. Não presume nada sobre o modelo; reage ao que a API
  // respondeu, e continua valendo para modelos que ainda não existem.
  if (!response.ok && body.error?.code === "unsupported_value" && /effort/i.test(body.error?.message || "")) {
    const aceitos = [...(body.error.message || "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    // `low` primeiro: é o único que apareceu nas duas famílias medidas, e é o
    // mais barato entre os que geram raciocínio.
    const alternativa = ["low", "minimal", "medium"].find((v) => aceitos.includes(v));
    if (alternativa) {
      logger.warn("ai.effort_incompativel", {
        provider: "openai", model, task: input.task,
        enviado: profile.effort, aceitos, repetindoCom: alternativa,
      });
      response = await chamar(alternativa);
      body = (await response.json()) as CorpoOpenAI;
    }
  }

  if (!response.ok)
    throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
  const text = openAIText(body);
  if (!text) throw new Error("OpenAI retornou resposta vazia.");
  const usage = {
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    totalTokens: body.usage?.total_tokens ?? 0,
    // input_tokens já inclui os cacheados; guardá-los à parte é o que torna a
    // economia de cache de prefixo mensurável em vez de artigo de fé.
    cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  };
  return {
    text,
    provider: "openai",
    model,
    latencyMs: Date.now() - startedAt,
    citations: [],
    providerRequestId:
      body.id || response.headers.get("x-request-id") || undefined,
    usage,
  };
}

async function generatePerplexity(
  input: GenerateInput,
): Promise<AIProviderResult> {
  if (input.containsPersonalData)
    throw new Error(
      "Pesquisa externa bloqueada para contexto com dados pessoais.",
    );
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY não configurada.");
  const model = aiModelProfiles().research;
  const startedAt = Date.now();
  const response = await resilientFetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
      search_context_size: "low",
    }),
    signal: input.signal,
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: "Perplexity" });
  const body = (await response.json()) as {
    id?: string;
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      // A Perplexity informa o custo da requisição na própria resposta, e
      // `request_cost` (US$ 0,005 medido em 2026-07-30) domina o custo de
      // chamadas curtas: 21 chamadas medidas custaram ~10,5x o que a tarifa por
      // token calculava. Sem ler isto, o custo gravado é ficção otimista.
      cost?: { total_cost?: number; request_cost?: number; input_tokens_cost?: number; output_tokens_cost?: number };
    };
  };
  if (!response.ok)
    throw new Error(
      body.error?.message || `Perplexity HTTP ${response.status}`,
    );
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Perplexity retornou resposta vazia.");
  const custoInformado = body.usage?.cost?.total_cost;
  const usage = {
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
    totalTokens: body.usage?.total_tokens ?? 0,
    providerReportedCostUsd:
      typeof custoInformado === "number" && Number.isFinite(custoInformado) ? custoInformado : null,
  };
  return {
    text,
    provider: "perplexity",
    model,
    latencyMs: Date.now() - startedAt,
    citations: body.citations ?? [],
    providerRequestId:
      body.id || response.headers.get("x-request-id") || undefined,
    usage,
  };
}

// Claude / Anthropic — Messages API (/v1/messages, header x-api-key + anthropic-version).
// Não é compatível com o formato OpenAI: system é campo próprio, resposta em content[].
// Bloqueado para dados pessoais (governança PII → somente OpenAI).
async function generateAnthropic(input: GenerateInput): Promise<AIProviderResult> {
  if (input.containsPersonalData) throw new Error("anthropic bloqueado para dados pessoais.");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const resolved = resolveProviderModel(input.task, "anthropic");
  // Sem modelo válido a chamada falha aqui e o failover segue para o próximo
  // provedor — melhor que servir o modelo mais caro por default implícito.
  if (!resolved.model) throw new Error(resolved.problem || "Modelo Anthropic não configurado.");
  const model = resolved.model;
  const maxTokens = input.task === "fast" ? 600 : input.task === "commercial" ? 1200 : 2400;
  const startedAt = Date.now();
  // Cache de prompt da Anthropic exige breakpoint explícito: sem cache_control não
  // existe cache algum, por mais estável que seja o prefixo do system.
  const system = input.system.trim() ? [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }] : undefined;
  const response = await resilientFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: input.prompt }],
    }),
    signal: input.signal,
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: "Anthropic" });
  const body = await response.json() as {
    id?: string; error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  if (!response.ok) throw new Error(body.error?.message || `Anthropic HTTP ${response.status}`);
  const text = (body.content ?? []).filter((block) => block.type === "text").map((block) => block.text || "").join("").trim();
  if (!text) throw new Error("Anthropic retornou resposta vazia.");
  const cachedInputTokens = body.usage?.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = body.usage?.cache_creation_input_tokens ?? 0;
  // Na Anthropic input_tokens EXCLUI os tokens de cache; somamos para que
  // inputTokens signifique sempre "tokens de entrada processados".
  const inputTokens = (body.usage?.input_tokens ?? 0) + cachedInputTokens + cacheWriteTokens;
  const outputTokens = body.usage?.output_tokens ?? 0;
  return {
    text, provider: "anthropic", model, latencyMs: Date.now() - startedAt, citations: [],
    providerRequestId: body.id || response.headers.get("request-id") || undefined,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cachedInputTokens, cacheWriteTokens },
  };
}

async function generateEconomyProvider(input: GenerateInput, provider: EconomyProvider): Promise<AIProviderResult> {
  if (input.containsPersonalData) throw new Error(`${provider} bloqueado para dados pessoais.`);
  const config = economyProviders[provider];
  const apiKey = config.key ? process.env[config.key] : "";
  const model = process.env[config.model];
  // Ollama roda local e não tem chave; exigir uma o bloquearia para sempre.
  const precisaDeChave = config.requerChave !== false;
  if ((precisaDeChave && !apiKey) || !model) throw new Error(`${provider} não configurado.`);
  const startedAt = Date.now();
  const response = await resilientFetch(process.env[`ATLAS_${provider.toUpperCase()}_BASE_URL`] || config.baseUrl, {
    method: "POST",
    headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }],
      temperature: input.task === "fast" ? 0.1 : 0.2,
      max_tokens: input.task === "fast" ? 600 : input.task === "commercial" ? 1200 : 2400,
      stream: false,
    }),
    signal: input.signal,
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: provider });
  const body = await response.json() as {
    id?: string; error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  if (!response.ok) throw new Error(body.error?.message || `${provider} HTTP ${response.status}`);
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider} retornou resposta vazia.`);
  return {
    text, provider, model, latencyMs: Date.now() - startedAt, citations: [],
    providerRequestId: body.id || response.headers.get("x-request-id") || undefined,
    usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0, totalTokens: body.usage?.total_tokens ?? 0 },
  };
}

function configuredEconomyProvider(provider: EconomyProvider) {
  const config = economyProviders[provider];
  // Provedor auto-hospedado (Ollama) não tem chave: exigir uma o deixaria
  // eternamente "não configurado" mesmo rodando na máquina.
  const chaveOk = config.requerChave === false ? true : Boolean(process.env[config.key]);
  return Boolean(chaveOk && process.env[config.model]);
}

export function aiProviderReadiness() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
    // Gerado a partir do registro, e não escrito à mão: provedor novo entrava no
    // catálogo e ficava fora da prontidão, o que o tornava inalcançável pela
    // ordem de provedores sem ninguém perceber.
    ...(Object.fromEntries(
      (Object.keys(economyProviders) as EconomyProvider[]).map((nome) => [nome, configuredEconomyProvider(nome)]),
    ) as Record<EconomyProvider, boolean>),
    localFallback: true,
    host: "hostinger" as const,
  };
}

function localFallback(input: GenerateInput): AIProviderResult {
  const text =
    input.task === "research"
      ? "Pesquisa atualizada indisponível neste momento. Não use esta resposta como evidência de mercado; tente novamente quando o provedor de pesquisa estiver disponível."
      : "A IA generativa está temporariamente indisponível. Preserve os indicadores determinísticos do CRM, não execute ações externas e encaminhe a decisão para revisão humana.";
  return {
    text,
    provider: "local",
    model: "deterministic-safe-fallback",
    latencyMs: 0,
    citations: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

export async function generateAIText(
  input: GenerateInput,
): Promise<AIProviderResult> {
  let result: AIProviderResult;
  logAIRoutingDiagnosticsOnce();
  const inputGuard=assessAIInput(input.system,input.prompt);
  const guardedInput={...input,system:`${input.system}\n\n${AI_GUARD_SYSTEM_POLICY}`};
  const recordGuard=async(stage:"input"|"output",guard:typeof inputGuard,provider?:string,model?:string)=>{if(!guard.findings.length)return;try{await getSupabaseAdmin().from("ai_guardrail_events").insert({organization_id:input.organizationId,user_id:input.userId||null,feature:input.feature,stage,risk_level:guard.risk,blocked:guard.blocked,human_review_required:guard.humanReviewRequired,finding_codes:guard.findings.map(f=>f.code),provider:provider||null,model:model||null})}catch{/* Guardrail funciona mesmo antes da migration. */}};
  await recordGuard("input",inputGuard);
  if(inputGuard.blocked){result=localFallback(input);result.text="Solicitação bloqueada pela proteção da IA. Remova instruções para revelar configurações, segredos, executar comandos ou ignorar regras. Se a necessidade for legítima, encaminhe para revisão humana.";result.guardrail={risk:inputGuard.risk,blocked:true,humanReviewRequired:true,findingCodes:inputGuard.findings.map(f=>f.code)};return recordUsage(input,result)}
  // ── O TETO, ANTES DE GASTAR (4.7 / §8) ────────────────────────────────────
  //
  // Aqui, e não dentro do laço de provedores: perguntar depois de escolher o
  // provedor já teria montado a chamada, e a recusa mais barata é a que acontece
  // antes de qualquer rede.
  const teto = await pedirPermissaoDeIA({
    organizationId: input.organizationId,
    usuarioId: input.userId,
    feature: input.feature,
    agente: agenteDaFeature(input.feature),
  });
  if (!teto.permitido) {
    // FALLBACK SEM IA: a recusa por teto devolve o caminho determinístico, não
    // um erro. O corretor continua com os indicadores do CRM.
    result = localFallback(input);
    result.text = `Orçamento de IA do dia atingido para esta rotina. ${teto.motivos.join(" ")} Os indicadores determinísticos do CRM seguem válidos; nenhuma ação externa foi executada.`;
    //
    // A recusa NÃO é gravada em ai_usage_events, de propósito.
    //
    // Gravá-la faria o medidor contar as próprias recusas: cada "não" viraria
    // uma chamada no total do dia, o teto apertaria mais, e a operação entraria
    // num laço em que a IA se tranca sozinha e cada tentativa piora a trava.
    // Consumo é o que gastou. Recusa gastou zero — e vive no log
    // `ia.recusada_por_teto`, que é onde se investiga por que a IA parou.
    return result;
  }
  // parseProviderOrder devolve também os tokens descartados, que antes sumiam em
  // silêncio: um typo na ordem ("anthropi") apagava o provedor sem nenhum sinal.
  const { order: configuredOrder } = parseProviderOrder(input.task);
  const readiness=aiProviderReadiness(),plan=planCommercialAI({task:input.task,containsPersonalData:input.containsPersonalData,feature:input.feature,configuredOrder,available:readiness});
  // ── "Trocar para modelo mais econômico" deixa de ser texto ────────────────
  //
  // O degrau do §8 só vale se mudar a ordem de quem atende. Com o teto encostado
  // (≥85%), os provedores de camada gratuita passam para a frente — o dado
  // pessoal continua fora dessa troca, porque `planCommercialAI` já força
  // ["openai","local"] nesse caminho e a ordem dele não é reordenável aqui.
  if (teto.degraus.includes("trocar_para_modelo_economico") && !input.containsPersonalData) {
    // Compara por STRING, não pelo tipo: `RoutedProvider` (em
    // commercial-orchestrator.ts) não inclui os 6 provedores de camada gratuita
    // — gemini, groq, cerebras, mistral, openrouter, ollama. Eles existem no
    // catálogo do roteador e passam por `isRoutedProvider` em tempo de execução,
    // mas o tipo do orquestrador nunca foi alargado. Reordenar só o que JÁ está
    // na ordem evita depender dessa divergência, em vez de fingir que ela não
    // existe alargando o tipo aqui.
    const gratuitos = new Set<string>(provedoresGratuitos);
    const naFrente = plan.providerOrder.filter((p) => gratuitos.has(p));
    if (naFrente.length) {
      plan.providerOrder = [...naFrente, ...plan.providerOrder.filter((p) => !gratuitos.has(p))];
      logger.warn("ia.trocou_para_economico", { feature: input.feature, ordem: plan.providerOrder, degraus: teto.degraus });
    }
  }
  result = localFallback(input);
  // As falhas do caminho. Antes elas viviam SÓ na linha `ai.provider_failover` do
  // PM2 da Hostinger — fora do alcance de quem opera. Medido em 02/08/2026: 48
  // tentativas de OpenAI, 0 respostas, e nenhuma linha no banco dizendo por quê.
  const falhas: TentativaFalha[] = [];
  for (const provider of plan.providerOrder) {
    if(provider==="local"){result=localFallback(input);break}
    try {
      result = provider === "openai" ? await generateOpenAI(guardedInput) : provider==="anthropic"?await generateAnthropic(guardedInput):provider==="perplexity"?await generatePerplexity(guardedInput):await generateEconomyProvider(guardedInput, provider);
      break;
    } catch (error) {
      if (input.signal?.aborted) {
        throw input.signal.reason instanceof Error
          ? input.signal.reason
          : new DOMException("Solicitação cancelada.", "AbortError");
      }
      const falha = tentativaFalhaDe(error, provider);
      falhas.push(falha);
      logger.warn("ai.provider_failover", {
        provider,
        task: input.task,
        feature: input.feature,
        containsPersonalData: Boolean(input.containsPersonalData),
        // A classe é o que torna a linha de log acionável sem abrir o texto:
        // credencial e cota são do dono da conta, configuração é do time técnico.
        classe: falha.classe,
        codigo: falha.codigo,
        quemResolve: falha.quemResolve,
        // `reason` continua sendo a frase do provedor, agora com segredo redigido
        // na origem — não dependendo só da redação genérica do logger.
        reason: falha.mensagem,
      });
    }
  }
  const inspected=inspectAndSanitizeAIOutput(result.text);result.text=inspected.text;result.guardrail={risk:inspected.assessment.risk,blocked:inspected.assessment.blocked,humanReviewRequired:inputGuard.humanReviewRequired||inspected.assessment.humanReviewRequired,findingCodes:[...inputGuard.findings,...inspected.assessment.findings].map(f=>f.code)};await recordGuard("output",inspected.assessment,result.provider,result.model);await recordOrchestration(input,plan,result,falhas);
  // `falhas` sobe junto da resposta: quem chamou consegue dizer ao operador POR QUE
  // veio o texto determinístico, em vez de mostrar "IA indisponível" sem causa.
  return { ...(await recordUsage(input, result)), falhas };
}

/**
 * ── O INSTRUMENTO DE TESTE PRECISA REGISTRAR A FALHA, NÃO SÓ O SUCESSO ───────
 *
 * `recordUsage(request, await generateOpenAI(request))` só grava quando a chamada
 * DÁ CERTO: se `generateOpenAI` lança, o `await` interrompe a expressão e
 * `recordUsage` nunca é alcançado. O teste que existe para diagnosticar falha era
 * justamente o que não deixava rastro dela.
 *
 * Medido em 02/08/2026: `perplexity-homologation` tem 8 linhas em ai_usage_events
 * e `openai-homologation` tem ZERO. A Perplexity respondeu e foi gravada; a
 * OpenAI, tentada 48 vezes pelo roteador sem nunca atender, não deixou uma linha
 * sequer — nem no teste feito para investigá-la.
 *
 * `registrarFalhaDeTeste` fecha isso: a tentativa falha vira uma linha em
 * ai_orchestration_decisions com a CAUSA classificada, e o erro segue subindo
 * para quem chamou. Gravar não engole a falha.
 */
async function registrarFalhaDeTeste(
  request: GenerateInput,
  provedor: string,
  erro: unknown,
): Promise<TentativaFalha> {
  const falha = tentativaFalhaDe(erro, provedor);
  logger.warn("ai.homologacao_falhou", {
    feature: request.feature,
    provider: provedor,
    classe: falha.classe,
    codigo: falha.codigo,
    quemResolve: falha.quemResolve,
    reason: falha.mensagem,
  });
  // O teste de conexão não passa pelo planejador, então não há plano real a
  // gravar: a ordem é o provedor único que ele existe para exercitar. Os campos
  // obrigatórios da tabela recebem o que de fato foi pedido, e `status` sai
  // 'failed' — o valor que o CHECK já aceitava e que o código nunca escreveu.
  await recordOrchestration(
    request,
    {
      requestedTask: request.task,
      resolvedTask: request.task,
      dataClass: "internal",
      riskLevel: "low",
      providerOrder: [provedor as RoutedProvider],
      tokenBudget: 600,
      routingReasons: ["homologacao-de-conexao"],
      humanReviewRequired: false,
    } as AIExecutionPlan,
    { ...localFallback(request), text: "" },
    [falha],
    // Nada foi servido: o erro sobe para a rota. Ver `nadaFoiServido`.
    true,
  );
  return falha;
}

/** Erro de homologação que carrega a causa já classificada até a rota. */
export class FalhaDeHomologacao extends Error {
  readonly falha: TentativaFalha;
  constructor(falha: TentativaFalha) {
    super(falha.mensagem);
    this.name = "FalhaDeHomologacao";
    this.falha = falha;
  }
}

export async function testOpenAIConnection(
  input: Pick<GenerateInput, "organizationId" | "userId">,
) {
  const request: GenerateInput = {
    ...input,
    task: "fast",
    feature: "openai-homologation",
    containsPersonalData: false,
    timeoutMs: 30_000,
    system:
      "Você é o teste técnico do Atlas. Não execute ações e não solicite dados pessoais.",
    prompt: "Responda somente ATLAS_OPENAI_OK para confirmar a conexão.",
  };
  try {
    return await recordUsage(request, await generateOpenAI(request));
  } catch (error) {
    throw new FalhaDeHomologacao(await registrarFalhaDeTeste(request, "openai", error));
  }
}

export async function testPerplexityConnection(
  input: Pick<GenerateInput, "organizationId" | "userId">,
) {
  const request: GenerateInput = {
    ...input,
    task: "research",
    feature: "perplexity-homologation",
    containsPersonalData: false,
    timeoutMs: 30_000,
    system:
      "Você testa pesquisa imobiliária do Atlas. Use apenas fontes públicas, cite URLs e não solicite dados pessoais.",
    prompt:
      "Indique dois indicadores públicos úteis para analisar o mercado imobiliário brasileiro e cite as fontes.",
  };
  try {
    return await recordUsage(request, await generatePerplexity(request));
  } catch (error) {
    throw new FalhaDeHomologacao(await registrarFalhaDeTeste(request, "perplexity", error));
  }
}

export async function testEconomyProviderConnection(
  provider: EconomyProvider,
  input: Pick<GenerateInput, "organizationId" | "userId">,
) {
  const expected = `ATLAS_${provider.toUpperCase()}_OK`;
  const request: GenerateInput = {
    ...input,
    task: provider === "kimi" ? "commercial" : "fast",
    feature: `${provider}-homologation`,
    containsPersonalData: false,
    timeoutMs: 30_000,
    system:
      "Você é um teste técnico de conectividade do Atlas. Não use ferramentas, não execute ações e não solicite dados pessoais.",
    prompt: `Responda somente ${expected} para confirmar a conexão.`,
  };
  try {
    return await recordUsage(request, await generateEconomyProvider(request, provider));
  } catch (error) {
    throw new FalhaDeHomologacao(await registrarFalhaDeTeste(request, provider, error));
  }
}

export async function testAICostRouting(
  input: Pick<GenerateInput, "organizationId" | "userId">,
) {
  const definitions: Array<{
    task: Exclude<AITask, "research">;
    feature: string;
    prompt: string;
  }> = [
    {
      task: "fast",
      feature: "cost-routing-fast",
      prompt: "Responda somente ROTA_RAPIDA_OK.",
    },
    {
      task: "commercial",
      feature: "cost-routing-commercial",
      prompt: "Responda somente ROTA_COMERCIAL_OK.",
    },
    {
      task: "reasoning",
      feature: "cost-routing-reasoning",
      prompt: "Responda somente ROTA_COMPLEXA_OK.",
    },
  ];
  return Promise.all(
    definitions.map(async (definition) => {
      const request: GenerateInput = {
        ...input,
        task: definition.task,
        feature: definition.feature,
        containsPersonalData: false,
        timeoutMs: 30_000,
        system:
          "Você testa o roteamento técnico do Atlas. Não execute ações, não use ferramentas e não solicite dados pessoais.",
        prompt: definition.prompt,
      };
      try {
        return {
          task: definition.task,
          ...(await recordUsage(request, await generateOpenAI(request))),
        };
      } catch (error) {
        throw new FalhaDeHomologacao(await registrarFalhaDeTeste(request, "openai", error));
      }
    }),
  );
}
