const AUTH_PATHS = new Set(["/login", "/forgot-password", "/reset-password", "/auth/callback"]);

export function safeAuthDestination(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || value.length > 1_024 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  const pathname = value.split("?", 1)[0].replace(/\/+$/, "") || "/";
  return AUTH_PATHS.has(pathname) ? fallback : value;
}
