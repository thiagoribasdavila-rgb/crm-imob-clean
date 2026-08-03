#!/usr/bin/env node
/**
 * PORTÃO DA LINGUAGEM VISUAL v3 — o eixo tipográfico.
 *
 * ── Por que ele existe ──────────────────────────────────────────────────────
 *
 * O eixo COR já tinha guarda (`check-contraste.mjs`, `check-cor-cravada.mjs`).
 * O eixo TIPOGRÁFICO estava a zero: uma auditoria de 28 agentes mediu, em
 * 01/08/2026, `font-size` aparecendo 446 vezes em `globals.css` com UMA única
 * asserção em todo o repositório — e essa asserção era um `includes` que nem
 * provava a qual regra o valor pertencia.
 *
 * O resultado desse vácuo eram 809 tamanhos arbitrários em `.tsx`, com 17
 * valores distintos, incluindo meio-pixel (11.5, 12.5, 13.5, 10.5) e texto de
 * 8px. Meio-pixel é a assinatura do problema: alguém ajustou no olho porque não
 * havia degrau para consultar.
 *
 * ── O que este portão mede, e o que ele NÃO mede ───────────────────────────
 *
 * Ele NÃO julga se um tamanho é bonito. Ele mede três propriedades que ou são
 * verdadeiras ou não são:
 *
 *   1. os degraus do v3 existem e valem o que dizem valer;
 *   2. o legado de arbitrários só encolhe (catraca, no molde do cor-cravada);
 *   3. as duas classes de tamanho que a operação já provou serem defeito —
 *      meio-pixel e texto abaixo de 10px — não voltam. Estas são ZERO, não
 *      catraca: elas foram eliminadas, e voltar é regressão, não dívida.
 *
 * Rodar: node scripts/check-linguagem-visual.mjs
 */
import fs from "node:fs";
import path from "node:path";

const CSS = "app/globals.css";

/* ── AS CATRACAS ──────────────────────────────────────────────────────────
   Medidas em 01/08/2026, depois de 757 conversões. Só podem CAIR.
   Quem baixar o número, baixe também a catraca — é o que transforma a
   limpeza em progresso irreversível. */
const TETO_ARBITRARIOS_TSX = 52;
const TETO_FONT_SIZE_CSS = 355;

/** Os degraus, nomeados pelo PAPEL. Nome de tamanho convidaria a inventar o 11.5 de novo. */
const DEGRAUS = {
  "--text-micro": "10px",
  "--text-rotulo": "11px",
  "--text-corpo": "13px",
  "--text-numero": "20px",
  "--text-heroi": "34px",
};

const falhas = [];
const ok = [];

function arquivosDeCodigo(raiz) {
  const saida = [];
  const pilha = [raiz];
  while (pilha.length) {
    const atual = pilha.pop();
    let itens;
    try { itens = fs.readdirSync(atual, { withFileTypes: true }); } catch { continue; }
    for (const item of itens) {
      const caminho = path.join(atual, item.name);
      if (item.isDirectory()) {
        if (item.name === "node_modules" || item.name === ".next") continue;
        pilha.push(caminho);
      } else if (/\.(tsx|ts)$/.test(item.name)) {
        saida.push(caminho);
      }
    }
  }
  return saida;
}

const css = fs.readFileSync(CSS, "utf8");
const fontes = arquivosDeCodigo("app").concat(arquivosDeCodigo("components"));

// ── 1. OS DEGRAUS EXISTEM E VALEM O QUE DIZEM ───────────────────────────────
for (const [nome, valor] of Object.entries(DEGRAUS)) {
  const achado = css.match(new RegExp(`${nome}\\s*:\\s*([^;]+);`))?.[1]?.trim();
  if (!achado) {
    falhas.push(`o degrau \`${nome}\` sumiu de ${CSS} — sem ele as classes que o usam viram font-size nenhum`);
  } else if (achado !== valor) {
    falhas.push(`\`${nome}\` mudou de ${valor} para ${achado}. Se foi de propósito, atualize este portão junto e diga por quê`);
  }
}
if (falhas.length === 0) ok.push(`os ${Object.keys(DEGRAUS).length} degraus da escala existem e batem`);

// ── 2. AS DUAS CLASSES DE DEFEITO NÃO VOLTAM ────────────────────────────────
const meioPixel = [];
const microscopico = [];
const arbitrarios = [];

