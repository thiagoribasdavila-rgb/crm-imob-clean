import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/login-experience.json"), "utf8"));
const login = readFileSync(resolve(root, "app/(auth)/login/page.tsx"), "utf8");
const browserSupabase = readFileSync(resolve(root, "lib/supabase.ts"), "utf8");
const redirect = readFileSync(resolve(root, "lib/auth/safe-redirect.ts"), "utf8");
const callback = readFileSync(resolve(root, "app/auth/callback/route.ts"), "utf8");
const middleware = readFileSync(resolve(root, "utils/supabase/middleware.ts"), "utf8");
// ProtectedRoute foi APOSENTADO (o guard canônico é SupabaseGuard + middleware).
// Ausente = nada de legado apontando para /auth/login — a checagem trivialmente vale.
const legacyGuardPath = resolve(root, "components/ui/ProtectedRoute.tsx");
const legacyGuard = existsSync(legacyGuardPath) ? readFileSync(legacyGuardPath, "utf8") : "";
const proxy = readFileSync(resolve(root, "proxy.ts"), "utf8");
const errors = [];

if (contract.canonicalPath !== "/login" || legacyGuard.includes("/auth/login")) errors.push("rota canônica de login inconsistente");
if (!redirect.includes('value.startsWith("//")') || !redirect.includes('value.includes("\\\\")') || !redirect.includes("AUTH_PATHS.has(pathname)")) errors.push("redirecionamento interno não bloqueia origem externa ou loop de autenticação");
if (!login.includes("withLoginTimeout") || !login.includes("LOGIN_TIMEOUT_MS = 15_000")) errors.push("login sem limite de espera");
if (!login.includes("setRememberEmail] = useState(false)") || login.includes("localStorage.setItem") === false) errors.push("memória de e-mail não exige escolha");
if (!browserSupabase.includes('createBrowserClient') || browserSupabase.includes('persistSession: true')) errors.push("cliente do navegador não compartilha cookies com o servidor");
if (!login.includes("signInWithPassword") || !login.includes('fetch("/api/v1/auth/me"') || !login.includes('credentials: "include"')) errors.push("autenticação não confirma sessão, perfil e organização no servidor");
if (!login.includes("window.location.assign(") || !login.includes("window.location.replace(")) errors.push("redirecionamento pós-login não força navegação limpa");
if (!login.includes('role="alert"') || !login.includes('aria-live="assertive"') || !login.includes("Caps Lock está ativado")) errors.push("feedback acessível incompleto");
if (!login.includes("Esqueci minha senha") || !login.includes("showPassword") || !login.includes("autoComplete=\"current-password\"")) errors.push("controles essenciais ausentes");
if (!middleware.includes('pathname.startsWith("/login") && authenticated') || !callback.includes("safeAuthDestination")) errors.push("sessão ativa ou callback sem destino seguro");
if (proxy.includes("error.message") || proxy.includes("String(error)")) errors.push("proxy registra detalhe bruto de autenticação");

if (errors.length) { console.error("ATLAS LOGIN: FAILED"); errors.forEach((error) => console.error(`- ${error}`)); process.exit(1); }
console.log(`ATLAS LOGIN: PASSED (${contract.requiredControls.length} controles; timeout ${contract.timeoutMs}ms; rota ${contract.canonicalPath})`);
