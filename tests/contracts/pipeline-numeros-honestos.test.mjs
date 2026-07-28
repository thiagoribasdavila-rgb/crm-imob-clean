/**
 * Contrato do PIPELINE: nenhum número grande sem base que o sustente.
 *
 * A base real desta operação expõe os três defeitos que este arquivo protege:
 *
 *   217 leads · 18 com orçamento (8%) · 205 na etapa "novo" (94%)
 *
 * 1. "Pipeline bruto" e "Forecast" somavam `budget_max` de 8% da carteira e
 *    eram lidos como o total. É o mesmo defeito do CPL do marketing, ao
 *    contrário: lá o zero fingia de medido; aqui a amostra finge de total.
 * 2. Toda coluna mostrava "R$ 0,00" quando ninguém preencheu orçamento — lê-se
 *    "esta etapa não vale nada" em vez de "o campo está vazio".
 * 3. A coluna "novo" desenhava 205 cards arrastáveis. A décima quinta lead já
 *    não é encontrada; a centésima não existe na prática.
 *
 * Rodar: node --test tests/contracts/pipeline-numeros-honestos.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const pagina = fs.readFileSync(path.join(raiz, "app", "(crm)", "pipeline", "page.tsx"), "utf8");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

test("valor de pipeline exige cobertura mínima de orçamento", () => {
  assert.match(pagina, /COBERTURA_MINIMA_DE_ORCAMENTO\s*=\s*0\.4/,
    "sem piso declarado, uma amostra de 8% volta a virar total");
  assert.match(pagina, /const orcamentoConfiavel = cobertura >= COBERTURA_MINIMA_DE_ORCAMENTO/);
});

test("abaixo do piso, pipeline e forecast são null — não zero", () => {
  assert.match(pagina, /const pipeline = orcamentoConfiavel[\s\S]{0,160}: null;/,
    "R$ 0 diz que a carteira não vale nada; null vira '—' e a explicação vem junto");
  assert.match(pagina, /const forecast = orcamentoConfiavel[\s\S]{0,300}: null;/);
});

test("quando o número não sai, a tela diz o que falta preencher", () => {
  assert.match(pagina, /sem orçamento — some com a base atual seria chute/,
    "a ausência precisa virar tarefa, não mistério");
  assert.match(pagina, /sobre \$\{Math\.round\(metrics\.coberturaDeOrcamento \* 100\)\}% da carteira/,
    "quando sai, o número tem que declarar sobre quanto da carteira foi apurado");
});

test("a coluna não anuncia R$ 0,00 quando ninguém preencheu orçamento", () => {
  assert.match(pagina, /value: comOrcamento\.length[\s\S]{0,140}: null,/);
  assert.match(pagina, /orçamento não informado/,
    "'R$ 0,00' no topo da coluna lê como 'esta etapa não vale nada'");
});

test("a coluna desenha um número limitado de cards", () => {
  // O que precisa ser verdade é que EXISTA um teto e que ele seja usado —
  // não que ele valha um número específico. Fixar 25 aqui travou um ajuste
  // legítimo: com 178 leads em "novo", 25 sumia com 86% da base e o dono
  // relatou "as leads não estão aparecendo todas". A faixa protege dos dois
  // extremos — teto tão baixo que esconde o trabalho, ou alto a ponto de
  // devolver a pilha que ninguém rola.
  const teto = Number(pagina.match(/LIMITE_DE_CARDS_POR_COLUNA\s*=\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(teto), "o teto de cards por coluna sumiu");
  assert.ok(teto >= 50 && teto <= 150, `teto de ${teto} fora da faixa útil (50–150)`);
  assert.match(pagina, /visiveis: items\.slice\(0, LIMITE_DE_CARDS_POR_COLUNA\)/);
  assert.match(pagina, /\{stage\.visiveis\.map\(\(lead\)/,
    "renderizar stage.items inteiro traz os 205 cards de volta");
  assert.ok(
    !/\{stage\.items\.map\(\(lead\)/.test(pagina),
    "sobrou um map sobre a lista completa",
  );
});

test("o corte é DECLARADO, com caminho para o resto", () => {
  // Coluna que desenha 25 de 205 sem avisar é pior que uma que desenha 205:
  // passa a impressão de que aquilo é tudo.
  assert.match(pagina, /stage\.ocultos > 0 \?/);
  assert.match(pagina, /\+\{stage\.ocultos\}/);
  assert.match(pagina, /Abrir a fila completa/);
  assert.match(pagina, /href=\{`\/leads\?status=\$\{encodeURIComponent\(stage\.key\)\}/,
    "o link tem que levar à etapa certa, não à lista genérica");
});

test("a ordenação por prioridade vem ANTES do corte", () => {
  // Cortar os 25 primeiros só é defensável se os 25 primeiros forem os mais
  // urgentes. Se o corte viesse antes da ordenação, seriam 25 aleatórios.
  const posOrdenacao = pagina.indexOf("const visibleLeads");
  const posCorte = pagina.indexOf("visiveis: items.slice");
  assert.ok(posOrdenacao > 0 && posOrdenacao < posCorte,
    "visibleLeads (já ordenado) precisa existir antes do fatiamento");
});

test("saiu a métrica que valia zero e não mudava decisão", () => {
  assert.ok(
    !/label="Perfis compradores"/.test(pagina),
    "comprou_outro vale 0 nesta base e a lista já aparece na seção própria — métrica que não muda decisão é ruído",
  );
  assert.match(pagina, /2xl:grid-cols-5/, "cinco métricas, não seis");
});

test("a leitura do pipeline concorda com a escrita sobre QUEM vê o quê", () => {
  // ── O DEFEITO QUE ISTO FIXA ───────────────────────────────────────────────
  //
  // Relatado pelo dono e confirmado com o login real: o corretor via as 199
  // leads da empresa, inclusive 3 de OUTROS corretores ativos. Ao tentar
  // descartá-las vinha 403 — correto — com a mensagem "esta lead está com
  // outra pessoa, ela não aparece na sua carteira". Aparecia. A recusa
  // contradizia a tela, e a conclusão natural era "o sistema está quebrado".
  //
  // A regra de quem pode MOVER já existia na RPC. Isto faz a LEITURA obedecer
  // à mesma regra — não cria política nova.
  const rota = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(rota, /ownerId: lideranca \? null : identity\.userId/,
    "a restrição de dono precisa ir para a consulta");
  assert.match(rota, /VE_O_FUNIL_INTEIRO/,
    "liderança continua vendo tudo: é dela o trabalho de distribuir represadas");
});

test("o filtro de dono roda no BANCO, não em memória", () => {
  // Filtrar depois NÃO funciona: `mapLegacyLead` devolve as colunas de dono
  // nulas, e as leads de outra pessoa passavam batido — foi exatamente a
  // primeira tentativa de correção, que removeu 1 das 4.
  const repo = ler("lib", "atlas", "core-v2", "live-repositories.ts");
  assert.match(repo, /ownerId\?: string \| null/);
  assert.match(repo, /assigned_user_id\.eq\.\$\{input\.ownerId\}/);
  assert.match(repo, /and\(assigned_user_id\.is\.null,assigned_to\.is\.null\)/,
    "lead sem dono é da fila e continua visível — esconder criaria lead invisível para todos");
});

test("as etapas de FECHAMENTO existem como coluna escolhível", () => {
  // ── O DEFEITO ─────────────────────────────────────────────────────────────
  //
  // `perdido` e `comprou_outro` nascem com `visible: false` e eram REMOVIDAS
  // da lista de etapas. Medido no navegador com o login do corretor: o quadro
  // oferecia 7 etapas de 9, e as 12 leads descartadas dele não tinham coluna
  // nenhuma onde aparecer. Descartar fazia a lead sumir da tela.
  //
  // Elas continuam fora do quadro por PADRÃO — quadro de trabalho é sobre o
  // que está em jogo. Mas passam a existir na lista, para quem quiser marcá-las.
  assert.ok(!/DEFAULT_PIPELINE_STAGES\.filter\(\(stage\) => stage\.visible/.test(pagina),
    "filtrar por `visible` na origem tira a etapa até de quem quer escolhê-la");
  assert.match(pagina, /const FECHAMENTO = new Set<StageKey>\(\["perdido", "comprou_outro"\]\)/);
  assert.match(pagina, /const emJogo = stageData\.filter\(\(stage\) => !FECHAMENTO\.has\(stage\.key\)\)/,
    "fora por padrão, disponível por escolha");
});

test("coluna escolhida à mão não é esvaziada pelo filtro de foco", () => {
  // O foco ("atrasadas", "quentes") prioriza trabalho em ABERTO e descarta lead
  // fechada. Aplicá-lo às colunas de fechamento produzia "Perdido 0" com 12
  // descartadas no banco — a coluna aparecia e mentia.
  assert.match(pagina, /const fonte = FECHAMENTO\.has\(stage\.key\) \? leadsBuscadas : visibleLeads;/);
  assert.match(pagina, /const leadsBuscadas = useMemo/,
    "precisa existir uma lista que passa só pela busca, sem o foco");
});

test("a escolha de colunas é da pessoa e sobrevive ao recarregar", () => {
  assert.match(pagina, /etapasVisiveis\?: StageKey\[\]/, "entra nas preferências gravadas");
  assert.match(pagina, /Array\.isArray\(preferences\.etapasVisiveis\)/, "e é lida de volta");
  assert.match(pagina, /return escolhidas\.length \? escolhidas : stageData;/,
    "desmarcar tudo devolveria um quadro vazio sem explicação");
});
