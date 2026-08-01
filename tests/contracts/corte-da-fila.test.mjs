/**
 * Contrato do CORTE DA FILA.
 *
 * ── O QUE ESTE CONTRATO EXISTE PARA IMPEDIR ─────────────────────────────────
 *
 * 1. CAMINHOS DIVERGENTES. A central conta a faixa em JS sobre o instantâneo
 *    que já tem em memória; `/leads` filtra em PostgREST. Dois caminhos, mesmo
 *    nome — e um dia o clique em "146" abre 139. Aqui os dois rodam sobre o
 *    MESMO conjunto e são obrigados a devolver exatamente o mesmo conjunto,
 *    faixa por faixa. É a classe de bug que este repositório mais pagou.
 *
 * 2. A ESCADA DEIXAR DE SOMAR. As faixas são DECOMPOSIÇÃO de
 *    `firstContactOverdue`, não uma segunda contagem. Se alguém mudar um
 *    predicado e a soma quebrar, o defeito tem de aparecer aqui — não como
 *    "dois números na mesma página".
 *
 * 3. "TODO MUNDO ESTÁ FORA DA PRAÇA". Nenhum empreendimento ativo com UF
 *    preenchida ⇒ o eixo geográfico SOME. A versão invertida seria plausível e
 *    completamente errada, e o painel ficaria confiante sobre nada.
 *
 * 4. DDD INVENTADO. '971567739185' tem 12 dígitos e não começa com 55: lido de
 *    forma ingênua viraria DDD 97 (Amazonas). Comprimento errado é ausência de
 *    dado, e ausência de dado é faixa própria — nunca "fora da praça".
 *
 * 5. PRAZO SEM PREMISSA. Sem ritmo declarado a resposta é "sem prazo". Uma
 *    data inventada é pior que nenhuma: ela escapa do painel e vira meta
 *    cobrada da equipe.
 *
 * 6. O VERBO EM LOTE VOLTANDO PELA PORTA DOS FUNDOS. O módulo não exporta
 *    NENHUMA escrita, e não pode passar a exportar.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  avancarDiasUteis,
  CHAVES_DE_FAIXA,
  classificarNaFila,
  dddDoTelefone,
  derivarPraca,
  DIAS_ATE_RECONFIRMAR_RITMO,
  FAIXAS_DA_FILA,
  fragmentoDaFaixa,
  prazoDaFaixa,
  premissaPrecisaReconfirmar,
  ritmoNecessarioPara,
  triarFila,
  ufDoDdd,
} from "../../lib/atlas/triagem-da-fila.ts";
import { DISCARD_REASONS } from "../../lib/atlas/discard-reasons.ts";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const ler = (relativo) => fs.readFileSync(path.join(RAIZ, relativo), "utf8");

const AGORA = Date.parse("2026-07-29T15:00:00.000Z");
const DIA = 86_400_000;

/** Praça medida hoje: 3 empreendimentos ativos em SP e um sem UF (Spin Mood). */
const EMPREENDIMENTOS = [
  { state: "SP", status: "active" },
  { state: "SP", status: "active" },
  { state: "SP", status: "active" },
  { state: null, status: "active" },
];

const PRACA = derivarPraca(EMPREENDIMENTOS);

/**
 * Conjunto de prova. Reproduz a forma da base viva medida em 2026-07-29 —
 * pedidos de contato com DDD paulista, pedidos de fora, lista importada dos
 * dois lados — e acrescenta os dois telefones ilegíveis que existem de verdade
 * ('971567739185' e '01511991096505'), além de um lead já contatado, que não é
 * fila, e de um telefone repetido.
 */
