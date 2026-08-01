#!/usr/bin/env node
/**
 * PORTÃO: as três regressões da ficha do cliente que o navegador já mediu.
 *
 * Cada asserção aqui nasceu de uma MEDIÇÃO em navegador real, não de leitura de
 * código — e as três compartilham a mesma doença: **uma regra escrita num lugar
 * e vencida em outro**. Ler o CSS onde a intenção está declarada dava a resposta
 * errada nos três casos.
 *
 *   1. O corte do "Faça agora" em 2 linhas era pedido numa regra sem
 *      `display:-webkit-box` — e perdia, por ordem, para outra que pedia 3.
 *   2. O botão desabilitado pintava de vermelho de ação porque o seletor de
 *      urgência pesa (0,3,0) e o `:disabled` pesa (0,2,0).
 *   3. A moldura de tentativas de contato renderizava VAZIA e DECORADA no topo
 *      de toda ficha, e o `order-[-2]` dela era inerte por estar aninhada.
 *
 * Por que este portão é escrito assim: ele NÃO procura a intenção ("existe uma
 * regra pedindo 2?"). Ele procura a regra QUE VENCE. É a diferença entre um
 * portão que concorda com quem o escreveu e um que mede.
 *
 * Rodar: node scripts/check-lead-360-regressoes.mjs
 */
import fs from "node:fs";

const CSS = "app/globals.css";
const PAGE = "app/(crm)/leads/[id]/page.tsx";

const falhas = [];
const ok = [];
const reprova = (m) => falhas.push(m);
const passa = (m) => ok.push(m);

const css = fs.readFileSync(CSS, "utf8");
const page = fs.readFileSync(PAGE, "utf8");

/** Comentário não é implementação — some com eles antes de qualquer asserção. */
const semComentariosCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
const semComentariosJsx = page.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

// ── 1. O CLAMP QUE VENCE É O DE 2 ───────────────────────────────────────────
// A regra que manda é a que traz `display:-webkit-box` junto: sem ela o clamp
// não existe. Procuramos o bloco que corta de verdade e conferimos o valor.
{
  const blocos = [...semComentariosCss.matchAll(/\.atlas-lead-next-action[^{}]*strong\s*\{([^}]*)\}/g)];
  const queCortam = blocos.filter((b) => /display:\s*-webkit-box/.test(b[1]) && /overflow:\s*hidden/.test(b[1]));

  if (queCortam.length === 0) {
    reprova("nenhuma regra de `.atlas-lead-next-action strong` traz display:-webkit-box + overflow:hidden — sem elas o line-clamp não corta nada");
  } else {
    // A que vence é a ÚLTIMA no arquivo entre as de mesma especificidade.
    const vencedora = queCortam[queCortam.length - 1][1];
    const valor = vencedora.match(/(?:-webkit-)?line-clamp:\s*(\d+)/)?.[1];
    if (valor !== "2") {
      reprova(`a regra que efetivamente corta o "Faça agora" está em line-clamp:${valor ?? "ausente"} — o combinado é 2`);
    } else {
      passa(`o clamp que vence corta em 2 linhas (${queCortam.length} regra(s) com display:-webkit-box)`);
    }
  }

  // E a regra irmã não pode reabrir a disputa declarando o clamp sem o display.
  const irma = semComentariosCss.match(/\.atlas-lead-next-action\s*>\s*strong\s*\{([^}]*)\}/)?.[1] ?? "";
  if (/line-clamp/.test(irma) && !/display:\s*-webkit-box/.test(irma)) {
    reprova("`.atlas-lead-next-action > strong` voltou a declarar line-clamp sem display:-webkit-box — é a disputa que já custou uma linha a mais de texto");
  } else {
    passa("a regra irmã não redeclara o clamp órfão");
  }
}

