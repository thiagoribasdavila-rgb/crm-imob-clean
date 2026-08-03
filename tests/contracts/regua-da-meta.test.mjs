/**
 * Contrato da RÉGUA DA META.
 *
 * O que este contrato protege não é a existência das regras — é o que
 * acontece QUANDO ELAS REPROVAM. Antes desta régua o produto já sabia que um
 * público HOUSING inválido era inválido: `validateHousingTargeting` era chamada,
 * o resultado ia para a tela, a linha ficava vermelha — e o botão "Enviar para
 * aprovação" continuava habilitado. Saber e não barrar é decorar o problema.
 *
 * Por isso os testes centrais aqui são de BLOQUEIO, não de detecção:
 * `podePropor` tem de virar `false`, e o motivo tem de chegar legível.
 *
 * O segundo grupo protege a HONESTIDADE da régua nas duas pontas:
 *   · não medido nunca conta como aprovado (mídia por hash não tem largura);
 *   · aviso nunca vira bloqueio (a regra dos 20% de texto na imagem foi
 *     REVOGADA pela Meta em set/2020 — reprovar por ela seria o produto
 *     inventando uma recusa que a plataforma não faz).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  conferirPecaNaMeta,
  conferirPolitica,
  conferirLimitesDeTexto,
  conferirPublico,
  conferirMidia,
  conferirArtefatosDeDestino,
  fecharVeredito,
  proporcaoMaisProxima,
  POSICIONAMENTOS,
  REGRAS_DE_TEXTO,
  FONTES,
  LIMITE_TITULO,
  LIMITE_TEXTO,
  MAX_VARIACOES_POR_CAMPO,
  TEXTO_NA_IMAGEM_RECOMENDADO,
} from "../../lib/marketing/regua-da-meta.ts";
import { housingTargetingSpec } from "../../lib/meta/marketing/housing-audience.ts";
import { validateCopy } from "../../lib/ai/creative-strategist.ts";
import { ACOES_PROIBIDAS_AUTONOMAMENTE } from "../../lib/ai/niveis-de-autonomia.ts";
import {
  LIMITE_TITULO as LIMITE_TITULO_COMPOSICAO,
  prontidaoDaPublicacao,
} from "../../lib/marketing/campanhas-criativos-composicao.ts";

/** Peça limpa. Cada teste estraga UMA coisa daqui. */
const limpa = () => ({
  titulos: ["Do aluguel ao imóvel próprio"],
  textos: [
    "Condições direto com a incorporadora, sujeitas a análise de crédito. Simule sem compromisso e conheça a planta.",
  ],
  descricoes: ["Simule sem compromisso"],
  targeting: housingTargetingSpec({ countries: ["BR"], cities: ["269969"] }),
  categoriasEspeciais: ["HOUSING"],
  midias: [{ referencia: "imagem abc123", larguraPx: 1080, alturaPx: 1350, tamanhoMb: 2.4 }],
});

// ---------------------------------------------------------------------------
// O que a régua deixa passar
// ---------------------------------------------------------------------------

test("peça limpa passa, e passar é um ITEM — não uma lista vazia", () => {
  const v = conferirPecaNaMeta(limpa());
  assert.equal(v.podePropor, true);
  assert.equal(v.bloqueios, 0);
  assert.ok(v.aprovados > 0, "aprovação silenciosa faria zero parecer saúde");
  assert.ok(v.itens.some((i) => i.chave === "politica_conteudo" && i.estado === "aprovado"));
});

