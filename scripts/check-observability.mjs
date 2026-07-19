import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/observability.json"), "utf8"));
const logger = readFileSync(resolve(root, "lib/observability/logger.ts"), "utf8");
const apiCore = readFileSync(resolve(root, "lib/api/core.ts"), "utf8");
const ecosystem = readFileSync(resolve(root, "ecosystem.config.cjs"), "utf8");
const authCallback = readFileSync(resolve(root, "app/auth/callback/route.ts"), "utf8");
const recovery = readFileSync(resolve(root, "app/api/auth/password-recovery/route.ts"), "utf8");
const clientError = readFileSync(resolve(root, "app/(crm)/error.tsx"), "utf8");
const errors = [];

for (const field of ["timestamp", "level", "event", "service", "environment", "requestId", "correlationId"]) if (!contract.requiredFields?.includes(field)) errors.push(`campo estruturado ausente: ${field}`);
for (const field of ["password", "token", "email", "phone", "cpf", "prompt"]) if (!contract.forbiddenData?.includes(field)) errors.push(`dado sensível sem política: ${field}`);
for (const header of ["X-Request-Id", "X-Correlation-Id"]) if (!contract.correlationHeaders?.includes(header) || !apiCore.includes(`headers.set("${header}"`)) errors.push(`correlação ausente: ${header}`);
if (!logger.includes("sanitizeLogMetadata") || !logger.includes("SENSITIVE_KEY") || !logger.includes("SENSITIVE_VALUE")) errors.push("logger sem sanitização central");
if (!apiCore.includes("sanitizeLogMetadata(data ?? {})")) errors.push("log canônico da API não usa sanitização");
if (!ecosystem.includes(contract.hostinger.stdout) || !ecosystem.includes(contract.hostinger.stderr)) errors.push("PM2 não separa stdout e stderr");
if (contract.hostinger.rotationRequiresHostingerSetup !== true) errors.push("rotação externa da Hostinger deve permanecer explícita");
if (authCallback.includes("console.error") || recovery.includes("console.error")) errors.push("autenticação ainda usa log não estruturado");
if (clientError.includes("message: error.message")) errors.push("interface envia mensagem de erro potencialmente sensível ao console");
if (!authCallback.includes("requestId: meta.requestId") || !recovery.includes("correlationId: meta.correlationId")) errors.push("fluxos de autenticação sem correlação");

if (errors.length) {
  console.error("ATLAS OBSERVABILITY: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`ATLAS OBSERVABILITY: PASSED (${contract.requiredFields.length} campos; ${contract.metrics.length} métricas; logs sanitizados e correlacionados)`);
