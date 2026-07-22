/**
 * Redação de metadado de log. Função PURA, de propósito fora do logger.
 *
 * Ela vivia dentro de lib/observability/logger.ts, que declara `import "server-only"` —
 * correto para o logger, que escreve no processo do servidor, mas errado para esta
 * função, que só transforma um valor em outro. O acoplamento a tornava impossível de
 * testar fora do bundler do Next, e foi assim que um defeito sério passou despercebido:
 * a palavra "message" estava na lista de chaves sensíveis, então TODO erro do sistema era
 * gravado como message:"[REDACTED]".
 *
 * Regra que fica registrada: lógica pura não herda restrição de ambiente. Se ela não
 * toca o servidor, ela precisa poder ser exercida por um teste.
 */

/**
 * Chaves cujo VALOR nunca deve aparecer no log.
 *
 * "message" NÃO está aqui, e a ausência é deliberada: logger.error monta o erro como
 * { name, message, stack }, e redigir por nome de chave apagava a frase que explica a
 * falha. O conteúdo de mensagem do cliente — a preocupação legítima que colocou a palavra
 * na lista — continua protegido pelas chaves que de fato o carregam.
 */
const SENSITIVE_KEY =
  /(authorization|cookie|password|passphrase|token|secret|api.?key|email|phone|mobile|whatsapp|cpf|cnpj|document|prompt|message.?(body|content|text)|\bcontent\b|\bbody\b|lead.?content)/i;

/**
 * Padrões que não podem aparecer em texto livre, mesmo dentro de uma frase de erro:
 * credencial portadora, chave de API, JWT, e-mail e sequência longa de dígitos (telefone).
 *
 * Aplica-se SOMENTE a string. Número passa intacto — então duração e carimbo de tempo
 * numéricos continuam legíveis no log, ao contrário do que se poderia supor pela regra
 * de dígitos.
 */
const SENSITIVE_VALUE =
  /(bearer\s+[a-z0-9._-]+|\bsk-[a-z0-9_-]{12,}|\bpplx-[a-z0-9_-]{12,}|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}|\b\d{10,14}\b)/i;

/** Teto por string: um único log não pode engolir o disco. */
const MAX_STRING = 2_000;

export function sanitizeLogMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeLogMetadata);
  if (typeof value === "string") return SENSITIVE_VALUE.test(value) ? "[REDACTED]" : value.slice(0, MAX_STRING);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeLogMetadata(nested),
    ]),
  );
}