function conjuntoDeProva() {
  const leads = [];
  const nascer = (dias) => AGORA - dias * DIA;
  const empurrar = (quantidade, molde) => {
    for (let indice = 0; indice < quantidade; indice += 1) {
      leads.push({
        id: `${molde.prefixo}-${indice}`,
        importBatchId: molde.importBatchId,
        phoneNormalized: molde.telefone(indice),
        createdAtMs: nascer(molde.dias),
        donoId: molde.dono,
        naFila: true,
      });
    }
  };
  // Pediu contato, DDD da praça (SP). Um deles é o mais antigo da base: 67 dias.
  empurrar(6, { prefixo: "p1", importBatchId: null, dono: "corretor-a", dias: 67, telefone: (i) => `5511${String(900000000 + i)}` });
  // Pediu contato, DDD de outro estado — o caso mais caro de enterrar.
  empurrar(3, { prefixo: "p2", importBatchId: null, dono: "corretor-a", dias: 20, telefone: (i) => `5581${String(900000000 + i)}` });
  // Lista importada, DDD da praça.
  empurrar(4, { prefixo: "p3", importBatchId: "lote-1", dono: "corretor-b", dias: 1, telefone: (i) => `5519${String(900000000 + i)}` });
  // Lista importada, DDD de outro estado (telemarketing frio).
  empurrar(5, { prefixo: "p4", importBatchId: "lote-1", dono: "corretor-b", dias: 1, telefone: (i) => `5592${String(900000000 + i)}` });
  // Telefone fixo de 12 caracteres, praça — o formato existe (18 na base viva).
  leads.push({ id: "p3-fixo", importBatchId: "lote-1", phoneNormalized: "551132001234", createdAtMs: nascer(1), donoId: "corretor-b", naFila: true });
  // Os dois ilegíveis REAIS.
  leads.push({ id: "p0-a", importBatchId: "lote-1", phoneNormalized: "971567739185", createdAtMs: nascer(1), donoId: "corretor-b", naFila: true });
  leads.push({ id: "p0-b", importBatchId: null, phoneNormalized: "01511991096505", createdAtMs: nascer(3), donoId: "corretor-a", naFila: true });
  // Sem telefone nenhum: também é "praça não medida", nunca "fora".
  leads.push({ id: "p0-c", importBatchId: null, phoneNormalized: null, createdAtMs: nascer(3), donoId: null, naFila: true });
  // Prefixo 55 CERTO e comprimento errado — o caso que só o comprimento pega.
  // Sem ele, tirar a checagem de tamanho passaria despercebido, e a lista do
  // banco (que casa por padrão de comprimento) divergiria da contagem em JS.
  leads.push({ id: "p0-d", importBatchId: null, phoneNormalized: "5511999", createdAtMs: nascer(4), donoId: "corretor-a", naFila: true });
  // Já contatado: NÃO é fila, mas existe e é o sobrevivente de um telefone
  // repetido — por isso entra no conjunto.
  leads.push({ id: "vivo-contatado", importBatchId: null, phoneNormalized: "5511911112222", createdAtMs: nascer(90), donoId: "corretor-a", naFila: false });
  // A cópia mais nova do mesmo telefone, essa sim na fila.
  leads.push({ id: "p1-repetido", importBatchId: null, phoneNormalized: "5511911112222", createdAtMs: nascer(2), donoId: "corretor-a", naFila: true });
  return leads;
}

const LEADS = conjuntoDeProva();
const FILA = LEADS.filter((lead) => lead.naFila);

// ── 1. A escada decompõe, não recontagem ───────────────────────────────────

test("as faixas somam exatamente o tamanho da fila", () => {
  const resultado = triarFila(LEADS, PRACA, { agoraMs: AGORA });
  assert.equal(resultado.total, FILA.length, "o total é a fila, e a fila é quem tem naFila");
  assert.equal(
    resultado.somaDasFaixas,
    FILA.length,
    "se a soma das faixas não é o mesmo número da linha acima, a tela se desmente no primeiro clique",
  );
  assert.equal(resultado.faixas.length, FAIXAS_DA_FILA.length, "com praça medida são cinco faixas");
});

test("lead já contatado não entra em faixa nenhuma", () => {
  const resultado = triarFila(LEADS, PRACA, { agoraMs: AGORA });
  assert.equal(resultado.total, LEADS.length - 1, "exatamente um lead do conjunto já foi contatado");
  // O contatado é o SOBREVIVENTE do telefone repetido: ele precisa estar no
  // conjunto (senão a cópia mais nova não teria com quem se repetir) e ao
  // mesmo tempo não pode contar como fila. Se ele vazasse para uma faixa, a
  // escada somaria 21 e a linha acima continuaria dizendo 20.
  const contatado = LEADS.find((lead) => lead.id === "vivo-contatado");
  assert.equal(contatado.naFila, false);
  assert.equal(resultado.somaDasFaixas, LEADS.length - 1, "quem já foi contatado não é fila");
});

