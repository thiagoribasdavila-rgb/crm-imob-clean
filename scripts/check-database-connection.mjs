/**
 * check-database-connection.mjs — conexão com o banco de homologação.
 *
 * ── O QUE MUDOU EM 2026-07-29, E POR QUÊ ────────────────────────────────────
 *
 * Antes, os quatro desfechos saíam todos com código 1: "o ambiente não está
 * provisionado", "a URL não existe", "faltou npm ci" e "a conexão falhou de
 * verdade" eram indistinguíveis para quem lê o agregado. A quarentena de
 * `scripts/portoes-todos.mjs` dizia que este portão parava por falta de
 * connection string — mas, executado nesta máquina, ele nunca chegava perto
 * disso: parava no PRIMEIRO crivo, o dos rótulos de ambiente.
 *
 * Medido (2026-07-29, .env.local do repositório):
 *   ATLAS_ENV=production  ·  ATLAS_DATABASE_ENVIRONMENT contém uma connection
 *   string com a senha ainda em [YOUR-PASSWORD], apontando para o projeto de
 *   PRODUÇÃO — onde o código espera um RÓTULO ("homologation"/"production").
 *
 * Então agora o script separa NÃO MEDIDO de MEDIDO E QUEBRADO, no mesmo padrão
 * de `check-rls-leads-cerca.mjs`:
 *   código 2 → não executado (proteção de ambiente, ou falta de credencial)
 *   código 1 → executou e falhou (host, senha, SSL, allowlist)
 *   código 0 → conectou e rodou `select 1;` sem alterar nada
 *
 * Nada foi afrouxado: continua exigindo que o banco esteja identificado como
 * homologation, e o desfecho vermelho continua vermelho. O que passou a existir
 * é a diferença entre não ter medido e ter medido.
 *
 * Nenhum ramo imprime a connection string: ela carrega senha.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const naoExecutado = (motivo, detalhe) => {
  console.error(`ATLAS DATABASE CONNECTION: NÃO EXECUTADO — ${motivo}`);
  if (detalhe) console.error(detalhe);
  process.exit(2);
};

const environment = process.env.ATLAS_ENV;
const databaseEnvironment = process.env.ATLAS_DATABASE_ENVIRONMENT;
const databaseUrl = process.env.DATABASE_URL || "";

/**
 * Proteção deliberada: este portão só aceita o banco identificado como
 * homologation. Em produção ele NÃO deve passar — deve declarar que não mediu.
 */
if (environment !== "homologation" || databaseEnvironment !== environment) {
  naoExecutado(
    "o ambiente não se identifica como homologation; recusado antes de tentar conectar.",
    `ATLAS_ENV=${environment ? JSON.stringify(environment) : "(vazio)"} · ` +
      `ATLAS_DATABASE_ENVIRONMENT=${databaseEnvironment ? (/^[a-z_]+$/.test(databaseEnvironment) ? JSON.stringify(databaseEnvironment) : "(não é um rótulo — parece uma connection string)") : "(vazio)"}\n` +
      "Os dois precisam valer exatamente \"homologation\".",
  );
}

let urlValida = false;
try {
  const parsed = new URL(databaseUrl);
  urlValida = ["postgres:", "postgresql:"].includes(parsed.protocol) && Boolean(parsed.hostname) && parsed.pathname !== "/";
} catch {
  urlValida = false;
}
if (!urlValida) {
  naoExecutado(
    "DATABASE_URL ausente ou inválida.",
    `presente=${databaseUrl ? "sim" : "não"} — exige postgres(ql)://host:porta/banco. ` +
      "O valor não é impresso: carrega senha.",
  );
}

const prisma = resolve("node_modules/.bin/prisma");
if (!existsSync(prisma)) naoExecutado("dependências ausentes. Execute npm ci.");

const result = spawnSync(prisma, ["db", "execute", "--stdin"], {
  cwd: process.cwd(),
  env: process.env,
  input: "select 1;",
  encoding: "utf8",
  timeout: 30_000,
});
if (result.status !== 0) {
  console.error("ATLAS DATABASE CONNECTION: FALHOU sem executar alterações. Revise host, senha, SSL e allowlist.");
  process.exit(1);
}
console.log("ATLAS DATABASE CONNECTION: PASSED (homologation; SELECT 1; alterações executadas: 0)");
