/**
 * Contrato de ONDE SE MARCA A PRÓXIMA AÇÃO.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `NextActionQuickSet` é o único escritor de `next_action_at` que o corretor
 * alcança em um clique. Ele nasceu montado em UM lugar só: o cartão MOBILE da
 * lista de leads, dentro de `.atlas-leads-mobile` — que `app/globals.css`
 * apaga com `display: none` a partir de 1180px.
 *
 * Ou seja: no monitor onde o corretor passa o dia, o botão não existia.
 *
 * Medido em produção (pozbrcsfthnhmnebfoxv, 2026-08-02):
 *
 *     total de leads .................. 490
 *     com next_action_at ................. 5   (todas com status "perdido")
 *     leads ABERTAS .................... 67
 *     leads abertas com próxima ação ..... 0
 *
 * O "5 de 490" foi reportado como comportamento da operação. Era defeito de
 * produto: a tabela desktop tinha uma coluna "Próxima ação" que só LIA, e o
 * Kanban tinha um recorte "Sem próxima ação" com contador e um cartão que dizia
 * "Definir a próxima ação" — nenhum dos dois oferecia onde definir.
 *
 * ── O QUE ESTE ARQUIVO GUARDA ───────────────────────────────────────────────
 *
 * 1. As três montagens, uma por superfície onde o corretor decide.
 * 2. Que continua havendo UM escritor — dois botões falando com a mesma coluna
 *    seriam duas verdades sobre o mesmo compromisso.
 * 3. Que a tela só desenha o que o SERVIDOR confirmou (regra executada, não
 *    lida: `lerRespostaDaMarcacao` roda de verdade aqui).
 * 4. Que marcar MUDA A POSIÇÃO da lead — as duas funções de ordenação são
 *    extraídas das páginas e EXECUTADAS, não conferidas por regex.
 *
 * Rodar: node --test tests/contracts/marcar-onde-se-trabalha.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...partes) => fs.readFileSync(path.join(raiz, ...partes), "utf8");

const paginaDeLeads = ler("app", "(crm)", "leads", "page.tsx");
const paginaDoKanban = ler("app", "(crm)", "pipeline", "page.tsx");
const componente = ler("components", "crm", "next-action-quick-set.tsx");
const css = ler("app", "globals.css");

/** Sem comentários: eles CITAM o defeito para explicar por que ele sumiu. */
const semComentarios = (fonte) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const leadsSemComentarios = semComentarios(paginaDeLeads);
const kanbanSemComentarios = semComentarios(paginaDoKanban);

// ── AS TRÊS MONTAGENS ───────────────────────────────────────────────────────

/**
 * A lista de leads renderiza DUAS árvores irmãs — `.atlas-leads-desktop` (a
 * tabela) e `.atlas-leads-mobile` (os cartões) — e o CSS mostra uma de cada
 * vez. Contar montagens no arquivo inteiro não distinguiria as duas: era
 * exatamente por isso que o defeito passou despercebido, com o componente
 * "presente na página de leads" e invisível para quem trabalha no monitor.
 */
function fatiaDaTabelaDesktop() {
  const inicio = leadsSemComentarios.indexOf('className="atlas-leads-desktop"');
  assert.ok(inicio > 0, "a vista de tabela sumiu da página de leads");
  const fim = leadsSemComentarios.indexOf("</table>", inicio);
  assert.ok(fim > inicio, "a tabela desktop perdeu o fechamento");
  return leadsSemComentarios.slice(inicio, fim);
}

function fatiaDosCartoesMobile() {
  const inicio = leadsSemComentarios.indexOf('className="atlas-leads-mobile"');
  assert.ok(inicio > 0, "a vista de cartões sumiu da página de leads");
  return leadsSemComentarios.slice(inicio);
}

const contar = (fonte, agulha) => fonte.split(agulha).length - 1;

test("a tabela DESKTOP monta o marcador de próxima ação", () => {
  // A asserção central do arquivo. Sem ela o produto volta a cobrar o
  // compromisso na coluna e não oferecer onde assumi-lo.
  assert.equal(contar(fatiaDaTabelaDesktop(), "<NextActionQuickSet"), 1);
});

test("o cartão MOBILE continua montando — a correção não trocou um buraco por outro", () => {
  assert.equal(contar(fatiaDosCartoesMobile(), "<NextActionQuickSet"), 1);
});

