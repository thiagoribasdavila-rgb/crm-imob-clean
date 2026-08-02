#!/usr/bin/env node
/**
 * ENSAIO A SECO DA IMPORTAÇÃO DA BIBLIOTECA DE MÍDIA.
 *
 * Roda o caminho INTEIRO contra a conta REAL e o banco REAL — lê `/adimages` e
 * `/advideos`, confere o que o CRM já tem, monta as linhas de `creative_assets`
 * — e PARA antes de gravar. Imprime cada linha que entraria, com o hash inteiro
 * e o endereço que viraria `asset_url`.
 *
 * O que ele escreve na Meta: NADA. Não existe caminho de escrita aqui nem com
 * `--gravar`: subir mídia é escrita na conta do dono e continua acontecendo no
 * Gerenciador de Anúncios. Toda conversa com a Graph é GET.
 *
 * O que ele escreve no banco: NADA, salvo com `--gravar` — que insere em
 * `creative_assets` as peças que faltam. É idempotente: rodar de novo não
 * duplica, porque a identidade é `conta + referência` e ela é conferida contra
 * o que já está gravado.
 *
 *   set -a && . ./.env.local && set +a
 *   node --experimental-strip-types scripts/ensaio-a-seco-biblioteca.mjs
 *   node --experimental-strip-types scripts/ensaio-a-seco-biblioteca.mjs --gravar
 *
 * Variáveis: ENSAIO_ORG_ID (organização), META_AD_ACCOUNT_ID (conta),
 * ENSAIO_CREATED_BY (o perfil que assina a importação — obrigatório para gravar,
 * porque `creative_assets.created_by` referencia `profiles(id)`).
 *
 * O hook de resolução abaixo é o mesmo de `scripts/ensaio-a-seco-criativo.mjs`:
 * o repo usa moduleResolution 'bundler' e os módulos de servidor têm
 * `import "server-only"`, que o loader do Node não resolve sozinho.
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const RAIZ = ${JSON.stringify(RAIZ)};
      const EXTS = ['.ts','.mts','.cts','.js','.mjs','.cjs','.tsx','.json','.node'];
      export async function resolve(specifier, context, next) {
        if (specifier === 'server-only' || specifier === 'client-only') {
          return { url: 'data:text/javascript,export{}', shortCircuit: true };
        }
        let alvo = specifier;
        if (alvo.startsWith('@/')) alvo = RAIZ + '/' + alvo.slice(2);
        const rel = alvo.startsWith('./') || alvo.startsWith('../') || alvo.startsWith('/');
        const temExt = EXTS.some((e) => alvo.endsWith(e));
        if (rel && !temExt) {
          for (const e of ['.ts', '.tsx', '/index.ts']) {
            try { return await next(alvo + e, context); } catch {}
          }
        }
        return next(alvo, context);
      }
    `),
  pathToFileURL("./").href,
);

const { lerBibliotecaDaConta, errosDaLeitura, totalDePecas } =
  await import("../lib/meta/marketing/biblioteca-de-midia.ts");
const { planejarImportacao, resumirImportacao, chaveDaPeca } =
  await import("../lib/marketing/importar-biblioteca-de-midia.ts");
const { lerAtivosDaBiblioteca, gravarPecasImportadas } =
  await import("../lib/marketing/creative-assets-da-biblioteca.ts");

/**
 * A organização que OPERA. Medido em 02/08/2026: `organizations` tem duas
 * linhas, e a outra ("Atlas AI", 87036a39…) está vazia — 0 perfis, 0
 * empreendimentos, 0 campanhas. Errar esta constante importaria as 38 peças
 * para o inquilino errado, sem erro nenhum: a gravação daria certo.
 */
const ORG = process.env.ENSAIO_ORG_ID || "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const CONTA = `act_${String(process.env.META_AD_ACCOUNT_ID ?? "").replace(/^act_/, "")}`;
const CRIADO_POR = process.env.ENSAIO_CREATED_BY || "";
const GRAVAR = process.argv.includes("--gravar");

const linha = (c = "─") => console.log(c.repeat(78));
const titulo = (t) => { console.log(); linha("═"); console.log(t); linha("═"); };

titulo(`ENSAIO A SECO — BIBLIOTECA DE MÍDIA — ${GRAVAR ? "MODO GRAVAÇÃO" : "SEM GRAVAR NADA"}`);
console.log(`organização: ${ORG}`);
console.log(`conta ......: ${CONTA}`);

