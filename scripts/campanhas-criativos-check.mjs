/**
 * PORTÃO ADVERSARIAL DA COMPOSIÇÃO DE PROPOSTA DE ANÚNCIO.
 *
 * A garantia que este portão protege é uma só, e é a que custa dinheiro se
 * quebrar: **o painel nunca pode dizer "pronto" sem ter medido cada item.**
 *
 * Um item de prontidão tem três estados, não dois. "A conta de anúncios é
 * alcançável?" só tem resposta se a listagem viva da Meta respondeu. Se ela
 * falhou, `false` diria "a conta não serve" (mentira) e `true` diria "pode
 * publicar" (mentira cara: R$ 3.845,19 já saíram de uma conta enquanto as leads
 * atribuídas vinham de outra). O terceiro estado — NÃO MEDIDO — é o único
 * honesto, e `podePublicar` tem de reprová-lo com o mesmo rigor de uma falta.
 *
 * 100% determinístico: sem rede, sem banco, sem relógio, sem aleatório. Importa
 * o núcleo PURO lib/marketing/campanhas-criativos-composicao.ts direto do .ts —
 * o Node apaga os tipos sozinho e resolve os imports relativos do módulo.
 *
 * Rodar da raiz do repo: node scripts/campanhas-criativos-check.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NUCLEO = path.join(raiz, "lib", "marketing", "campanhas-criativos-composicao.ts");
const ROTA = path.join(raiz, "app", "api", "v1", "marketing", "campanhas-criativos-proposta", "route.ts");
const TELA = path.join(raiz, "app", "(crm)", "marketing", "campanhas-criativos-proposta", "page.tsx");

const falhas = [];
let passou = 0;
function check(nome, condicao, extra = "") {
  if (condicao) {
    passou += 1;
    console.log(`✅ ${nome}`);
  } else {
    falhas.push(`${nome}${extra ? ` — ${extra}` : ""}`);
    console.log(`❌ ${nome}${extra ? ` — ${extra}` : ""}`);
  }
}

const fonte = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

/**
 * Remove comentários antes de afirmar o que o arquivo FAZ.
 *
 * A primeira versão deste portão reprovou o docstring da própria rota — a frase
 * que EXPLICA que a execução mora em `/api/v1/marketing/execute` foi lida como
 * se fosse uma chamada. Um portão que pune a documentação ensina a apagar a
 * documentação. A asserção foi reapontada para a propriedade que importa (o
 * código não chama), e com isso ficou mais forte: um `fetch` de verdade escrito
 * dentro de um bloco comentado deixaria de passar despercebido.
 */
const semComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── Carrega o núcleo puro ──────────────────────────────────────────────────
if (!fs.existsSync(NUCLEO)) {
  console.error("núcleo não encontrado:", NUCLEO);
  process.exit(1);
}
/**
 * O núcleo é importado DIRETO do .ts (o Node 26 apaga os tipos sozinho).
 *
 * Antes ele era stripado à mão e importado por uma URL `data:`. Aquilo dependia
 * de o módulo ter só `import type` — porque um `data:` URL não tem diretório
 * base, e o primeiro import relativo DE VALOR quebrava a carga inteira com
 * ERR_INVALID_URL. Foi exatamente o que aconteceu quando a composição passou a
 * importar a régua da Meta: o portão morreu por causa de uma premissa do
 * carregador, não por um defeito do que ele mede.
 *
 * Importar o arquivo pelo caminho real resolve os relativos como o Next resolve
 * — e o portão passa a medir o módulo que existe, não uma cópia sem vizinhos.
 */
const modulo = await import(pathToFileURL(NUCLEO).href);
const {
  prontidaoDaPublicacao, resumoDeProntidao, briefDoEmpreendimento,
  resumoDoPlano, construtorDePlano, objetivoValido, previaDoAnuncio,
  VERBA_DIARIA_MINIMA_BRL, LIMITE_TITULO,
} = modulo;