test("a distribuição por dono é o que torna a má alocação visível", () => {
  const resultado = triarFila(LEADS, PRACA, { agoraMs: AGORA });
  const pediuNaPraca = resultado.faixas.find((faixa) => faixa.chave === "pediu_na_praca");
  assert.ok(pediuNaPraca.donos.length, "sem a coluna do dono a escada vira estatística, não decisão");
  assert.equal(pediuNaPraca.donos[0].id, "corretor-a");
  const listaFora = resultado.faixas.find((faixa) => faixa.chave === "lista_fora_da_praca");
  assert.equal(listaFora.donos[0].id, "corretor-b", "as faixas não estão misturadas entre os corretores");
});

test("cada faixa carrega a idade da mais antiga, para a explicação não virar desculpa", () => {
  const resultado = triarFila(LEADS, PRACA, { agoraMs: AGORA });
  const pediuNaPraca = resultado.faixas.find((faixa) => faixa.chave === "pediu_na_praca");
  assert.equal(pediuNaPraca.idadeMaisAntigaDias, 67, "o pedido mais antigo já espera 67 dias");
});

test("telefone repetido é contado — em LEITURA, e do lado da cópia mais nova", () => {
  const resultado = triarFila(LEADS, PRACA, { agoraMs: AGORA });
  const pediuNaPraca = resultado.faixas.find((faixa) => faixa.chave === "pediu_na_praca");
  assert.equal(pediuNaPraca.telefoneRepetido, 1, "só a cópia mais nova conta; a mais antiga é o sobrevivente");
  const total = resultado.faixas.reduce((soma, faixa) => soma + faixa.telefoneRepetido, 0);
  assert.equal(total, 1, "nenhum outro telefone se repete no conjunto");
});

// ── 2. O DDD, e as duas armadilhas dele ────────────────────────────────────

test("telefone fora do formato canônico é 'não medido', nunca um DDD inventado", () => {
  assert.equal(dddDoTelefone("971567739185"), null, "12 dígitos sem o 55 não é DDD 97");
  assert.equal(dddDoTelefone("01511991096505"), null, "14 dígitos não é telefone canônico");
  assert.equal(dddDoTelefone(null), null);
  assert.equal(dddDoTelefone("5511abcdefghi"), null, "só dígitos");
  assert.equal(dddDoTelefone("5511999998888"), "11", "55 + DDD + 9 dígitos");
  assert.equal(dddDoTelefone("551132001234"), "11", "55 + DDD + 8 dígitos (fixo)");
  assert.equal(dddDoTelefone("5510999998888"), null, "DDD 10 não existe no plano de numeração");
});

test("os ilegíveis caem em 'praça não medida', e não em 'fora da praça'", () => {
  const resultado = triarFila(LEADS, PRACA, { agoraMs: AGORA });
  const naoMedida = resultado.faixas.find((faixa) => faixa.chave === "praca_nao_medida");
  assert.equal(naoMedida.total, 4, "dois fora do formato, um ausente e um com 55 e comprimento errado");
  assert.equal(dddDoTelefone("5511999"), null, "prefixo certo não salva comprimento errado");
  const fora = resultado.faixas.find((faixa) => faixa.chave === "lista_fora_da_praca");
  assert.ok(!fora.total || fora.total === 5, "os ilegíveis não podem engordar a faixa de fora da praça");
});

test("UF vem do plano de numeração, não de palpite", () => {
  assert.equal(ufDoDdd("11"), "SP");
  assert.equal(ufDoDdd("92"), "AM");
  assert.equal(ufDoDdd("10"), null);
  assert.equal(ufDoDdd(null), null);
});

// ── 3. A praça, e a regra dura ─────────────────────────────────────────────

