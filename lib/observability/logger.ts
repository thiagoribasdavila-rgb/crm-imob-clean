import "server-only";

type LogLevel = "debug" | "info" | "warn" | "error";

type Metadata = Record<string, unknown>;

// A redação vive em ./redact — função pura, testável fora do bundler do Next.
// Reexportada aqui para não quebrar quem já importava sanitizeLogMetadata do logger.
export { sanitizeLogMetadata } from "./redact";
import { sanitizeLogMetadata as redact } from "./redact";
import { normalizeError } from "./normalize-error";

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
    // A normalização vive em ./normalize-error. Ela existe porque este ponto fazia
    // String(error) para tudo que não fosse instância de Error — e erro do PostgREST é
    // objeto simples, então virava "[object Object]" no log de produção.
    write("error", event, { ...metadata, error: normalizeError(error) });
  },
};
