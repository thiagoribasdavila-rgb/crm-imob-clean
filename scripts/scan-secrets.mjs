import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const textFiles = files.filter((file) => !/\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|lock)$/i.test(file) && !file.startsWith("app/generated/"));
const findings = [];
const tokenPatterns = [
  ["OpenAI", /\bsk-[A-Za-z0-9_-]{20,}\b/g], ["Perplexity", /\bpplx-[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g], ["AWS", /\bAKIA[0-9A-Z]{16}\b/g],
  ["chave privada", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const allowedPublic = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_APP_URL"]);

for (const file of textFiles) {
  const content = readFileSync(file, "utf8");
  for (const [label, pattern] of tokenPatterns) if (pattern.test(content)) findings.push(`${file}: possível credencial ${label}`);
  for (const match of content.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) if (!allowedPublic.has(match[0])) findings.push(`${file}: variável pública não aprovada ${match[0]}`);
  if (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") findings.push(`${file}: arquivo de ambiente versionado`);
}

if (findings.length) { console.error("ATLAS SECRET SCAN: FAILED"); for (const finding of [...new Set(findings)]) console.error(`- ${finding}`); process.exit(1); }
console.log(`ATLAS SECRET SCAN: PASSED (${textFiles.length} arquivos rastreados, 0 credenciais detectadas)`);
