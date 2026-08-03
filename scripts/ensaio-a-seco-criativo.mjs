#!/usr/bin/env node
/**
 * ENSAIO A SECO DO GERADOR DE CRIATIVOS.
 *
 * Roda o caminho INTEIRO contra os dados REAIS de produção — ficha de fatos,
 * prompt, chamada de modelo pelo roteador de verdade, conferência dos números e
 * montagem das linhas — e PARA antes de gravar. Imprime as peças que sairiam e
 * confere cada número citado contra `properties`.
 *
 * O que ele escreve na produção: NADA de negócio. Nenhuma linha em
 * `creative_assets`, `creative_intelligence_versions` ou `marketing_campaigns`.
 * A única escrita possível é a telemetria de consumo de IA (`ai_usage_events`),
 * gravada pelo próprio roteador — e ela DEVE acontecer: a chamada de modelo é
 * real e custa dinheiro; não registrá-la faria o medidor de orçamento mentir.
 *
 *   set -a && . ./.env.local && set +a
 *   node --experimental-strip-types scripts/ensaio-a-seco-criativo.mjs
 *
 * `--gravar` executa a gravação de verdade. Fora do ensaio, é ato deliberado.
 *
 * O repo usa moduleResolution 'bundler' (imports sem extensão) e os módulos do
 * servidor têm `import "server-only"`, que o loader do Node não resolve. O hook
 * abaixo completa a extensão, resolve o alias `@/` e neutraliza `server-only` —
 * é o mesmo recurso já usado por `scripts/check-outbox-token-health.mjs`, e é o
 * que permite a este ensaio chamar o ROTEADOR DE VERDADE em vez de inventar um
 * segundo cliente de LLM.
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

const { conferirNumeros } = await import("../lib/marketing/fatos-do-empreendimento.ts");
const {
  planejarPecasComLastro, gravarCriativos, montarPromptDeVariacoes,
} = await import("../lib/marketing/gerador-de-criativos.ts");

const ORG = process.env.ENSAIO_ORG_ID || "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const DEV = process.env.ENSAIO_DEV_ID || "0df32360-71cc-41aa-b594-be78ac5df86f"; // Inside Perdizes
const OBJETIVO = process.env.ENSAIO_OBJETIVO || "gerar_leads";
const GRAVAR = process.argv.includes("--gravar");

const linha = (c = "─") => console.log(c.repeat(78));
const titulo = (t) => { console.log(); linha("═"); console.log(t); linha("═"); };
const brl = (n) => (n === null || n === undefined ? "—" : `R$ ${Number(n).toLocaleString("pt-BR")}`);

titulo(`ENSAIO A SECO — ${GRAVAR ? "MODO GRAVAÇÃO" : "SEM GRAVAR NADA"}`);
console.log(`organização: ${ORG}`);
console.log(`empreendimento: ${DEV}`);
console.log(`objetivo: ${OBJETIVO}`);

// ─────────────────────────────────────────────────────────────────────────────
// O ensaio percorre a MESMA função que a rota percorre.
//
// `planejarPecasComLastro` é literalmente o corpo de `gerarPecasComLastro`
// menos a gravação — e `gerarPecasComLastro` é o que
// `app/api/v1/marketing/creative-studio/route.ts` chama no modo com lastro.
// Remontar os quatro passos aqui à mão provaria que os quatro módulos
// funcionam, nunca que a rota os chama nesta ordem: seria um ensaio de um
// caminho que não é o caminho vivo.
// ─────────────────────────────────────────────────────────────────────────────
const PERFIL = process.env.ENSAIO_PROFILE_ID || "00000000-0000-0000-0000-000000000000";
const r = await planejarPecasComLastro({
  organizationId: ORG,
  developmentId: DEV,
  objetivo: OBJETIVO,
  criadoPor: PERFIL,
  quantidade: 4,
  marketingCampaignId: null,
});
if (!r) {
  console.error("✘ empreendimento não encontrado no escopo da organização.");
  process.exit(1);
}
const { ficha, geracao, avaliadas, plano } = r;

// ─────────────────────────────────────────────────────────────────────────────
titulo("1. FICHA DE FATOS — lida de properties, não de total_units");
// ─────────────────────────────────────────────────────────────────────────────

console.log(`  empreendimento .......... ${ficha.nome} (${ficha.incorporadora ?? "sem incorporadora"})`);
console.log(`  local ................... ${[ficha.bairro, ficha.cidade].filter(Boolean).join(", ") || "—"}`);
console.log(`  unidades DISPONÍVEIS .... ${ficha.unidadesDisponiveis}`);
console.log(`  faixa de preço .......... ${brl(ficha.precoMin)} a ${brl(ficha.precoMax)}`);
console.log(`  faixa de área ........... ${ficha.areaMin ?? "—"} a ${ficha.areaMax ?? "—"} m²`);
console.log(`  tipologias .............. ${ficha.tipologias.length}`);
for (const t of ficha.tipologias) {
  console.log(`      · ${t.rotulo.padEnd(14)} ${String(t.unidades).padStart(3)} unid. · ${String(t.areaM2 ?? "?").padStart(6)} m² · a partir de ${brl(t.precoMin)}`);
}
console.log(`  fatos com procedência ... ${ficha.fatos.length}`);
console.log(`  fontes web (verified) ... ${ficha.fontesWeb.length}`);
if (ficha.ausentes.length) console.log(`  AUSENTES ................ ${ficha.ausentes.join("; ")}`);
if (ficha.divergenciasDeCadastro.length) {
  console.log("  DIVERGÊNCIAS DE CADASTRO (developments × properties):");
  for (const d of ficha.divergenciasDeCadastro) console.log(`      ! ${d}`);
}

// ─────────────────────────────────────────────────────────────────────────────
titulo("2. O PROMPT QUE VAI AO MODELO (literal)");
// ─────────────────────────────────────────────────────────────────────────────
const prompt = montarPromptDeVariacoes(ficha, OBJETIVO, 4);
console.log(prompt);

// ─────────────────────────────────────────────────────────────────────────────
titulo("3. CHAMADA REAL AO MODELO (lib/ai/provider-router.ts)");
// ─────────────────────────────────────────────────────────────────────────────
console.log(`  provedor ................ ${geracao.provedor}`);
console.log(`  modelo .................. ${geracao.modelo}`);
console.log(`  tokens .................. ${geracao.tokens}`);
console.log(`  custo estimado .......... ${geracao.custoUsd === null ? "não precificado" : `US$ ${geracao.custoUsd}`}`);
console.log(`  variações devolvidas .... ${geracao.variacoes.length}`);
if (geracao.semModelo) {
  console.log("  ✘ O ROTEADOR CAIU NO FALLBACK LOCAL: nenhum texto foi escrito por modelo.");
}

// ─────────────────────────────────────────────────────────────────────────────
titulo("4. AS PEÇAS, COM CADA NÚMERO CONFERIDO CONTRA properties");
// ─────────────────────────────────────────────────────────────────────────────
for (const [i, v] of avaliadas.entries()) {
  linha("·");
  console.log(`PEÇA ${i + 1} — ${v.conceito}  [${v.angulo} / ${v.persona} / ${v.etapa}]  ${v.aprovada ? "✔ APROVADA" : "✘ RECUSADA"}`);
  console.log(`  título (${String(v.titulo.length).padStart(3)}/40) : ${v.titulo}`);
  console.log(`  texto  (${String(v.textoPrincipal.length).padStart(3)}/200): ${v.textoPrincipal}`);
  console.log(`  descr. (${String(v.descricao.length).padStart(3)}/30) : ${v.descricao}`);
  console.log(`  chamada        : ${v.chamada}`);
  console.log(`  objeção        : ${v.objecao}`);
  console.log(`  números citados: ${v.numerosCitados}`);
  for (const d of v.divergencias) console.log(`      ✘ NÚMERO SEM LASTRO [${d.campo}] "${d.trecho}" → ${d.motivo}`);
  for (const p of v.violacoes) console.log(`      ✘ POLÍTICA [${p.field}] ${p.rule}: ${p.detail}`);
  if (v.aprovada) {
    // Reconferência independente do texto inteiro — o que sobe é o que se lê.
    const todo = [v.titulo, v.textoPrincipal, v.descricao, v.chamada].join(" ");
    const resto = conferirNumeros("peça inteira", todo, ficha);
    console.log(`      ✔ reconferência da peça inteira: ${resto.length} divergência(s)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
titulo("4b. O FILTRO MORDE? — peças fabricadas com número que o estoque não sustenta");
// ─────────────────────────────────────────────────────────────────────────────
// Quatro peças aprovadas não provam que a conferência funciona; provam que o
// modelo se comportou. O filtro precisa ser visto RECUSANDO, senão ele pode
// estar sempre devolvendo lista vazia e ninguém saberia.
const iscas = [
  ["preço abaixo do estoque", "Studios em Perdizes a partir de R$ 250.000. Agende sua visita."],
  ["preço acima do estoque", "Cobertura no Inside Perdizes por R$ 1.900.000, últimas unidades."],
  ['"a partir de" com valor do meio da faixa', "Inside Perdizes: unidades a partir de R$ 704.280."],
  ["metragem que não existe", "Apartamentos de 120 m² em Perdizes com varanda gourmet."],
  ["estoque inflado", "Aproveite: 300 unidades disponíveis no Inside Perdizes."],
  ["número correto (controle)", "Inside Perdizes: unidades a partir de R$ 337.782, de 23 a 48 m²."],
];
let mordidas = 0;
for (const [rotulo, texto] of iscas) {
  const d = conferirNumeros("isca", texto, ficha);
  if (d.length) mordidas += 1;
  console.log(`  ${d.length ? "✔ RECUSOU" : "· passou  "} ${rotulo}`);
  console.log(`      "${texto}"`);
  for (const x of d) console.log(`         → "${x.trecho}" (${x.valorCitado} ${x.unidade}): ${x.motivo}`);
}
console.log(`  ${mordidas} de ${iscas.length - 1} iscas recusadas; a de controle precisa passar.`);

// ─────────────────────────────────────────────────────────────────────────────
titulo("5. AS LINHAS QUE SERIAM GRAVADAS");
// ─────────────────────────────────────────────────────────────────────────────
console.log(`  peças a gravar .......... ${plano.pecas.length}`);
console.log(`  recusadas ............... ${plano.recusadas.length}`);
if (plano.impedimentos.length) {
  console.log("  IMPEDIMENTOS (por que não dá para gravar):");
  for (const m of plano.impedimentos) console.log(`      ✘ ${m}`);
}
for (const [i, p] of plano.pecas.entries()) {
  linha("·");
  console.log(`LINHA ${i + 1} · creative_assets`);
  console.log(`  name ............ ${p.asset.name}`);
  console.log(`  status .......... ${p.asset.status}   (nasce rascunho)`);
  console.log(`  campaign_id ..... ${p.asset.campaign_id}   (nulo: a FK aponta para campaigns, tabela morta)`);
  console.log(`  procedência ..... prompt ${p.asset.metadata.procedencia.promptVersao} · ${p.asset.metadata.procedencia.provedor}/${p.asset.metadata.procedencia.modelo}`);
  console.log(`  fatos do CRM .... ${p.asset.metadata.procedencia.fatosDoCRM.length} fato(s) com origem tabela/coluna/filtro`);
  console.log(`  fontes web ...... ${p.asset.metadata.procedencia.fontesWeb.length}`);
  console.log(`LINHA ${i + 1} · creative_intelligence_versions  (o fluxo de aprovação que já existe)`);
  console.log(`  review_status ... draft (padrão do banco) → diretoria aprova pela RPC review_creative_intelligence_version`);
  console.log(`  taxonomia ....... ${p.versao.funnel_stage} / ${p.versao.persona_moment} / ${p.versao.message_angle} / ${p.versao.format}`);
  console.log(`  content_hash .... ${p.versao.content_hash.slice(0, 16)}…`);
}

// ─────────────────────────────────────────────────────────────────────────────
titulo(GRAVAR ? "6. GRAVANDO" : "6. NADA FOI GRAVADO — ISTO FOI UM ENSAIO A SECO");
// ─────────────────────────────────────────────────────────────────────────────
if (GRAVAR) {
  if (plano.impedimentos.length) {
    console.log("  ✘ recusado: há impedimentos. Nada foi gravado.");
    process.exit(1);
  }
  const r = await gravarCriativos(plano);
  console.log(`  gravadas: ${r.gravadas}`);
  for (const n of r.naoGravadas) console.log(`  ✘ ${n.titulo} → ${n.motivo}`);
} else {
  console.log("  creative_assets ................. intacta");
  console.log("  creative_intelligence_versions .. intacta");
  console.log("  marketing_campaigns ............. intacta");
  console.log("  ai_usage_events ................. o roteador registrou a chamada real de modelo (consumo é fato)");
}
console.log();