test("nenhum empreendimento ativo com UF ⇒ o eixo geográfico SOME", () => {
  const semUf = derivarPraca([{ state: null, status: "active" }, { state: "", status: "active" }]);
  assert.equal(semUf.medida, false, "praça sem UF não é praça vazia — é praça não medida");
  assert.ok(semUf.motivo, "e o motivo precisa viajar até a tela");
  const resultado = triarFila(LEADS, semUf, { agoraMs: AGORA });
  assert.deepEqual(
    resultado.faixas.map((faixa) => faixa.chave),
    ["pediu", "lista"],
    "sem praça a escada mostra só 'pediu / não pediu' — jamais 'todos fora'",
  );
  assert.equal(resultado.somaDasFaixas, FILA.length, "colapsar o eixo não pode perder lead");
  const fora = resultado.faixas.some((faixa) => faixa.chave.includes("fora"));
  assert.equal(fora, false, "'todos fora da praça' seria plausível e completamente invertido");
});

test("empreendimento inativo não define praça", () => {
  const praca = derivarPraca([{ state: "RJ", status: "inactive" }, { state: "SP", status: "active" }]);
  assert.deepEqual(praca.ufs, ["SP"]);
});

test("a praça medida declara quantos ativos ficaram sem UF", () => {
  assert.equal(PRACA.medida, true);
  assert.deepEqual(PRACA.ufs, ["SP"]);
  assert.equal(PRACA.ativos, 4);
  assert.equal(PRACA.ativosSemUf, 1, "a lacuna do Spin Mood é declarada, não preenchida");
});

// ── 4. O invariante que vale mais que todos: os DOIS caminhos contam igual ──

/** Avaliador de LIKE do PostgREST: `_` casa um caractere, `%` casa qualquer coisa. */
function casaLike(valor, padrao) {
  if (valor === null || valor === undefined) return false;
  const regex = new RegExp(
    `^${padrao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, ".").replace(/%/g, ".*")}$`,
  );
  return regex.test(String(valor));
}

/** Aplica o fragmento do jeito que a rota de leads aplica. */
function aplicarFragmento(leads, fragmento) {
  return leads.filter((lead) => {
    if (!lead.naFila) return false;
    const loteOk = fragmento.importBatch === "nulo" ? !lead.importBatchId : Boolean(lead.importBatchId);
    if (!loteOk) return false;
    if (!fragmento.telefoneOr) return true;
    return fragmento.telefoneOr
      .split(",")
      .some((termo) => casaLike(lead.phoneNormalized, termo.replace("phone_normalized.like.", "")));
  });
}

test("o predicado em JS e o fragmento em PostgREST devolvem o MESMO conjunto", () => {
  for (const definicao of FAIXAS_DA_FILA) {
    const fragmento = fragmentoDaFaixa(definicao.chave, PRACA);
    if (!fragmento) continue;
    const porJs = FILA.filter((lead) => classificarNaFila(lead, PRACA) === definicao.chave)
      .map((lead) => lead.id)
      .sort();
    const porConsulta = aplicarFragmento(LEADS, fragmento).map((lead) => lead.id).sort();
    assert.deepEqual(
      porConsulta,
      porJs,
      `faixa ${definicao.chave}: contar de um jeito e listar de outro é como a tela se desmente`,
    );
  }
});

test("o mesmo vale com o eixo colapsado", () => {
  const semUf = derivarPraca([{ state: null, status: "active" }]);
  for (const chave of ["pediu", "lista"]) {
    const fragmento = fragmentoDaFaixa(chave, semUf);
    assert.ok(fragmento, "sem praça as duas faixas continuam expressáveis");
    const porJs = FILA.filter((lead) => classificarNaFila(lead, semUf) === chave).map((lead) => lead.id).sort();
    const porConsulta = aplicarFragmento(LEADS, fragmento).map((lead) => lead.id).sort();
    assert.deepEqual(porConsulta, porJs);
  }
});

test("o fragmento fixa o COMPRIMENTO, e não só o prefixo do DDD", () => {
  const fragmento = fragmentoDaFaixa("lista_na_praca", PRACA);
  assert.ok(
    fragmento.telefoneOr.includes("phone_normalized.like.5511_________"),
    "55 + DDD + nove caracteres",
  );
  assert.ok(
    fragmento.telefoneOr.includes("phone_normalized.like.5511________"),
    "e a variante de oito, que os 18 fixos da base usam",
  );
  // Sem o comprimento no filtro do banco, '5511' + qualquer coisa entraria na
  // lista e a contagem da central diria outro número.
  assert.equal(casaLike("55111234", "5511_________"), false);
});