// ── Composição de referência: tudo certo ───────────────────────────────────
const EMPREENDIMENTO = {
  id: "0df32360-71cc-41aa-b594-be78ac5df86f",
  nome: "Inside Perdizes",
  incorporadora: "Incorporadora",
  bairro: "Perdizes",
  cidade: "São Paulo",
  precoMin: 337782,
  entrega: null,
  tipologias: ["1D", "2D"],
  materiais: ["book", "presentation"],
};

const completa = () => ({
  objetivo: "gerar_leads",
  empreendimento: EMPREENDIMENTO,
  contaId: "act_123456789",
  contaAlcancavel: true,
  paginaId: "111222333",
  formularioId: "444555666",
  publico: { cidade: "São Paulo", chaveCidade: "269969", chaveMedida: true, paisISO2: "BR" },
  verbaDiariaBrl: 80,
  duracaoDias: 14,
  criativo: {
    titulos: ["Apartamento em Perdizes"],
    textos: ["Moradia pronta para começar a sua história."],
    descricoes: ["Agende sua visita"],
    cta: "SIGN_UP",
    imageHashes: ["abc123"],
    videoIds: [],
  },
  origemDoTexto: "humano",
  lastroDaIA: null,
});

const resumoDe = (entrada) => resumoDeProntidao(prontidaoDaPublicacao(entrada));

// ── 1 · O caso feliz precisa realmente passar ─────────────────────────────
// Sem isto, todas as asserções negativas abaixo passariam com uma função que
// devolve "não pode publicar" para tudo — portão verde congelando o defeito.
const base = resumoDe(completa());
check(
  "composição completa e toda medida → podePublicar",
  base.podePublicar === true,
  `podePublicar=${base.podePublicar}; motivos: ${base.motivos.join(" | ")}`,
);
check("composição completa não deixa item sem medir", base.naoMedidos === 0, `naoMedidos=${base.naoMedidos}`);
check("composição completa não deixa bloqueador", base.bloqueadores === 0, `bloqueadores=${base.bloqueadores}`);

// ── 2 · NÃO MEDIDO derruba a conclusão ────────────────────────────────────
// É a garantia central deste arquivo.
const contaNaoMedida = { ...completa(), contaAlcancavel: null };
const rConta = resumoDe(contaNaoMedida);
check(
  "conta não medida (Meta não respondeu) → NÃO pode publicar",
  rConta.podePublicar === false && rConta.naoMedidos >= 1,
  `podePublicar=${rConta.podePublicar}, naoMedidos=${rConta.naoMedidos}`,
);
check(
  "conta não medida aparece como 'nao_medido', nunca como 'falta'",
  prontidaoDaPublicacao(contaNaoMedida).find((i) => i.chave === "conta")?.estado === "nao_medido",
);
check(
  "o motivo do bloqueio diz explicitamente que não foi medido",
  rConta.motivos.some((m) => m.includes("não medido")),
  rConta.motivos.join(" | "),
);

const geoNaoMedida = {
  ...completa(),
  publico: { cidade: "São Paulo", chaveCidade: null, chaveMedida: false, paisISO2: "BR" },
};
const rGeo = resumoDe(geoNaoMedida);
check(
  "cidade não resolvida na Meta (leitura falhou) → NÃO pode publicar",
  rGeo.podePublicar === false && rGeo.naoMedidos >= 1,
  `podePublicar=${rGeo.podePublicar}, naoMedidos=${rGeo.naoMedidos}`,
);
check(
  "cidade resolvida e NÃO encontrada é 'falta', não 'nao_medido'",
  prontidaoDaPublicacao({
    ...completa(),
    publico: { cidade: "Cidade Inexistente", chaveCidade: null, chaveMedida: true, paisISO2: "BR" },
  }).find((i) => i.chave === "geo")?.estado === "falta",
);