for (const arquivo of fontes) {
  const texto = fs.readFileSync(arquivo, "utf8");
  for (const m of texto.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    const valor = Number(m[1]);
    arbitrarios.push({ arquivo, valor });
    if (!Number.isInteger(valor)) meioPixel.push({ arquivo, valor });
    if (valor < 10) microscopico.push({ arquivo, valor });
  }
}

if (meioPixel.length) {
  const amostra = meioPixel.slice(0, 3).map((x) => `${x.arquivo} (${x.valor}px)`).join(", ");
  falhas.push(
    `${meioPixel.length} tamanho(s) de meio-pixel voltaram em .tsx: ${amostra}. ` +
      `Meio-pixel é a assinatura de ajuste no olho — o degrau certo existe, use-o`,
  );
} else {
  ok.push("nenhum meio-pixel em .tsx");
}

if (microscopico.length) {
  const amostra = microscopico.slice(0, 3).map((x) => `${x.arquivo} (${x.valor}px)`).join(", ");
  falhas.push(
    `${microscopico.length} texto(s) abaixo de 10px voltaram em .tsx: ${amostra}. ` +
      `Foram eliminados em 01/08/2026 — 8px e 9px não são legíveis na tela de trabalho de ninguém`,
  );
} else {
  ok.push("nenhum texto abaixo de 10px em .tsx");
}

/* ── O MESMO DEFEITO, DO OUTRO LADO DA FRONTEIRA ────────────────────────────
   A primeira versão deste portão afirmava "nenhum meio-pixel" olhando só
   `.tsx` — e estava tecnicamente certa e praticamente falsa: `globals.css`
   tinha 33 meio-pixels e 87 tamanhos abaixo de 10px. Pior: TRÊS dos
   meio-pixels estavam no painel de referência do próprio v3, escrito na mesma
   sessão que escreveu este portão. Ele aprovou o próprio autor.

   O defeito não tinha sido eliminado; tinha mudado de arquivo. Uma asserção
   que só olha onde a limpeza passou sempre concorda com quem a escreveu.

   Aqui vão como CATRACA, não como zero: 30 e 87 são dívida herdada de anos de
   CSS, e travar em zero fecharia o portão sem ninguém conseguir abri-lo. Só
   podem cair. */
const meioPixelCss = (css.match(/font-size:\s*\d+\.\d+px/g) ?? []).length;
const microCss = (css.match(/font-size:\s*[0-9]px/g) ?? []).length;
const TETO_MEIO_PIXEL_CSS = 30;
const TETO_MICRO_CSS = 87;

if (meioPixelCss > TETO_MEIO_PIXEL_CSS) {
  falhas.push(`meio-pixel em ${CSS} subiu para ${meioPixelCss} (teto ${TETO_MEIO_PIXEL_CSS}) — a escala tem degrau para isso`);
} else {
  ok.push(`meio-pixel em ${CSS}: ${meioPixelCss} (teto ${TETO_MEIO_PIXEL_CSS})`);
}
if (microCss > TETO_MICRO_CSS) {
  falhas.push(`texto abaixo de 10px em ${CSS} subiu para ${microCss} (teto ${TETO_MICRO_CSS})`);
} else {
  ok.push(`abaixo de 10px em ${CSS}: ${microCss} (teto ${TETO_MICRO_CSS})`);
}

/* A superfície de referência do v3 não pode ela mesma violar a escala — é a
   que todo mundo vai copiar. Esta é ZERO, sem catraca. */
const blocoV3 = css.split("FILA DE DECISÕES")[1] ?? "";
const sujeiraNaReferencia = (blocoV3.match(/font-size:\s*(\d+\.\d+|[0-9])px/g) ?? []);
if (sujeiraNaReferencia.length) {
  falhas.push(
    `a superfície de referência do v3 usa tamanho fora da escala: ${sujeiraNaReferencia.join(", ")}. ` +
      `É a que todo mundo vai copiar — ela não pode ser a exceção`,
  );
} else {
  ok.push("a referência do v3 respeita a própria escala");
}

