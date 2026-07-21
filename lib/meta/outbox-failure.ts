/**
 * Classificação de falha de entrega do outbox: separa erro de CREDENCIAL
 * (token expirado/inválido — Graph 190/102 e subcodes de sessão 463/467) de
 * erro de DADO do próprio evento.
 *
 * Motivação (auditoria): um token de acesso expirado (code 190, subcodes
 * 463/467) fazia CADA evento da fila queimar as 5 tentativas e virar
 * dead_letter; renovar o token depois NÃO reprocessava nada — a fila ficava
 * enterrada. Erro de credencial não é culpa do evento: não deve consumir
 * tentativa nem enterrar a fila. Erro de dado é do evento: continua consumindo
 * tentativa até dead_letter, como antes.
 *
 * Puro e determinístico: sem rede, sem ambiente. Reusa `classifyGraphError`
 * (a mesma família `auth_expired` usada na leitura da Marketing API) para não
 * duplicar a tabela de códigos. Import de valor entre libs por caminho relativo.
 */

import { classifyGraphError } from "./marketing/graph-client";

export type OutboxFailureCause = "token_unhealthy" | "data";

export type GraphCodeSignal = {
  code: number | null;
  subcode: number | null;
};

/**
 * Extrai code/subcode do padrão `[code 190/463]` que `describeMetaGraphFailure`
 * embute na mensagem. Sem o colchete explícito, não inventa código a partir de
 * números soltos no texto — devolve null/null (será tratado como erro de dado).
 */
export function extractGraphCodes(message: string): GraphCodeSignal {
  const bracket = message.match(/\[code\s+(\d+)(?:\/(\d+))?\]/i);
  if (!bracket) return { code: null, subcode: null };
  return { code: Number(bracket[1]), subcode: bracket[2] ? Number(bracket[2]) : null };
}

/**
 * Classifica a falha em `token_unhealthy` (credencial) ou `data` (dado do
 * evento). Aceita code/subcode estruturados quando o chamador os tem; senão,
 * tenta extrair do texto (padrão da `describeMetaGraphFailure`). Só marca
 * `token_unhealthy` quando `classifyGraphError` enxerga `auth_expired` — nunca
 * por um número solto. Sem qualquer sinal de código, é erro de dado.
 */
export function classifyOutboxFailure(input: {
  message?: string | null;
  code?: number | null;
  subcode?: number | null;
}): OutboxFailureCause {
  const message = input.message ?? "";
  let code = input.code ?? null;
  let subcode = input.subcode ?? null;

  if (code === null && subcode === null) {
    const parsed = extractGraphCodes(message);
    code = parsed.code;
    subcode = parsed.subcode;
  }

  if (code === null && subcode === null) return "data";

  const kind = classifyGraphError({
    code: code ?? undefined,
    error_subcode: subcode ?? undefined,
    message,
  });
  return kind === "auth_expired" ? "token_unhealthy" : "data";
}
