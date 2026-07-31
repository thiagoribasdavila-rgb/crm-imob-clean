import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";
import { createRouteQuarantine } from "./route-quarantine.mjs";

const root = process.cwd();

/**
 * ── A PROCEDÊNCIA DO BUILD ──────────────────────────────────────────────────
 *
 * Em 2026-07-30 foi preciso DEDUZIR qual commit estava em produção pela ausência
 * de uma chave na resposta de `/api/v1/ready`: `agendamento` não aparecia, logo o
 * build era anterior ao commit que a introduziu. Arqueologia só funciona
 * enquanto alguém lembra qual commit acrescentou o quê.
 *
 * A pergunta "a produção está rodando o código que eu auditei?" tem de ter
 * resposta direta — dela dependem todas as outras. Correção publicada no git e
 * ausente no servidor é correção que não existe.
 *
 * Estas três variáveis são gravadas no build e devolvidas por `/api/v1/ready`.
 * Quando o `git` não está disponível (build a partir de tarball, por exemplo),
 * elas ficam AUSENTES em vez de receber um valor inventado — e a rota declara o
 * motivo. "Não declarado" é informação diferente de "commit X".
 *
 * Nada aqui é segredo: SHA e nome de branch são públicos por natureza.
 */
function descobrirProcedencia() {
  const gitOu = (args) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    const valor = r.status === 0 ? String(r.stdout || "").trim() : "";
    return valor || null;
  };
  /**
   * O TOPO DAS MIGRATIONS DO REPOSITÓRIO.
   *
   * Sozinho não diz nada; o valor está na COMPARAÇÃO com o que o banco reporta
   * (`public.estado_das_migrations()`). Medido em 2026-07-31: 218 aplicadas no
   * banco contra 173 arquivos no repositório — o banco tem coisa que o repo não
   * reproduz, e é essa divergência que a prontidão passa a publicar em vez de
   * deixar para alguém descobrir num deploy.
   */
  let topoDeMigration = null;
  try {
    const dir = resolve(root, "supabase/migrations");
    if (existsSync(dir)) {
      // Compara por NOME, nunca por versão. O banco grava `version` como o
      // carimbo de QUANDO aplicou, não o prefixo do arquivo: medido em
      // 2026-07-31, o arquivo 20260731020000_estado_das_migrations_para_prontidao
      // virou a linha 20260731013305 no banco. Comparar números daria falso
      // vermelho PERMANENTE — e portão que grita sempre ensina a ser ignorado.
      topoDeMigration = readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.replace(/^\d+_/, "").replace(/\.sql$/, ""))
        .sort()
        .join(",");
    }
  } catch {
    topoDeMigration = null; // ausência declarada; a rota diz "não medido"
  }

  const procedencia = {
    ATLAS_BUILD_COMMIT: process.env.ATLAS_BUILD_COMMIT || gitOu(["rev-parse", "HEAD"]),
    ATLAS_BUILD_BRANCH: process.env.ATLAS_BUILD_BRANCH || gitOu(["rev-parse", "--abbrev-ref", "HEAD"]),
    ATLAS_BUILD_TIME: process.env.ATLAS_BUILD_TIME || new Date().toISOString(),
    ATLAS_BUILD_MIGRATIONS: process.env.ATLAS_BUILD_MIGRATIONS || topoDeMigration,
  };
  // Árvore suja significa que o que está no ar não corresponde a NENHUM commit —
  // e é exatamente essa a situação que faz a pergunta "qual versão está no ar?"
  // não ter resposta. O build não é bloqueado; a resposta passa a dizer a verdade.
  const sujo = gitOu(["status", "--porcelain"]);
  if (sujo) {
    procedencia.ATLAS_BUILD_COMMIT = `${procedencia.ATLAS_BUILD_COMMIT ?? "sem-git"}+arvore-suja`;
    console.warn(
      `ATLAS build: árvore de trabalho com ${sujo.split("\n").length} alteração(ões) não commitada(s).\n` +
        "  O commit publicado em /api/v1/ready sai marcado como `+arvore-suja`:\n" +
        "  o que está no ar não corresponde a nenhum commit do repositório.",
    );
  }
  for (const [chave, valor] of Object.entries(procedencia)) {
    if (valor) process.env[chave] = valor;
  }
  console.log(
    `ATLAS build: commit ${procedencia.ATLAS_BUILD_COMMIT ?? "(não declarado)"} · ` +
      `branch ${procedencia.ATLAS_BUILD_BRANCH ?? "(não declarada)"}`,
  );
  return procedencia;
}

descobrirProcedencia();
const quarantine = createRouteQuarantine({ root, paths: legacyRoutePaths, mode: "build" });
const nextBin = resolve(root, "node_modules/next/dist/bin/next");
// O padrão é o turbopack porque é o que este projeto já usava (`next build` sem
// flag no Next 16) e é o perfil de chunking que o orçamento de performance mede:
// com webpack o build gera 772 chunks contra o teto de 600 e reprova
// check-performance-budget. Manter webpack como opção explícita ainda é útil —
// ele valida o contrato de página do Next, que o turbopack não checa.
const requestedBundler = (process.env.ATLAS_NEXT_BUNDLER || "turbopack").toLowerCase();

if (!existsSync(nextBin)) {
  throw new Error(
    "Next.js não está instalado localmente. Execute `npm ci` antes do build.",
  );
}

if (!["webpack", "turbopack"].includes(requestedBundler)) {
  throw new Error(
    "ATLAS_NEXT_BUNDLER deve ser `webpack` ou `turbopack`.",
  );
}

try {
  const buildArgs = [nextBin, "build"];
  if (requestedBundler === "webpack") buildArgs.push("--webpack");

  console.log(
    `ATLAS build: Next.js com ${requestedBundler} (runtime local, sem download implícito).`,
  );

  const result = spawnSync(process.execPath, buildArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  process.exitCode = result.status ?? 1;
} finally {
  quarantine.restore();
}
