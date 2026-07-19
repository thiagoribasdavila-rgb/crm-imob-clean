import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "config", "security-audit.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const headers = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
const upload = fs.readFileSync(path.join(root, "app/api/v1/developments/[id]/materials/route.ts"), "utf8");
const logger = fs.readFileSync(path.join(root, "lib/observability/logger.ts"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "app/api/bootstrap/admin/route.ts"), "utf8");
const failures = [];

for (const gate of contract.requiredGates) if (gate !== "security:audit" && !pkg.scripts.validate.includes(`npm run ${gate}`)) failures.push(`validate sem ${gate}`);
for (const header of contract.requiredHeaders) if (!headers.includes(header)) failures.push(`cabeçalho ausente: ${header}`);
for (const control of contract.uploadControls) if (!upload.includes(control)) failures.push(`upload sem ${control}`);
for (const key of contract.logSensitiveKeys) if (!logger.toLowerCase().includes(key.toLowerCase())) failures.push(`redação de log sem ${key}`);

if (/user_metadata\s*:\s*\{[^}]*\b(role|organization_id)\b/s.test(bootstrap)) failures.push("bootstrap coloca autorização em user_metadata");
if (upload.includes("uploadError.message")) failures.push("upload expõe mensagem interna do provedor");
if (headers.includes("poweredByHeader: true")) failures.push("cabeçalho de tecnologia exposto");
if (!headers.includes("object-src 'none'") || !headers.includes("frame-ancestors 'none'")) failures.push("CSP não bloqueia objetos/frames");

for (const name of ["@supabase/ssr", "@supabase/supabase-js"]) {
  const version = pkg.dependencies[name];
  if (!/^\d+\.\d+\.\d+$/.test(version)) failures.push(`${name} não está fixado exatamente`);
}

if (failures.length) {
  console.error(`SECURITY Fase ${contract.phase}: falhou\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SECURITY Fase ${contract.phase}: aprovado — ${contract.areas.length} áreas; ${contract.requiredGates.length} gates; ${contract.requiredHeaders.length} cabeçalhos; ${contract.uploadControls.length} controles de upload; autorização fora de user_metadata.`);
