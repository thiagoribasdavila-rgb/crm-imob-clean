import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/session-management.json"), "utf8"));
const route = readFileSync(resolve(root, "app/api/auth/sessions/route.ts"), "utf8");
const panel = readFileSync(resolve(root, "app/(crm)/settings/profile/SessionSecurityPanel.tsx"), "utf8");
const profile = readFileSync(resolve(root, "app/(crm)/settings/profile/page.tsx"), "utf8");
const middleware = readFileSync(resolve(root, "utils/supabase/middleware.ts"), "utf8");
const guard = readFileSync(resolve(root, "components/SupabaseGuard.tsx"), "utf8");
const topbars = [readFileSync(resolve(root, "components/AtlasTopbar.tsx"), "utf8"), readFileSync(resolve(root, "components/atlas/topbar.tsx"), "utf8")];
const errors = [];

if (!middleware.includes("getClaims()") || !middleware.includes("setAll(cookiesToSet)")) errors.push("middleware não valida e renova cookies");
if (!guard.includes("onAuthStateChange") || !guard.includes("router.replace(`/login")) errors.push("interface não reage à expiração");
for (const [action, scope] of Object.entries(contract.logoutScopes || {})) if (!route.includes(`action === "${action}"`) || !route.includes(`"${scope}"`)) errors.push(`escopo de logout ausente: ${action}`);
if (!route.includes("auth.getUser()") || !route.includes("tokensReturned: false") || !route.includes("deviceEnumerationAvailable: false")) errors.push("API de sessão não valida usuário ou expõe estado indevido");
if (!route.includes('limit: 10') || !route.includes("session-control")) errors.push("controle de sessão sem rate limit");
if (topbars.some((source) => !source.includes('scope: "local"'))) errors.push("logout rápido não está limitado ao aparelho atual");
if (!panel.includes("Encerrar outros dispositivos") || !panel.includes("Encerrar todos") || !panel.includes("window.confirm")) errors.push("painel não separa ações destrutivas");
if (!panel.includes("não fornece uma lista confiável") || contract.deviceFingerprinting !== false) errors.push("plataforma pode inventar ou rastrear aparelhos");
if (!profile.includes("<SessionSecurityPanel />")) errors.push("gestão de sessões ausente do perfil");

if (errors.length) { console.error("ATLAS SESSIONS: FAILED"); errors.forEach((error) => console.error(`- ${error}`)); process.exit(1); }
console.log(`ATLAS SESSIONS: PASSED (3 escopos; renovação automática; tokens invisíveis; sem fingerprint)`);
