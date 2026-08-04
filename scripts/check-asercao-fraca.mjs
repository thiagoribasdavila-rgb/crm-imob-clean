#!/usr/bin/env node
/**
 * PORTÃO DOS PORTÕES: quantas asserções procuram TEXTO em vez de medir PROPRIEDADE.
 *
 * ── O que motivou ──────────────────────────────────────────────────────────
 *
 * Em 01/08/2026, 11 portões que liam `app/globals.css` foram auditados um a um.
 * Todos os 11 verificavam CSS assim:
 *
 *     styles.includes(".alguma-classe") && styles.includes("min-height: 44px")
 *
 * Dois `includes` sobre um arquivo de 10.960 linhas. `min-height: 44px` aparece
 * **45 vezes** ali; `@media (prefers-reduced-motion: reduce)`, 15. Qualquer
 * ocorrência, em qualquer canto, satisfazia a asserção.
 *
 * Dos 11, **três estavam aprovando o vazio**:
 *   · phase-026 nomeava `.atlas-topbar-location` e cobrava `font-size: 13px` —
 *     que mora em OUTRA classe. Passava com a propriedade nomeada ausente.
 *   · phase-041 cobrava layout de `/customers`, uma tela de 43 linhas que é um
 *     REDIRECT: "Clientes 360 morreu, aqui só resta a porta".
 *   · phase-025 conferia dois valores de espaçamento que vivem em famílias
 *     diferentes, sem dizer de quem era cada um.
 *
 * ── O que este portão mede ─────────────────────────────────────────────────
 *
 * Ele NÃO proíbe `includes`. Procurar por uma string longa e distintiva
 * (`aria-labelledby="atlas-leads-action-title"`) é legítimo. O que ele conta é
 * o caso frágil: `includes` de string CURTA e SEM MARCA sobre um arquivo lido
 * do disco — o padrão que passa por acidente.
 *
 * É catraca: o número medido só pode cair. Cada asserção reapontada para a
 * propriedade derruba um ponto, e quem derrubar deve baixar o teto.
 *
 * Rodar: node scripts/check-asercao-fraca.mjs
 */
import fs from "node:fs";
import path from "node:path";

/* Medido em 01/08/2026 por este script. 276 -> 272 -> 262 no mesmo dia: phase-029 reapontada, e depois os numeros
   soltos de budget-sizing e meta-forecast virando comparacao de valor. A catraca so desce.

   02/08/2026: 264 -> 243. O portao estava VERMELHO (264 contra teto 262) e desceu
   21 pontos por reapontamento, nenhum por remocao. Onze asseracoes de CSS
   passaram a medir o CORPO da regra pelas funcoes deste repositorio:

     fase 026  centralizacao do trilho recolhido cobrada da regra que a declara
     fase 027  `display: none` e `text-overflow` cobrados da familia quick-create
     fase 028  ellipsis e alvo de 44px cobrados de .atlas-action-label/.atlas-page-action
     fase 032  breakpoint de 1180px passa a ALCANCAR o controle; gutter e container
               cobrados de .atlas-app-main e .atlas-app-content, que os declaram
     fase 033  margin-left/left/container-name cobrados de cada regra do tablet
     fase 034  touch-action e tap-highlight no MESMO corpo; rotulo dentro do @media
     fase 092  a pior delas: `transform: none` (33 ocorrencias no arquivo, ZERO na
               familia .atlas-ambient) e o token --atlas-control-height-touch, que
               so aparecia como USO — a declaracao vive em styles/atlas-tokens.css,
               e a asseracao nao distinguia isso de token inexistente
     sprint 050-059  navegacao movel do Kanban tem de estar DENTRO do bloco de 820px
     evolucao 500    canvas e font-size do textarea comparados por VALOR

   Refutacao permanente em tests/contracts/css-propriedade-reprova.test.mjs e
   tests/contracts/estrutura-jsx-reprova.test.mjs: as duas provam que a mesma
   folha/fonte quebrada passa no `includes` e reprova na medicao. */
const TETO = 243;

const DIR = "scripts";
const arquivos = fs.readdirSync(DIR).filter((f) => f.startsWith("check-") && f.endsWith(".mjs"));

/** Uma string é DISTINTIVA quando não daria para achá-la por acidente. */
function distintiva(valor) {
  if (valor.length > 28) return true;              // frase longa não colide
  if (/[.#[\]]/.test(valor)) return true;          // seletor CSS
  if (/[A-Z]/.test(valor)) return true;            // identificador/componente
  if (/[_/]/.test(valor)) return true;             // caminho ou snake_case
  return false;
}

const achados = [];
for (const f of arquivos) {
  const fonte = fs.readFileSync(path.join(DIR, f), "utf8");
  /* Só conta comentário fora: comentário não é asserção. */
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of codigo.matchAll(/\.includes\((["'`])([^"'`]{1,40})\1\)/g)) {
    if (!distintiva(m[2])) achados.push({ arquivo: f, valor: m[2] });
  }
}

const porArquivo = {};
for (const a of achados) (porArquivo[a.arquivo] ??= []).push(a.valor);

console.log(`  asserções frágeis (includes de string curta e sem marca): ${achados.length}`);
console.log(`  espalhadas por ${Object.keys(porArquivo).length} portões`);

if (achados.length > TETO) {
  const piores = Object.entries(porArquivo).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  console.error(`\n  FALHA asserções frágeis subiram para ${achados.length} (teto ${TETO}).`);
  console.error("  Piores:");
  for (const [arq, vs] of piores) {
    console.error(`    ${arq.padEnd(46)} ${String(vs.length).padStart(3)}  ${vs.slice(0, 3).map((v) => JSON.stringify(v)).join(" ")}`);
  }
  console.error(
    "\n✗ asercao-fraca: uma asserção que procura texto curto num arquivo grande\n" +
      "  passa por acidente. Ela não aprova um defeito — ela NÃO SABERIA.\n" +
      "\n  O conserto é medir a propriedade. Para CSS existe `scripts/lib/css-propriedade.mjs`:\n" +
      "  `temAlvoDeToque`, `familiaDeclara`, `mediaAlcanca`, `regrasQueCitam` — todas olham o\n" +
      "  CORPO da regra que carrega a classe, não o arquivo inteiro.",
  );
  process.exit(1);
}

const piores = Object.entries(porArquivo).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
console.log(`  ok   dentro do teto (${TETO}). Concentração atual:`);
for (const [arq, vs] of piores) console.log(`       ${arq.padEnd(46)} ${vs.length}`);
console.log(`\n✓ asercao-fraca: ${achados.length} de teto ${TETO}. Cada reapontamento derruba o número — baixe o teto junto.`);
