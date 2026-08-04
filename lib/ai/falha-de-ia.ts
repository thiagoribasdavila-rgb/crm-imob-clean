/**
 * A CAUSA DA FALHA DE IA — de "Error" para uma frase que aponta um responsável.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * Medido no banco de produção em 2026-08-02:
 *
 *   ai_orchestration_decisions com 'openai' na ordem ..... 48
 *   ai_orchestration_decisions que ESCOLHERAM openai .....  0
 *   ai_usage_events com provider='openai' ................  0
 *
 * A OpenAI foi tentada 48 vezes e não atendeu nenhuma. O `copilot` caiu no
 * fallback determinístico 13 vezes seguidas. E a única frase que diz POR QUE
 * está na linha `ai.provider_failover` do PM2 da Hostinger — fora do alcance de
 * quem opera. `/api/ai/openai-test` era pior: devolvia `details: error.name`,
 * literalmente a string "Error", e nunca gravava linha nenhuma.
 *
 * O sistema foi construído sem conseguir responder a pergunta mais importante
 * da operação de IA: "por que ela não respondeu?".
 *
 * ── POR QUE CLASSIFICAR, E NÃO SÓ GUARDAR A MENSAGEM ────────────────────────
 *
 * "Guardar a mensagem" devolve a pergunta ao operador em outra forma. Chave
 * vencida, cota estourada e rede fora produzem frases diferentes do provedor,
 * mas exigem pessoas diferentes: o DONO repõe crédito, o TIME TÉCNICO conserta
 * parâmetro, e ninguém conserta rede — só se observa. A classe é o que traduz
 * a falha em ação, e por isso ela viaja junto de `quemResolve`.
 *
 * ── FUNÇÃO PURA, DE PROPÓSITO ──────────────────────────────────────────────
 *
 * Sem `server-only`: quem classifica não toca servidor, e a lição de
 * lib/observability/redact.ts é que lógica pura presa ao ambiente não pode ser
 * exercida por teste — foi assim que "message" ficou anos na lista de chaves
 * sensíveis apagando toda frase de erro do sistema.
 */

export type ClasseDeFalhaDeIa =
  | "credencial"
  | "cota"
  | "rede"
  | "configuracao"
  | "recusa_do_modelo"
  | "politica_interna"
  | "cancelada"
  | "desconhecida";

export type FalhaDeIaClassificada = {
  classe: ClasseDeFalhaDeIa;
  /** Mensagem do provedor, com segredo removido e comprimento limitado. */
  mensagem: string;
  /** Código curto do provedor quando existir (`insufficient_quota`, `HTTP 429`). */
  codigo: string | null;
  provedor: string;
  httpStatus: number | null;
  /** Quem destrava. É o campo que impede a tela de mostrar número bonito. */
  quemResolve: string;
};

/** Teto por mensagem: uma frase de erro não pode virar despejo de payload. */
const MAX_MENSAGEM = 500;

/**
 * Redação INLINE — troca só o trecho secreto e preserva o resto da frase.
 *
 * `sanitizeLogMetadata` (lib/observability/redact.ts) apaga a string INTEIRA
 * quando encontra um padrão sensível. Correto para log genérico, e destrutivo
 * aqui: a frase é justamente o que estamos tentando salvar. Uma mensagem de
 * quota que mencione o e-mail da conta viraria "[REDACTED]" e a causa sumiria
 * de novo — trocando um cego por outro.
 */
export function redigirSegredo(texto: string): string {
  return texto
    .replace(/\b(sk|pplx|xai|gsk|sk-ant|sk-or)-[A-Za-z0-9_-]{8,}/g, "[SEGREDO]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [SEGREDO]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[SEGREDO]")
    .replace(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g, "[EMAIL]");
}

/** Frase de quem destrava, por classe. Sem isto a tela vira número sem dono. */
const QUEM_RESOLVE: Record<ClasseDeFalhaDeIa, string> = {
  credencial:
    "Dono da conta: a chave do provedor está ausente ou foi recusada. Repor a variável de ambiente no servidor.",
  cota: "Dono da conta: cota ou saldo do provedor esgotado. Liberar crédito no painel do provedor.",
  rede: "Ninguém no Atlas: o provedor não respondeu a tempo ou a rede caiu. Repetir e acompanhar.",
  configuracao:
    "Time técnico: modelo ou parâmetro inválido na configuração do Atlas. Não é saldo nem rede.",
  recusa_do_modelo:
    "Time técnico: o modelo recusou o conteúdo enviado. Revisar o texto do pedido, não a conta.",
  politica_interna:
    "Ninguém: uma regra do próprio Atlas barrou a chamada de propósito. Comportamento esperado.",
  cancelada: "Ninguém: quem pediu cancelou antes da resposta.",
  desconhecida:
    "Time técnico: causa não reconhecida. A mensagem do provedor está gravada ao lado.",
};

