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

test("a TROCA também passa pela sessão do navegador", () => {
  // Liberar a tela e barrar o envio seria pior que barrar antes: o corretor
  // digita a senha inteira e perde o trabalho.
  assert.match(pagina, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(pagina, /o corretor\s*\n?\s*\/\/ faz o trabalho e perde|faz o trabalho e perde/);
});

test("falha ao limpar o cookie não desfaz a senha já trocada", () => {
  assert.match(pagina, /não desfaz a senha já alterada/);
  assert.match(pagina, /\}\)\.catch\(\(\) => \{\}\);/);
});

test("o caminho antigo continua como recuo", () => {
  // Link que criou sessão só no servidor continua funcionando.
  assert.match(pagina, /} else \{[\s\S]{0,400}fetch\("\/api\/auth\/password-reset"/);
});
