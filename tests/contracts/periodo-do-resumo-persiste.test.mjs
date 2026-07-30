/**
 * Contrato: O RECORTE ESCOLHIDO VOLTA — E O PADRÃO CONTINUA SENSATO SEM ESCOLHA.
 *
 * ── O DEFEITO QUE ISTO FIXA (medido em 2026-07-29) ──────────────────────────
 *
 * `docs/FINAL_PHASE_7_ROLE_DASHBOARDS.md` prometia, desde a Fase Final 7, que
 * "o resumo operacional alterna entre dia, semana e mês" e que "o período
 * escolhido permanece durante a sessão". Metade era verdade: `/reports` tinha
 * as pastilhas e o recorte era real (`periodData` refaz VGV, forecast,
 * conversão, score médio, funil e fontes). A outra metade nunca existiu —
 * `useState("month")` e nada gravando. Quem olhava "Hoje", abria uma lead e
 * voltava, encontrava "30 dias" outra vez, sem aviso nenhum de que o recorte
 * tinha sumido.
 *
 * O portão `final-dashboards:check` cobrava `DASHBOARD_PERIOD_KEY` de
 * `app/(crm)/dashboard/page.tsx` — arquivo que virou um redirect de 18 linhas
 * quando Início e Command Center se fundiram. Cobrar de uma tela aposentada é
 * como não cobrar: some o vermelho, some a funcionalidade.
 *
 * ── POR QUE ESTE CONTRATO EXECUTA ───────────────────────────────────────────
 *
 * Procurar `DASHBOARD_PERIOD_KEY` no arquivo prova que alguém digitou o nome.
 * Não prova que a escolha volta. As asserções abaixo CHAMAM as funções: a
 * guarda de hidratação é um valor de retorno (`periodoParaGravar` → `null`), e
 * o recorte é uma função pura (`dentroDoPeriodo`), então quebrar qualquer uma
 * das duas muda o resultado e reprova aqui.
 *
 * Os dois lados de toda regra estão provados: o que a guarda BARRA (gravação
 * antes da hidratação, valor fora do vocabulário) e o que ela DEIXA PASSAR
 * (cada um dos quatro recortes válidos, depois de hidratar). Uma guarda que
 * barrasse tudo passaria num teste de vazamento e destruiria o produto — aqui
 * ela reprovaria.
 *
 * Rodar: node --experimental-strip-types --test tests/contracts/periodo-do-resumo-persiste.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const CAMINHO_MODULO = path.join(raiz, "lib", "dashboards", "periodo-do-resumo.ts");
const fonteModulo = fs.readFileSync(CAMINHO_MODULO, "utf8");

const {
  DASHBOARD_PERIOD_KEY,
  PERIODOS_DO_RESUMO,
  PERIODO_PADRAO,
  ehPeriodoDoResumo,
  lerPeriodoSalvo,
  periodoParaGravar,
  diasDoPeriodo,
  dentroDoPeriodo,
} = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonteModulo))}`);

const pagina = fs.readFileSync(path.join(raiz, "app", "(crm)", "reports", "page.tsx"), "utf8");

/**
 * A ARMADILHA DO IMPORT.
 *
 * Uma mutação já sobreviveu neste repositório porque o identificador continuava
 * na linha do `import` depois de o uso ser desligado. Toda asserção de texto
 * abaixo olha o corpo do arquivo SEM o bloco de imports.
 */
const corpoDaPagina = (() => {
  const fim = pagina.indexOf("type Period =");
  assert.ok(fim > 0, "não achei o fim do bloco de imports da página — a varredura perdeu a âncora");
  return pagina.slice(fim);
})();

const DIA_MS = 86_400_000;

// ── O QUE A GUARDA DEIXA PASSAR ────────────────────────────────────────────

test("cada recorte válido salvo volta como ele mesmo", () => {
  assert.ok(PERIODOS_DO_RESUMO.length >= 3, "o vocabulário encolheu abaixo de dia/semana/mês");
  for (const periodo of PERIODOS_DO_RESUMO) {
    assert.equal(
      lerPeriodoSalvo(periodo),
      periodo,
      `${periodo} foi salvo e voltou diferente — a escolha não persiste`,
    );
  }
});

test("dia, semana e mês são os recortes que a Fase Final 7 promete", () => {
  for (const prometido of ["day", "week", "month"]) {
    assert.ok(
      PERIODOS_DO_RESUMO.includes(prometido),
      `o doc promete o recorte ${prometido} e o vocabulário não o tem`,
    );
  }
});

