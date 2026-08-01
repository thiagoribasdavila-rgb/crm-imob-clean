import "server-only";

type ResilientFetchOptions = {
  timeoutMs?: number;
  retries?: number;
  retryUnsafe?: boolean;
  operation?: string;
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function retryDelay(response: Response | null, attempt: number) {
  const retryAfter = Number(response?.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(2_000, retryAfter * 1_000);
  return Math.min(2_000, 250 * 2 ** attempt + Math.floor(Math.random() * 100));
}

function combinedSignal(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function resilientFetch(input: string | URL, init: RequestInit = {}, options: ResilientFetchOptions = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(method);
  const retries = Math.max(0, Math.min(3, options.retries ?? (safeMethod ? 2 : 0)));
  const canRetry = safeMethod || options.retryUnsafe === true;
  const timeoutMs = Math.max(1_000, Math.min(60_000, options.timeoutMs ?? 30_000));
  const startedAt = Date.now();
  let lastResponse: Response | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, { ...init, signal: combinedSignal(init.signal, timeoutMs) });
      lastResponse = response;
      if (!canRetry || !RETRYABLE_STATUS.has(response.status) || attempt === retries) return response;
    } catch (error) {
      lastError = error;
      if (!canRetry || attempt === retries) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay(lastResponse, attempt)));
  }

  throw lastError instanceof Error ? lastError : new Error(`${options.operation || "API externa"} indisponível após ${Date.now() - startedAt}ms.`);
}
