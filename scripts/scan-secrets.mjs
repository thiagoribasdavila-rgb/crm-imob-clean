import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { scanContent } from "./secret-scan-rules.mjs";

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
try {
  files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
  if (!files.length) files = filesystemFiles();
} catch {
  files = filesystemFiles();
}
const textFiles = files.filter((file) => !/\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|lock)$/i.test(file) && !file.startsWith("app/generated/"));
const findings = [];

for (const file of textFiles) {
  findings.push(...scanContent(file, readFileSync(file, "utf8")));
}

if (findings.length) { console.error("ATLAS SECRET SCAN: FAILED"); for (const finding of [...new Set(findings)]) console.error(`- ${finding}`); process.exit(1); }
console.log(`ATLAS SECRET SCAN: PASSED (${textFiles.length} arquivos rastreados, 0 credenciais detectadas)`);
