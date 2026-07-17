import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/password-recovery.json"), "utf8"));
const requestRoute = readFileSync(resolve(root, "app/api/auth/password-recovery/route.ts"), "utf8");
const resetRoute = readFileSync(resolve(root, "app/api/auth/password-reset/route.ts"), "utf8");
const callback = readFileSync(resolve(root, "app/auth/callback/route.ts"), "utf8");
const resetPage = readFileSync(resolve(root, "app/(auth)/reset-password/page.tsx"), "utf8");
const forgotPage = readFileSync(resolve(root, "app/(auth)/forgot-password/page.tsx"), "utf8");
const errors = [];

if (!requestRoute.includes("Se o e-mail estiver cadastrado") || contract.enumerationSafe !== true) errors.push("solicitação pode revelar existência do e-mail");
if (!requestRoute.includes("resetPasswordForEmail") || !requestRoute.includes("/auth/callback") || !requestRoute.includes("/reset-password")) errors.push("rota de envio não fecha callback e destino");
for (const flag of ["httpOnly: true", 'sameSite: "strict"', "maxAge: 15 * 60"]) if (!callback.includes(flag)) errors.push(`cookie de intenção sem proteção: ${flag}`);
if (!callback.includes("ATLAS_BASE_URL || process.env.NEXT_PUBLIC_APP_URL")) errors.push("callback não prioriza domínio canônico privado");
if (!resetRoute.includes("verifiedRecovery") || !resetRoute.includes("auth.getUser()") || !resetRoute.includes('scope: "global"')) errors.push("troca não exige recuperação validada ou não revoga sessões");
if (!resetRoute.includes("categories < 3") || !resetRoute.includes("password.length < 12") || !resetRoute.includes("password.length > 128")) errors.push("política de senha incompleta no servidor");
if (resetPage.includes("supabase.auth.updateUser") || !resetPage.includes('/api/auth/password-reset')) errors.push("navegador ainda altera senha diretamente");
if (!resetPage.includes('role="alert"') || !resetPage.includes("password-strength")) errors.push("feedback de senha não é acessível");
if (!forgotPage.includes("Use somente o e-mail mais recente") || !forgotPage.includes("Caixa de Entrada, Spam")) errors.push("orientação de entrega incompleta");
if (contract.intentCookie.maxAgeSeconds !== 900 || contract.invalidateSessionsAfterReset !== "global") errors.push("contrato de expiração ou revogação inválido");

if (errors.length) { console.error("ATLAS PASSWORD RECOVERY: FAILED"); errors.forEach((error) => console.error(`- ${error}`)); process.exit(1); }
console.log(`ATLAS PASSWORD RECOVERY: PASSED (${contract.intentCookie.maxAgeSeconds / 60} min; senha ${contract.passwordPolicy.minimumLength}-${contract.passwordPolicy.maximumLength}; revogação global)`);
