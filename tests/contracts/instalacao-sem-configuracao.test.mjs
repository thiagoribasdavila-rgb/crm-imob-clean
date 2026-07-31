/**
 * Contrato: O PLACEHOLDER DO BUILD NÃO PODE ENVENENAR O BUNDLE EM SILÊNCIO.
 *
 * ── A CAUSA MAIS PROFUNDA DO INCIDENTE DE 2026-07-31 ────────────────────────
 *
 * `getSupabasePublicConfig()` tinha uma escotilha: durante
 * `phase-production-build`, sem as variáveis, devolvia `http://127.0.0.1:54321`
 * em vez de falhar.
 *
 * Como `NEXT_PUBLIC_*` é assada no bundle do NAVEGADOR, esse placeholder não
 * ficou em memória: foi **gravado no JavaScript entregue a cada usuário**. O
 * navegador de quem abria o CRM passava a tentar autenticar contra `127.0.0.1`
 * — a própria máquina da pessoa.
 *
 * Medido em produção: `/login` com HTTP 200, **sem campo de senha**.
 *
 * Dois problemas, dois contratos:
 *   1. o endereço apontava para um Supabase LOCAL LEGÍTIMO — quem tivesse um de
 *      pé veria a aplicação "funcionar" contra o banco errado;
 *   2. nada no produto sabia distinguir "não configurado" de "quebrado".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const semComentarios = (fonte) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * ASSERÇÃO SOBRE COMPORTAMENTO OLHA CÓDIGO, NÃO COMENTÁRIO.
 *
 * A primeira versão deste contrato reprovou o arquivo por conter
 * `127.0.0.1:54321` — que estava no **docblock que narra o incidente**. Pela
 * terceira vez nesta linha de trabalho o instrumento leu a explicação como se
 * fosse a implementação. A lição já está na memória do projeto e eu tropecei
 * nela de novo: quando a asserção é sobre o que o código FAZ, remova os
 * comentários antes de olhar.
 */
const envBruto = readFileSync("utils/supabase/env.ts", "utf8");
const env = semComentarios(envBruto);
const login = readFileSync("app/(auth)/login/page.tsx", "utf8");

test("o placeholder NÃO aponta para um Supabase local que possa existir de verdade", () => {
  // 127.0.0.1:54321 é o endereço padrão do Supabase local. Um desenvolvedor com
  // ele de pé veria a aplicação conectar — no banco errado, silenciosamente.
  assert.doesNotMatch(env, /127\.0\.0\.1:54321/);
  assert.doesNotMatch(env, /localhost:54321/);
});

test("o placeholder usa um TLD que NUNCA resolve (RFC 2606)", () => {
  // `.invalid` é reservado por norma. Falha imediatamente, sempre — em vez de
  // conectar em algo por acidente.
  assert.match(env, /\.invalid/);
  assert.match(env, /SUPABASE_PLACEHOLDER_URL/);
});

test("o build GRITA quando usa o placeholder", () => {
  const bloco = env.slice(env.indexOf("phase-production-build"), env.indexOf("return { url: SUPABASE_PLACEHOLDER_URL"));
  assert.match(bloco, /console\.warn/);
  assert.match(bloco, /NÃO SERVE PARA PRODUÇÃO/);
});

test("existe como PERGUNTAR, em tempo de execução, se o bundle foi assado sem configuração", () => {
  assert.match(env, /export function configuracaoEhPlaceholder/);
  // Precisa funcionar no navegador: sem rede, sem await, sem banco.
  const fn = env.slice(env.indexOf("export function configuracaoEhPlaceholder"));
  assert.doesNotMatch(fn, /await |fetch\(/);
});

test("a tela de login RESPONDE por essa pergunta antes de montar o cliente", () => {
  // Tentar autenticar contra um endereço placeholder produz exatamente a tela
  // quebrada que esta correção elimina. A verificação vem antes.
  assert.match(login, /configuracaoEhPlaceholder\(\)/);
  const posVerificacao = login.indexOf("if (configuracaoEhPlaceholder()) return");
  const posSuspense = login.indexOf("<LoginExperience />");
  assert.ok(posVerificacao > 0 && posVerificacao < posSuspense, "a verificação precisa vir ANTES de montar a experiência de login");
});

test("a mensagem diz que RECONSTRUIR é necessário — reiniciar não resolve", () => {
  // Quem não sabe que o valor é assado no build passa horas dando restart.
  assert.match(login, /construir a aplicação de novo|reiniciar não resolve/i);
  assert.match(login, /nenhum dado foi perdido/i, "a primeira pergunta de quem vê a tela é se perdeu algo");
});

test("a tela não culpa o usuário nem expõe detalhe técnico de infraestrutura", () => {
  const tela = login.slice(login.indexOf("function InstalacaoSemConfiguracao"), login.indexOf("export default function LoginPage"));
  assert.match(tela, /não é uma falha da\s*\n?\s*sua conta|Não é uma falha da/i);
  for (const vazamento of ["SUPABASE_SERVICE_ROLE", "process.env", "127.0.0.1"]) {
    assert.ok(!tela.includes(vazamento), `a tela não pode expor ${vazamento}`);
  }
});
