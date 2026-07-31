/**
 * Contrato: O BUILD SE RECUSA A PRODUZIR UM ARTEFATO QUE NÃO PODE FUNCIONAR.
 *
 * ── O INCIDENTE QUE ORIGINOU ISTO — 2026-07-31 ──────────────────────────────
 *
 * Um deploy subiu sem `NEXT_PUBLIC_SUPABASE_URL`. O build passou. O pacote foi
 * gerado. O processo iniciou. O domínio respondeu HTTP 200.
 *
 * E o CRM ficou fora do ar para todos os usuários:
 *
 *   /api/v1/auth/me ..... HTTP 500
 *   /api/v1/crm/leads ... HTTP 500
 *   /login .............. 200, SEM CAMPO DE SENHA
 *
 * ── POR QUE NENHUMA OUTRA GUARDA PEGARIA ───────────────────────────────────
 *
 * `NEXT_PUBLIC_*` é assada no bundle do navegador DURANTE O BUILD. Faltando ali,
 * o cliente recebe `undefined` e a tela de login não tem para onde autenticar.
 * Não há erro de compilação, não há erro de start: há uma aplicação que sobe e
 * não serve.
 *
 * E reiniciar não conserta — o valor já foi assado. Corrigir o `.env` e dar
 * `restart` deixa o bundle quebrado no lugar. **É preciso construir de novo.**
 *
 * Um artefato assim é um objeto cuja única função é enganar quem o instala.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const build = readFileSync("scripts/build.mjs", "utf8");

const rodar = (env, tetoMs = 25_000) =>
  spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
    timeout: tetoMs,
    // Ambiente MÍNIMO: sem herdar nada da máquina de quem roda o teste. Herdar
    // faria o contrato passar aqui e falhar no CI, que é o oposto do objetivo.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });

test("SEM as variáveis do bundle, o build RECUSA — este é o caso do incidente", () => {
  const r = rodar({});
  const saida = (r.stdout || "") + (r.stderr || "");
  assert.match(saida, /BUILD RECUSADO/);
  assert.match(saida, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.equal(r.status, 1, "recusar sem exit code diferente de zero é só um aviso que o CI ignora");
});

test("a recusa EXPLICA que reiniciar não resolve", () => {
  // Quem não sabe que o valor é assado no build passa horas dando restart.
  const r = rodar({});
  const saida = (r.stdout || "") + (r.stderr || "");
  assert.match(saida, /assada|ASSADAS/i);
  assert.match(saida, /npm run build/, "a mensagem precisa dar o caminho de saída");
});

test("a escotilha é DECLARADA e grita — guarda sem saída é desligada de vez", () => {
  // Teto curto de propósito: com a escotilha o script SEGUE para o `next build`,
  // que leva minutos. O aviso é impresso nos primeiros milissegundos, então
  // 6 s bastam — e o processo é morto em seguida. Sem isto, este único teste
  // acrescentaria 25 s a toda execução da suíte.
  const r = rodar({ ATLAS_BUILD_SEM_AMBIENTE: "1" }, 6_000);
  const saida = (r.stdout || "") + (r.stderr || "");
  assert.match(saida, /SEM AMBIENTE/);
  assert.match(saida, /NÃO SERVE PARA PRODUÇÃO/);
  assert.doesNotMatch(saida, /BUILD RECUSADO/, "com a escotilha, avisa em vez de recusar");
});

test("a lista cobre as duas variáveis que o navegador precisa, e aceita os dois nomes da chave pública", () => {
  assert.match(build, /NEXT_PUBLIC_SUPABASE_URL/);
  // O Supabase renomeou `anon` para `publishable` e o produto aceita as duas.
  // Exigir só uma reprovaria ambiente correto.
  assert.match(build, /NEXT_PUBLIC_SUPABASE_ANON_KEY\|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});

test("a guarda roda DEPOIS da procedência e ANTES do next build", () => {
  const proc = build.indexOf("descobrirProcedencia();\nexigirAmbienteDeBuild();");
  assert.ok(proc > 0, "a ordem precisa ser: procedência, guarda, e só então o build");
});

test("a guarda NÃO imprime valor de variável nenhuma", () => {
  const bloco = build.slice(build.indexOf("function exigirAmbienteDeBuild"), build.indexOf("descobrirProcedencia();\nexigirAmbienteDeBuild"));
  // Só o NOME do que falta pode viajar para o terminal e para o log de CI.
  assert.doesNotMatch(bloco, /\$\{process\.env\[/);
  assert.doesNotMatch(bloco, /console\.(log|error|warn)\([^)]*process\.env\./);
});
