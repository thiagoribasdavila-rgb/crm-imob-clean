/**
 * PROVA DE QUE AS ASSERÇÕES REAPONTADAS EM 02/08/2026 AINDA REPROVAM.
 *
 * Asserção que ninguém viu falhar não é asserção. Quatro portões
 * (038, 039, 040, 088) tiveram asserções trocadas de `includes` de rótulo por
 * medição de estrutura — e uma medição nova que nunca acendeu vermelho é
 * exatamente o defeito que ela veio consertar, só que mais difícil de achar.
 *
 * O método: LER A FONTE REAL, mutilá-la EM MEMÓRIA de um jeito que representa
 * o defeito, e exigir o vermelho. Em memória de propósito — quebrar o arquivo
 * no disco para ver o portão acender funciona uma vez, e some. Aqui a
 * refutação roda em toda suíte, para sempre, e outros agentes editando a
 * árvore ao mesmo tempo não correm o risco de encontrar o produto quebrado.
 *
 * Cada teste tem dois lados: a fonte real PASSA, a fonte mutilada REPROVA. Só
 * o primeiro lado seria a mesma armadilha de novo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  corposDeElemento,
  corposDeEfeito,
  efeitosQueTocamRede,
  elementoContem,
  itensDeArrayLiteral,
} from "../../scripts/lib/jsx-estrutura.mjs";

const tarefas = readFileSync("app/(crm)/tasks/page.tsx", "utf8");
const agenda = readFileSync("app/(crm)/calendar/page.tsx", "utf8");
const atividades = readFileSync("app/(crm)/activity/page.tsx", "utf8");
const linhaDoTempo = readFileSync("components/crm/acompanhamento-corretor-linha-do-tempo.tsx", "utf8");

/* ── ESCOPO: o ganho é o CORPO do elemento, não o `includes` ──────────────── */

test("elementoContem NÃO se satisfaz com o trecho fora do elemento", () => {
  const fora = `
    export function Tela() {
      const rodape = "remainingSteps.map";
      return (
        <section>
          <p>{rodape}</p>
          <details><summary>Mais</summary><span>nada aqui</span></details>
        </section>
      );
    }`;
  assert.equal(fora.includes("remainingSteps.map"), true, "o texto ESTÁ no arquivo");
  assert.equal(
    elementoContem(fora, "details", "remainingSteps.map"),
    false,
    "e mesmo assim não está dentro do <details> — era exatamente isso que o portão não sabia",
  );
});

test("fase 038: divulgação progressiva reprova quando o <details> some", () => {
  assert.equal(
    elementoContem(tarefas, "details", "<summary", "remainingSteps.length", "remainingSteps.map"),
    true,
    "a fonte real precisa passar",
  );

  /* O defeito: alguém troca o <details> por um <div> e os passos 4-em-diante
     passam a aparecer abertos, sem resumo clicável. A asserção antiga
     (`includes("+{remainingSteps.length} planejadas") && includes("remainingSteps.map")`)
     continuaria VERDE — as duas frases seguem no arquivo. */
  const aberto = tarefas.replace("<details className=\"cc6-hairline px-5 py-2.5\">", "<div>").replace("</details>", "</div>");
  assert.notEqual(aberto, tarefas, "a mutilação precisa ter acontecido");
  assert.equal(
    elementoContem(aberto, "details", "<summary", "remainingSteps.length", "remainingSteps.map"),
    false,
    "sem <details> não há divulgação progressiva — tem de reprovar",
  );
  assert.equal(
    aberto.includes("remainingSteps.map"),
    true,
    "prova de que a asserção ANTIGA teria passado nesta mesma fonte quebrada",
  );
});

/* ── CONTAGEM DE SINAIS: quem manda é o array, não a classe CSS ───────────── */

test("fase 040: os três sinais do pulso reprovam quando viram dois", () => {
  const sinais = itensDeArrayLiteral(atividades, "pulso");
  assert.equal(sinais.length, 3, "a fonte real mostra três sinais");

  const doisSinais = atividades.replace('["Registros no escopo", data?.summary.total],', "");
  assert.notEqual(doisSinais, atividades);
  assert.equal(itensDeArrayLiteral(doisSinais, "pulso").length, 2, "sinal removido tem de aparecer na medição");

  /* E o contrário, que é o lado cego da asserção antiga: a classe CSS aparecer
     3 vezes com a tela mostrando dois sinais. */
  const classeInflada = doisSinais.replace(
    '<p className="cc6-eyebrow" id="activity-pulso-title">',
    '<p className="cc6-metric-value cc6-metric-value cc6-eyebrow" id="activity-pulso-title">',
  );
  assert.equal((classeInflada.match(/cc6-metric-value/g) || []).length, 3);
  assert.equal(
    itensDeArrayLiteral(classeInflada, "pulso").length,
    2,
    "contagem da classe diria 3; o array diz a verdade",
  );
});