test("toda regra carrega FONTE com url, publicador e data", () => {
  for (const item of conferirPecaNaMeta(limpa()).itens) {
    assert.match(item.fonte, /https?:\/\//, `${item.chave} sem url`);
    assert.match(item.fonte, /\d{4}-\d{2}-\d{2}/, `${item.chave} sem data`);
    assert.ok(item.detalhe.length > 0, `${item.chave} não explica a si mesmo`);
  }
});

// ---------------------------------------------------------------------------
// Público — o que derruba a CONTA, não o anúncio
// ---------------------------------------------------------------------------

test("BLOQUEIO: targeting sem as travas HOUSING impede propor", () => {
  // Exatamente o que a política proíbe: estreitar idade e escolher gênero.
  const v = conferirPecaNaMeta({
    ...limpa(),
    targeting: { ...housingTargetingSpec({ countries: ["BR"] }), age_min: 25, age_max: 45, genders: [1] },
  });
  assert.equal(v.podePropor, false);
  assert.ok(v.bloqueios >= 2);
  assert.match(v.motivos.join(" "), /idade/i);
  assert.match(v.motivos.join(" "), /g[êe]nero/i);
});

test("BLOQUEIO: segmentar por CEP impede propor", () => {
  const alvo = housingTargetingSpec({ countries: ["BR"] });
  alvo.geo_locations = { ...alvo.geo_locations, zips: [{ key: "BR:01310" }] };
  const v = conferirPecaNaMeta({ ...limpa(), targeting: alvo });
  assert.equal(v.podePropor, false);
  assert.match(v.motivos.join(" "), /CEP/i);
});

test("BLOQUEIO: campanha imobiliária sem HOUSING declarado", () => {
  const v = conferirPecaNaMeta({ ...limpa(), categoriasEspeciais: [] });
  assert.equal(v.podePropor, false);
  assert.match(v.motivos.join(" "), /HOUSING/);
  // O risco tem de estar dito: quem lê precisa saber que não é só o anúncio.
  assert.match(v.motivos.join(" "), /conta/i);
});

test("categoria e travas são itens SEPARADOS — declarar não é obedecer", () => {
  const itens = conferirPublico({
    ...limpa(),
    categoriasEspeciais: ["HOUSING"],
    targeting: { ...housingTargetingSpec({ countries: ["BR"] }), genders: [2] },
  });
  assert.ok(itens.some((i) => i.chave === "categoria_especial" && i.estado === "aprovado"));
  assert.ok(itens.some((i) => i.chave.startsWith("trava_housing") && i.estado === "reprovado"));
});

test("sem plano montado, público é NÃO MEDIDO — nunca aprovado", () => {
  const itens = conferirPublico({ titulos: [], textos: [], descricoes: [], targeting: null, categoriasEspeciais: null });
  assert.equal(itens.length, 2);
  for (const i of itens) assert.equal(i.estado, "nao_medido");
  // Não medido não derruba a proposta, mas também não conta como aprovação.
  assert.equal(itens.filter((i) => i.estado === "aprovado").length, 0);
});

// ---------------------------------------------------------------------------
// Política de texto — o elo que estava partido
// ---------------------------------------------------------------------------

test("BLOQUEIO: o texto EDITADO na tela passa pela política (era o elo partido)", () => {
  // `buildAdCopy` limpa o que ele gera; este texto veio do teclado do usuário.
  const v = conferirPecaNaMeta({ ...limpa(), textos: ["Apartamento ideal para famílias que querem sossego."] });
  assert.equal(v.podePropor, false);
  assert.match(v.motivos.join(" "), /ideal para/i);
});

test("BLOQUEIO: pergunta sobre situação financeira do leitor", () => {
  const v = conferirPecaNaMeta({ ...limpa(), titulos: ["Está negativado?"] });
  assert.equal(v.podePropor, false);
  const item = v.itens.find((i) => i.trecho && /negativad/i.test(i.trecho));
  assert.ok(item, "o trecho exato tem de voltar — sem ele o usuário caça a frase no escuro");
  assert.equal(item.severidade, "bloqueio");
});

test("BLOQUEIO: prometer aprovação de crédito", () => {
  for (const frase of ["Crédito aprovado na hora!", "Financiamento aprovado para todos", "Sem consulta ao SPC"]) {
    const v = conferirPecaNaMeta({ ...limpa(), textos: [frase] });
    assert.equal(v.podePropor, false, `passou: ${frase}`);
    assert.match(v.motivos.join(" "), /banco|an[áa]lise|crédito|cr[ée]dito/i);
  }
});

test("BLOQUEIO: garantir que o preço não muda", () => {
  const v = conferirPecaNaMeta({ ...limpa(), textos: ["Preço congelado até o fim do mês."] });
  assert.equal(v.podePropor, false);
  assert.match(v.motivos.join(" "), /pre[çc]o|tabela/i);
});

test("a ressalva honesta NÃO é reprovada — a régua não pode punir o texto certo", () => {
  // Este é o texto que o próprio `buildAdCopy` gera. Se a régua o reprovasse,
  // o produto brigaria consigo mesmo e ninguém conseguiria propor nada.
  const v = conferirPecaNaMeta({
    ...limpa(),
    textos: [
      "Financiamento com condições facilitadas direto com a incorporadora, sujeitas a análise de crédito.",
    ],
  });
  assert.equal(v.podePropor, true, v.motivos.join(" | "));
});

test("a política REUSA validateCopy — os 9 padrões antigos não foram reescritos", () => {
  // Se alguém reimplementar os padrões aqui em vez de chamar `validateCopy`,
  // este teste continua verde — mas o de baixo não: ele confere que o DETALHE
  // vem palavra por palavra do módulo original, e uma reescrita mudaria a
  // redação. É a diferença entre "detecta" e "detecta pelo mesmo caminho".
  const doOriginal = validateCopy({
    product: "",
    angles: [],
    primaryTexts: ["Apartamento ideal para famílias que querem sossego."],
    headlines: [],
    descriptions: [],
    callToAction: "LEARN_MORE",
    complianceNotes: [],
  }).find((v) => v.rule === "discriminacao_housing");
  assert.ok(doOriginal, "validateCopy deixou de pegar 'ideal para famílias'");

  const daRegua = conferirPolitica({
    titulos: [],
    textos: ["Apartamento ideal para famílias que querem sossego."],
    descricoes: [],
  }).find((i) => i.chave.startsWith("politica_existente_"));
  assert.ok(daRegua);
  assert.equal(daRegua.detalhe, doOriginal.detail);
  assert.equal(daRegua.severidade, "bloqueio");
});

test("tamanho e duplicata não são reportados como POLÍTICA", () => {
  // `validateCopy` mistura limite de caractere com política. Deixar os dois
  // saírem pelo mesmo item faria "título longo" aparecer como violação de
  // política de discriminação — e quem lesse pararia de acreditar na régua.
  const itens = conferirPolitica({
    titulos: ["x".repeat(LIMITE_TITULO + 50), "x".repeat(LIMITE_TITULO + 50)],
    textos: ["Texto honesto sobre o empreendimento e a planta."],
    descricoes: [],
  });
  assert.equal(itens.filter((i) => i.estado === "reprovado").length, 0);
});

test("os IDs de regra batem com o catálogo de ações proibidas do dono", () => {
  // O acoplamento é por nome (regua-da-meta não pode IMPORTAR
  // niveis-de-autonomia: aquele módulo lê `fs` e quebraria o bundle da tela).
  // Nome sem verificação apodrece — este teste é a verificação.
  const doCatalogo = new Set(ACOES_PROIBIDAS_AUTONOMAMENTE.map((a) => a.acao));
  const daRegua = new Set(REGRAS_DE_TEXTO.map((r) => r.regra));
  for (const nome of ["prometer_financiamento", "garantir_preco_ou_estoque"]) {
    assert.ok(doCatalogo.has(nome), `${nome} sumiu do catálogo do dono`);
    assert.ok(daRegua.has(nome), `${nome} sumiu da régua`);
  }
});

// ---------------------------------------------------------------------------
// Aviso NUNCA vira bloqueio
// ---------------------------------------------------------------------------

test("AVISO: texto cortado no feed não impede propor", () => {
  const longo = "a".repeat(LIMITE_TEXTO - 10); // acima dos 125 visíveis, abaixo do limite
  const v = conferirPecaNaMeta({ ...limpa(), textos: [longo] });
  assert.equal(v.podePropor, true, "corte visual não é recusa da Meta");
  const corte = v.itens.find((i) => i.chave === "corte_feed");
  assert.equal(corte.estado, "reprovado");
  assert.equal(corte.severidade, "aviso");
});

test("AVISO: a regra dos 20% de texto na imagem foi revogada — não bloqueia", () => {
  const v = conferirPecaNaMeta({
    ...limpa(),
    midias: [{ referencia: "img", larguraPx: 1080, alturaPx: 1080, fracaoDeTexto: 0.6 }],
  });
  assert.equal(v.podePropor, true);
  const item = v.itens.find((i) => i.chave.startsWith("midia_texto_"));
  assert.equal(item.severidade, "aviso");
  assert.match(item.detalhe, /REVOGADA/);
  assert.ok(TEXTO_NA_IMAGEM_RECOMENDADO > 0 && TEXTO_NA_IMAGEM_RECOMENDADO < 1);
});

test("AVISO: escassez de estoque avisa, não bloqueia", () => {
  const v = conferirPecaNaMeta({ ...limpa(), descricoes: ["Últimas unidades"] });
  assert.equal(v.podePropor, true);
  assert.ok(v.avisos > 0);
});

// ---------------------------------------------------------------------------
// Limites de texto
// ---------------------------------------------------------------------------

test("BLOQUEIO: título acima do limite (a Meta trunca a ressalva legal)", () => {
  const v = conferirPecaNaMeta({ ...limpa(), titulos: ["x".repeat(LIMITE_TITULO + 1)] });
  assert.equal(v.podePropor, false);
  assert.match(v.motivos.join(" "), /trunca/i);
});

test("BLOQUEIO: mais de 5 variações por campo", () => {
  const itens = conferirLimitesDeTexto({
    titulos: Array.from({ length: MAX_VARIACOES_POR_CAMPO + 1 }, (_, i) => `Título ${i}`),
    textos: [],
    descricoes: [],
  });
  const excedente = itens.find((i) => i.chave === "variacoes_titulo");
  assert.ok(excedente);
  assert.equal(excedente.severidade, "bloqueio");
});

test("campo vazio é NÃO MEDIDO — ausência não é aprovação", () => {
  const itens = conferirLimitesDeTexto({ titulos: [], textos: [], descricoes: [] });
  const titulo = itens.find((i) => i.chave === "limite_titulo");
  assert.equal(titulo.estado, "nao_medido");
});

test("todo posicionamento declarado é medido, e nenhum inventa número", () => {
  const itens = conferirLimitesDeTexto(limpa());
  for (const p of POSICIONAMENTOS) {
    assert.ok(itens.some((i) => i.chave === `corte_${p.id}`), `${p.id} não foi medido`);
    // `null` significa "a fonte não afirma" — e não pode virar 0, que reprovaria tudo.
    for (const campo of ["titulo", "texto", "descricao"]) {
      const visivel = p.visivel[campo];
      assert.ok(visivel === null || visivel > 0, `${p.id}.${campo} virou zero`);
    }
  }
});

// ---------------------------------------------------------------------------
// Mídia — o que não dá para medir aqui
// ---------------------------------------------------------------------------

test("peça referenciada por hash é NÃO MEDIDA, jamais aprovada", () => {
  const itens = conferirMidia([{ referencia: "imagem abc123" }]);
  const prop = itens.find((i) => i.chave.startsWith("midia_proporcao_"));
  assert.equal(prop.estado, "nao_medido");
  assert.match(prop.detalhe, /hash/i);
  assert.equal(itens.filter((i) => i.estado === "aprovado").length, 0);
});

test("anúncio sem peça nenhuma: PROPOR pode, ATIVAR não", () => {
  // Esta asserção era `podePropor === false` e foi INVERTIDA em 02/08/2026,
  // não removida — o que ela protegia (a falta de mídia não pode sumir) segue
  // protegido, e agora com os DOIS lados presos. Ela congelava um defeito: com
  // `creative_assets` em 0 linhas no banco, TODA composição chega com
  // `midias: []`, e a tela não conseguia emitir uma única proposta.
  const v = conferirPecaNaMeta({ ...limpa(), midias: [] });
  assert.equal(v.podePropor, true, `propor travado por: ${v.motivos.join(" | ")}`);
  assert.equal(v.podeAtivar, false, "sem peça visual o anúncio não pode ir ao ar");
  assert.equal(v.bloqueiosParaPropor, 0);
  assert.equal(v.bloqueiosParaAtivar, 1);
  assert.match(v.motivosParaAtivar.join(" "), /sem imagem nem v[íi]deo/i);
  // Falta de artefato sem "onde resolver" é lista de queixas, não prontidão.
  const item = v.itens.find((i) => i.chave === "midia_presenca");
  assert.equal(item.impede, "ativar");
  assert.ok(item.ondeResolver?.href, "o item não diz onde a peça é resolvida");
});

test("o que impede PROPOR também impede ATIVAR — nunca só metade", () => {
  // O inverso do teste acima. Sem esta linha, `podeAtivar` poderia contar só os
  // artefatos e uma peça com texto discriminatório apareceria como "pronta para
  // ativar" — o erro invertido, que é o mais caro dos dois.
  const v = conferirPecaNaMeta({ ...limpa(), titulos: ["Está negativado?"] });
  assert.equal(v.podePropor, false);
  assert.equal(v.podeAtivar, false);
  assert.match(v.motivosParaAtivar.join(" "), /negativad/i);
});

test("proporção fora dos formatos aceitos reprova; 4:5 e 9:16 passam", () => {
  assert.equal(proporcaoMaisProxima(1080, 1350).id, "4:5");
  assert.equal(proporcaoMaisProxima(1080, 1920).id, "9:16");
  assert.equal(proporcaoMaisProxima(1080, 1080).id, "1:1");
  assert.equal(proporcaoMaisProxima(1200, 628), null, "16:9 de link não é formato de peça");
  assert.equal(proporcaoMaisProxima(0, 100), null);
});

test("arquivo acima do teto é recusado no ENVIO — bloqueia ativar, não propor", () => {
  // Mesma família da mídia ausente: o que falta é um ARQUIVO trocado, não um
  // texto reescrito. Aprovar isto não põe no ar nada proibido — põe algo que
  // não sobe. A asserção também foi invertida, e ganhou o segundo lado.
  const v = conferirPecaNaMeta({
    ...limpa(),
    midias: [{ referencia: "img", larguraPx: 1080, alturaPx: 1080, tamanhoMb: 45 }],
  });
  assert.equal(v.podePropor, true, v.motivos.join(" | "));
  assert.equal(v.podeAtivar, false);
  assert.match(v.motivosParaAtivar.join(" "), /MB/);
  assert.equal(v.itens.find((i) => i.chave.startsWith("midia_tamanho_")).impede, "ativar");
});

// ---------------------------------------------------------------------------
// Os dois portões — a separação que zerou (e depois destravou) a emissão
// ---------------------------------------------------------------------------

test("todo item declara O QUE impede, e aviso nunca impede nada", () => {
  // A invariante que impede a régua de voltar a ter uma palavra só: `aviso` ⟺
  // `nada`. Um aviso que impedisse algo deixaria de ser aviso; um bloqueio que
  // não impedisse nada seria decoração. Varre a régua inteira, item a item.
  const cenarios = [
    limpa(),
    { ...limpa(), midias: [] },
    { ...limpa(), midias: [{ referencia: "x" }] },
    { ...limpa(), titulos: ["Está negativado?"], categoriasEspeciais: [] },
    { ...limpa(), textos: ["a".repeat(LIMITE_TEXTO + 1)] },
    { titulos: [], textos: [], descricoes: [], targeting: null, categoriasEspeciais: null },
  ];
  for (const cenario of cenarios) {
    for (const item of conferirPecaNaMeta(cenario).itens) {
      assert.ok(["propor", "ativar", "nada"].includes(item.impede), `${item.chave} sem impede`);
      if (item.severidade === "aviso") assert.equal(item.impede, "nada", `${item.chave}: aviso que impede`);
      else assert.notEqual(item.impede, "nada", `${item.chave}: bloqueio que não impede nada`);
    }
  }
});

test("o que impede PROPOR é a PEÇA; o que impede ATIVAR é o ARTEFATO", () => {
  // A régua da divisão, presa por grupo: política, texto e público falam da
  // peça (ninguém "consegue" um texto legal esperando); mídia é artefato.
  const v = conferirPecaNaMeta({ ...limpa(), midias: [] });
  for (const item of v.itens.filter((i) => i.severidade === "bloqueio")) {
    if (item.grupo === "midia") assert.equal(item.impede, "ativar", `${item.chave} deveria impedir ativar`);
    else assert.equal(item.impede, "propor", `${item.chave} deveria impedir propor`);
  }
});

test("artefatos de destino: Página e formulário impedem ATIVAR, e dizem onde resolver", () => {
  const faltando = conferirArtefatosDeDestino({ paginaId: null, formularioId: "" });
  assert.equal(faltando.length, 2);
  for (const item of faltando) {
    assert.equal(item.estado, "reprovado");
    assert.equal(item.impede, "ativar");
    assert.equal(item.ondeResolver.href, "/integrations/meta");
  }
  const ok = conferirArtefatosDeDestino({ paginaId: "111", formularioId: "222" });
  assert.ok(ok.every((i) => i.estado === "aprovado"));
  // Sem criativo no plano não há ONDE ler — e "não li" não é "não tem".
  const semLeitura = conferirArtefatosDeDestino({});
  assert.ok(semLeitura.every((i) => i.estado === "nao_medido"));
  assert.equal(fecharVeredito(semLeitura).bloqueiosParaAtivar, 0);
});

// ---------------------------------------------------------------------------
// Uma régua só — o limite não pode existir em dois lugares
// ---------------------------------------------------------------------------

test("o limite de título é O MESMO objeto na régua e na composição", () => {
  // Se alguém redeclarar o número em campanhas-criativos-composicao.ts, este
  // teste continua verde por coincidência — até os dois divergirem. Por isso o
  // teste seguinte confere o COMPORTAMENTO, não só o valor.
  assert.equal(LIMITE_TITULO_COMPOSICAO, LIMITE_TITULO);
});

test("a prontidão repete o veredito da régua, não emite um segundo", () => {
  const base = {
    objetivo: "gerar_leads",
    empreendimento: null,
    contaId: "",
    contaAlcancavel: null,
    paginaId: null,
    formularioId: null,
    publico: { cidade: "", chaveCidade: null, chaveMedida: false, paisISO2: "BR" },
    verbaDiariaBrl: 80,
    duracaoDias: 14,
    criativo: {
      titulos: ["x".repeat(LIMITE_TITULO + 1)],
      textos: ["ok"],
      descricoes: [],
      cta: "SIGN_UP",
      imageHashes: [],
      videoIds: [],
    },
    origemDoTexto: "humano",
    lastroDaIA: null,
  };
  const item = prontidaoDaPublicacao(base).find((i) => i.chave === "limites_de_texto");
  assert.equal(item.estado, "falta");
  // O detalhe agora VEM da régua — é o mesmo texto, não uma segunda redação.
  const daRegua = conferirLimitesDeTexto(base.criativo).find(
    (i) => i.chave === "limite_titulo" && i.estado === "reprovado",
  );
  assert.ok(daRegua);
  assert.equal(item.detalhe, daRegua.detalhe);
});

test("as fontes citadas são da Meta, não de terceiros disfarçados", () => {
  for (const [nome, fonte] of Object.entries(FONTES)) {
    assert.match(fonte.url, /^https:\/\/(developers\.facebook\.com|transparency\.meta\.com|www\.facebook\.com)/, `${nome} aponta para fora da Meta`);
    assert.ok(fonte.publicador.length > 0);
    assert.ok(fonte.lidoEm.length > 0);
  }
  // As duas que dependem de fonte secundária DIZEM que dependem — é o que
  // impede a régua de bancar como documentado o que ela apenas observou.
  assert.match(FONTES.truncamentoVisivel.publicador, /secund[áa]ria/i);
  assert.match(FONTES.textoNaImagem.publicador, /secund[áa]ria/i);
});
