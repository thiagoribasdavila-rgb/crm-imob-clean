import "server-only";

type LogLevel = "debug" | "info" | "warn" | "error";

type Metadata = Record<string, unknown>;

const SENSITIVE_KEY = /(authorization|cookie|password|passphrase|token|secret|api.?key|email|phone|mobile|whatsapp|cpf|cnpj|document|prompt|message|lead.?content)/i;
const SENSITIVE_VALUE = /(bearer\s+[a-z0-9._-]+|\bsk-[a-z0-9_-]{12,}|\bpplx-[a-z0-9_-]{12,}|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}|\b\d{10,14}\b)/i;

export function sanitizeLogMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "string") return SENSITIVE_VALUE.test(value) ? "[REDACTED]" : value.slice(0, 2_000);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeLogMetadata(nested),
    ]),
  );
}

const redact = sanitizeLogMetadata;

function write(level: LogLevel, event: string, metadata: Metadata = {}) {
  const { requestId = "system", correlationId = requestId, ...safeMetadata } = metadata;
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "atlas-ai-os",
    environment: process.env.ATLAS_ENV || process.env.NODE_ENV || "unknown",
    requestId: String(requestId).slice(0, 128),
    correlationId: String(correlationId).slice(0, 128),
    metadata: redact(safeMetadata),
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}

export const logger = {
  debug: (event: string, metadata?: Metadata) => write("debug", event, metadata),
  info: (event: string, metadata?: Metadata) => write("info", event, metadata),
  warn: (event: string, metadata?: Metadata) => write("warn", event, metadata),
  error: (event: string, error?: unknown, metadata: Metadata = {}) => {
    const normalized =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { value: String(error ?? "unknown") };
    write("error", event, { ...metadata, error: normalized });
  },
};
