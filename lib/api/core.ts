import { NextResponse, type NextRequest } from "next/server";

export const ATLAS_API_VERSION = "v1";
export const ATLAS_API_SERVICE = "atlas-api-platform";

export type ApiMeta = {
  requestId: string;
  correlationId: string;
  version: string;
  timestamp: string;
};

type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta: ApiMeta;
};

type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiMeta;
};

function cleanHeaderId(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(normalized) ? normalized : null;
}

export function createRequestContext(request: NextRequest): ApiMeta {
  const requestId = cleanHeaderId(request.headers.get("x-request-id")) ?? crypto.randomUUID();
  const correlationId = cleanHeaderId(request.headers.get("x-correlation-id")) ?? requestId;

  return {
    requestId,
    correlationId,
    version: ATLAS_API_VERSION,
    timestamp: new Date().toISOString(),
  };
}

function responseHeaders(meta: ApiMeta, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Request-Id", meta.requestId);
  headers.set("X-Correlation-Id", meta.correlationId);
  headers.set("X-Atlas-Api-Version", meta.version);
  headers.set("X-Content-Type-Options", "nosniff");
  const durationMs = Math.max(0, Date.now() - new Date(meta.timestamp).getTime());
  headers.set("Server-Timing", `atlas;dur=${durationMs}`);
  headers.set("X-Response-Time", `${durationMs}ms`);
  return headers;
}

export function apiSuccess<T>(
  data: T,
  meta: ApiMeta,
  options?: { status?: number; headers?: HeadersInit },
) {
  const body: ApiSuccess<T> = { ok: true, data, meta };
  return NextResponse.json(body, {
    status: options?.status ?? 200,
    headers: responseHeaders(meta, options?.headers),
  });
}

export function apiError(
  code: string,
  message: string,
  meta: ApiMeta,
  options?: { status?: number; details?: unknown; headers?: HeadersInit },
) {
  const body: ApiFailure = {
    ok: false,
    error: {
      code,
      message,
      ...(options?.details === undefined ? {} : { details: options.details }),
    },
    meta,
  };

  return NextResponse.json(body, {
    status: options?.status ?? 400,
    headers: responseHeaders(meta, options?.headers),
  });
}

export function methodNotAllowed(request: NextRequest, allowed: string[]) {
  const meta = createRequestContext(request);
  return apiError("METHOD_NOT_ALLOWED", "Método não permitido nesta rota.", meta, {
    status: 405,
    headers: { Allow: allowed.join(", ") },
  });
}

export function getClientAddress(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function structuredApiLog(
  level: "info" | "warn" | "error",
  event: string,
  request: NextRequest,
  meta: ApiMeta,
  data?: Record<string, unknown>,
) {
  const payload = {
    level,
    event,
    service: ATLAS_API_SERVICE,
    requestId: meta.requestId,
    correlationId: meta.correlationId,
    method: request.method,
    path: request.nextUrl.pathname,
    clientAddress: getClientAddress(request),
    timestamp: new Date().toISOString(),
    ...data,
  };

  if (level === "error") console.error(JSON.stringify(payload));
  else if (level === "warn") console.warn(JSON.stringify(payload));
  else console.info(JSON.stringify(payload));
}