// ── 3. AS CATRACAS ──────────────────────────────────────────────────────────
if (arbitrarios.length > TETO_ARBITRARIOS_TSX) {
  const novos = arbitrarios.length - TETO_ARBITRARIOS_TSX;
  const porTamanho = {};
  for (const a of arbitrarios) porTamanho[a.valor] = (porTamanho[a.valor] || 0) + 1;
  falhas.push(
    `tamanhos arbitrários em .tsx subiram para ${arbitrarios.length} (teto ${TETO_ARBITRARIOS_TSX}, +${novos}). ` +
      `Distribuição: ${Object.entries(porTamanho).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}px×${n}`).join(" ")}. ` +
      `Use text-micro/rotulo/corpo/numero/heroi`,
  );
} else {
  ok.push(`arbitrários em .tsx: ${arbitrarios.length} (teto ${TETO_ARBITRARIOS_TSX})`);
}

const declaracoesCss = (css.match(/^\s*font-size:/gm) ?? []).length;
if (declaracoesCss > TETO_FONT_SIZE_CSS) {
  falhas.push(
    `declarações de font-size em ${CSS} subiram para ${declaracoesCss} (teto ${TETO_FONT_SIZE_CSS}). ` +
      `Regra nova de tamanho pertence à escala, não ao arquivo`,
  );
} else {
  ok.push(`font-size em ${CSS}: ${declaracoesCss} (teto ${TETO_FONT_SIZE_CSS})`);
}

// ── 4. A ESCALA ESTÁ VIVA, NÃO SÓ DECLARADA ────────────────────────────────
// Degrau declarado e nunca usado é documentação, não linguagem.
let usos = 0;
for (const arquivo of fontes) {
  usos += (fs.readFileSync(arquivo, "utf8").match(/text-(micro|rotulo|corpo|numero|heroi)\b/g) ?? []).length;
}
if (usos < 500) {
  falhas.push(`a escala do v3 tem só ${usos} usos — ela precisa ser o caminho dominante, não uma alternativa declarada`);
} else {
  ok.push(`a escala do v3 está viva: ${usos} usos`);
}

// ── 5. O ALVO DE 44px NAS PRIMITIVAS DE BOTÃO ───────────────────────────────
/* A regra do v3: qualquer controle que MUDA ESTADO tem 44px. Estava 42px no
   desktop e 44px só dentro de `@media (max-width: 767px)` — como se o dedo
   errasse no telefone e a mão acertasse no trackpad.

   O portão olha a regra GERAL de cada primitiva, não a existência de "44px" em
   algum lugar do arquivo: o `44px` já existia em remendos pontuais enquanto a
   regra geral entregava 42. Procurar a string aprovaria o estado defeituoso. */
const PRIMITIVAS_DE_BOTAO = [
  { seletor: ".atlas-app-shell .atlas-button-primary,\n.atlas-app-shell .atlas-button-secondary", nome: "atlas-button-primary/secondary" },
  { seletor: ".cc6-ghost-btn", nome: "cc6-ghost-btn" },
];
for (const p of PRIMITIVAS_DE_BOTAO) {
  const i = css.indexOf(`${p.seletor} {`);
  if (i < 0) {
    falhas.push(`não achei a regra base de \`${p.nome}\` — o portão não pode afirmar nada sobre o alvo de toque dela`);
    continue;
  }
  const bloco = css.slice(i, css.indexOf("}", i));
  const altura = bloco.match(/min-height:\s*(\d+)px/)?.[1];
  if (!altura) {
    falhas.push(`\`${p.nome}\` voltou a não declarar min-height — a altura passa a sair do padding, e o alvo encolhe`);
  } else if (Number(altura) < 44) {
    falhas.push(`\`${p.nome}\` está com min-height ${altura}px na regra geral; o v3 pede 44px em controle que muda estado`);
  } else {
    ok.push(`\`${p.nome}\`: alvo de ${altura}px na regra geral`);
  }
}

// ── 6. O CHIP QUE AGE TEM ALVO, MESMO SENDO PEQUENO ─────────────────────────
/* Medido na produção, na ficha de um cliente: 17 chips INTERATIVOS com 25px —
   e um deles é o controle que copia o telefone, o gesto mais usado do
   corretor. A correção não incha o pílulo (isso mataria a densidade que o faz
   existir): estende a área de toque com um pseudo-elemento centrado.

   O portão procura o PSEUDO-ELEMENTO, não `min-height` no chip — cobrar
   min-height aqui empurraria alguém a inchar o pílulo para passar. */