// ── 3 · Cada item bloqueante, sozinho, derruba a conclusão ────────────────
// Varre um a um: um `podePublicar` que ignorasse qualquer um deles passaria
// despercebido numa asserção agregada.
const derrubas = [
  ["empreendimento", { empreendimento: null }],
  ["pagina", { paginaId: null }],
  ["formulario", { formularioId: null }],
  ["conta", { contaId: "", contaAlcancavel: false }],
  ["verba", { verbaDiariaBrl: VERBA_DIARIA_MINIMA_BRL - 1 }],
  ["objetivo", { objetivo: "contato_whatsapp" }],
];
for (const [chave, patch] of derrubas) {
  const r = resumoDe({ ...completa(), ...patch });
  check(`falta em "${chave}" derruba podePublicar`, r.podePublicar === false, `podePublicar=${r.podePublicar}`);
}
// O CONVERSO da varredura acima — o que faltava, e o buraco por onde passou uma
// mutação do cético em 02/08/2026: trocar `faltando.filter((i) => i.bloqueia)`
// por `faltando` em `resumoDeProntidao` mantinha os 44 verdes. O campo
// `bloqueia` perdia todo o sentido (descrição ausente passaria a impedir
// publicar) sem uma única asserção reclamar. Item não bloqueante que falta tem
// de deixar `podePublicar` de pé — senão o painel vira lista de proibições.
const semDescricao = {
  ...completa(),
  criativo: { ...completa().criativo, descricoes: [] },
};
const rSemDescricao = resumoDe(semDescricao);
check(
  "descrição ausente é falta NÃO bloqueante — não derruba podePublicar",
  rSemDescricao.podePublicar === true && rSemDescricao.faltando >= 1,
  `podePublicar=${rSemDescricao.podePublicar}, faltando=${rSemDescricao.faltando}`,
);
check(
  "falta não bloqueante fica fora da contagem de bloqueadores",
  rSemDescricao.bloqueadores === 0,
  `bloqueadores=${rSemDescricao.bloqueadores}`,
);

const semMidia = {
  ...completa(),
  criativo: { ...completa().criativo, imageHashes: [], videoIds: [] },
};
check("anúncio sem mídia não pode publicar", resumoDe(semMidia).podePublicar === false);

const semTexto = {
  ...completa(),
  criativo: { ...completa().criativo, titulos: [], textos: [] },
};
check("anúncio sem título/texto não pode publicar", resumoDe(semTexto).podePublicar === false);

// ── 4 · Limite de texto da Meta ───────────────────────────────────────────
const tituloLongo = {
  ...completa(),
  criativo: { ...completa().criativo, titulos: ["x".repeat(LIMITE_TITULO + 1)] },
};
check(
  `título acima de ${LIMITE_TITULO} caracteres é bloqueio`,
  resumoDe(tituloLongo).podePublicar === false,
);

// ── 5 · Todo item bloqueante tem detalhe que explica ──────────────────────
// Item sem detalhe transforma o painel numa lista de proibições mudas — o
// defeito que o usuário nomeou: "botão morto sem explicação".
const itensCompletos = prontidaoDaPublicacao(semMidia);
check(
  "todo item traz detalhe não vazio",
  itensCompletos.every((i) => typeof i.detalhe === "string" && i.detalhe.trim().length > 0),
);
check(
  "itens de integração apontam ONDE resolver",
  ["conta", "pagina", "formulario"].every(
    (c) => itensCompletos.find((i) => i.chave === c)?.ondeResolver?.href === "/integrations/meta",
  ),
);

// ── 6 · Preço ausente NUNCA vira zero na peça ─────────────────────────────
// "Ausência de dado não pode ser desenhada como zero": Arvo e Tiê Aclimação têm
// price_min NULO no banco. Um 0 aqui viraria "a partir de R$ 0" num anúncio.
const briefSemPreco = briefDoEmpreendimento({ ...EMPREENDIMENTO, precoMin: null });
check(
  "empreendimento sem preço não recebe priceFrom",
  !("priceFrom" in briefSemPreco),
  `priceFrom=${briefSemPreco.priceFrom}`,
);
const briefPrecoZero = briefDoEmpreendimento({ ...EMPREENDIMENTO, precoMin: 0 });
check("preço 0 não vira priceFrom", !("priceFrom" in briefPrecoZero));
check(
  "empreendimento com preço recebe priceFrom",
  briefDoEmpreendimento(EMPREENDIMENTO).priceFrom === 337782,
);

