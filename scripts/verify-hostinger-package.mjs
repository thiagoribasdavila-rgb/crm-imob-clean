import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const root = process.cwd(),
  packageName = process.env.ATLAS_PACKAGE_NAME || "atlas-v3-hostinger-homologation.zip",
  zip = resolve(root, `dist/hostinger/${packageName}`),
  sumFile = `${zip}.sha256`;
if (!existsSync(zip) || !existsSync(sumFile))
  throw new Error("ZIP ou checksum ausente.");
const bytes = readFileSync(zip),
  actual = createHash("sha256").update(bytes).digest("hex"),
  expected = readFileSync(sumFile, "utf8").trim().split(/\s+/)[0];
if (actual !== expected) throw new Error("Checksum externo divergente.");
const entries = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
if (entries.some((e) => e.startsWith("/") || e.includes("../")))
  throw new Error("Caminho inseguro no ZIP.");
const isRealEnvironmentFile = (entry) => {
  const basename = entry.split("/").at(-1) || "";
  return (basename === ".env" || basename.startsWith(".env.")) && !basename.endsWith(".example");
};
const forbidden = entries.filter(
  (e) =>
    isRealEnvironmentFile(e) ||
    /(^|\/)(?:hostinger\.env|node_modules|\.next|tmp|outputs|dist|\.git)(?:\/|$)/.test(
      e,
    ) || /\.(?:xlsx?|csv|pdf|pem|key|mov|mp4|zip)$/i.test(e),
);
if (forbidden.length)
  throw new Error(`Conteúdo proibido: ${forbidden.slice(0, 5).join(", ")}`);
for (const required of [
  "HOSTINGER_PACKAGE.json",
  "RELEASE_FILES.sha256",
  "package.json",
  "package-lock.json",
  "ecosystem.config.cjs",
  ".env.example",
  ".env.homologation.example",
  "CHECKLIST_FINAL.md",
  "INSTALACAO.md",
  "app/(auth)/setup/page.tsx",
  "app/(auth)/setup/layout.tsx",
  "app/api/bootstrap/admin/route.ts",
  "lib/bootstrap/installation-status.ts",
  "lib/bootstrap/policy.ts",
  "proxy.ts",
  "scripts/check-bootstrap-fixed.mjs",
  "tests/contracts/bootstrap-public-route.test.mjs",
  "docs/ATLAS_ONE_V1000_CLEAN_RELEASE.md",
  "lib/auth/safe-redirect.ts",
  "components/crm/lead-operational-bar.tsx",
  "docs/HOSTINGER_FINAL_RELEASE_PHASE_100.md",
  "playwright.config.mjs",
  "supabase/seed.sql",
  "tests/e2e/login.spec.mjs",
  "tests/e2e/authenticated-journeys.spec.mjs",
  "app/(crm)/notifications/page.tsx",
  "components/atlas/notifications-v3000-surface.tsx",
  "components/atlas/v3000-page-template.tsx",
  "docs/V3000_PHASE_05_NOTIFICATIONS_PILOT.md",
  "docs/V3000_PHASE_06_ACCESSIBILITY_CONSOLIDATION.md",
  "docs/V3000_PHASE_07_VISUAL_PROOF.md",
  "docs/V3000_PHASE_08_AUTHENTICATED_RELEASE_GATE.md",
  "docs/V3000_PHASE_09_CONTROLLED_RELEASE.md",
  "docs/V3000_PHASE_10_ARTIFACT_PROOF.md",
  "tests/contracts/v3000-page-template.test.mjs",
  "tests/contracts/v3000-phase-09-controlled-release.test.mjs",
  "tests/contracts/v3000-phase-10-artifact-proof.test.mjs",
])
  if (!entries.includes(required))
    throw new Error(`Obrigatório ausente: ${required}`);
const manifest = JSON.parse(
    execFileSync("unzip", ["-p", zip, "HOSTINGER_PACKAGE.json"], {
      encoding: "utf8",
    }),
  ),
  head = (() => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  })();
