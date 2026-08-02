/**
 * Contrato das TRAVAS DOS WORKERS — nenhum agendado roda sem o segredo.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `app/api/v2/marketing/capi-feedback/process/route.ts` era `export async
 * function POST()` — sem `request`. Sem o objeto da requisição, ele não tinha
 * COMO conferir cabeçalho: qualquer um que alcançasse a URL disparava envio de
 * conversões à Meta para até 200 organizações.
 *
 * Medido em 2026-07-29: dos 12 workers agendados em
 * `config/workers-schedule.json`, era o ÚNICO sem trava. Os outros 11 já
 * exigiam `ATLAS_CRON_SECRET`. Não era um padrão faltando — era um esquecido.
 *
 * ── POR QUE A LISTA VEM DO AGENDAMENTO, E NÃO DAQUI ─────────────────────────
 *
 * A lista de rotas é lida de `config/workers-schedule.json`, o mesmo arquivo que
 * o crontab do deploy usa. Worker novo entra no agendamento e cai neste contrato
 * no mesmo commit — não existe "esqueci de adicionar ao teste". Se a lista
 * vivesse aqui, ela divergiria do agendamento, que é a classe de defeito
 * dominante deste repositório.
 *
 * ── A PARTE SUTIL: FALHA FECHADA ────────────────────────────────────────────
 *
 * `if (!esperado || token !== esperado)` recusa quando o segredo não está
 * configurado. Escrito na ordem inversa — `if (esperado && token !== esperado)`
 * — a rota fica ABERTA exatamente onde o segredo falta: todo ambiente novo,
 * incluindo o primeiro dia de uma homologação. É um erro de uma tecla, passa em
 * revisão de código, e a suíte não notaria. Por isso este contrato olha a ORDEM,
 * não só a presença.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const agenda = JSON.parse(fs.readFileSync(path.join(raiz, "config", "workers-schedule.json"), "utf8"));

/** Resolve a rota do agendamento para o arquivo que a implementa. */
function arquivoDaRota(rota) {
  return path.join(raiz, "app", rota, "route.ts");
}

test("o agendamento tem workers para conferir", () => {
  // Sem este piso, apagar as entradas do JSON deixaria todos os testes abaixo
  // verdes por vacuidade — o pior modo de falha de um teste de varredura.
  assert.ok(
    Array.isArray(agenda.workers) && agenda.workers.length >= 11,
    `o agendamento declara ${agenda.workers?.length ?? 0} workers; eram 12 em 2026-07-29. ` +
      "Se caiu, ou um worker saiu do ar sem aviso ou a varredura deixou de achar a lista.",
  );
});

test("todo worker agendado existe como rota", () => {
  for (const w of agenda.workers) {
    assert.ok(
      fs.existsSync(arquivoDaRota(w.rota)),
      `"${w.nome}" está no crontab do deploy apontando para ${w.rota}, e a rota não existe. ` +
        "O cron chamaria uma URL morta a cada ciclo, em silêncio.",
    );
  }
});

