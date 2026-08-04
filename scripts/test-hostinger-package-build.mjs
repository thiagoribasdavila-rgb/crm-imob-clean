/**
 * ENSAIO DO PACOTE — descompacta, instala e BUILDA como a Hostinger faria.
 *
 * ── O DEFEITO QUE TORNAVA ESTE ENSAIO IMPOSSÍVEL DE PASSAR ──────────────────
 *
 * Ele COPIAVA o `.env.local` para dentro do stage e mandava buildar. Só que a
 * guarda de `scripts/build.mjs` — a que existe desde o incidente de 31/07/2026,
 * quando um build sem as `NEXT_PUBLIC_*` subiu, respondeu 200 e não deixou
 * ninguém entrar — lê `process.env`, não o arquivo. Copiar não exporta.
 *
 * Resultado medido em 03/08/2026: `npm ci` passava (1.381 pacotes) e o build
 * morria em "BUILD RECUSADO — faltam variáveis que são ASSADAS NO BUNDLE".
 * Ou seja: o único ensaio capaz de provar que o pacote sobe NUNCA passava, e a
 * falha parecia do pacote quando era da ferramenta.
 *
 * A guarda está CERTA e não se toca: na Hostinger as variáveis vivem na aba de
 * ambiente do painel (runbook, Anexo C, B.2 passo 3) — isto é, no AMBIENTE.
 * Quem precisava reproduzir produção era o ensaio.
 *
 * Agora o arquivo é lido e injetado no ambiente do processo filho. Os valores
 * não são impressos, não entram em log e morrem com o processo — o stage
 * inteiro é apagado no `finally`.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Lê um arquivo de ambiente para um objeto. Deliberadamente simples: só
 * `CHAVE=valor`, ignorando comentário e linha vazia, com aspas removidas das
 * pontas. Não interpola, não executa nada — este arquivo tem segredo de
 * produção dentro e não é lugar para esperteza.
 */
function lerAmbiente(caminho) {
  const saida = {};
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const corte = limpa.indexOf("=");
    if (corte < 1) continue;
    const chave = limpa.slice(0, corte).trim().replace(/^export\s+/, "");
    let valor = limpa.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (chave) saida[chave] = valor;
  }
  return saida;
}

const root = process.cwd();
// Mesmo contrato de nome do produtor (scripts/package-hostinger.mjs): o ensaio
// precisa abrir o pacote que o release realmente gera. Apontar para um nome
// antigo faz o teste passar sobre um artefato obsoleto que sobrou em disco.
const packageName = process.env.ATLAS_PACKAGE_NAME || "atlas-v3-hostinger-homologation.zip";
const zip = resolve(root, "dist/hostinger", packageName);
const envFile = resolve(root, process.env.ATLAS_PACKAGE_ENV_FILE || ".env.local");
if (!existsSync(zip)) throw new Error("Gere o ZIP Hostinger antes do build limpo.");
if (!existsSync(envFile)) throw new Error("Arquivo de ambiente local ausente para o ensaio.");

const stage = mkdtempSync(join(tmpdir(), "atlas-hostinger-clean-build-"));
try {
  execFileSync("unzip", ["-q", zip, "-d", stage]);
  // O arquivo continua indo para o stage: é assim que o Next lê em runtime.
  copyFileSync(envFile, join(stage, ".env.local"));
  execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: stage, stdio: "inherit" });

  // E o mesmo conteúdo vai para o AMBIENTE do filho, que é onde a guarda de
  // build procura — reproduzindo a aba de variáveis do painel da Hostinger.
  const ambiente = { ...process.env, ...lerAmbiente(envFile) };
  const assadasNoBundle = Object.keys(ambiente).filter((k) => k.startsWith("NEXT_PUBLIC_")).length;
  execFileSync("npm", ["run", "build"], { cwd: stage, stdio: "inherit", env: ambiente });

  console.log(
    JSON.stringify({
      ok: true,
      cleanInstall: true,
      cleanBuild: true,
      secretsPackaged: false,
      // A CONTAGEM, jamais os valores. Zero aqui significaria que o ensaio
      // buildou sem nada assado — o defeito de 31/07 passando de novo, agora
      // com um "ok: true" em cima.
      variaveisPublicasAssadas: assadasNoBundle,
    }),
  );
} finally {
  rmSync(stage, { recursive: true, force: true });
}
