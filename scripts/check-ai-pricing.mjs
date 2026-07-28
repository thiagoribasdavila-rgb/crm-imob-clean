import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

/**
 * PERGUNTA ao código quais modelos rodam — não raspa o fonte.
 *
 * A versão anterior lia `lib/ai/provider-router.ts` com expressão regular. Dois
 * defeitos, medidos em 2026-07-27:
 *
 *   · acusava `openai/gpt-5.2`, que só existia num EXEMPLO dentro de um
 *     comentário, e devolvia nomes truncados (`openai/gpt-5.6-`);
 *   · lia `ATLAS_OPENAI_MODEL`, `OPENAI_MODEL` e `ATLAS_PERPLEXITY_MODEL` —
 *     nenhuma dessas variáveis existe neste produto.
 *
 * Resultado: nunca enxergou `gpt-5-mini`, que era o modelo do tier rápido. Um
 * portão cego é pior que portão nenhum, porque diz "conferido".
 *
 * `model-profiles.ts` foi separado do roteador justamente para poder ser
 * importado aqui: o roteador tem `import "server-only"` e nenhum script o
 * carrega. O type-stripping do Node lê o `.ts` direto, mesmo caminho que os
 * testes de contrato já usam.
 */
const fonte = readFileSync("lib/ai/model-profiles.ts", "utf8");
const perfis = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

function tabela() {
  const bruto = process.env.ATLAS_AI_PRICE_TABLE || "";
  if (!bruto.trim()) return { chaves: new Set(), vazia: true, invalida: false };
  try {
    const parsed = JSON.parse(bruto);
    return { chaves: new Set(Object.keys(parsed).map((k) => k.trim().toLowerCase())), vazia: false, invalida: false };
  } catch {
    return { chaves: new Set(), vazia: false, invalida: true };
  }
}

const { chaves, vazia, invalida } = tabela();
const emUso = perfis.modelosEmUso();

/** Uma tarifa cobre o modelo se houver chave exata ou curinga do provedor. */
const temTarifa = (par) => chaves.has(par.toLowerCase()) || chaves.has(`${par.split("/")[0]}/*`);

const semTarifa = emUso.filter((par) => !temTarifa(par));

console.log("ATLAS AI PRICING");
console.log(`  modelos referenciados: ${emUso.length}`);
console.log(`  tarifas cadastradas:   ${chaves.size}`);

if (invalida) {
  console.error("\n❌ ATLAS_AI_PRICE_TABLE não é JSON válido — nenhuma tarifa é aplicada.");
  console.error("   Formato: {\"perplexity/sonar\":{\"input\":1,\"output\":1}}  (US$ por milhão de tokens)");
  process.exit(1);
}

if (vazia) {
  console.error("\n❌ ATLAS_AI_PRICE_TABLE ausente. Todo consumo de IA será gravado com custo NULO.");
  console.error("   O painel de custos mostrará zero e parecerá saudável — não é.");
  console.error(`\n   Modelos que precisam de tarifa: ${emUso.join(", ")}`);
  console.error("\n   Consulte a página de preços de cada provedor e preencha em US$ por milhão de tokens.");
  console.error("   NÃO estime de cabeça: preço errado é pior que preço ausente, porque parece confiável.");
  process.exit(1);
}

if (semTarifa.length) {
  console.error(`\n❌ ${semTarifa.length} modelo(s) em uso SEM tarifa — o consumo deles fica com custo nulo:`);
  for (const par of semTarifa) console.error(`   - ${par}`);
  console.error("\n   Acrescente em ATLAS_AI_PRICE_TABLE, ou use o curinga \"provedor/*\" como tarifa padrão.");
  process.exit(1);
}

console.log(`\n✅ Todos os ${emUso.length} modelos em uso têm tarifa cadastrada.`);
