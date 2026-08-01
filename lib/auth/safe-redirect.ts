/* `/redefinir-senha` é o apelido em português de `/reset-password` (a `main`
   criou em 25/07/2026 como re-export da mesma tela). Precisa entrar aqui pelo
   mesmo motivo das outras: um `next=` apontando para uma tela de autenticação
   devolve o usuário ao fallback em vez de deixá-lo em looping. */
const AUTH_PATHS = new Set(["/login", "/forgot-password", "/reset-password", "/redefinir-senha", "/auth/callback"]);

export function safeAuthDestination(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || value.length > 1_024 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  const pathname = value.split("?", 1)[0].replace(/\/+$/, "") || "/";
  return AUTH_PATHS.has(pathname) ? fallback : value;
}
