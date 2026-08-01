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
 *
 * ── DIZ ONDE CONSERTAR, NÃO SÓ QUE ESTÁ QUEBRADO ────────────────────────────
 *
 * Defeito medido em 2026-07-30: a tabela estava CORRETA no `.env.local` (JSON
 * válido, conferido lendo o arquivo direto) e mesmo assim o portão acusava
 * "não é JSON válido, tarifas cadastradas: 0". A causa não estava no arquivo:
 *
 *     set -a && . ./.env.local && set +a && npm run ai:pricing:check   → ❌
 *     env -u ATLAS_AI_PRICE_TABLE npm run ai:pricing:check             → ✅
 *
 * O `.` do shell faz REMOÇÃO DE ASPAS. Num valor JSON não citado, as aspas
 * duplas internas somem e `{"openai/...":{...}}` chega ao processo como
 * `{openai/...:{...}}`. E `--env-file` NÃO resgata: tanto o Node quanto o
 * `@next/env` só escrevem a chave quando ela AINDA NÃO EXISTE em `process.env`
 * — variável herdada do shell tem precedência sobre o arquivo. Logo o `next
 * start` sofre do mesmo mal se o processo nascer (ou for reiniciado com
 * `pm2 restart --update-env`) de um shell que deu source no `.env`.
 *
 * O portão acusava a mesma coisa nos dois casos — "tabela inválida" — e o
 * operador ia mexer no arquivo, que estava certo. Agora ele lê os arquivos de
 * ambiente e SEPARA os dois diagnósticos: tabela quebrada no arquivo (conserte
 * o arquivo) de tabela quebrada só no ambiente herdado (limpe o ambiente, ou
 * envolva o valor em aspas SIMPLES para o shell parar de mutilá-lo).
 */
const fonte = readFileSync("lib/ai/model-profiles.ts", "utf8");
const perfis = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

const VARIAVEL = "ATLAS_AI_PRICE_TABLE";
// `.env.local` é o de desenvolvimento; `.env` é o que o deploy escreve no VPS
// (scripts/atlas-go-live.sh copia `.env.hostinger` para lá). Conferir os dois
// permite rodar este portão nas duas pontas sem trocar de comando.
const ARQUIVOS = [".env.local", ".env"];

/** JSON da tabela → conjunto de chaves normalizadas. Distingue vazio de inválido. */
function lerTabela(bruto) {
  if (bruto === null || bruto === undefined) return { estado: "ausente", chaves: new Set() };
  if (!bruto.trim()) return { estado: "ausente", chaves: new Set() };
  try {
    const parsed = JSON.parse(bruto);
    return { estado: "valida", chaves: new Set(Object.keys(parsed).map((k) => k.trim().toLowerCase())) };
  } catch (erro) {
    return { estado: "invalida", chaves: new Set(), erro: erro.message };
  }
}

/**
 * Lê a declaração da variável num arquivo de ambiente com as MESMAS regras de
 * citação do dotenv (é o que `@next/env` embute e o que `node --env-file`
 * implementa): aspas simples, duplas ou crase são removidas; sem aspas, o valor
 * é cortado no primeiro `#`. Declaração repetida: vence a última, igual ao
 * dotenv e igual ao shell.
 */
function declaracaoNoArquivo(caminho) {
  let conteudo;
  try {
    conteudo = readFileSync(caminho, "utf8");
  } catch {
    return null; // arquivo não existe nesta máquina — não é defeito, é ambiente
  }
  let bruto = null;
  for (const linha of conteudo.split(/\r?\n/)) {
    const limpa = linha.trim().replace(/^export\s+/, "");
    if (!limpa.startsWith(`${VARIAVEL}=`)) continue;
    bruto = limpa.slice(VARIAVEL.length + 1).trim();
  }
  if (bruto === null) return null;

  const aspa = bruto[0];
  const citado = (aspa === "'" || aspa === '"' || aspa === "`") && bruto.length > 1 && bruto.endsWith(aspa);
  let valor = citado ? bruto.slice(1, -1) : bruto.split("#")[0].trim();
  if (citado && aspa === '"') valor = valor.replace(/\\n/g, "\n").replace(/\\r/g, "\r");

  // Só a aspa SIMPLES protege do `.` do shell. Sem aspas, as aspas duplas do
  // JSON são removidas; com aspas duplas ou crase o resultado é o mesmo (a
  // crase ainda por cima abre substituição de comando).
  return { caminho, valor, aspa: citado ? aspa : null, sobreviveAoShell: aspa === "'" && citado };
}

const noAmbiente = lerTabela(process.env[VARIAVEL] ?? null);
const nosArquivos = ARQUIVOS.map(declaracaoNoArquivo).filter(Boolean).map((d) => ({ ...d, ...lerTabela(d.valor) }));
const arquivoBom = nosArquivos.find((d) => d.estado === "valida");
const emUso = perfis.modelosEmUso();

/** Uma tarifa cobre o modelo se houver chave exata ou curinga do provedor. */
const temTarifa = (par) => noAmbiente.chaves.has(par.toLowerCase()) || noAmbiente.chaves.has(`${par.split("/")[0]}/*`);

const semTarifa = emUso.filter((par) => !temTarifa(par));

console.log("ATLAS AI PRICING");
console.log(`  modelos referenciados: ${emUso.length}`);
console.log(`  tarifas cadastradas:   ${noAmbiente.chaves.size}`);
for (const d of nosArquivos) {
  const estado = d.estado === "valida" ? `${d.chaves.size} tarifa(s)` : d.estado === "ausente" ? "declarada vazia" : "JSON inválido";
  console.log(`  ${d.caminho.padEnd(21)}${estado}${d.aspa === "'" ? " (entre aspas simples)" : ""}`);
}