function textoDoErro(erro: unknown): string {
  if (erro instanceof Error) {
    const causa = (erro as { cause?: unknown }).cause;
    const codigoDaCausa =
      causa && typeof causa === "object" && "code" in causa
        ? ` ${String((causa as { code?: unknown }).code ?? "")}`
        : "";
    return `${erro.name}: ${erro.message}${codigoDaCausa}`;
  }
  if (typeof erro === "string") return erro;
  if (erro && typeof erro === "object") {
    const objeto = erro as { message?: unknown; code?: unknown };
    if (objeto.message) return `${String(objeto.message)} ${String(objeto.code ?? "")}`.trim();
  }
  return String(erro);
}

function extrairHttpStatus(texto: string): number | null {
  const marcado = /\bHTTP\s+(\d{3})\b/i.exec(texto);
  if (marcado) return Number(marcado[1]);
  const status = /\bstatus(?:\s+code)?[:\s]+(\d{3})\b/i.exec(texto);
  return status ? Number(status[1]) : null;
}

function extrairCodigo(texto: string, httpStatus: number | null): string | null {
  const conhecido =
    /\b(insufficient_quota|rate_limit_exceeded|invalid_api_key|model_not_found|unsupported_value|unsupported_parameter|context_length_exceeded|content_filter|invalid_request_error|billing_hard_limit_reached|account_deactivated|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR_[A-Z_]+)\b/i.exec(
      texto,
    );
  if (conhecido) return conhecido[1];
  if (/\bTimeoutError\b/.test(texto)) return "TimeoutError";
  if (/\bAbortError\b/.test(texto)) return "AbortError";
  return httpStatus ? `HTTP ${httpStatus}` : null;
}

/**
 * Classifica uma falha de provedor de IA.
 *
 * A ORDEM DOS TESTES É A REGRA, não estilo. `429` é cota mesmo vindo embrulhado
 * numa frase que fala em "request"; `401` é credencial mesmo quando o provedor
 * chama de "invalid_request_error". Por isso credencial e cota são decididas
 * ANTES do balde genérico de 4xx — inverter faria toda chave vencida aparecer
 * como "configuração", e o dono nunca saberia que precisa repor a chave.
 */
export function classificarFalhaDeIa(
  erro: unknown,
  provedor: string,
): FalhaDeIaClassificada {
  const bruto = textoDoErro(erro);
  const texto = redigirSegredo(bruto);
  const httpStatus = extrairHttpStatus(bruto);
  const codigo = extrairCodigo(bruto, httpStatus);
  const baixo = bruto.toLowerCase();

  const classe: ClasseDeFalhaDeIa = (() => {
    // Cancelamento de quem pediu não é falha do provedor e não pode virar
    // alarme de credencial só porque a frase é curta.
    if (/aborterror|cancelad/i.test(bruto) && !/timeout/i.test(bruto)) return "cancelada";

    // Regra do próprio Atlas: recusa deliberada, ninguém tem o que consertar.
    if (/bloqueada para contexto com dados pessoais|bloqueada pela proteção/i.test(bruto))
      return "politica_interna";

    if (
      httpStatus === 401 ||
      httpStatus === 403 ||
      /invalid_api_key|incorrect api key|invalid authentication|unauthorized|no api key|api key not|não configurada|nao configurada|account_deactivated|permission to access/i.test(
        baixo,
      )
    )
      return "credencial";

    if (
      httpStatus === 429 ||
      /insufficient_quota|exceeded your current quota|rate limit|rate_limit|billing|quota|credit balance|payment required|out of credits/i.test(
        baixo,
      ) ||
      httpStatus === 402
    )
      return "cota";

    if (
      /timeouterror|timed out|etimedout|econnrefused|econnreset|enotfound|eai_again|fetch failed|network|socket hang up|und_err|indisponível após|indisponivel apos/i.test(
        baixo,
      ) ||
      (httpStatus !== null && httpStatus >= 500)
    )
      return "rede";

    if (/content_filter|content policy|safety|refus|moderation|cannot assist/i.test(baixo))
      return "recusa_do_modelo";

    if (
      /model_not_found|unsupported_value|unsupported_parameter|context_length_exceeded|invalid_request_error|não configurado|nao configurado|resposta vazia|does not exist|invalid model|max_output_tokens/i.test(
        baixo,
      ) ||
      (httpStatus !== null && httpStatus >= 400 && httpStatus < 500)
    )
      return "configuracao";

    return "desconhecida";
  })();

  return {
    classe,
    mensagem: texto.slice(0, MAX_MENSAGEM),
    codigo,
    provedor,
    httpStatus,
    quemResolve: QUEM_RESOLVE[classe],
  };
}

/**
 * Resumo de uma tentativa falha, na forma que vai para o banco e para a tela.
 * `mensagem` já vem redigida por `classificarFalhaDeIa`.
 */
export type TentativaFalha = {
  provedor: string;
  classe: ClasseDeFalhaDeIa;
  codigo: string | null;
  mensagem: string;
  quemResolve: string;
  httpStatus: number | null;
};

export function tentativaFalhaDe(erro: unknown, provedor: string): TentativaFalha {
  const { classe, codigo, mensagem, quemResolve, httpStatus } = classificarFalhaDeIa(erro, provedor);
  return { provedor, classe, codigo, mensagem, quemResolve, httpStatus };
}
