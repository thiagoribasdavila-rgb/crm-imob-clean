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

// Comentário e import NÃO são código. Toda asserção de forma abaixo roda sobre a
// fonte sem comentários, para que a guarda não aprove por causa de uma palavra
// solta nem reprove por causa da frase que explica o problema.
function semComentarios(source) {
  let out = "";
  let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += next ?? ""; i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; continue; }
    if (c === "/" && next === "/") { while (i < source.length && source[i] !== "\n") i += 1; out += "\n"; continue; }
    if (c === "/" && next === "*") { i += 2; while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1; i += 1; continue; }
    out += c;
  }
  return out;
}

function regiao(source, abre, fecha) {
  const inicio = source.indexOf(abre);
  if (inicio < 0) return "";
  const fim = source.indexOf(fecha, inicio + abre.length);
  return source.slice(inicio, fim < 0 ? source.length : fim);
}

if (!requestRoute.includes("Se o e-mail estiver cadastrado") || contract.enumerationSafe !== true) errors.push("solicitação pode revelar existência do e-mail");
if (!requestRoute.includes("resetPasswordForEmail") || !requestRoute.includes("/auth/callback") || !requestRoute.includes("/reset-password")) errors.push("rota de envio não fecha callback e destino");
for (const flag of ["httpOnly: true", 'sameSite: "strict"', "maxAge: 15 * 60"]) if (!callback.includes(flag)) errors.push(`cookie de intenção sem proteção: ${flag}`);
if (!callback.includes("ATLAS_BASE_URL || process.env.NEXT_PUBLIC_APP_URL")) errors.push("callback não prioriza domínio canônico privado");
if (!resetRoute.includes("verifiedRecovery") || !resetRoute.includes("auth.getUser()") || !resetRoute.includes('scope: "global"')) errors.push("troca não exige recuperação validada ou não revoga sessões");
if (!resetRoute.includes("categories < 3") || !resetRoute.includes("password.length < 12") || !resetRoute.includes("password.length > 128")) errors.push("política de senha incompleta no servidor");
// ── A PROPRIEDADE, NÃO O MECANISMO ───────────────────────────────────────────
// Reapontado em 2026-07-29 depois de MEDIR o provedor (projeto de homologação
// pozbrcsfthnhmnebfoxv; usuário descartável, duas sessões vivas, troca real):
//
// · o caminho do navegador JÁ REVOGA as outras sessões. O GoTrue faz isso
//   sozinho na troca de senha: as duas sessões antigas foram de 200 para
//   GET /auth/v1/user = 403 e refresh_token = 400 SEM nenhum signOut. A suspeita
//   de "senha muda e o invasor continua dentro" está REFUTADA por medição.
// · o que sobra vivo é a SESSÃO DE RECUPERAÇÃO: GET /auth/v1/user com ela
//   respondeu 200 DEPOIS da troca, e o link segue podendo trocar a senha por
//   ~1 h. É esta a ponta solta que precisa de guarda.
// · a política do provedor é só "at least 6 characters": "aaaaaa", "abc123",
//   "12345678" e "senhasimples" foram ACEITAS (HTTP 200) via PUT /auth/v1/user.
//   Quem aplica 12/128/3 é o Atlas — logo a ORDEM (validar antes de chamar o
//   provedor) é propriedade de segurança, não estilo.
//
// Proibir `updateUser` na página não protege nenhuma das três, e apagaria o
// caminho que ainda funciona quando o cookie de intenção (15 min) expira antes
// de o usuário digitar a senha, já que a sessão de recuperação dura ~1 h.
const paginaLimpa = semComentarios(resetPage);
const regiaoEnvio = regiao(paginaLimpa, "async function handleSubmit", "return (");
if (!regiaoEnvio) errors.push("página de reset sem região de envio reconhecível");
if (!paginaLimpa.includes("/api/auth/password-reset")) errors.push("troca no navegador não fala com a rota do servidor");
if (/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(regiaoEnvio)) errors.push("troca no navegador engole a resposta da rota (falha silenciosa: sem registro e sem revogação)");
if (!/signOut\(\s*\{\s*scope:\s*"global"\s*\}\s*\)/.test(regiaoEnvio)) errors.push("troca no navegador não encerra a sessão de recuperação, que MEDIDAMENTE sobrevive à troca");
const posPolitica = regiaoEnvio.indexOf("strength.valid");
const posProvedor = regiaoEnvio.indexOf("auth.updateUser");
if (posPolitica < 0 || (posProvedor >= 0 && posPolitica > posProvedor)) errors.push("política 12/128/3 não é aplicada ANTES do provedor, que aceita 6 caracteres");
// A rota não pode deixar de exigir o cookie de intenção: sem ele, qualquer
// sessão apenas logada trocaria a senha sem provar recuperação nem saber a atual.
const regiaoVerificacao = regiao(semComentarios(resetRoute), "async function verifiedRecovery", "export async function GET");
if (!regiaoVerificacao.includes("RECOVERY_COOKIE") || !regiaoVerificacao.includes("return null")) errors.push("rota de troca deixou de exigir o cookie de intenção (troca sem reautenticação)");
if (!resetRoute.includes('logger.info("auth.recovery.password_updated"')) errors.push("troca pela rota não é registrada");
if (!resetPage.includes('role="alert"') || !resetPage.includes("password-strength")) errors.push("feedback de senha não é acessível");
if (!forgotPage.includes("Use somente o e-mail mais recente") || !forgotPage.includes("Caixa de Entrada, Spam")) errors.push("orientação de entrega incompleta");
if (contract.intentCookie.maxAgeSeconds !== 900 || contract.invalidateSessionsAfterReset !== "global") errors.push("contrato de expiração ou revogação inválido");

if (errors.length) { console.error("ATLAS PASSWORD RECOVERY: FAILED"); errors.forEach((error) => console.error(`- ${error}`)); process.exit(1); }
console.log(`ATLAS PASSWORD RECOVERY: PASSED (${contract.intentCookie.maxAgeSeconds / 60} min; senha ${contract.passwordPolicy.minimumLength}-${contract.passwordPolicy.maximumLength}; revogação global)`);