const token = process.env.META_ADS_ACCESS_TOKEN;
if (!token) {
  console.error("✘ META_ADS_ACCESS_TOKEN ausente — sem token não há biblioteca para ler.");
  process.exit(1);
}
if (CONTA === "act_") {
  console.error("✘ META_AD_ACCOUNT_ID vazio — não há conta para consultar.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
titulo("1. A BIBLIOTECA DA CONTA (GET /adimages + GET /advideos)");
// ─────────────────────────────────────────────────────────────────────────────

const biblioteca = await lerBibliotecaDaConta(CONTA, token);
const erros = errosDaLeitura(biblioteca);

console.log(`  imagens ................. ${biblioteca.imagens.pecas === null ? "NÃO LIDO" : biblioteca.imagens.pecas.length}`);
console.log(`  vídeos .................. ${biblioteca.videos.pecas === null ? "NÃO LIDO" : biblioteca.videos.pecas.length}`);
console.log(`  total ................... ${totalDePecas(biblioteca) ?? "NÃO MEDIDO (um lado falhou — e isto não é zero)"}`);
for (const e of erros) console.log(`      ✘ ${e}`);

const lidas = [...(biblioteca.imagens.pecas ?? []), ...(biblioteca.videos.pecas ?? [])];
for (const peca of lidas.slice(0, 40)) {
  console.log(
    `      · [${peca.tipo === "imagem" ? "IMG" : "VID"}] ${peca.referencia}  ${String(peca.situacao ?? "sem situação").padEnd(10)} ` +
    `${peca.largura && peca.altura ? `${peca.largura}×${peca.altura}`.padEnd(11) : "".padEnd(11)} ${peca.nome}`,
  );
}
if (lidas.length > 40) console.log(`      … e mais ${lidas.length - 40}`);

// ─────────────────────────────────────────────────────────────────────────────
titulo("2. O QUE O CRM JÁ TEM (SELECT em creative_assets)");
// ─────────────────────────────────────────────────────────────────────────────

const ativos = await lerAtivosDaBiblioteca(ORG);
if (!ativos.ok) {
  console.error(`✘ não foi possível ler creative_assets: ${ativos.erro}`);
  process.exit(1);
}
console.log(`  peças da biblioteca já registradas .. ${ativos.pecas.length}`);
for (const peca of ativos.pecas.slice(0, 40)) {
  console.log(`      · ${peca.contaId} ${peca.referencia} ${peca.nome}`);
}
const jaDestaConta = lidas.filter((p) => ativos.chaves.has(chaveDaPeca(CONTA, p.referencia))).length;
console.log(`  dessas, batem com a conta atual .... ${jaDestaConta}`);

// ─────────────────────────────────────────────────────────────────────────────
titulo("3. AS LINHAS QUE ENTRARIAM EM creative_assets");
// ─────────────────────────────────────────────────────────────────────────────

const plano = planejarImportacao(lidas, ativos.chaves, {
  organizationId: ORG,
  contaId: CONTA,
  createdBy: CRIADO_POR || "00000000-0000-0000-0000-000000000000",
  agoraIso: new Date().toISOString(),
});

for (const [i, l] of plano.linhas.entries()) {
  linha("·");
  console.log(`LINHA ${i + 1} · creative_assets`);
  console.log(`  name .......... ${l.name}`);
  console.log(`  format ........ ${l.format}   channel: ${l.channel}   status: ${l.status} (nasce rascunho)`);
  console.log(`  campaign_id ... ${l.campaign_id}   (nulo: a FK aponta para campaigns, tabela morta)`);
  console.log(`  asset_url ..... ${l.asset_url ?? "— (sem endereço permanente: a prontidão não conta esta)"}`);
  console.log(`  referência .... ${l.metadata.meta.tipo} ${l.metadata.meta.referencia}`);
  console.log(`  conta ......... ${l.metadata.meta.contaId}   situação: ${l.metadata.meta.situacao ?? "—"}`);
}
if (!plano.linhas.length) console.log("  (nenhuma linha nova)");

for (const d of plano.descartadas) {
  console.log(`  ✘ FORA: [${d.tipo}] ${d.referencia} — ${d.motivo}`);
}

const resumo = resumirImportacao(plano, { naBiblioteca: totalDePecas(biblioteca), erros });
linha("·");
console.log(`  ${resumo.frase}`);
console.log(`  biblioteca inteira no CRM? ${resumo.bibliotecaInteiraNoCrm ? "sim" : "não"}`);

// ─────────────────────────────────────────────────────────────────────────────
titulo(GRAVAR ? "4. GRAVANDO" : "4. NADA FOI GRAVADO — ISTO FOI UM ENSAIO A SECO");
// ─────────────────────────────────────────────────────────────────────────────

if (!GRAVAR) {
  console.log("  creative_assets ... intacta");
  console.log("  a conta na Meta ... intacta (só houve GET; este script não tem caminho de escrita para lá)");
  console.log();
  process.exit(0);
}

// `created_by` referencia `profiles(id)`: um uuid inventado devolve 23503 e
// derruba o lote inteiro. Melhor recusar aqui, com o nome da variável que falta.
if (!CRIADO_POR) {
  console.error("  ✘ recusado: defina ENSAIO_CREATED_BY com o perfil que assina a importação (creative_assets.created_by → profiles.id).");
  process.exit(1);
}

const gravacao = await gravarPecasImportadas(plano.linhas);
if (!gravacao.ok) {
  console.error(`  ✘ o banco recusou: ${gravacao.erro}`);
  process.exit(1);
}
console.log(`  gravadas: ${gravacao.gravadas}`);
console.log();