test("itensDeArrayLiteral atravessa `as const satisfies` e devolve null quando não existe", () => {
  const fonte = 'const pulso = [["a", 1], ["b", 2]] as const satisfies ReadonlyArray<readonly [string, number]>;';
  assert.equal(itensDeArrayLiteral(fonte, "pulso").length, 2);
  assert.equal(itensDeArrayLiteral(fonte, "inexistente"), null);
  assert.equal(itensDeArrayLiteral("const pulso = montarPulso();", "pulso"), null, "não é array literal");
});

/* ── REDE: o efeito é recortado pela árvore, não por indexOf de uma frase ─── */

test("fases 039 e 040: um efeito novo que busca dados reprova", () => {
  for (const [nome, fonte, assinatura] of [
    ["agenda", agenda, 'supabase.channel("commercial-calendar")'],
    ["atividades", atividades, '.channel("commercial-activity-history")'],
  ]) {
    const comRede = efeitosQueTocamRede(fonte);
    assert.equal(comRede.length, 1, `${nome}: só a assinatura realtime toca rede`);
    assert.ok(comRede[0].includes(assinatura), `${nome}: e é a assinatura nomeada`);

    /* O defeito que as contagens de useState/useEffect NÃO pegavam: um efeito
       novo abrindo uma segunda leitura. Como as contagens comparavam com um
       número no config, bastava alguém atualizar o número. */
    const espiao = fonte.replace(
      "useEffect(",
      'useEffect(() => { void fetch("/api/v1/telemetria"); }, []);\n  useEffect(',
    );
    assert.equal(
      efeitosQueTocamRede(espiao).length,
      2,
      `${nome}: efeito novo com fetch tem de ser visto`,
    );
  }
});

test("corposDeEfeito recorta o efeito mesmo com a pontuação reformatada", () => {
  /* O recorte antigo era `indexOf("}, [router]);")`. Prettier quebrando a
     linha em `}, [\n  router,\n]);` devolvia a string-sentinela e o portão
     reprovava por formatação. */
  const reformatado = agenda.replace("}, [router]);", "}, [\n    router,\n  ]);");
  assert.notEqual(reformatado, agenda);
  const efeito = corposDeEfeito(reformatado).find((c) => c.includes("pedeCriar(lerIntencaoDaJanela())"));
  assert.ok(efeito, "o efeito da intenção continua encontrável depois da reformatação");
  assert.ok(efeito.includes('router.replace("/tasks?create=1")'));
  assert.equal(efeito.includes("fetch("), false);
});

/* ── FASE 088: a linha do tempo mudou de arquivo, e o fallback é relação ──── */

test("fase 088: o cartão da interação carrega o evento governado, o autor e a hora", () => {
  assert.equal(
    elementoContem(linhaDoTempo, "article", "<CommercialContextTimelineEntry"),
    true,
  );
  assert.equal(
    elementoContem(
      linhaDoTempo,
      "article",
      'interacao.authorName || "Equipe Atlas"',
      "dataLegivel(interacao.occurred_at)",
    ),
    true,
  );

  /* Defeito real e já visto neste produto: o carimbo de auditoria sai do
     cartão numa reorganização e ninguém mais sabe QUEM registrou. */
  const semAutor = linhaDoTempo.replace('{interacao.authorName || "Equipe Atlas"} · ', "");
  assert.notEqual(semAutor, linhaDoTempo);
  assert.equal(
    elementoContem(semAutor, "article", 'interacao.authorName || "Equipe Atlas"', "dataLegivel(interacao.occurred_at)"),
    false,
  );
});

test("corposDeElemento conta os elementos, não as aparições da palavra", () => {
  const artigos = corposDeElemento(linhaDoTempo, "article");
  assert.ok(artigos.length >= 2, `esperava vários <article>, achei ${artigos.length}`);
  for (const corpo of artigos) assert.ok(corpo.startsWith("<article"), "o recorte começa no elemento");
  assert.equal(corposDeElemento("<p>article article article</p>", "article").length, 0);
});