test("depois de hidratar, cada recorte válido é gravado", () => {
  for (const periodo of PERIODOS_DO_RESUMO) {
    assert.equal(
      periodoParaGravar(periodo, true),
      periodo,
      `${periodo} escolhido depois da hidratação não foi gravado — a próxima visita esquece`,
    );
  }
});

// ── O QUE A GUARDA BARRA ───────────────────────────────────────────────────

test("sem escolha salva o padrão continua sensato", () => {
  assert.ok(
    ehPeriodoDoResumo(PERIODO_PADRAO),
    "o padrão não pertence ao vocabulário — a tela abriria num recorte que nada valida",
  );
  for (const nada of [null, undefined, "", "   "]) {
    assert.equal(
      lerPeriodoSalvo(nada),
      PERIODO_PADRAO,
      `ausência de escolha (${JSON.stringify(nada)}) deveria cair no padrão`,
    );
  }
});

test("valor corrompido, inventado ou de outra versão cai no padrão, não recorta às cegas", () => {
  // "semana"/"mes": alguém traduziu o vocabulário. "DAY": trocou a caixa.
  // O JSON: uma versão futura embrulhou o valor. O último: mão no DevTools.
  for (const lixo of ["semana", "mes", "DAY", "quarter", '{"periodo":"week"}', "week;drop"]) {
    assert.equal(
      lerPeriodoSalvo(lixo),
      PERIODO_PADRAO,
      `"${lixo}" passou como recorte — um recorte inválido esvazia a lista sem erro nenhum`,
    );
  }
});

test("nada é gravado antes de a leitura da sessão terminar", () => {
  // ESTE é o defeito clássico do padrão: o efeito de gravação roda na primeira
  // montagem com o padrão ainda no estado e apaga a escolha salva. Sintoma:
  // "não persiste", com todo o código de persistência presente e bonito.
  for (const periodo of PERIODOS_DO_RESUMO) {
    assert.equal(
      periodoParaGravar(periodo, false),
      null,
      `gravou ${periodo} antes de hidratar — isso sobrescreve a escolha do usuário com o padrão`,
    );
  }
});

test("recorte fora do vocabulário nunca chega ao armazenamento", () => {
  for (const lixo of ["semana", "", null, undefined, 7, {}]) {
    assert.equal(
      periodoParaGravar(lixo, true),
      null,
      `${JSON.stringify(lixo)} seria gravado — só adia o problema para a próxima leitura`,
    );
  }
});

// ── A PASTILHA NÃO É DECORAÇÃO: ELA MEXE NOS NÚMEROS ───────────────────────

test("a janela de cada recorte é distinta e crescente", () => {
  assert.equal(diasDoPeriodo("day"), 1);
  assert.equal(diasDoPeriodo("week"), 7);
  assert.equal(diasDoPeriodo("month"), 30);
  assert.equal(diasDoPeriodo("all"), null, "histórico não pode ter janela fechada");
  const fechadas = PERIODOS_DO_RESUMO.map(diasDoPeriodo).filter((dias) => dias !== null);
  assert.equal(
    new Set(fechadas).size,
    fechadas.length,
    "dois recortes com a mesma janela: trocar de pastilha não mudaria número nenhum",
  );
});

test("a mesma linha entra num recorte e sai do outro", () => {
  const agora = Date.parse("2026-07-29T12:00:00.000Z");
  const dezDiasAtras = new Date(agora - 10 * DIA_MS).toISOString();
  assert.equal(dentroDoPeriodo("month", dezDiasAtras, agora), true, "10 dias atrás está dentro de 30");
  assert.equal(dentroDoPeriodo("week", dezDiasAtras, agora), false, "10 dias atrás não está dentro de 7");
  assert.equal(dentroDoPeriodo("day", dezDiasAtras, agora), false, "10 dias atrás não é hoje");
  assert.equal(dentroDoPeriodo("all", dezDiasAtras, agora), true, "histórico não recorta");

  const umaHoraAtras = new Date(agora - 3_600_000).toISOString();
  for (const periodo of PERIODOS_DO_RESUMO) {
    assert.equal(
      dentroDoPeriodo(periodo, umaHoraAtras, agora),
      true,
      `uma hora atrás ficou fora de ${periodo} — o recorte barra quem devia passar`,
    );
  }
});

