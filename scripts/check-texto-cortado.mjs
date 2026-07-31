/**
 * TEXTO QUE O PRODUTO CORTA — e a diferença entre cortar um nome e cortar a
 * instrução.
 *
 * ── O DEFEITO QUE ORIGINOU ESTE PORTÃO — 2026-07-31 ────────────────────────
 *
 * A frase que responde "faça agora" na barra do Lead 360 estava com
 * `white-space: nowrap` + `text-overflow: ellipsis`. Medido no navegador, a
 * 1440px:
 *
 *     caixa .................... 389 px
 *     altura renderizada ....... 18 px  →  UMA linha
 *     próxima ação real ........ 148 caracteres
 *     visível .................. ~63 caracteres (42%)
 *
 * O corretor lia "Retornar a ligação de Maria Aparecida Go…" e não ficava
 * sabendo sobre QUAL proposta, de QUAL torre, o que confirmar. Nenhum dos 1.247
 * contratos pegou: a regra era válida, o build passava, a tela mentia.
 *
 * ── O QUE ESTE PORTÃO FAZ, E O QUE ELE RECUSA FAZER ────────────────────────
 *
 * FAZ ..... trava a correção provada. `.atlas-lead-next-action strong` não pode
 *           voltar a `nowrap`, e precisa manter um clamp de 2+ linhas.
 *
 * FAZ ..... mantém CONTADO o resto da classe. Existem outros blocos que cortam
 *           texto com reticências, e a maioria está certa: cortar o nome numa
 *           célula de tabela é desenho, não defeito. Mas o número não pode
 *           CRESCER sem alguém olhar.
 *
 * RECUSA .. dizer que a classe está resolvida. Eu vi UM caso com o navegador e
 *           corrigi UM caso. Os demais vivem em telas que eu nunca abri — mudar
 *           regra de layout sem ver a tela é como este defeito nasceu.
 *
 * ── POR QUE CATRACA, E NÃO NÚMERO CRAVADO ──────────────────────────────────
 *
 * Diminuir passa (alguém corrigiu um). Aumentar reprova (alguém introduziu
 * outro). Número exato produziria vermelho por reforma inofensiva, e portão que
 * grita à toa é portão que as pessoas aprendem a ignorar.
 */
import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();

/**
 * Os comentários saem ANTES de qualquer inspeção.
 *
 * Não é zelo: a primeira versão deste portão reprovou a própria correção que
 * veio proteger. O comentário acima da regra EXPLICA o defeito citando
 * `white-space: nowrap` — e o portão leu a explicação como se fosse a
 * implementação. É a terceira vez que isso acontece neste repositório; o
 * comentário que descreve o defeito não pode ser confundido com o defeito.
 */
const semComentarios = (fonte) => fonte.replace(/\/\*[\s\S]*?\*\//g, "");

const css = semComentarios(fs.readFileSync(path.join(raiz, "app", "globals.css"), "utf8"));

/** Blocos com o par que corta: nowrap + reticências. */
function blocosQueCortam(fonte) {
  const achados = [];
  const re = /([^{}\n][^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(fonte))) {
    const corpo = m[2];
    if (/white-space:\s*nowrap/.test(corpo) && /text-overflow:\s*ellipsis/.test(corpo)) {
      achados.push({
        seletor: m[1].trim().replace(/\s+/g, " "),
        linha: fonte.slice(0, m.index).split("\n").length,
      });
    }
  }
  return achados;
}

/** O corpo de uma regra, pelo seletor exato. */
function corpoDaRegra(fonte, seletor) {
  const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|\\})\\s*${alvo}\\s*\\{([^}]*)\\}`, "m").exec(fonte);
  return m ? m[2] : null;
}

const falhas = [];
const ok = (rotulo) => console.log(`  ✓ ${rotulo}`);
const conferir = (rotulo, condicao, porque) => {
  if (condicao) return ok(rotulo);
  falhas.push(`${rotulo} — ${porque}`);
  console.log(`  ✗ ${rotulo} — ${porque}`);
};

console.log("\nTEXTO CORTADO — a instrução principal precisa caber\n");

// ── 1. A correção provada, congelada ───────────────────────────────────────
const acao = corpoDaRegra(css, ".atlas-lead-next-action strong");
conferir(
  "A próxima ação do Lead 360 existe como regra própria",
  acao !== null,
  "`.atlas-lead-next-action strong` sumiu de app/globals.css",
);
if (acao) {
  conferir(
    "A próxima ação não volta a uma linha só",
    !/white-space:\s*nowrap/.test(acao),
    "`white-space: nowrap` voltou: a instrução do corretor cabe ~42% e o resto vira reticência",
  );
  const clamp = /-webkit-line-clamp:\s*(\d+)/.exec(acao);
  conferir(
    "A próxima ação mantém clamp de 2+ linhas",
    clamp !== null && Number(clamp[1]) >= 2,
    clamp ? `clamp de ${clamp[1]} linha(s) — abaixo de 2 o texto longo volta a ser cortado` : "sem `-webkit-line-clamp`: a altura fica sem teto",
  );
  // A lição que quase passou: o clamp chegou e não teve efeito porque `nowrap`
  // vinha de outro lugar. Regra que depende da ausência de outra funciona por
  // sorte — por isso `white-space` tem de estar DECLARADO aqui.
  conferir(
    "A quebra de linha é declarada, não presumida",
    /white-space:\s*normal/.test(acao),
    "sem `white-space: normal` explícito o clamp fica à mercê de um `nowrap` herdado — foi exatamente o que aconteceu ao corrigir",
  );
}

// ── 2. O resto da classe, contado e nunca silencioso ───────────────────────
//
// Linha de base medida em 2026-07-31, no commit que corrigiu o primeiro caso.
// Só o CRESCIMENTO reprova.
// 45 é MEDIDO, não estimado. A primeira versão deste portão trouxe 44 — eu
// tinha subtraído mentalmente o caso corrigido, e ele nunca esteve na conta
// (deixou de casar com o padrão no momento em que a correção entrou).
const BASE_DE_BLOCOS_QUE_CORTAM = 45;
const atuais = blocosQueCortam(css);
conferir(
  `A classe não cresce (base ${BASE_DE_BLOCOS_QUE_CORTAM})`,
  atuais.length <= BASE_DE_BLOCOS_QUE_CORTAM,
  `${atuais.length} blocos cortam texto com reticências, contra ${BASE_DE_BLOCOS_QUE_CORTAM} na base. Um novo corte entrou — confira se o que ele esconde é um rótulo (tudo bem) ou uma instrução (não)`,
);

console.log(
  `\n  INVENTÁRIO: ${atuais.length} bloco(s) cortam texto com reticências.\n` +
    "  A maioria está certa — cortar nome em célula de tabela é desenho.\n" +
    "  NENHUM deles foi verificado com a tela aberta, exceto a próxima ação do\n" +
    "  Lead 360. Isto é dívida declarada, não cobertura.\n",
);

if (falhas.length > 0) {
  console.log(`✗ ${falhas.length} falha(s).\n`);
  process.exit(1);
}
console.log("✅ A instrução principal do Lead 360 cabe, e a classe não cresceu.\n");