test("faixa inexpressável RECUSA em vez de devolver lista aproximada", () => {
  assert.equal(
    fragmentoDaFaixa("praca_nao_medida", PRACA),
    null,
    "filtro que devolve o número errado é pior que filtro ausente",
  );
  assert.equal(fragmentoDaFaixa("inventada", PRACA), null);
  assert.equal(fragmentoDaFaixa("pediu_na_praca", derivarPraca([])), null, "sem praça não há faixa geográfica");
});

test("o vocabulário da faixa é fechado", () => {
  assert.equal(CHAVES_DE_FAIXA.includes("pediu_na_praca"), true);
  assert.equal(CHAVES_DE_FAIXA.includes("todas"), false);
});

// ── 5. A consequência dita, e a premissa que ninguém mediu ─────────────────

test("sem ritmo declarado a resposta é 'sem prazo' — nunca uma data", () => {
  assert.equal(
    prazoDaFaixa({ tamanhoDaFaixa: 146, acumuladoAntes: 0, corretores: 2, ritmoPorCorretorPorDiaUtil: null, agoraMs: AGORA }),
    null,
    "uma data inventada escapa do painel e vira meta cobrada",
  );
});

test("sem corretor com carteira também não há prazo", () => {
  assert.equal(
    prazoDaFaixa({ tamanhoDaFaixa: 146, acumuladoAntes: 0, corretores: 0, ritmoPorCorretorPorDiaUtil: 12, agoraMs: AGORA }),
    null,
  );
});

test("a aritmética é fila ÷ (corretores × ritmo), arredondando para cima", () => {
  const prazo = prazoDaFaixa({ tamanhoDaFaixa: 146, acumuladoAntes: 0, corretores: 2, ritmoPorCorretorPorDiaUtil: 12, agoraMs: AGORA });
  assert.equal(prazo.diasUteis, 7, "146 ÷ 24 = 6,08 — e ninguém termina em fração de dia");
  assert.equal(prazo.diasUteisAteComecar, 0, "a primeira faixa não espera nada");
  assert.equal(prazo.unidade, "primeira ligação", "a unidade nunca é receita nem conversão");
});

test("a faixa de baixo só começa depois das de cima", () => {
  const prazo = prazoDaFaixa({ tamanhoDaFaixa: 161, acumuladoAntes: 279, corretores: 2, ritmoPorCorretorPorDiaUtil: 20, agoraMs: AGORA });
  assert.equal(prazo.diasUteisAteComecar, 7, "279 ÷ 40, para cima");
  assert.equal(prazo.diasUteis, 11, "(279 + 161) ÷ 40, para cima");
});

test("dias úteis pulam o fim de semana, pela MESMA definição da próxima ação", () => {
  // 2026-07-31 é uma sexta-feira. Um dia útil adiante é a segunda, 03/08.
  const sexta = Date.parse("2026-07-31T15:00:00.000Z");
  const proximo = new Date(avancarDiasUteis(sexta, 1));
  assert.equal(proximo.getUTCDate(), 3, "sábado não é dia de primeira ligação");
  assert.equal(proximo.getUTCMonth(), 7, "agosto");
  assert.equal(avancarDiasUteis(sexta, 0), sexta, "zero dia não anda");
});

test("a linha invertida diz o ritmo que a meta exigiria", () => {
  assert.equal(
    ritmoNecessarioPara({ tamanhoDaFaixa: 146, acumuladoAntes: 0, corretores: 2, diasUteis: 10 }),
    8,
    "146 ÷ (2 × 10), para cima",
  );
  assert.equal(ritmoNecessarioPara({ tamanhoDaFaixa: 146, acumuladoAntes: 0, corretores: 0, diasUteis: 10 }), null);
});

test("a premissa envelhece à vista e precisa ser reconfirmada", () => {
  assert.equal(premissaPrecisaReconfirmar(null, AGORA), true, "sem declaração não há prazo");
  assert.equal(premissaPrecisaReconfirmar(AGORA - 13 * DIA, AGORA), false);
  assert.equal(
    premissaPrecisaReconfirmar(AGORA - DIAS_ATE_RECONFIRMAR_RITMO * DIA, AGORA),
    true,
    "número digitado há duas semanas é lido como medição por quem chega depois",
  );
});