// ── 2. DESABILITADO VENCE URGENTE ───────────────────────────────────────────
{
  const urgente = /\.atlas-lead-next-action\[data-urgente="true"\]\s+\.atlas-lead-gesto\s*\{/.test(semComentariosCss);
  const guarda = semComentariosCss.match(
    /\.atlas-lead-next-action\[data-urgente="true"\]\s+\.atlas-lead-gesto:disabled\s*\{([^}]*)\}/,
  );

  if (!urgente) {
    passa("não há regra de urgência sobre o gesto — nada a desempatar");
  } else if (!guarda) {
    reprova(
      'existe `.atlas-lead-next-action[data-urgente="true"] .atlas-lead-gesto` (0,3,0) sem a contrapartida `:disabled` (0,4,0) — ' +
        'o botão desabilitado volta a pintar de vermelho de ação',
    );
  } else if (/var\(--atlas-danger\)/.test(guarda[1])) {
    reprova("a guarda do desabilitado existe mas pinta com --atlas-danger — ela precisa DESFAZER a cor de ação, não repeti-la");
  } else if (!/cursor:\s*not-allowed/.test(guarda[1])) {
    reprova("a guarda do desabilitado não devolve `cursor: not-allowed` — o cursor continua dizendo que dá para clicar");
  } else {
    passa("o desabilitado vence a urgência por especificidade e devolve cor e cursor");
  }
}

// ── 3. A MOLDURA DE TENTATIVAS: NÃO VAZIA, NÃO ANINHADA ─────────────────────
{
  if (!/\.atlas-lead-consentimento:empty\s*\{[^}]*display:\s*none/.test(semComentariosCss)) {
    reprova("`.atlas-lead-consentimento:empty { display: none }` sumiu — a moldura volta a desenhar borda, fundo e padding em volta de nada");
  } else {
    passa("a moldura de tentativas desaparece quando não tem conteúdo");
  }

  // `order` só vale no FILHO DIRETO do flex. Se a seção estiver aninhada dentro
  // de #lead-overview, a ordem é inerte — foi assim que ela foi parar no topo.
  const abre = semComentariosJsx.indexOf('id="lead-overview"');
  const alvo = semComentariosJsx.indexOf("atlas-lead-consentimento");

  if (abre < 0 || alvo < 0) {
    reprova(`não achei os marcadores em ${PAGE} (lead-overview=${abre}, consentimento=${alvo}) — o portão não pode afirmar nada`);
  } else {
    // Caminha as tags <section> a partir da abertura de #lead-overview e acha
    // onde ela fecha; a seção-alvo tem de estar DEPOIS disso.
    let prof = 1;
    let i = semComentariosJsx.indexOf(">", abre) + 1;
    let fecha = -1;
    const tags = /<section\b|<\/section>/g;
    tags.lastIndex = i;
    let m;
    while ((m = tags.exec(semComentariosJsx))) {
      prof += m[0] === "</section>" ? -1 : 1;
      if (prof === 0) { fecha = m.index; break; }
    }
    if (fecha < 0) {
      reprova("não consegui achar o fechamento de #lead-overview — estrutura mudou, revise este portão antes de confiar nele");
    } else if (alvo < fecha) {
      reprova(
        "a seção `atlas-lead-consentimento` voltou para DENTRO de #lead-overview — `order` só vale no filho direto do flex, " +
          "então o `order-[-2]` dela é inerte e ela reaparece no topo da ficha",
      );
    } else {
      passa("a seção de tentativas é irmã do flex, não neta — o `order` dela vale");
    }
  }
}

// ── SAÍDA ───────────────────────────────────────────────────────────────────
for (const o of ok) console.log(`  ok   ${o}`);
for (const f of falhas) console.error(`  FALHA ${f}`);

if (falhas.length) {
  console.error(`\n✗ lead-360-regressoes: ${falhas.length} de ${falhas.length + ok.length} asserções reprovaram.`);
  process.exit(1);
}
console.log(`\n✓ lead-360-regressoes: ${ok.length} asserções, todas verdes.`);
