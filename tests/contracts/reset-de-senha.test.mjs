/**
 * Contrato da REDEFINIÇÃO DE SENHA.
 *
 * Relato do dono do produto: "o corretor não consegue resetar a senha, a página
 * abre mas não pede a senha nova".
 *
 * Dois defeitos no mesmo fluxo, e os dois vinham de tratar o servidor como
 * fonte de uma verdade que só existe no navegador.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const pagina = fs.readFileSync(path.join(raiz, "app", "(auth)", "reset-password", "page.tsx"), "utf8");

// Ancorar na REGIÃO, nunca na linha: corpo aninhado e reflow não podem derrubar
// uma guarda cuja propriedade não mudou.
function regiao(fonte, abre, fecha) {
  const inicio = fonte.indexOf(abre);
  assert.ok(inicio >= 0, `região não encontrada: ${abre}`);
  const fim = fonte.indexOf(fecha, inicio + abre.length);
  return fonte.slice(inicio, fim < 0 ? fonte.length : fim);
}

test("a sessão do NAVEGADOR é consultada antes do servidor", () => {
  // A Supabase entrega o token no FRAGMENTO da URL (#access_token=…), que o
  // navegador nunca envia ao servidor. Perguntar ao servidor primeiro é
  // perguntar a quem não pode saber.
  const iNavegador = pagina.indexOf("supabase.auth.getSession()");
  const iServidor = pagina.indexOf('fetch("/api/auth/password-reset"');
  assert.ok(iNavegador > -1 && iNavegador < iServidor,
    "a sessão do navegador vem primeiro");
});

test("a corrida é resolvida por evento, não por conclusão precipitada", () => {
  // A troca do fragmento por sessão é assíncrona. Concluir "falhou" antes dela
  // terminar deixava a tela morta para sempre.
  assert.match(pagina, /onAuthStateChange/);
  assert.match(pagina, /PASSWORD_RECOVERY/);
});

test("existe prazo — a tela não fica 'verificando' para sempre", () => {
  assert.match(pagina, /setTimeout\(async \(\) => \{/);
  assert.match(pagina, /}, 3000\)/);
});

test("navegador diferente do que pediu o reset NÃO é barrado", () => {
  // `atlas-recovery-intent` é cookie do navegador que PEDIU. Quem pede no
  // computador e abre o e-mail no celular não o tem.
  assert.match(pagina, /NAVEGADOR DIFERENTE/);
  assert.match(pagina, /Sessão de recuperação válida basta/);
});

test("a TROCA passa pela sessão do navegador sem depender da autorização da rota", () => {
  // REAPONTADO EM 2026-07-29. A asserção antiga exigia a FRASE de um comentário
  // ("faz o trabalho e perde"). Comentário não é comportamento: reescrever o
  // texto derrubava a guarda sem nada ter mudado no produto, e é o mesmo defeito
  // já documentado em reativacao-consentida.test.mjs — cobrar o NOME, não a
  // propriedade.
  //
  // A propriedade: havendo sessão do navegador, é ela que troca a senha, ANTES
  // de qualquer conversa com a rota. Assim o corretor não digita a senha inteira
  // para perder o trabalho quando a rota não pode autorizar.
  const ramoNavegador = regiao(pagina, "if (sessao.session) {", "} else {");
  const iProvedor = ramoNavegador.indexOf("supabase.auth.updateUser({ password })");
  const iRota = ramoNavegador.indexOf('fetch("/api/auth/password-reset"');
  assert.ok(iProvedor > -1, "o ramo com sessão de navegador precisa trocar a senha pelo provedor");
  assert.ok(iRota > -1, "o ramo com sessão de navegador precisa avisar a rota do servidor");
  assert.ok(iProvedor < iRota, "a troca não pode ficar condicionada à autorização da rota");
});

test("falha da rota não desfaz a senha já trocada, e também não passa em silêncio", () => {
  // REAPONTADO EM 2026-07-29. A asserção antiga cobrava o MECANISMO exato
  // `}).catch(() => {});` — o catch vazio — como se ele FOSSE a propriedade.
  //
  // Medido no projeto de homologação pozbrcsfthnhmnebfoxv, com usuário
  // descartável e duas sessões vivas: a troca pelo caminho do navegador já
  // revoga as OUTRAS sessões (refresh das duas foi de 200 a 400 sem nenhum
  // signOut), mas a sessão de RECUPERAÇÃO sobrevive — GET /auth/v1/user com ela
  // respondeu 200 DEPOIS da troca, e o link segue trocando a senha por ~1 h.
  // Engolir a resposta da rota deixava exatamente isso sem tratamento.
  //
  // A propriedade tem dois lados, e os dois são exigidos:
  //   · a senha já trocada NÃO é desfeita — a tela termina em sucesso FORA dos
  //     dois ramos, aconteça o que acontecer com a rota;
  //   · a falha NÃO é engolida — o catch vazio deixou de ser aceito. O detalhe
  //     fica em tests/contracts/troca-de-senha-nao-e-silenciosa.test.mjs.
  assert.match(pagina, /não desfaz a senha já alterada/);
  const iElse = pagina.indexOf("} else {");
  const iSucesso = pagina.indexOf("setUpdated(true)");
  assert.ok(iElse > -1, "os dois caminhos de troca precisam continuar existindo");
  assert.ok(iSucesso > iElse, "o sucesso da tela precisa ficar fora dos dois ramos, não dentro de um deles");
  assert.doesNotMatch(
    regiao(pagina, "if (sessao.session) {", "} else {"),
    /\}\)\.catch\(\(\) => \{\}\);/,
    "catch vazio devolve a falha silenciosa: troca sem registro e sessão de recuperação viva",
  );
});

test("o caminho antigo continua como recuo", () => {
  // Link que criou sessão só no servidor continua funcionando.
  assert.match(pagina, /} else \{[\s\S]{0,400}fetch\("\/api\/auth\/password-reset"/);
});