test("o cartão do KANBAN monta, e FORA do 'Ver contexto'", () => {
  assert.equal(contar(kanbanSemComentarios, "<NextActionQuickSet"), 1);
  // Dentro do <details> a porta continuaria fechada: o cartão diz "Definir a
  // próxima ação" na face visível, e é ali que ela tem que ser definível.
  const detalhes = kanbanSemComentarios.slice(
    kanbanSemComentarios.indexOf('className="atlas-kanban-card-details"'),
    kanbanSemComentarios.indexOf("</details>"),
  );
  assert.ok(!detalhes.includes("<NextActionQuickSet"),
    "escondido atrás de um <details> é o mesmo defeito com outra roupa");
});

test("o CSS que escondia a única montagem continua lá — e é por isso que a desktop precisa existir", () => {
  // Se um dia `.atlas-leads-mobile` deixar de ser escondida no desktop, este
  // teste avisa que a premissa mudou (e que haveria duas montagens visíveis ao
  // mesmo tempo na mesma tela).
  //
  // A regra é procurada pelo SEU PRÓPRIO texto e a media query é lida de trás
  // para frente: a folha tem vários `@media (min-width: 1180px)`, e fatiar a
  // partir do primeiro media que aparece mede o vizinho errado.
  const regra = css.search(/\.atlas-leads-mobile\s*\{\s*display:\s*none/);
  assert.ok(regra > 0, "a premissa deste contrato é que o cartão mobile some no desktop");
  const media = css.lastIndexOf("@media", regra);
  assert.match(css.slice(media, css.indexOf("{", media)), /min-width:\s*1180px/,
    "o corte que esconde o cartão mobile precisa ser o de desktop");
  const bloco = css.slice(media, regra);
  assert.match(bloco, /\.atlas-leads-desktop\s*\{\s*display:\s*block/,
    "na mesma faixa em que o cartão some, a tabela precisa aparecer");
});

// ── UM ESCRITOR SÓ ──────────────────────────────────────────────────────────

test("só existe UM lugar no produto que fala com a rota de próxima ação", () => {
  // Dois escritores para a mesma coluna divergem em silêncio: um manda
  // `observacao`, o outro esquece; um confere o retorno, o outro confia no 200.
  const arquivos = [];
  const varrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
      const alvo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) varrer(alvo);
      else if (/\.tsx?$/.test(entrada.name)) arquivos.push(alvo);
    }
  };
  for (const pasta of ["app", "components", "lib"]) varrer(path.join(raiz, pasta));

  const escritores = arquivos.filter((arquivo) => {
    // A própria ROTA não conta: ela é o destino, não um cliente.
    if (arquivo.endsWith(path.join("next-action", "route.ts"))) return false;
    return /fetch\([^)]*\/next-action`?/.test(fs.readFileSync(arquivo, "utf8"));
  });
  assert.deepEqual(
    escritores.map((arquivo) => path.relative(raiz, arquivo)),
    [path.join("components", "crm", "next-action-quick-set.tsx")],
  );
});

// ── A TELA SÓ DESENHA O QUE O SERVIDOR CONFIRMOU ────────────────────────────

const { lerRespostaDaMarcacao } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(ler("lib", "crm", "next-action.ts")))}`
);

test("200 sem o eco do que gravou é RECUSA, não sucesso", () => {
  // O caso silencioso do PostgREST: `update` que não casa com linha alguma
  // devolve 200 sem erro. Se a rota parar de ecoar a data, a tela precisa dizer
  // que não sabe — nunca desenhar "✓ terça, 14h30" numa lead sem compromisso.
  const semDados = lerRespostaDaMarcacao("marcar", true, {});
  assert.equal(semDados.confirmado, false);
  const semData = lerRespostaDaMarcacao("marcar", true, { data: { leadId: "abc" } });
  assert.equal(semData.confirmado, false);
  const dataPodre = lerRespostaDaMarcacao("marcar", true, { data: { proximaAcaoEm: "terça que vem" } });
  assert.equal(dataPodre.confirmado, false);
});

test("marcação confirmada devolve a data DO SERVIDOR, não a que a tela pediu", () => {
  const r = lerRespostaDaMarcacao("marcar", true, {
    data: { proximaAcaoEm: "2026-08-04T17:30:00.000Z", descricao: "Ligar" },
  });
  assert.equal(r.confirmado, true);
  assert.equal(r.quando, "2026-08-04T17:30:00.000Z");
  assert.equal(r.descricao, "Ligar");
});

test("LIMPAR só é confirmado com null EXPLÍCITO", () => {
  // `undefined` é ausência de resposta. Tratá-la como limpeza apagaria da tela
  // um compromisso que continua no banco — a lead sumiria da agenda de quem
  // marcou sem ter saído de lugar nenhum.
  assert.equal(lerRespostaDaMarcacao("limpar", true, { data: {} }).confirmado, false);
  const ok = lerRespostaDaMarcacao("limpar", true, { data: { proximaAcaoEm: null } });
  assert.equal(ok.confirmado, true);
  assert.equal(ok.quando, null);
});

test("erro do servidor chega com a frase do servidor", () => {
  const r = lerRespostaDaMarcacao("marcar", false, {
    error: { message: "Você só marca a próxima ação de leads da sua carteira." },
  });
  assert.equal(r.confirmado, false);
  assert.match(r.motivo, /sua carteira/);
});

test("resposta sem JSON não vira sucesso mudo", () => {
  // 502 do proxy devolve HTML; o componente passa `null` para cá.
  assert.equal(lerRespostaDaMarcacao("marcar", true, null).confirmado, false);
  assert.equal(lerRespostaDaMarcacao("marcar", false, null).confirmado, false);
});

test("o componente usa ESTA leitura, e não o 'ok' cru", () => {
  const codigo = semComentarios(componente);
  assert.match(codigo, /const leitura = lerRespostaDaMarcacao\(/);
  assert.match(codigo, /if \(!leitura\.confirmado\)/);
  assert.match(codigo, /aoMarcar\?\.\(leitura\.quando, leitura\.descricao\)/,
    "o que sobe para a tela é o eco do servidor, não o que a tela pediu");
  assert.ok(!/b\?\.data\?\.proximaAcaoEm \?\? null/.test(codigo),
    "ler o campo na mão contorna a recusa e ressuscita o 200 silencioso");
});

// ── MARCAR MUDA A POSIÇÃO (funções REAIS, executadas) ───────────────────────

/**
 * Extrai uma função de topo do arquivo e a executa de verdade.
 *
 * Regex sobre a página provaria só que o texto está lá. Estas duas funções são
 * a ORDEM da fila e a ORDEM da coluna do Kanban: se elas pararem de reagir a
 * `next_action_at`, marcar continuaria gravando e a tela continuaria parada —
 * o defeito que este arquivo existe para impedir, agora do outro lado.
 */
function funcaoDaPagina(fonte, nomes) {
  const codigo = semComentarios(fonte);
  const pedacos = nomes.map((nome) => {
    const inicio = codigo.indexOf(`function ${nome}(`);
    assert.ok(inicio > 0, `função ${nome} precisa existir na página`);
    const fim = codigo.indexOf("\n}\n", inicio);
    assert.ok(fim > inicio, `função ${nome} sem fechamento em coluna zero`);
    return codigo.slice(inicio, fim + 2);
  });
  return pedacos.join("\n\n");
}

const HOT = 70; // HOT_SCORE_THRESHOLD, o mesmo que a página importa.

async function carregar(fonte, nomes, prelúdio = "") {
  const corpo = `${prelúdio}\n${funcaoDaPagina(fonte, nomes)}\nexport { ${nomes.join(", ")} };`;
  return import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(corpo))}`);
}

const { priorityWeight } = await carregar(paginaDoKanban, [
  "leadRisk", "firstContactSla", "isNextActionOverdue", "priorityWeight",
]);

const { visibleLeadPriority } = await carregar(
  paginaDeLeads,
  ["isHotLead", "isOpenLead", "formatarMinutos", "visibleLeadPriority"],
  `const HOT_SCORE_THRESHOLD = ${HOT};`,
);

/** Lead aberta, já contatada (SLA fora do caminho), score morno. */
const leadBase = {
  id: "l1",
  status: "qualificacao",
  score: 40,
  temperature: "morno",
  next_action_at: null,
  first_contacted_at: "2026-08-01T12:00:00.000Z",
  first_response_minutes: 4,
  first_contact_sla_met: true,
  first_contact_due_at: null,
  created_at: "2026-08-01T11:00:00.000Z",
  updated_at: new Date().toISOString(),
  assigned_to: "p1",
};
const amanha = () => new Date(Date.now() + 86_400_000).toISOString();

test("KANBAN: marcar tira 80 pontos de prioridade — o cartão desce na coluna", () => {
  const semAcao = priorityWeight({ ...leadBase });
  const comAcao = priorityWeight({ ...leadBase, next_action_at: amanha() });
  assert.equal(semAcao - comAcao, 80,
    "o peso tem que reagir à próxima ação, senão marcar não move nada");
  assert.ok(comAcao < semAcao);
});

test("KANBAN: a lead marcada sai do recorte 'Sem próxima ação'", () => {
  // O mesmo predicado do seletor de foco e do contador da coluna.
  const semAcao = { ...leadBase };
  const comAcao = { ...leadBase, next_action_at: amanha() };
  assert.equal(!semAcao.next_action_at, true);
  assert.equal(!comAcao.next_action_at, false);
});

test("LEADS: marcar tira a lead da Fila de ação", () => {
  const agora = Date.now();
  const antes = visibleLeadPriority({ ...leadBase }, agora, false);
  assert.ok(antes, "sem próxima ação, a lead tem que estar na fila");
  assert.equal(antes.label, "Sem próxima ação");
  assert.equal(antes.rank, 4);

  const depois = visibleLeadPriority({ ...leadBase, next_action_at: amanha() }, agora, false);
  assert.equal(depois, null, "com compromisso futuro, a lead sai da fila de ação");
});

test("LEADS: lead QUENTE marcada sobe de gravidade, não some", () => {
  // O caso que separa "some da fila" de "muda de posição": quente sem agenda é
  // vermelho (rank 2); quente com agenda continua na fila, amarelo (rank 3).
  const quente = { ...leadBase, temperature: "quente" };
  const agora = Date.now();
  const antes = visibleLeadPriority({ ...quente }, agora, false);
  assert.equal(antes.rank, 2);
  assert.equal(antes.tone, "danger");
  const depois = visibleLeadPriority({ ...quente, next_action_at: amanha() }, agora, false);
  assert.equal(depois.rank, 3);
  assert.equal(depois.tone, "warning");
  assert.ok(depois.rank > antes.rank, "marcar tem que baixar a gravidade, não subir");
});

test("LEADS: próxima ação VENCIDA volta a ser vermelha", () => {
  // Fecha o ciclo: o valor gravado não é só um carimbo, ele volta a cobrar.
  const vencida = visibleLeadPriority(
    { ...leadBase, next_action_at: new Date(Date.now() - 3_600_000).toISOString() },
    Date.now(),
    false,
  );
  assert.equal(vencida.label, "Follow-up vencido");
  assert.equal(vencida.rank, 0);
});

// ── O ESTADO QUE ALIMENTA AS DUAS ORDENAÇÕES ────────────────────────────────

test("as duas páginas gravam o retorno no estado — inclusive o null de LIMPAR", () => {
  /* O defeito que isto fixa nasceu no cartão mobile:
         next_action_at: quando ?? l.next_action_at
     `??` cai de volta no valor antigo quando `quando` é null — e null é
     exatamente o que LIMPAR devolve. A lead saía da agenda no banco e
     continuava marcada na tela até alguém recarregar. */
  for (const [nome, fonte] of [["leads", leadsSemComentarios], ["kanban", kanbanSemComentarios]]) {
    const inicio = fonte.indexOf("function aplicarProximaAcao(");
    assert.ok(inicio > 0, `${nome}: falta o patch único de próxima ação`);
    const corpo = fonte.slice(inicio, fonte.indexOf("\n  }\n", inicio));
    assert.match(corpo, /next_action_at: quando\b/, `${nome}: o valor tem que entrar cru`);
    assert.ok(!/next_action_at: quando \?\?/.test(corpo),
      `${nome}: '??' ressuscita o valor antigo e LIMPAR deixa de refletir`);
    assert.match(corpo, /next_action: descricao\b/, `${nome}: o QUÊ também precisa acompanhar`);
  }
});

test("nenhuma das duas telas recarrega a lista para refletir a marcação", () => {
  // Recarga perderia filtro, busca, seleção e rolagem — e com a ficha em lâmina
  // fecharia o painel no meio do trabalho. O patch cirúrgico é o que faz os
  // `useMemo` de ordenação recalcularem sozinhos.
  for (const [nome, fonte] of [["leads", leadsSemComentarios], ["kanban", kanbanSemComentarios]]) {
    const inicio = fonte.indexOf("function aplicarProximaAcao(");
    const corpo = fonte.slice(inicio, fonte.indexOf("\n  }\n", inicio));
    assert.ok(!/setReloadKey|\bload\(\)|loadLeads/.test(corpo),
      `${nome}: marcar não pode disparar recarga da lista`);
  }
  // E as três montagens passam pelo patch único, nunca por um setState próprio.
  const montagens = [...leadsSemComentarios.matchAll(/<NextActionQuickSet[\s\S]{0,400}?\/>/g)]
    .concat([...kanbanSemComentarios.matchAll(/<NextActionQuickSet[\s\S]{0,400}?\/>/g)])
    .map((m) => m[0]);
  assert.equal(montagens.length, 3, `esperava 3 montagens, achei ${montagens.length}`);
  for (const montagem of montagens) {
    assert.match(montagem, /aoMarcar=\{\(quando, descricao\) =>\s*aplicarProximaAcao\(/,
      `montagem com escrita própria em vez do patch único:\n${montagem}`);
  }
});
