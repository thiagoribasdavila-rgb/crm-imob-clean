import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const excludedDirectories = new Set([".git", ".next", "node_modules", "dist", "tmp", "outputs"]);
const excludedDirectory = (name) => excludedDirectories.has(name) || name.startsWith(".atlas-route-quarantine-");
function filesystemFiles(directory = ".") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).replace(/^\.\//, "");
    if (entry.isDirectory()) return excludedDirectory(entry.name) ? [] : filesystemFiles(path);
    return entry.isFile() ? [path] : [];
  });
}
let files;
let usingGitIndex = false;
try {
  files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
  usingGitIndex = files.length > 0;
  if (!usingGitIndex) files = filesystemFiles();
} catch {
  files = filesystemFiles();
}
const allowedEnvironmentTemplates = new Set([".env.example", ".env.homologation.example"]);
const isPrivateEnvironmentFile = (file) => /^\.env(?:\.|$)/.test(file) && !allowedEnvironmentTemplates.has(file);
// In source snapshots without .git metadata, local environment files may exist
// for homologation. Never open or scan their values; packaging has a separate
// allowlist. In a real repository, a private environment file in the Git index
// remains a release-blocking finding.
const textFiles = files.filter(
  (file) =>
    !/\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|lock)$/i.test(file) &&
    !file.startsWith("app/generated/") &&
    (usingGitIndex || !isPrivateEnvironmentFile(file)),
);
const findings = [];
const tokenPatterns = [
  ["OpenAI", /\bsk-[A-Za-z0-9_-]{20,}\b/g], ["Perplexity", /\bpplx-[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g], ["AWS", /\bAKIA[0-9A-Z]{16}\b/g],
  ["chave privada", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const allowedPublic = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_APP_URL"]);
const allowedPublicByFile = new Map([
  ["scripts/audit-lead-roundtrip-environment.mjs", new Set(["NEXT_PUBLIC_LEAK"])],
  ["scripts/scan-secrets.mjs", new Set(["NEXT_PUBLIC_LEAK"])],
]);
for (const file of textFiles) {
  const content = readFileSync(file, "utf8");
  for (const [label, pattern] of tokenPatterns) if (pattern.test(content)) findings.push(`${file}: possível credencial ${label}`);
  for (const match of content.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
    const fileAllowlist = allowedPublicByFile.get(file);
    if (!allowedPublic.has(match[0]) && !fileAllowlist?.has(match[0])) findings.push(`${file}: variável pública não aprovada ${match[0]}`);
  }
  if (usingGitIndex && isPrivateEnvironmentFile(file)) findings.push(`${file}: arquivo de ambiente versionado`);
}

if (findings.length) { console.error("ATLAS SECRET SCAN: FAILED"); for (const finding of [...new Set(findings)]) console.error(`- ${finding}`); process.exit(1); }
console.log(`ATLAS SECRET SCAN: PASSED (${textFiles.length} arquivos rastreados, 0 credenciais detectadas)`);