const chipInterativo = css.match(/(a|button)\.cc6-chip::after\s*\{([^}]*)\}/);
if (!chipInterativo) {
  falhas.push("o chip interativo perdeu a área de toque estendida — 17 deles medem 25px de tinta e voltariam a ser alvo de 25px");
} else if (!/height:\s*44px/.test(chipInterativo[2]) || !/position:\s*absolute/.test(chipInterativo[2])) {
  falhas.push("a área de toque do chip existe mas não entrega 44px absolutos — confira `height` e `position`");
} else {
  ok.push("chip interativo: 25px de tinta, 44px de alvo");
}

const railLink = css.match(/\.atlas-rail-link\s*\{([^}]*)\}/);
const alturaRail = railLink?.[1]?.match(/min-height:\s*(\d+)px/)?.[1];
if (!alturaRail) {
  falhas.push("`.atlas-rail-link` não declara min-height — são 14 links de navegação usados o dia inteiro");
} else if (Number(alturaRail) < 44) {
  falhas.push(`\`.atlas-rail-link\` voltou para ${alturaRail}px; navegar muda o estado da tela e o v3 pede 44px`);
} else {
  ok.push(`navegação lateral: alvo de ${alturaRail}px`);
}

// ── 7. FILETE DENTRO DE FILETE ──────────────────────────────────────────────
/* Medido na ficha do cliente: 24 `.cc6-panel` + 16 `.cc6-panel-quiet`, os dois
   com a MESMA hairline — o painel de dentro desenhava a linha que o de fora já
   tinha desenhado, 1px adiante. Um filete quer dizer "aqui começa outra
   coisa"; quando tudo tem filete, ele vira textura.

   E o portão cobra as duas metades: sumir com a borda genérica E manter as que
   têm papel. Sem a segunda metade, a limpeza apagaria sinal junto com ruído —
   foi o que quase aconteceu, porque CSS sem camada vence utilitário do
   Tailwind e passaria por cima do destaque e do hover sem ninguém notar. */
/* A âncora `^` não é decoração: sem ela esta asserção casava com a regra do
   TEMA CLARO (`:root[data-theme="light"] .cc6-panel .cc6-panel-quiet`), que
   também zera a borda — e ficava verde mesmo com a regra base apagada.
   Verificava uma regra diferente da que dizia verificar. Medido: a sabotagem
   passou na primeira tentativa. */
if (!/^\.cc6-panel \.cc6-panel-quiet \{[^}]*border-color:\s*transparent/m.test(css)) {
  falhas.push("o painel aninhado voltou a desenhar filete sobre filete — os dois usam a mesma hairline e a de dentro não separa nada");
} else {
  ok.push("painel aninhado sem filete redundante");
}
/* Cada papel é cobrado pela DECLARAÇÃO que o torna visível, não pela presença
   do nome. Na primeira versão eu pedia só o seletor: apagar a linha do `:hover`
   do `cc6-interativo` deixava a regra do `transition` para trás, o nome
   continuava no arquivo e o portão passava — com o hover morto. */
const PAPEIS = [
  { classe: "cc6-destaque", exige: /\.cc6-panel-quiet\.cc6-destaque\s*\{[^}]*border-color:\s*var\(--atlas-accent\)/, oque: "a borda de acento" },
  { classe: "cc6-interativo", exige: /\.cc6-panel-quiet\.cc6-interativo:hover\s*\{[^}]*border-color:/, oque: "a borda que aparece no hover" },
];
for (const p of PAPEIS) {
  if (!p.exige.test(css)) {
    falhas.push(`o papel \`${p.classe}\` perdeu ${p.oque} — a limpeza de filetes volta a apagar um sinal que DIZ alguma coisa, e ninguém vê acontecer`);
  } else {
    ok.push(`\`${p.classe}\`: ${p.oque} sobrevive à limpeza`);
  }
}

// ── 8. QUANTOS TRATAMENTOS DE RÓTULO COEXISTEM ──────────────────────────────
/* Medido em 01/08/2026: SEIS classes `*eyebrow*` no CSS. Mas o que a tela
   RENDERIZA são quatro tratamentos, porque a regra do shell achata quatro delas
   num só — e achata por ORDEM, com especificidade empatada em (0,3,0).

   Vencedor por uso: `cc6-eyebrow`, 178 contra 54 somados. É ele o rótulo do v3.

   A catraca conta as classes DECLARADAS, não os usos: classe nova de rótulo é o
   jeito como esta divergência cresceu, uma de cada vez, cada uma parecendo
   pequena. `atlas-eyebrow` e `atlas-page-eyebrow` continuam na conta de
   propósito — elas têm `letter-spacing: 0` e `text-transform: none`, ou seja
   NÃO são eyebrow, são texto normal com o nome errado. Renomear 37 sítios sem
   navegador para medir seria trocar clareza por risco. */
