#!/usr/bin/env node
/**
 * INSTALA O AGENDAMENTO — e recusa em qualquer máquina que não seja o servidor.
 *
 * ── POR QUE ESTE SCRIPT É SEPARADO DO GERADOR ───────────────────────────────
 *
 * Em 2026-07-30 foi entregue o comando:
 *
 *     node scripts/gera-crontab-dos-workers.mjs > /tmp/atlas.cron && crontab /tmp/atlas.cron
 *
 * Ele juntava GERAR e INSTALAR num `&&`. Foi executado no Mac de desenvolvimento e
 * agendou 11 workers comerciais na máquina local, apontando para PRODUÇÃO —
 * inclusive o `outbox`, que envia mensagem de verdade, a cada 2 minutos.
 *
 * Não houve dano porque `/var/www/atlas/.env` não existe no Mac e o `source`
 * abortava antes do `curl` (provado na fila: dois eventos elegíveis seguiram
 * intocados por 373 minutos). Foi acidente de caminho, não proteção.
 *
 * `gerar && instalar` numa linha só apaga o passo em que alguém OLHA. Agora são
 * três comandos, e o do meio é obrigatório:
 *
 *     npm run cron:gerar     # imprime; não toca em nada
 *     npm run cron:validar   # diz SE esta máquina poderia instalar, e por quê
 *     npm run cron:instalar  # só funciona no servidor autorizado
 *
 * ── O QUE ELE NUNCA FAZ ─────────────────────────────────────────────────────
 *
 * · Não usa `crontab -r` — isso apagaria agendamentos de terceiros.
 * · Não imprime o valor de segredo nenhum.
 * · Não instala sem `ATLAS_AUTORIZA_INSTALAR_CRON` com a frase exata.
 * · Não substitui linhas que não sejam do Atlas: preserva o resto do crontab.
 *
 * Uso:
 *   node scripts/instala-crontab-no-servidor.mjs --validar
 *   node scripts/instala-crontab-no-servidor.mjs --instalar
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { hostname, userInfo, tmpdir } from "node:os";
import { join } from "node:path";

import { avaliarAutorizacaoDeInstalacao, VALOR_DE_AUTORIZACAO } from "../lib/deploy/autorizacao-de-instalacao.ts";

const MODO = process.argv.includes("--instalar") ? "instalar" : "validar";
const DIRETORIO_DA_APLICACAO = process.env.ATLAS_APP_DIR || "/var/www/atlas";
const MARCADOR = "# ATLAS ONE — agendamento dos workers";

const ambiente = {
  plataforma: process.platform,
  hostname: hostname(),
  usuario: (() => {
    try {
      return userInfo().username;
    } catch {
      return "(desconhecido)";
    }
  })(),
  diretorioDaAplicacaoExiste: existsSync(DIRETORIO_DA_APLICACAO),
  diretorioDaAplicacao: DIRETORIO_DA_APLICACAO,
  autorizacaoExplicita: process.env.ATLAS_AUTORIZA_INSTALAR_CRON,
  hostnamesAutorizados: (process.env.ATLAS_HOSTNAMES_AUTORIZADOS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
};

console.log("máquina:");
console.log(`  plataforma ......... ${ambiente.plataforma}`);
console.log(`  hostname ........... ${ambiente.hostname}`);
console.log(`  usuário ............ ${ambiente.usuario}`);
console.log(`  ${DIRETORIO_DA_APLICACAO} ... ${ambiente.diretorioDaAplicacaoExiste ? "existe" : "NÃO existe"}`);
// Só o BOOLEANO da autorização sai daqui, nunca o valor lido.
console.log(`  autorização explícita  ${ambiente.autorizacaoExplicita ? "presente" : "AUSENTE"}`);
console.log();

const veredito = avaliarAutorizacaoDeInstalacao(ambiente);

if (!veredito.autorizado) {
  console.log(`✘ INSTALAÇÃO RECUSADA nesta máquina.\n`);
  console.log(`  ${veredito.motivo}\n`);
  console.log("  Workers comerciais instalados fora do servidor disparam mensagem real");
  console.log("  a partir de uma máquina que ninguém está observando. Foi o que quase");
  console.log("  aconteceu em 2026-07-30, e só não aconteceu por acaso.\n");
  console.log("  No SERVIDOR, e só nele:");
  console.log(`      export ATLAS_AUTORIZA_INSTALAR_CRON="${VALOR_DE_AUTORIZACAO}"`);
  console.log("      node scripts/instala-crontab-no-servidor.mjs --instalar");
  process.exit(1);
}

console.log(`✔ ${veredito.motivo}`);

if (MODO === "validar") {
  console.log("\n  Modo VALIDAR: nada foi alterado. Para instalar, repita com --instalar.");
  process.exit(0);
}

// ── A partir daqui, instala de verdade ──────────────────────────────────────

const gerado = execFileSync(process.execPath, ["scripts/gera-crontab-dos-workers.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
});
if (!gerado.includes(MARCADOR)) {
  console.error("✘ o gerador não produziu o bloco esperado — instalação abortada.");
  process.exit(1);
}

const atual = (() => {
  try {
    return execFileSync("crontab", ["-l"], { encoding: "utf8" });
  } catch {
    return ""; // sem crontab ainda é um estado legítimo
  }
})();

// Backup ANTES de qualquer escrita, com o conteúdo íntegro.
const pasta = mkdtempSync(join(tmpdir(), "atlas-cron-"));
const backup = join(pasta, "crontab-antes.txt");
writeFileSync(backup, atual);
console.log(`\n  backup do crontab atual: ${backup} (${atual.split("\n").length} linhas)`);

/**
 * Preserva o que não é do Atlas. `crontab -r` apagaria agendamento de terceiro —
 * e num servidor compartilhado isso é estrago silencioso que só aparece quando a
 * tarefa do outro deixa de rodar.
 */
const linhasPreservadas = atual
  .split("\n")
  .filter((l) => !l.includes("atlasaios.com.br") && !l.startsWith("# ATLAS ONE") && !/^# GERADO por scripts\/gera-crontab/.test(l));
const preservadasNaoVazias = linhasPreservadas.filter((l) => l.trim() && !l.trim().startsWith("#")).length;

const novo = [...linhasPreservadas.filter((l) => l.trim()), "", gerado.trim(), ""].join("\n");
const arquivo = join(pasta, "crontab-novo.txt");
writeFileSync(arquivo, novo);
execFileSync("crontab", [arquivo]);

const depois = execFileSync("crontab", ["-l"], { encoding: "utf8" });
const instaladas = depois.split("\n").filter((l) => l.includes("atlasaios.com.br")).length;
const nomes = [...depois.matchAll(/\/var\/log\/atlas\/([a-z0-9-]+)\.log/g)].map((m) => m[1]);

console.log(`\n✔ instalado.`);
console.log(`  entradas do Atlas ....... ${instaladas}`);
console.log(`  workers ................. ${nomes.join(", ")}`);
console.log(`  linhas de terceiros preservadas: ${preservadasNaoVazias}`);
console.log(`\n  A prova NÃO é este comando ter saído certo. É o efeito:`);
console.log(`    · um evento sair de attempts=0 SOZINHO, em até 5 minutos;`);
console.log(`    · /api/v1/ready passar a declarar execução recente.`);
console.log(`\n  Rollback:  crontab ${backup}`);
