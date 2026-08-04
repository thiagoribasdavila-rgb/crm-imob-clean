import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const root = process.cwd();
const outputRoot = resolve(root, "dist/hostinger");
const stage = join(outputRoot, "atlas-v3");
const packageName = process.env.ATLAS_PACKAGE_NAME || "atlas-v3-hostinger-homologation.zip";
if (!/^atlas-v3-[a-z0-9-]+\.zip$/.test(packageName) && packageName !== "ATLAS_AI_OS_RELEASE_v1.zip") throw new Error("Nome de pacote inválido.");
const zipPath = join(outputRoot, packageName);
const checksumPath = `${zipPath}.sha256`;
const trackedChanges = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=no"],
  { cwd: root, encoding: "utf8" },
).trim();
if (trackedChanges)
  throw new Error(
    "Existem alterações versionadas sem commit. Registre-as antes de gerar o pacote Hostinger.",
  );

mkdirSync(outputRoot, { recursive: true });
rmSync(stage, { recursive: true, force: true });
rmSync(zipPath, { force: true });
rmSync(checksumPath, { force: true });
mkdirSync(stage, { recursive: true });
const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], {
  cwd: root,
  maxBuffer: 50 * 1024 * 1024,
});
execFileSync("tar", ["-xf", "-", "-C", stage], { input: archive });

for (const relativePath of legacyRoutePaths)
  rmSync(join(stage, relativePath), { recursive: true, force: true });
for (const relativePath of [
  "AGENTS.md",
  "CLAUDE.md",
  "core",
  "logs",
  "application",
  "domain",
  "components/ui/ProtectedRoute.tsx",
  "lib/data",
  "lib/services",
  "public/file.svg",
  "public/globe.svg",
  "public/next.svg",
  "public/vercel.svg",
  "public/window.svg",
])
  rmSync(join(stage, relativePath), { recursive: true, force: true });

const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const sourceTimestamp = execFileSync(
  "git",
  ["show", "-s", "--format=%cI", "HEAD"],
  { cwd: root, encoding: "utf8" },
).trim();
const releaseVersion = JSON.parse(
  readFileSync(join(stage, "package.json"), "utf8"),
).version;
writeFileSync(
  join(stage, "HOSTINGER_PACKAGE.json"),
  `${JSON.stringify(
    {
      application: "Atlas V3",
      commit,
      releaseVersion,
      sourceTimestamp,
      target: "Hostinger Node.js 20.9+",
      releaseChannel: packageName === "atlas-v3-hostinger-homologation.zip"
        ? "hostinger-homologation-candidate"
        : "final-homologation-candidate",
      evolutionPhase: process.env.ATLAS_EVOLUTION_PHASE
        ? Number(process.env.ATLAS_EVOLUTION_PHASE)
        : null,
      cleanInstall: true,
      dependsOnV2: false,
      startCommand: "npm start",
      processManager: "pm2 start ecosystem.config.cjs",
      privateDataIncluded: false,
      legacyPrototypeRoutesIncluded: false,
      unusedConceptualCoreIncluded: false,
      fileInventory: "RELEASE_FILES.sha256",
    },
    null,
    2,
  )}\n`,
);