test("linha sem data fica fora da janela fechada e dentro do histórico", () => {
  const agora = Date.parse("2026-07-29T12:00:00.000Z");
  for (const vazio of [null, undefined, "", "ontem"]) {
    assert.equal(
      dentroDoPeriodo("month", vazio, agora),
      false,
      `data ${JSON.stringify(vazio)} entrou no recorte de 30 dias — inventaria movimento sem lastro`,
    );
    assert.equal(dentroDoPeriodo("all", vazio, agora), true, "histórico não pode esconder a linha");
  }
});

// ── A TELA USA ISTO DE VERDADE ─────────────────────────────────────────────

test("a chave da sessão é versionada e da SESSÃO, como o doc promete", () => {
  assert.match(
    DASHBOARD_PERIOD_KEY,
    /^atlas:.+:v\d+$/,
    "chave sem prefixo e sem versão: um vocabulário futuro não terá como ignorar o valor antigo",
  );
  assert.ok(
    corpoDaPagina.includes("window.sessionStorage.getItem(DASHBOARD_PERIOD_KEY)"),
    "a página não lê o recorte da sessão pela constante",
  );
  assert.ok(
    corpoDaPagina.includes("window.sessionStorage.setItem(DASHBOARD_PERIOD_KEY"),
    "a página não grava o recorte da sessão pela constante",
  );
  // Ancorado na REGIÃO de cada uso da chave, não no arquivo inteiro: proibir a
  // palavra `localStorage` na página toda reprovaria por uma preferência
  // futura que nada tem a ver com o recorte, e guarda que reprova por motivo
  // errado é guarda que alguém afrouxa.
  for (let i = corpoDaPagina.indexOf("DASHBOARD_PERIOD_KEY"); i >= 0; i = corpoDaPagina.indexOf("DASHBOARD_PERIOD_KEY", i + 1)) {
    const vizinhanca = corpoDaPagina.slice(Math.max(0, i - 120), i + 120);
    assert.ok(
      !vizinhanca.includes("localStorage"),
      "o doc promete 'durante a sessão'; localStorage devolveria o recorte de sexta na segunda",
    );
  }
  assert.ok(
    !corpoDaPagina.includes("atlas:dashboard-period"),
    "a chave foi redigitada como literal na página — duas cópias divergem, e a leitura passa a não achar o que a gravação escreveu",
  );
});

test("a gravação da página passa pela guarda, não direto ao armazenamento", () => {
  // Ancorado na REGIÃO do efeito, não numa linha: asserção presa a formatação
  // quebra no primeiro reflow do arquivo.
  const inicio = corpoDaPagina.indexOf("periodoParaGravar(");
  assert.ok(inicio > 0, "a página não chama periodoParaGravar — a guarda de hidratação está fora do caminho");
  const gravacao = corpoDaPagina.indexOf("window.sessionStorage.setItem(DASHBOARD_PERIOD_KEY");
  assert.ok(
    inicio < gravacao,
    "a gravação acontece antes da guarda — o padrão sobrescreveria a escolha salva na montagem",
  );
  const regiao = corpoDaPagina.slice(inicio, gravacao);
  assert.match(
    regiao,
    /if \(!\w+\) return;/,
    "entre a guarda e a gravação não há saída antecipada: o `null` de periodoParaGravar não está sendo respeitado",
  );
});

test("as pastilhas nascem do MESMO vocabulário que valida o recorte salvo", () => {
  assert.ok(
    corpoDaPagina.includes("PERIODOS_DO_RESUMO.map("),
    "as pastilhas não são desenhadas a partir de PERIODOS_DO_RESUMO",
  );
  assert.ok(
    !corpoDaPagina.includes('"day", "week", "month"'),
    "a página reenumera os recortes: duas listas divergem, e a pastilha que a validação recusa vira tela vazia sem erro",
  );
  assert.ok(
    corpoDaPagina.includes("dentroDoPeriodo(period,"),
    "o recorte dos números não passa por dentroDoPeriodo — a pastilha voltaria a ser decoração",
  );
});

test("/dashboard continua sendo só porta de compatibilidade, não uma segunda casa", () => {
  // A casa de decisão é /command-center desde a fusão Início + Command Center.
  // Se alguém reconstruir um painel aqui, passam a existir duas verdades sobre
  // os mesmos números — a classe de defeito que já custou caro nesta base.
  const compat = fs.readFileSync(path.join(raiz, "app", "(crm)", "dashboard", "page.tsx"), "utf8");
  assert.ok(compat.includes('redirect("/command-center")'), "/dashboard deixou de reencaminhar para a casa de decisão");
  assert.ok(!compat.includes("useState"), "/dashboard voltou a ter estado próprio — é uma segunda casa nascendo");
});
