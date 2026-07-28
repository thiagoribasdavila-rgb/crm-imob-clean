/**
 * MODELOS PADRÃO DE IA — módulo puro, sem `server-only`.
 *
 * ── Por que vive fora do roteador ───────────────────────────────────────────
 *
 * `lib/ai/provider-router.ts` importa `server-only`: nenhum script nem teste
 * consegue carregá-lo. Consequência real, medida em 2026-07-27: o portão
 * `npm run ai:pricing:check` não conseguia PERGUNTAR quais modelos rodam, então
 * raspava o código-fonte com expressão regular. Ele acusava `openai/gpt-5.2`
 * (que só existia num exemplo dentro de um comentário), devolvia nomes
 * truncados, e lia variáveis de ambiente que o roteador nunca usou
 * (`ATLAS_OPENAI_MODEL`, `OPENAI_MODEL`, `ATLAS_PERPLEXITY_MODEL` — nenhuma
 * existe). Por isso nunca enxergou `gpt-5-mini`, o modelo que de fato rodava.
 *
 * Um portão cego é pior que portão nenhum: ele diz "conferido".
 *
 * Aqui a decisão é dado, não texto — dá para importar e perguntar.
 */

/**
 * MODELOS PADRÃO DA OPENAI — conferidos na fonte oficial em 2026-07-27.
 *
 * ── Por que isto mudou ──────────────────────────────────────────────────────
 *
 * Os padrões eram `gpt-5-mini` e `gpt-5.2`. Consultando a documentação da
 * OpenAI hoje (developers.openai.com/api/docs/{pricing,models,deprecations}):
 *
 *   · `gpt-5-mini` está DEPRECIADO, desligamento em 11/12/2026. Ainda responde,
 *     mas para de responder no meio da operação, sem aviso do nosso lado.
 *   · `gpt-5.2` não aparece na lista de modelos NEM na de preços NEM na de
 *     depreciações. `gpt-5.2-codex` foi desligado em 23/07/2026. O `gpt-5.2`
 *     simples é um ponto cego: pode responder ou pode devolver 404 na primeira
 *     chamada real — e o sintoma ("a IA não funciona") não aponta para a causa.
 *
 * Ligar a chave sem trocar isto era arriscar que a primeira chamada de verdade
 * falhasse por modelo aposentado.
 *
 * ── Por que LUNA em todos os tiers ──────────────────────────────────────────
 *
 * A linha atual é sol (trabalho complexo) · terra (equilíbrio) · luna (custo
 * baixo, alto volume). Decisão do dono do produto (2026-07-27): **só luna**.
 *
 * Faz sentido para o momento. A operação começa com um corretor e 199 leads —
 * o gasto é incerto e a chave é do dono. Um modelo só torna o custo previsível
 * (uma tarifa, uma linha na tabela de preços) e evita a situação pior de todas:
 * descobrir a conta no fim do mês.
 *
 * A contrapartida está no tier COMERCIAL, que é o que escreve para o cliente:
 * luna é o modelo otimizado para custo. Se a qualidade das mensagens incomodar,
 * `ATLAS_AI_COMMERCIAL_MODEL=gpt-5.6-terra` troca só esse tier, sem tocar em
 * código nem reempacotar — por isso o padrão nunca foi fixado no código antes
 * da variável.
 *
 * Toda variável de ambiente continua tendo precedência sobre estes padrões.
 *
 * Ao revisar: confira a página de depreciações. Modelo aposentado em produção é
 * uma falha que só aparece quando o cliente está esperando resposta.
 */

/** O modelo único desta fase. Um lugar só para trocar quando a decisão mudar. */
const MODELO_OPENAI_PADRAO = "gpt-5.6-luna";

export function aiModelProfiles() {
  return {
    fast: process.env.ATLAS_AI_FAST_MODEL || MODELO_OPENAI_PADRAO,
    commercial: process.env.ATLAS_AI_COMMERCIAL_MODEL || process.env.ATLAS_AI_MODEL || MODELO_OPENAI_PADRAO,
    reasoning: process.env.ATLAS_AI_REASONING_MODEL || process.env.ATLAS_AI_MODEL || MODELO_OPENAI_PADRAO,
    research: process.env.ATLAS_RESEARCH_MODEL || "sonar",
  } as const;
}


export type ModelFamily = "openai" | "anthropic" | "perplexity" | "economy" | "desconhecida";

/**
 * Família do modelo deduzida do nome. Enviar modelo de uma família para a API de
 * outra falha em 100% das chamadas — e a falha fica INVISÍVEL, porque o roteador
 * cai no fallback determinístico, ainda queima o retry e registra "completed".
 * Família desconhecida nunca bloqueia: só famílias comprovadamente incompatíveis.
 */
export function modelFamily(model: string): ModelFamily {
  const value = String(model || "").trim().toLowerCase();
  if (!value) return "desconhecida";
  if (/^(ft:)?(gpt|chatgpt|o[1-9])/.test(value)) return "openai";
  if (/^(claude|anthropic)/.test(value)) return "anthropic";
  if (/^(sonar|pplx)/.test(value)) return "perplexity";
  if (/^(deepseek|qwen|kimi|moonshot|glm|zhipu)/.test(value)) return "economy";
  return "desconhecida";
}

/**
 * TODO par provedor/modelo que pode ser cobrado, perguntado ao código.
 *
 * Substitui a raspagem de código-fonte que o portão de tarifas fazia. A versão
 * antiga acusava `openai/gpt-5.2` (que só existia num exemplo dentro de um
 * comentário) e lia variáveis inexistentes — por isso nunca viu `gpt-5-mini`,
 * o modelo que de fato rodava.
 *
 * A família sai do NOME do modelo, com a mesma regra que o roteador usa para
 * decidir para qual API mandar. Assim o par cobrado e o par conferido são o
 * mesmo — divergir aqui é gravar custo no modelo errado, ou em nenhum.
 */
export function modelosEmUso(): string[] {
  const perfis = aiModelProfiles();
  const candidatos = [
    perfis.fast, perfis.commercial, perfis.reasoning, perfis.research,
    // A Anthropic tem seus próprios nomes por tier; sem isto o modelo dela
    // ficaria fora da conferência e o consumo gravaria custo nulo.
    process.env.ATLAS_AI_FAST_MODEL_ANTHROPIC,
    process.env.ATLAS_AI_COMMERCIAL_MODEL_ANTHROPIC,
    process.env.ATLAS_AI_REASONING_MODEL_ANTHROPIC,
    process.env.ATLAS_ANTHROPIC_MODEL || process.env.ATLAS_CLAUDE_MODEL,
  ].filter((m): m is string => Boolean(m && m.trim()));

  const pares = new Set<string>();
  for (const modelo of candidatos) {
    const familia = modelFamily(modelo);
    // Família desconhecida entra assim mesmo: um modelo que ninguém reconhece
    // ainda vai ser cobrado. Silenciar aqui recria o custo nulo silencioso.
    pares.add(`${familia === "desconhecida" ? "desconhecido" : familia}/${modelo.trim()}`);
  }
  return [...pares].sort();
}