// ── 6. O que só dá para provar lendo o arquivo ─────────────────────────────

test("o módulo do corte não exporta NENHUMA escrita", () => {
  const fonte = ler("lib/atlas/triagem-da-fila.ts");
  for (const proibido of ["supabase", "from(", "insert", "update(", "delete(", "fetch("]) {
    assert.equal(
      fonte.includes(proibido),
      false,
      `"${proibido}" no módulo do corte é o verbo em lote voltando pela porta dos fundos`,
    );
  }
  assert.equal(
    /^import "server-only"/m.test(fonte),
    false,
    "puro, para poder ser exercitado sem subir o Next (a MENÇÃO no comentário é o motivo; o import é o que não pode existir)",
  );
});

test("a central não ganha botão de gravação em massa derivado do corte", () => {
  const pagina = ler("app/(crm)/command-center/page.tsx");
  const trecho = pagina.slice(pagina.indexOf("function CorteDaFila("), pagina.indexOf("export default function CommandCenterPage"));
  assert.ok(trecho.length > 500, "o componente do corte precisa existir nesta página");
  for (const proibido of ["bulk-discard", "bulk-stage", "bulk-transfer", "method: \"POST\"", "method: \"PATCH\""]) {
    assert.equal(trecho.includes(proibido), false, `"${proibido}" transformaria a escada em teatro`);
  }
});

test("o campo do ritmo nasce VAZIO, sem valor padrão e sem atalho", () => {
  const pagina = ler("app/(crm)/command-center/page.tsx");
  const trecho = pagina.slice(pagina.indexOf("function CorteDaFila("), pagina.indexOf("export default function CommandCenterPage"));
  assert.ok(trecho.includes('const [rascunho, setRascunho] = useState("");'), "vazio por padrão");
  assert.ok(trecho.includes('placeholder="—"'), "traço, nunca um número sugerido");
  assert.equal(/defaultValue/.test(trecho), false, "valor padrão seria um chute com aparência de conta");
  assert.ok(trecho.includes("premissa sua"), "todo resultado que ela produz vem rotulado");
});

test("a premissa mora na máquina do diretor — nunca no banco, nunca em API", () => {
  const pagina = ler("app/(crm)/command-center/page.tsx");
  assert.ok(pagina.includes('const RITMO_DECLARADO_KEY = "atlas:ritmo-declarado:v1"'), "chave versionada");
  const trecho = pagina.slice(pagina.indexOf("function CorteDaFila("), pagina.indexOf("export default function CommandCenterPage"));
  assert.ok(trecho.includes("window.localStorage"), "precisa sobreviver à aba para poder envelhecer à vista");
  assert.equal(trecho.includes("/api/"), false, "no dia em que virar dado compartilhado, vira métrica");
  for (const arquivo of fs.readdirSync(path.join(RAIZ, "supabase/migrations"))) {
    assert.equal(
      ler(`supabase/migrations/${arquivo}`).includes("ritmo_declarado"),
      false,
      "premissa persistida em banco é premissa promovida a medição",
    );
  }
});

test("o número na tela e o número da lista saem do MESMO campo", () => {
  const rota = ler("app/api/v1/analytics/director-daily/route.ts");
  assert.ok(
    rota.includes("naFila: !lead.first_contacted_at"),
    "a fila do corte é o mesmo predicado por coluna que firstContactOverdue usa",
  );
  assert.ok(
    rota.includes("const firstContactOverdue = primeiroContatoMensuravel"),
    "e ele continua sendo calculado por coluna, não por etapa",
  );
});

