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
/**
 * A LISTA AQUI TEM DE SER PELO MENOS TÃO LARGA QUANTO A DO EMPACOTADOR.
 *
 * `scripts/package-hostinger.mjs` exclui `.env` sem sufixo, `.whatsapp-sessions`
 * e `logs`; esta verificação não conferia nenhum dos três. Régua mais fraca que a
 * regra não protege: se o empacotador deixasse passar um `.env` de produção, o
 * verificador diria que está tudo certo — e o ZIP sai com credencial dentro.
 *
 * Divergência entre duas listas que precisam concordar é a classe de defeito mais
 * cara deste repositório. Aqui ela custaria segredo publicado.
 */
const forbidden = entries.filter(
  (e) =>
    /(^|\/)(?:\.env|\.env\.[^/]+|hostinger\.env|node_modules|\.next|tmp|outputs|dist|\.git|whatsapp-sessions|\.whatsapp-sessions|logs)(?:\/|$)/.test(
      e,
    ) || /\.(?:xlsx?|csv|pdf|pem|key|p12|pfx)$/i.test(e),
);
// `.env.example` é o único que PODE entrar: só tem nomes de variável, sem valor,
// e o empacotador o inclui de propósito para quem for provisionar o ambiente.
const permitidos = new Set([".env.example"]);
const proibidosDeVerdade = forbidden.filter((e) => !permitidos.has(e.replace(/^atlas-v3\//, "")));
if (proibidosDeVerdade.length)
  throw new Error(`Conteúdo proibido: ${proibidosDeVerdade.slice(0, 5).join(", ")}`);
for (const required of [
  "HOSTINGER_PACKAGE.json",
  "RELEASE_FILES.sha256",
  "package.json",
  "package-lock.json",
  "ecosystem.config.cjs",
  "lib/auth/safe-redirect.ts",
  "components/crm/lead-operational-bar.tsx",
  "docs/HOSTINGER_FINAL_RELEASE_PHASE_100.md",
])
  if (!entries.includes(required))
    throw new Error(`Obrigatório ausente: ${required}`);
const manifest = JSON.parse(
    execFileSync("unzip", ["-p", zip, "HOSTINGER_PACKAGE.json"], {
      encoding: "utf8",
    }),
  ),
  head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
if (
  manifest.commit !== head ||
  manifest.privateDataIncluded !== false ||
  manifest.dependsOnV2 !== false
)
  throw new Error("Manifesto não corresponde ao commit seguro atual.");
const inventory = execFileSync("unzip", ["-p", zip, "RELEASE_FILES.sha256"], {
  encoding: "utf8",
})
  .trim()
  .split(/\r?\n/);
if (inventory.length < 100) throw new Error("Inventário interno incompleto.");
const extracted = mkdtempSync(join(tmpdir(), "atlas-v3-release-"));
try {
  execFileSync("unzip", ["-q", zip, "-d", extracted]);
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
    inventoryEntries: inventory.length,
  }),
);