const auditedRelease = /^atlas-one-audited-\d{8}-r\d{3}\.zip$/.test(packageName);
if (auditedRelease) {
  if (!entries.includes("RELEASE_TEST_REPORT.json"))
    throw new Error("Release auditada sem relatório interno de testes.");
  if (manifest.releaseTestReport !== "RELEASE_TEST_REPORT.json")
    throw new Error("Manifesto não referencia o relatório de testes.");
  const report = JSON.parse(
    execFileSync("unzip", ["-p", zip, "RELEASE_TEST_REPORT.json"], {
      encoding: "utf8",
    }),
  );
  const gates = Array.isArray(report.gates) ? report.gates : [];
  if (!gates.length || gates.some((gate) => gate.status !== "passed"))
    throw new Error("Relatório interno contém gate sem aprovação.");
}
const validSourceMode = ["git-archive", "workspace-content-hash"].includes(
  manifest.sourceMode,
);
const sourceProvenanceMatches =
  manifest.sourceMode === "git-archive"
    ? Boolean(head) && manifest.commit === head
    : !head || !manifest.commit || manifest.commit === head;
if (
  !validSourceMode ||
  !sourceProvenanceMatches ||
  !/^sha256:[a-f0-9]{64}$/.test(manifest.sourceFingerprint || "") ||
  manifest.privateDataIncluded !== false ||
  manifest.dependsOnV2 !== false
)
  throw new Error("Manifesto não corresponde à origem segura atual.");
if (
  packageName.includes("v3000-phase-10") &&
  (manifest.evolutionPhase !== 10 ||
    manifest.sourceMode !== "workspace-content-hash")
)
  throw new Error(
    "Release V3000 Fase 10 exige snapshot do workspace e evolutionPhase 10.",
  );
const packagedPackageJson = JSON.parse(
  execFileSync("unzip", ["-p", zip, "package.json"], { encoding: "utf8" }),
);
const packagedLock = JSON.parse(
  execFileSync("unzip", ["-p", zip, "package-lock.json"], {
    encoding: "utf8",
  }),
);
for (const dependency of [
  "next",
  "react",
  "react-dom",
  "tailwindcss",
  "@tailwindcss/postcss",
  "typescript",
]) {
  if (!packagedPackageJson.dependencies?.[dependency])
    throw new Error(`Dependência de build ausente em dependencies: ${dependency}`);
  if (!packagedLock.packages?.[`node_modules/${dependency}`])
    throw new Error(`Dependência ausente no lockfile: ${dependency}`);
}
const inventory = execFileSync("unzip", ["-p", zip, "RELEASE_FILES.sha256"], {
  encoding: "utf8",
})
  .trim()
  .split(/\r?\n/);
if (inventory.length < 100) throw new Error("Inventário interno incompleto.");
const extracted = mkdtempSync(join(tmpdir(), "atlas-v3-release-"));
try {
  execFileSync("unzip", ["-q", zip, "-d", extracted]);
  const sourceFiles = execFileSync("find", [".", "-type", "f"], {
    cwd: extracted,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(
      (file) =>
        !["./HOSTINGER_PACKAGE.json", "./RELEASE_FILES.sha256"].includes(file),
    )
    .sort();
  const sourceHash = createHash("sha256");
  for (const sourceFile of sourceFiles) {
    sourceHash.update(sourceFile.replace(/^\.\//, ""));
    sourceHash.update("\0");
    sourceHash.update(readFileSync(join(extracted, sourceFile)));
    sourceHash.update("\0");
  }
  const sourceFingerprint = `sha256:${sourceHash.digest("hex")}`;
  if (sourceFingerprint !== manifest.sourceFingerprint)
    throw new Error("Fingerprint da origem divergente.");
  for (const line of inventory) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new Error("Linha inválida no inventário interno.");
    const file = resolve(extracted, match[2]);
    if (!file.startsWith(`${extracted}/`) || !existsSync(file))
      throw new Error(`Arquivo inventariado ausente: ${match[2]}`);
    const digest = createHash("sha256")
      .update(readFileSync(file))
      .digest("hex");
    if (digest !== match[1])
      throw new Error(`Integridade interna divergente: ${match[2]}`);
  }
} finally {
  rmSync(extracted, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    ok: true,
    zip,
    files: entries.length,
    bytes: bytes.length,
    sha256: actual,
    commit: head,
    sourceMode: manifest.sourceMode,
    sourceFingerprint: manifest.sourceFingerprint,
    evolutionPhase: manifest.evolutionPhase,
    inventoryEntries: inventory.length,
  }),
);
