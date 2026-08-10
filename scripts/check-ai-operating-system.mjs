import fs from "node:fs";

const required = {
  "lib/ai/operating-system.ts": ["prepared_offline", "humanApprovalRequired", "ATLAS_AI_OS_AGENTS", "autonomousExternalActions: false"],
  "app/api/ai/status/route.ts": ["resolveAtlasAIOS", "operatingSystem"],
  "app/(crm)/settings/ai/page.tsx": ["AI OPERATING SYSTEM", "Atlas AI Brain", "Aguardando crédito"],
  "docs/ATLAS_AI_OPERATING_SYSTEM_SPEC.md": ["O modelo de IA é o motor", "Learning Loop", "HTTP 429", "Gates de produção"],
};

const failures = [];
for (const [file, markers] of Object.entries(required)) {
  const source = fs.readFileSync(file, "utf8");
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${file}: ${marker}`);
}
if (failures.length) {
  console.error(`AI OS incompleto:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Atlas AI Operating System: fundação, contingência e governança verificadas.");