const stagedFiles = execFileSync("find", [".", "-type", "f"], {
  cwd: stage,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();
const inventory = stagedFiles
  .map(
    (file) =>
      `${createHash("sha256")
        .update(readFileSync(join(stage, file)))
        .digest("hex")}  ${file.replace(/^\.\//, "")}`,
  )
  .join("\n");
writeFileSync(join(stage, "RELEASE_FILES.sha256"), `${inventory}\n`);
const releaseEpoch = execFileSync(
  "git",
  ["show", "-s", "--format=%ct", "HEAD"],
  { cwd: root, encoding: "utf8" },
).trim();
const releaseDate = new Date(Number(releaseEpoch) * 1000);
const touchTimestamp = `${releaseDate.getUTCFullYear()}${String(releaseDate.getUTCMonth() + 1).padStart(2, "0")}${String(releaseDate.getUTCDate()).padStart(2, "0")}${String(releaseDate.getUTCHours()).padStart(2, "0")}${String(releaseDate.getUTCMinutes()).padStart(2, "0")}.${String(releaseDate.getUTCSeconds()).padStart(2, "0")}`;
execFileSync(
  "find",
  [".", "-type", "f", "-exec", "touch", "-t", touchTimestamp, "{}", ";"],
  { cwd: stage, env: { ...process.env, TZ: "UTC" } },
);
const zipFiles = execFileSync("find", [".", "-type", "f"], {
  cwd: stage,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();
execFileSync("zip", ["-Xq", zipPath, "-@"], {
  cwd: stage,
  input: `${zipFiles.join("\n")}\n`,
  env: { ...process.env, TZ: "UTC" },
});
const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
/**
 * ── QUALQUER `.env` REAL, E NÃO UMA LISTA DE NOMES CONHECIDOS ────────────────
 *
 * O padrão anterior enumerava `\.env` e `\.env\.local` e fechava com
 * `(?:\/|$)`. Essa âncora exige que o nome TERMINE ali — então bastava um
 * sufixo para escapar. MEDIDO em 03/08/2026, com os arquivos que existem hoje
 * no disco deste projeto:
 *
 *     .env                      BLOQUEADO
 *     .env.local                BLOQUEADO
 *     .env.hostinger            PASSAVA   ← valores de produção
 *     .env.hostinger-template   PASSAVA
 *     atlas/.env.hostinger      PASSAVA   (aninhado, mesmo para `.env.local`)
 *
 * Lista de nomes conhecidos é a forma errada de escrever esta regra: ela
 * protege contra os arquivos que existiam quando alguém a escreveu, e o
 * próximo `.env.` qualquer entra calado. A inversão é o conserto — proíbe-se
 * TUDO que comece com `.env`, e abrem-se exceções DECLARADAS para os dois
 * exemplos que o pacote precisa levar.
 *
 * Assim um arquivo novo nasce bloqueado, e liberá-lo exige um gesto explícito
 * aqui — que é exatamente onde a decisão deve ser tomada.
 */
const EXEMPLOS_QUE_PODEM_IR = new Set([".env.example", ".env.production.example"]);
const ehEnvProibido = (entry) => {
  const nome = entry.split("/").filter(Boolean).pop() ?? "";
  const pareceEnv = nome.startsWith(".env") || nome === "hostinger.env";
  return pareceEnv && !EXEMPLOS_QUE_PODEM_IR.has(nome);
};

const forbidden = entries.filter(
  (entry) =>
    ehEnvProibido(entry) ||
    // Sessões de WhatsApp são credencial de acesso total à conta do corretor.
    // O lugar delas é ATLAS_WHATSAPP_SESSION_DIR, fora do repositório — esta
    // linha existe para o caso de alguém apontar o diretório para cá.
    /(^|\/)(?:node_modules|\.next|tmp|outputs|dist|\.git|whatsapp-sessions|\.whatsapp-sessions|logs)(?:\/|$)/.test(
      entry,
    ) || /\.(?:xlsx?|csv|pdf)$/i.test(entry) || /(^|\/)qr-[^/]*\.png$/i.test(entry),
);
if (forbidden.length)
  throw new Error(
    `Pacote contém arquivos proibidos: ${forbidden.slice(0, 10).join(", ")}`,
  );
for (const required of [
  "package.json",
  "package-lock.json",
  "ecosystem.config.cjs",
  ".env.example",
  "HOSTINGER_PACKAGE.json",
  "RELEASE_FILES.sha256",
  "docs/HOSTINGER_FINAL_RELEASE_PHASE_100.md",
  "docs/EVOLUTION_PHASE_101_HOMOLOGATION_PACKAGE.md",
  "lib/auth/safe-redirect.ts",
  "components/crm/lead-operational-bar.tsx",
  "CREDENCIAIS_E_CUSTOS_ATLAS_ONE.md",
  "workers/whatsapp-bridge.mjs",
  "supabase/migrations/20260727030000_presenca_viva_e_sessao_whatsapp.sql",
]) {
  if (!entries.includes(required))
    throw new Error(`Arquivo obrigatório ausente no ZIP: ${required}`);
}
const bytes = readFileSync(zipPath);
const checksum = createHash("sha256").update(bytes).digest("hex");
writeFileSync(checksumPath, `${checksum}  ${packageName}\n`);
if (!existsSync(zipPath)) throw new Error("ZIP Hostinger não foi criado.");
console.log(
  JSON.stringify({
    ok: true,
    zipPath,
    checksumPath,
    commit,
    files: entries.length,
    bytes: bytes.length,
    checksum,
  }),
);