// ── 7 · Nada nasce ativo ──────────────────────────────────────────────────
check(
  "plano com status ACTIVE é acusado",
  resumoDoPlano([{ kind: "create_campaign", path: "x", payload: { status: "ACTIVE" } }]).todosPausados === false,
);
check(
  "plano todo PAUSED passa",
  resumoDoPlano([
    { kind: "create_campaign", path: "x", payload: { status: "PAUSED" } },
    { kind: "create_adset", path: "y", payload: { status: "PAUSED" } },
  ]).todosPausados === true,
);
check(
  "resumo do plano conta cada tipo de passo",
  (() => {
    const r = resumoDoPlano([
      { kind: "create_campaign", path: "a", payload: {} },
      { kind: "create_adset", path: "b", payload: {} },
      { kind: "create_creative", path: "c", payload: {} },
      { kind: "create_ad", path: "d", payload: {} },
      { kind: "create_ad", path: "e", payload: {} },
    ]);
    return r.campanhas === 1 && r.conjuntos === 1 && r.criativos === 1 && r.anuncios === 2 && r.passos === 5;
  })(),
);

// ── 8 · Objetivo sem construtor não finge ter plano ───────────────────────
check("só gerar_leads tem construtor de plano", construtorDePlano("gerar_leads") === true);
check("contato_whatsapp NÃO tem construtor", construtorDePlano("contato_whatsapp") === false);
check("objetivo inválido é recusado", objetivoValido("qualquer_coisa") === false);

// ── 9 · A origem do texto viaja para quem aprova ──────────────────────────
for (const origem of ["humano", "ia", "ia_editado"]) {
  check(
    `prévia preserva origem "${origem}"`,
    previaDoAnuncio({ ...completa(), origemDoTexto: origem }).origemDoTexto === origem,
  );
}
check(
  "prévia sem mídia diz que não tem mídia",
  previaDoAnuncio(semMidia).temMidia === false && previaDoAnuncio(semMidia).midiaResumo.includes("sem mídia"),
);

// ── 10 · Fronteira: a rota não escreve na Meta nem no banco ───────────────
const rotaBruta = fonte(ROTA);
check("rota existe", Boolean(rotaBruta));
if (rotaBruta) {
  const rota = semComentarios(rotaBruta);
  check(
    "rota NÃO chama a rota de execução (que gasta)",
    !rota.includes("marketing/execute"),
  );
  check(
    "rota NÃO insere no banco",
    !/\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(rota),
    "toda gravação pertence a /api/v1/marketing/proposals",
  );
  check(
    "rota NÃO faz POST/DELETE na Graph API (leitura pura)",
    !/method:\s*["'](POST|PUT|DELETE|PATCH)["']/.test(rota),
  );
  check(
    "rota usa o MESMO construtor de plano de ready-campaigns",
    rota.includes("planFullPublication"),
  );
  check(
    "rota resolve a cidade para a chave da Meta",
    rota.includes("chaveDaCidade"),
    "mandar o nome cru faz o CONJUNTO ser recusado",
  );
}

// ── 11 · A tela leva a /approvals e não encurta a cadeia ──────────────────
const telaBruta = fonte(TELA);
check("tela existe", Boolean(telaBruta));
if (telaBruta) {
  const tela = semComentarios(telaBruta);
  check("tela aponta explicitamente para /approvals", tela.includes('href="/approvals"'));
  check(
    "tela propõe pela rota governada de propostas",
    tela.includes("/api/v1/marketing/proposals"),
  );
  check(
    "tela NÃO chama a rota de execução",
    !tela.includes("marketing/execute"),
  );
  check(
    "botão desabilitado explica o motivo",
    tela.includes("Ainda não dá para propor"),
  );
  check(
    "tela consome a prontidão de produto de campaign-readiness (fonte única)",
    tela.includes("campaign-readiness"),
  );
}

console.log(`\n${passou} verificação(ões) passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.error("\nFALHAS:");
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