test("a rota de leads RE-DERIVA a faixa no servidor e recusa o que não expressa", () => {
  const rota = ler("app/api/v1/crm/leads/route.ts");
  assert.ok(rota.includes("fragmentoDaFaixa"), "o predicado vem da lib, não do cliente");
  assert.ok(rota.includes("FAIXA_NAO_SUPORTADA"), "recusa explícita");
  // A asserção precisa olhar DENTRO do bloco da faixa. O mesmo predicado
  // aparece no filtro `attention=never_contacted` logo acima; procurar no
  // arquivo inteiro deixaria passar exatamente a quebra que importa aqui.
  const blocoDaFaixa = rota.slice(rota.indexOf("if (fragmento) {"), rota.indexOf("if (nextAction) {"));
  assert.ok(blocoDaFaixa.length > 200, "o bloco da faixa precisa existir na rota");
  assert.ok(
    blocoDaFaixa.includes('.is("first_contacted_at", null)'),
    "a faixa é definida sobre a fila dos nunca contatados; sem isso o rótulo mente",
  );
  assert.ok(blocoDaFaixa.includes("terminalStorageStatuses"), "e lead encerrado não é fila");
  assert.equal(
    /faixa[^\n]*params\.get\("ids"\)/.test(rota),
    false,
    "o servidor não confia na tela: nenhuma lista de ids do cliente entra nesta decisão",
  );
});

test("a faixa sem lista não ganha link", () => {
  const pagina = ler("app/(crm)/command-center/page.tsx");
  const mapa = pagina.slice(pagina.indexOf("const DESTINO_DA_FAIXA"), pagina.indexOf("const RITMO_DECLARADO_KEY"));
  assert.equal(mapa.includes("praca_nao_medida"), false, "link que abre outro número é pior que faixa sem link");
  for (const chave of ["pediu_na_praca", "lista_fora_da_praca"]) {
    assert.ok(mapa.includes(`${chave}: "/leads?attention=never_contacted&faixa=${chave}`), `destino de ${chave}`);
  }
});

test("o divisor é o corretor COM carteira, não o cadastrado", () => {
  const rota = ler("app/api/v1/analytics/director-daily/route.ts");
  assert.ok(rota.includes("const brokersWithPortfolio"), "medido, não cadastrado");
  const pagina = ler("app/(crm)/command-center/page.tsx");
  const trecho = pagina.slice(pagina.indexOf("function CorteDaFila("), pagina.indexOf("export default function CommandCenterPage"));
  assert.ok(trecho.includes("capacity?.brokersWithPortfolio"), "dividir pelo cadastro daria um prazo que ninguém atende");
});

test("'não medido' nunca vira zero na linha do primeiro contato", () => {
  const pagina = ler("app/(crm)/command-center/page.tsx");
  assert.ok(
    pagina.includes("firstContactOverdue: number | null;"),
    "a rota devolve null em banco sem a coluna; declarar `number` faz a divisão virar NaN ou zero",
  );
  assert.ok(
    pagina.includes("{directorDaily.commercial.firstContactOverdue ?? \"—\"}"),
    "traço, nunca 0 — zero se lê como 'a fila acabou'",
  );
});

// ── 7. O argumento da recusa, herdado do descarte ──────────────────────────

test("só dois motivos são provados pelo registro, e nenhum deles fala de tentativa", () => {
  const provados = DISCARD_REASONS.filter((motivo) => motivo.provaNoRegistro).map((motivo) => motivo.key);
  assert.deepEqual(provados.sort(), ["contato_invalido", "duplicado"]);
  const inalcancavel = DISCARD_REASONS.find((motivo) => motivo.key === "inalcancavel");
  assert.equal(
    inalcancavel.provaNoRegistro,
    false,
    "'sem resposta após tentativas' exige que alguém tenha tentado — e nesta operação ninguém tentou",
  );
  const foraArea = DISCARD_REASONS.find((motivo) => motivo.key === "fora_area");
  assert.equal(
    foraArea.provaNoRegistro,
    false,
    "DDD de outro estado NÃO é 'fora da área de atendimento': o DDD diz onde a linha foi habilitada",
  );
});

test("a tela diz que 'fora da praça' não é motivo de descarte", () => {
  const pagina = ler("app/(crm)/command-center/page.tsx");
  const trecho = pagina.slice(pagina.indexOf("function CorteDaFila("), pagina.indexOf("export default function CommandCenterPage"));
  assert.ok(trecho.includes("fora da área de atendimento"), "sem esta frase alguém liga os dois");
  assert.ok(
    trecho.includes("onde a linha foi habilitada"),
    "a ressalva da portabilidade é escrita na TELA, e não só devolvida pela API — payload não é leitura",
  );
});