const TETO_CLASSES_EYEBROW = 6;
const classesEyebrow = [...new Set((css.match(/^\.[a-z0-9-]*eyebrow[a-z0-9-]*/gm) ?? []))];
if (classesEyebrow.length > TETO_CLASSES_EYEBROW) {
  falhas.push(
    `${classesEyebrow.length} classes de rótulo coexistem (teto ${TETO_CLASSES_EYEBROW}): ${classesEyebrow.join(", ")}. ` +
      `O rótulo do v3 é \`cc6-eyebrow\` — 178 usos contra 54 somados das outras`,
  );
} else {
  ok.push(`classes de rótulo: ${classesEyebrow.length} (teto ${TETO_CLASSES_EYEBROW}) · vencedora: cc6-eyebrow`);
}

/* E a que já foi achatada não pode voltar a declarar o que não renderiza.
   `.atlas-empty-eyebrow` pedia 10px/700/.16em/uppercase e a tela entregava
   12px/500/0/none. Código que descreve uma tela que ninguém vê foi o que fez
   esta sessão concluir errado mais de uma vez. */
const empty = css.match(/^\.atlas-empty-eyebrow\s*\{([^}]*)\}/m)?.[1] ?? "";
if (/font-size|letter-spacing|text-transform|font-weight|color/.test(empty)) {
  falhas.push(
    "`.atlas-empty-eyebrow` voltou a declarar aparência que o shell sobrescreve — " +
      "a regra de `[data-visual-system=\"atlas-core-v2\"]` empata em (0,3,0) e vence por ordem",
  );
} else {
  ok.push("`.atlas-empty-eyebrow` declara só o que chega à tela");
}

// ── 9. A SUPERFÍCIE TEM UM RAIO, E ELE MORA NUM LUGAR SÓ ────────────────────
/* Havia 12 classes de painel com CINCO raios (10, 12, 16, 20, 24, 28px), cada
   um escolhido no lugar de uso. A pergunta "qual é o raio do produto?" não
   tinha resposta. Agora tem, e é um token — trocar o raio do v3 é trocar uma
   linha, não caçar doze.

   O portão cobra o TOKEN, não o número: se alguém recravar `16px` aqui, o
   valor continua o mesmo e a propriedade que importa (haver um só lugar de
   decisão) morre em silêncio. */
const bloco = (re) => css.match(re)?.[1] ?? "";
const superficie = bloco(/^\.cc6-panel,\n\.atlas-superficie \{([^}]*)\}/m);
const superficieQuieta = bloco(/^\.cc6-panel-quiet,\n\.atlas-superficie--quiet \{([^}]*)\}/m);
if (!superficie) {
  falhas.push("a primitiva de superfície perdeu o apelido oficial (`.cc6-panel, .atlas-superficie`) — o v3 volta a não ter nome para a superfície");
} else if (!/border-radius:\s*var\(--atlas-superficie-raio\)/.test(superficie)) {
  falhas.push("`.cc6-panel` voltou a cravar o raio em vez de consultar `--atlas-superficie-raio` — o raio volta a ser decidido em cada painel");
} else if (!/border-radius:\s*var\(--atlas-superficie-raio-quieto\)/.test(superficieQuieta)) {
  falhas.push("`.cc6-panel-quiet` voltou a cravar o raio — a superfície de dentro volta a divergir da de fora");
} else {
  ok.push("a superfície tem um raio só, e ele vem de token");
}

// ── 10. NENHUMA CLASSE É BAIXADA PARA SER SOBRESCRITA ───────────────────────
/* `status-badge.tsx` aplicava `atlas-badge atlas-badge-<tom>` e anulava, no
   mesmo className, as TRÊS propriedades que a variante existe para dar. 219
   instâncias carregando 6 variantes para descartar 100% delas.

   O portão procura o `!` — que é a assinatura exata do problema: só se usa
   `!important` num utilitário quando se está brigando com uma regra sem
   camada deste arquivo. Se a briga voltar, o `!` volta junto. */
