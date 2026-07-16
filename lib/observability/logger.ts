type LogLevel = "debug" | "info" | "warn" | "error";

type Metadata = Record<string, unknown>;

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "apiKey",
  "accessToken",
  "refreshToken",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      REDACTED_KEYS.has(key) ? "[REDACTED]" : redact(nested),
    ]),
  );
}

function write(level: LogLevel, event: string, metadata: Metadata = {}) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "atlas-ai-os",
    environment: process.env.ATLAS_ENV || process.env.NODE_ENV || "unknown",
    metadata: redact(metadata),
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