/** Comandos de saída, iguais em todos os diagnósticos de ambiente sujo. */
function comoLimparOAmbiente() {
  console.error("\n   Para conferir agora, sem o valor herdado:");
  console.error(`     env -u ${VARIAVEL} npm run ai:pricing:check`);
  console.error("\n   Para o problema não voltar, envolva o valor em aspas SIMPLES no arquivo:");
  console.error(`     ${VARIAVEL}='{"openai/gpt-5.6-luna":{"input":1,"output":6}}'`);
  console.error("   dotenv, `node --env-file` e o `@next/env` do `next start` removem essas aspas");
  console.error("   e leem o mesmo JSON; o `.` do shell passa a preservá-las.");
}

if (noAmbiente.estado === "invalida") {
  if (arquivoBom) {
    // ESTE é o caso que fazia o operador mexer no arquivo certo.
    console.error(`\n❌ ${VARIAVEL} chegou CORROMPIDA ao processo — mas o arquivo está correto.`);
    console.error(`   ${arquivoBom.caminho}: JSON válido, ${arquivoBom.chaves.size} tarifa(s).`);
    console.error(`   ambiente do processo: ${noAmbiente.erro}`);
    console.error(`   valor recebido: ${String(process.env[VARIAVEL]).slice(0, 120)}`);
    console.error("\n   NÃO edite o arquivo — ele não é a causa. A variável foi herdada de um shell");
    console.error("   que deu `source`/`.` no arquivo, e o shell REMOVEU as aspas do JSON. Variável");
    console.error("   já presente no ambiente vence o `--env-file` e vence o `.env` do Next.");
    comoLimparOAmbiente();
    process.exit(1);
  }
  const quebrado = nosArquivos.find((d) => d.estado === "invalida");
  console.error(`\n❌ ${VARIAVEL} não é JSON válido — nenhuma tarifa é aplicada.`);
  console.error(`   ${noAmbiente.erro}`);
  if (quebrado) console.error(`   E o arquivo ${quebrado.caminho} também está inválido: conserte lá.`);
  else console.error("   Nenhum arquivo de ambiente declara a tabela: o valor veio do shell.");
  console.error("\n   Formato: {\"perplexity/sonar\":{\"input\":1,\"output\":1}}  (US$ por milhão de tokens)");
  if (!quebrado) comoLimparOAmbiente();
  process.exit(1);
}

if (noAmbiente.estado === "ausente") {
  if (arquivoBom) {
    console.error(`\n❌ ${VARIAVEL} está correta em ${arquivoBom.caminho}, mas NÃO chegou ao processo.`);
    console.error("   O arquivo não foi carregado. Rode pelo script do package.json, que já passa");
    console.error(`   --env-file: npm run ai:pricing:check`);
    /* 2 = NÃO EXECUTADO, não 1. Este ramo é exatamente "a tarifa ESTÁ certa no
       arquivo, mas o processo não a recebeu" — ou seja, o portão não conseguiu
       medir, e ele já dizia isso na tela. Sair 1 anunciava defeito onde havia
       ausência de ambiente: em 01/08/2026 foi por isto que o job `validate` do
       PR #9 ficou vermelho, com o código intacto. `portoes-todos` lê 2 como NÃO
       EXECUTADO e nunca conta como aprovação. Mesmo tratamento de
       `check-database-target.mjs` e `cobertura-schema:check`. */
    process.exit(2);
  }
  console.error(`\n❌ ${VARIAVEL} ausente. Todo consumo de IA será gravado com custo NULO.`);
  console.error("   O painel de custos mostrará zero e parecerá saudável — não é.");
  console.error(`\n   Modelos que precisam de tarifa: ${emUso.join(", ")}`);
  console.error("\n   Consulte a página de preços de cada provedor e preencha em US$ por milhão de tokens.");
  console.error("   NÃO estime de cabeça: preço errado é pior que preço ausente, porque parece confiável.");
  process.exit(1);
}

if (semTarifa.length) {
  console.error(`\n❌ ${semTarifa.length} modelo(s) em uso SEM tarifa — o consumo deles fica com custo nulo:`);
  for (const par of semTarifa) console.error(`   - ${par}`);
  console.error(`\n   Acrescente em ${VARIAVEL}, ou use o curinga "provedor/*" como tarifa padrão.`);
  process.exit(1);
}

// Passou, mas com bomba armada: o valor está certo e sem aspas simples. Qualquer
// processo que nascer de um shell com `source` recebe JSON inválido e volta a
// gravar custo nulo — inclusive o `next start` reiniciado com `--update-env`.
const desprotegidos = nosArquivos.filter((d) => d.estado === "valida" && !d.sobreviveAoShell);
for (const d of desprotegidos) {
  console.warn(`\n⚠  ${d.caminho}: a tabela é válida, mas o valor NÃO está entre aspas simples.`);
  console.warn(`   \`set -a && . ./${d.caminho} && set +a\` entrega JSON inválido ao processo, e`);
  console.warn("   `--env-file` não conserta (variável herdada tem precedência). O custo de IA");
  console.warn("   desse processo volta a ser gravado como NULO, em silêncio.");
  console.warn(`   Correção: ${VARIAVEL}='{...}' — com aspas simples em volta do JSON.`);
}

console.log(`\n✅ Todos os ${emUso.length} modelos em uso têm tarifa cadastrada.`);