const SELO = "components/atlas/status-badge.tsx";
const selo = fs.existsSync(SELO) ? fs.readFileSync(SELO, "utf8") : "";
if (!selo) {
  falhas.push(`não achei ${SELO} — o portão não pode afirmar nada sobre a guerra de classes do selo`);
} else {
  const marcaDeGuerra = selo.match(/className=[^>]*?[\w)\]]!/s);
  if (marcaDeGuerra) {
    falhas.push(
      "o selo de estado voltou a sobrescrever com `!` a classe que ele mesmo baixa. " +
        "Ou a classe serve, ou sai: declare a aparência em `.cc6-badge-*` e não anule nada",
    );
  } else if (!/cc6-badge/.test(selo)) {
    falhas.push("o selo de estado não usa mais `.cc6-badge` — se mudou de primitiva, aponte este portão para a nova e diga por quê");
  } else {
    ok.push("o selo de estado usa a classe que serve, sem anular nada");
  }
}

// ── 11. A DENSIDADE ALCANÇA O ESPAÇO — E NÃO ALCANÇA O ALVO DE TOQUE ────────
/* A densidade atuava em 8 seletores e não tocava onde a página gasta altura.
   Agora escala padding, gap e margem dos utilitários que o produto usa.

   A SEGUNDA METADE DESTA ASSERÇÃO É A QUE IMPORTA. A implementação óbvia era
   redefinir `--spacing` (uma linha, alcança tudo). Ela teria rebaixado
   `min-h-11` — 117 usos, os 44px de alvo de toque do v3 — para 35,2px, e
   nenhum portão pegaria: os 44px conferidos acima são os das primitivas
   declaradas neste arquivo, em px literal, não os de `min-h-11`.

   Por isso o portão cobra a FRONTEIRA: a densidade pode encolher espaço
   ENTRE coisas, nunca o TAMANHO das coisas. */
const regrasDensidade = [
  ...css.matchAll(/\.atlas-app-shell\[data-desktop-density="compact"\] \.([a-z0-9\\.-]+) \{\s*([a-z-]+):/g),
];
const alvosDensidade = new Set(regrasDensidade.map((m) => m[1].replace(/\\/g, "")));
const DOMINANTES = ["p-5", "p-4", "gap-3", "gap-2", "px-5", "py-3", "mt-4"];
const faltando = DOMINANTES.filter((c) => !alvosDensidade.has(c));
const proibidos = [...alvosDensidade].filter((c) => /^(min-h|min-w|max-h|max-w|h|w|size)-\d/.test(c));

if (regrasDensidade.length < 100) {
  falhas.push(
    `a densidade voltou a atuar em ${regrasDensidade.length} utilitários (mínimo 100). ` +
      `Ela existe para mudar a altura da página, não um atributo`,
  );
} else if (faltando.length) {
  falhas.push(
    `a densidade parou de alcançar ${faltando.join(", ")} — são os utilitários de espaço mais usados do produto`,
  );
} else if (proibidos.length) {
  falhas.push(
    `a densidade passou a encolher TAMANHO, não só espaço: ${proibidos.slice(0, 5).join(", ")}. ` +
      `Entre eles mora \`min-h-11\` (117 usos), que é o alvo de toque de 44px — ` +
      `encolher isso rebaixa acessibilidade sem nenhum portão perceber`,
  );
} else {
  ok.push(`densidade: ${regrasDensidade.length} utilitários de espaço, e nenhum de tamanho`);
}

// ── SAÍDA ───────────────────────────────────────────────────────────────────
for (const o of ok) console.log(`  ok   ${o}`);
for (const f of falhas) console.error(`  FALHA ${f}`);

if (falhas.length) {
  console.error(
    `\n✗ linguagem-visual: ${falhas.length} de ${falhas.length + ok.length} asserções reprovaram.\n` +
      `\nTrês desfechos legítimos, e só três: consertar o código; reapontar a asserção para a\n` +
      `propriedade (documentando data e causa MEDIDA); ou parar e relatar. Nunca afrouxar a\n` +
      `catraca para passar.`,
  );
  process.exit(1);
}
console.log(`\n✓ linguagem-visual: ${ok.length} asserções, todas verdes.`);
