#!/usr/bin/env node
/**
 * O REPOSITÓRIO COMPILA NUM CLONE LIMPO?
 *
 * ── O DEFEITO QUE ISTO EXISTE PARA IMPEDIR ──────────────────────────────────
 *
 * Medido em 2026-07-30: OITO módulos fora do git eram importados por código
 * dentro do git. Um `git clone` seguido de `npm run build` falhava com TS2307 —
 * e nada acusava, porque na máquina de quem trabalhava os arquivos existiam.
 *
 *   components/atlas/OfertaAtivaDoAcervoPanel  <- app/(crm)/command-center
 *   lib/integrations/prontidao-das-integracoes <- app/api/v1/ready
 *   lib/ai/prontidao-generativa                <- api/ai/briefing, api/v1/ready
 *   ... e mais cinco
 *
 * Dois deles entraram por um commit que versionou telas COM o import pendurado,
 * sem versionar o módulo. O `tsc` local passou o tempo todo: ele lê o disco, não
 * o índice do git.
 *
 * Consequência medida: 294 dos 1087 testes da suíte — 27% — dependiam de arquivos
 * que não existiam para quem clonasse. O relatório dizia "1087 testes, 0 falhas"
 * sobre uma verificação que um quarto não existia.
 *
 * ── POR QUE NÃO BASTA `tsc` ─────────────────────────────────────────────────
 *
 * `tsc --noEmit` resolve pelo sistema de arquivos e fica verde com o arquivo
 * presente e não rastreado. Só a comparação com o ÍNDICE DO GIT pega isto — e é
 * por isso que este portão existe separado do typecheck.
 *
 * ── UMA ARMADILHA JÁ PAGA NA PRÓPRIA IMPLEMENTAÇÃO ──────────────────────────
 *
 * A primeira versão desta varredura usava `git ls-files '*.ts'` e devolveu ZERO
 * onde havia oito. O glob não expandiu para caminhos aninhados, e o resultado
 * falso-verde só foi descoberto porque alguém SABIA de um contraexemplo. Aqui a
 * lista vem da saída do comando, linha a linha, sem glob de shell.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const linhas = (comando) =>
  execSync(comando, { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 })
    .toString()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const ehCodigo = (p) => /\.(ts|tsx)$/.test(p);
const semExtensao = (p) => p.replace(/\.tsx?$/, "");

const rastreados = linhas("git ls-files").filter(ehCodigo);
const naoRastreados = linhas("git ls-files --others --exclude-standard").filter(ehCodigo);

/** Módulo alcançável pelo alias `@/` → o caminho sem extensão. */
const foraDoGit = new Map(naoRastreados.map((p) => [semExtensao(p), p]));

const pendurados = [];
for (const arquivo of rastreados) {
  let fonte;
  try {
    fonte = readFileSync(arquivo, "utf8");
  } catch {
    continue; // arquivo removido entre o `ls-files` e a leitura
  }
  // Só o alias `@/`: import relativo entre arquivos rastreados não é o caso, e
  // import de pacote não passa por aqui.
  for (const casamento of fonte.matchAll(/from\s+"@\/([^"]+)"/g)) {
    const modulo = casamento[1];
    if (foraDoGit.has(modulo)) {
      pendurados.push({ arquivo, modulo, caminho: foraDoGit.get(modulo) });
    }
  }
}

/**
 * ── O MESMO DEFEITO POR OUTRO MECANISMO: `fs`, NAO `import` ────────────────
 *
 * `lib/ai/orcamento-de-ia.ts` esta rastreado e le
 * `config/orcamento-e-autonomia-da-ia.json` com `readFileSync`, dentro de um
 * try/catch que devolve `null` em silencio. Num clone limpo o arquivo nao existe,
 * o teto de gasto da IA passa a vir de padroes do codigo em vez da declaracao do
 * dono, e NADA avisa — nem o `tsc`, nem a varredura de imports acima.
 *
 * Degradar em silencio e pior que quebrar: quebrar avisa.
 *
 * A deteccao e por NOME de arquivo `.json` citado em codigo rastreado, resolvido
 * contra `config/`. E estreita de proposito — cobre o padrao que este projeto usa,
 * e nao tenta adivinhar caminho montado dinamicamente.
 */
const configsRastreadas = new Set(linhas("git ls-files").filter((p) => p.startsWith("config/")));
const configsFora = new Set(
  linhas("git ls-files --others --exclude-standard").filter((p) => p.startsWith("config/") && p.endsWith(".json")),
);

const configPendurada = [];
for (const arquivo of rastreados) {
  let fonte;
  try {
    fonte = readFileSync(arquivo, "utf8");
  } catch {
    continue;
  }
  for (const casamento of fonte.matchAll(/"([a-z0-9][a-z0-9._-]*\.json)"/gi)) {
    const alvo = `config/${casamento[1]}`;
    if (configsFora.has(alvo) && !configsRastreadas.has(alvo)) {
      configPendurada.push({ arquivo, alvo });
    }
  }
}

console.log(`arquivos de codigo rastreados: ${rastreados.length}`);
console.log(`modulos de codigo fora do git: ${naoRastreados.length}`);

if (configPendurada.length > 0) {
  console.log(`\n✘ ${configPendurada.length} configuracao(oes) lida(s) por codigo rastreado e fora do git:\n`);
  for (const { arquivo, alvo } of configPendurada) console.log(`  ${alvo}\n      <- ${arquivo}`);
  console.log(
    `\nO codigo le com try/catch e cai para padrao em SILENCIO quando o arquivo falta.\n` +
      `Num clone limpo, a declaracao do dono e substituida por default de codigo sem aviso.\n` +
      `Versione a configuracao — depois de conferir que ela nao tem credencial.`,
  );
}

if (pendurados.length === 0 && configPendurada.length === 0) {
  console.log(`\n✔ nenhum import nem configuracao pendurada — o codigo rastreado se sustenta sozinho`);
  process.exit(0);
}
if (pendurados.length === 0) process.exit(1);

// Agrupado pelo MÓDULO que falta, porque o conserto é por módulo: incluir um
// resolve todos os importadores dele de uma vez.
const porModulo = new Map();
for (const p of pendurados) {
  if (!porModulo.has(p.caminho)) porModulo.set(p.caminho, []);
  porModulo.get(p.caminho).push(p.arquivo);
}

console.log(`\n✘ ${porModulo.size} modulo(s) fora do git importado(s) por codigo dentro dele:\n`);
for (const [caminho, importadores] of [...porModulo].sort()) {
  console.log(`  ${caminho}`);
  for (const imp of [...new Set(importadores)].sort()) console.log(`      <- ${imp}`);
}

console.log(
  `\nUm clone limpo deste repositorio NAO compila: falha com TS2307 nesses modulos.\n` +
    `O \`tsc\` local nao pega — ele le o disco, nao o indice do git.\n\n` +
    `Conserto: versione o modulo (com o contrato que o cobre), ou reverta o import.\n` +
    `Se o modulo pertence a entrega inacabada, reverter o importador e o caminho certo —\n` +
    `versionar codigo incompleto so para o build passar troca um defeito por outro.`,
);
process.exit(1);