test("todo worker agendado recebe a requisição — sem ela não há como conferir nada", () => {
  for (const w of agenda.workers) {
    const src = fs.readFileSync(arquivoDaRota(w.rota), "utf8");
    assert.match(
      src,
      /export async function POST\(\s*request/,
      `"${w.nome}" declara POST sem o parâmetro da requisição. Foi exatamente o estado do ` +
        "capi-feedback: sem `request`, o cabeçalho do segredo é inalcançável e a rota fica aberta.",
    );
  }
});

test("todo worker agendado exige ATLAS_CRON_SECRET e recusa com 401", () => {
  for (const w of agenda.workers) {
    const src = fs.readFileSync(arquivoDaRota(w.rota), "utf8");
    assert.match(src, /ATLAS_CRON_SECRET/,
      `"${w.nome}" não lê o segredo operacional: qualquer um que alcance a URL dispara o worker`);
    assert.match(src, /status:\s*401/,
      `"${w.nome}" não devolve 401 — a recusa precisa dizer "não autorizado", não "erro do servidor"`);
  }
});

test("e a recusa FALHA FECHADA quando o segredo não está configurado", () => {
  /**
   * DUAS formas corretas existem no repositório, e a primeira versão desta
   * asserção só conhecia uma — acusou o `outbox` de furo que ele não tem:
   *
   *   RECUSA negativa .... if (!esperado || token !== esperado) → 401
   *   PERMISSÃO positiva . return Boolean(secret && token && token === secret)
   *
   * As duas fecham quando o segredo falta. A que ABRE é a recusa escrita na
   * ordem inversa: `if (segredo && token !== segredo)` — verdadeira só quando o
   * segredo EXISTE, então onde ele falta a rota passa direto.
   *
   * Por isso a asserção tem duas metades, e a que protege de verdade é a
   * NEGATIVA: exigir uma forma segura permitiria uma terceira forma nova; proibir
   * a insegura pega qualquer reescrita que caia nela. Afrouxar isto para "tem a
   * string ATLAS_CRON_SECRET" perderia a propriedade inteira — e era a saída
   * fácil quando o falso positivo apareceu.
   */
  /**
   * As formas seguras aceitam VARIÁVEL ou EXPRESSÃO DE MEMBRO como primeiro
   * operando, porque o repositório usa as duas: `secret && ...` e
   * `process.env.ATLAS_CRON_SECRET && ...`. Generalizar pelo SIGNIFICADO — "o
   * primeiro operando é o segredo, logo segredo falso ⇒ não autorizado" — em vez
   * de somar uma variante de regex por rota. Cada variante somada às cegas é uma
   * chance de aceitar, sem perceber, uma forma que não fecha.
   */
  const EXPR = String.raw`[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*`;
  const PERIGOSA = new RegExp(String.raw`if\s*\(\s*${EXPR}\s*&&\s*[\w$.?[\]]+\s*!==`);
  const SEGURAS = [
    new RegExp(String.raw`if\s*\(\s*!\s*${EXPR}\s*\|\|`), // recusa negativa
    new RegExp(String.raw`Boolean\(\s*${EXPR}\s*&&`), // permissão positiva
    new RegExp(String.raw`return\s+${EXPR}\s*&&`), // idem, sem Boolean()
  ];

  for (const w of agenda.workers) {
    const bruto = fs.readFileSync(arquivoDaRota(w.rota), "utf8");
    /**
     * ── OS COMENTÁRIOS SAEM ANTES DA BUSCA (02/08/2026) ──────────────────────
     *
     * A janela ancorava na PRIMEIRA ocorrência do nome do segredo no arquivo
     * inteiro — inclusive dentro de comentário. Quando `meta-daily-report`
     * ganhou um cabeçalho que explica o comportamento do 401 e cita o nome da
     * variável, a âncora passou a cair 35 linhas ACIMA da função, a janela
     * cobriu a prosa e a asserção acusou furo numa rota que fecha corretamente.
     *
     * É a mesma correção que `scripts/check-dono-da-lead.mjs` já tinha: o
     * instrumento mede CÓDIGO, não texto sobre o código. Um portão que reprova
     * quem documenta ensina a não documentar.
     *
     * Isto NÃO afrouxa: as duas asserções continuam idênticas, a negativa
     * continua sendo a que protege, e a busca segue partindo da primeira
     * ocorrência — só que agora a primeira ocorrência é necessariamente código.
     */
    const src = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const i = src.indexOf("ATLAS_CRON_SECRET");
    assert.notEqual(
      i,
      -1,
      `"${w.nome}" não menciona ATLAS_CRON_SECRET em CÓDIGO (só em comentário, ou em lugar nenhum). ` +
        "Uma ponte máquina-a-máquina sem o segredo no código é uma rota aberta.",
    );
    // A janela começa ANTES da ocorrência. A primeira versão começava nela, e o
    // `Boolean(process.env.` do `nightly-sales` — que vem à esquerda — caía fora:
    // o instrumento cortava a evidência e acusava furo onde não havia.
    const janela = src.slice(Math.max(0, i - 240), i + 700);

    assert.doesNotMatch(
      janela,
      PERIGOSA,
      `"${w.nome}" recusa apenas QUANDO o segredo existe. Onde ATLAS_CRON_SECRET não está ` +
        "configurado — todo ambiente novo, incluindo o primeiro dia de uma homologação — a rota " +
        "fica ABERTA. Inverta para `if (!segredo || token !== segredo)`.",
    );
    assert.ok(
      SEGURAS.some((forma) => forma.test(janela)),
      `"${w.nome}" não mostra nenhuma das formas que fecham quando o segredo falta. ` +
        "Use `if (!segredo || token !== segredo)` ou `Boolean(segredo && token && token === segredo)`.",
    );
  }
});

test("worker de efeito EXTERNO é declarado no agendamento, para o deploy poder subir desligado", () => {
  /**
   * Dois dos agendados agem para FORA: `outbox` manda mensagem de verdade e
   * `capi-feedback` envia eventos à Meta. Subir uma homologação restaurada de
   * dump com o `outbox` ligado dispararia mensagem antiga para cliente real.
   *
   * O agendamento precisa carregar o PORQUÊ de cada worker — é o que permite a
   * quem faz o deploy decidir o que sobe desligado sem ler o código de 12 rotas.
   */
  for (const w of agenda.workers) {
    assert.ok(
      typeof w.porque === "string" && w.porque.length > 20,
      `"${w.nome}" não explica por que existe nem em que cadência. Sem isso, quem instala o ` +
        "crontab não tem como saber se ligá-lo gasta dinheiro ou manda mensagem.",
    );
  }
  const nomes = agenda.workers.map((w) => w.nome);
  for (const externo of ["outbox", "capi-feedback"]) {
    assert.ok(nomes.includes(externo),
      `"${externo}" tem efeito externo e saiu do agendamento — se ele roda por outro caminho, ` +
        "ninguém que leia este arquivo vai saber que precisa subi-lo desligado");
  }
});

/**
 * ── AS PONTES DO WHATSAPP, PELA MESMA RÉGUA ──────────────────────────────────
 *
 * `check-api-security.mjs` também vigia isto, e de propósito: ele roda no
 * `release:prebuild-check`, este contrato roda na rede de MUTAÇÕES. São redes
 * diferentes — medido em 2026-07-29, `scripts/mutacoes.mjs` só executa
 * `npm run test:contracts`, então uma quebra que apenas o guarda pegasse
 * SOBREVIVERIA à mutação e passaria por ponto cego.
 *
 * Para as duas não divergirem (a classe de defeito dominante daqui), a LISTA de
 * rotas vem do mesmo `config/api-security-contract.json` nos dois lugares. Só a
 * asserção é escrita duas vezes, e é isso que se aceita.
 */
const contratoApi = JSON.parse(
  fs.readFileSync(path.join(raiz, "config", "api-security-contract.json"), "utf8"),
);

test("as pontes máquina-a-máquina exigem o segredo compartilhado e recusam com 401", () => {
  const pontes = contratoApi.bridgeRoutes ?? [];
  assert.ok(pontes.length >= 3,
    `o contrato declara ${pontes.length} pontes; eram 3 em 2026-07-29. Lista vazia deixaria este teste verde por vacuidade.`);

  for (const rota of pontes) {
    const src = fs.readFileSync(path.join(raiz, rota), "utf8");
    assert.match(src, /x-atlas-bridge-secret/,
      `${rota}: ponte sem o cabeçalho do segredo — o processo do bridge chama esta URL, e sem trava qualquer um na rede também`);
    assert.match(src, /segredoConfere|segredoDaPonte/, `${rota}: ponte que não confere o segredo que recebe`);
    assert.match(src, /status:\s*401/, `${rota}: a recusa precisa dizer "não autorizado", não "erro do servidor"`);
  }
});

test("e as pontes NÃO aceitam sessão de usuário — é o que impede o conserto errado", () => {
  /**
   * Esta é a metade que faz o reapontamento ser mais forte que a régua antiga.
   * O guarda cobrava das pontes evidência de SESSÃO e ficava vermelho com as
   * três, que já tinham o segredo. O conserto tentador seria adicionar
   * `requireAccessContext` para "provar identidade" — e isso abriria a ponte
   * para QUALQUER corretor logado perguntar "este telefone é uma lead?" e
   * injetar mensagem de entrada.
   */
  for (const rota of contratoApi.bridgeRoutes ?? []) {
    const src = fs.readFileSync(path.join(raiz, rota), "utf8");
    for (const sessao of contratoApi.authenticationEvidence) {
      assert.ok(
        !src.includes(sessao),
        `${rota}: aceita \`${sessao}\` — sessão de usuário numa ponte máquina-a-máquina deixa ` +
          "qualquer corretor logado usar o canal do bridge",
      );
    }
  }
});
