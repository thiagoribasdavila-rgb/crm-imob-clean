/**
 * Contrato: O RBAC NÃO PODE AFIRMAR O QUE NÃO CUMPRE.
 *
 * ── O defeito que isto fixa ─────────────────────────────────────────────────
 *
 * `/api/v1/rbac/me` devolvia `backendEnforced: true` junto de uma lista de
 * permissões. A afirmação era falsa: `requirePermission` — a função que
 * aplicaria a matriz `ROLE_PERMISSIONS` — tem ZERO chamadas no produto.
 *
 * Ninguém está desprotegido: cada rota tem sua própria checagem escrita à mão,
 * e elas funcionam (medido com token de corretor real: /api/v1/team,
 * /api/v1/analytics/director-daily e /api/v2/approvals devolvem 403).
 *
 * O problema é a DIVERGÊNCIA. A matriz nega exportação ao corretor enquanto a
 * rota permite. Quem confiasse em `backendEnforced: true` para esconder um
 * botão esconderia o botão errado — ou mostraria um que não funciona.
 *
 * ── O que este contrato NÃO exige ───────────────────────────────────────────
 *
 * Não exige que a matriz passe a ser aplicada. Isso é mudança de controle de
 * acesso e merece decisão própria. Exige apenas que o produto não AFIRME uma
 * garantia que não entrega — enquanto `requirePermission` não for chamada, o
 * campo tem que dizer isso.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const rota = ler("app", "api", "v1", "rbac", "me", "route.ts");
/**
 * Comentário quebra linha, e cada linha começa com `*`. A evidência não pode
 * depender de onde quebrou nem do marcador — tira os dois antes de juntar.
 */
const corrido = rota.replace(/^\s*\*\s?/gm, " ").replace(/\s+/g, " ");
/** Sem comentários: o cabeçalho da rota CITA a mentira antiga para explicá-la. */
const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Quantas vezes `requirePermission` é de fato CHAMADA (não definida). */
function chamadasDeRequirePermission() {
  const achados = [];
  (function varrer(dir) {
    for (const nome of fs.readdirSync(dir)) {
      const completo = path.join(dir, nome);
      if (fs.statSync(completo).isDirectory()) { varrer(completo); continue; }
      if (!/\.tsx?$/.test(nome)) continue;
      const fonte = fs.readFileSync(completo, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
      for (const m of fonte.matchAll(/\brequirePermission\s*\(/g)) {
        // A própria definição não conta como uso.
        const antes = fonte.slice(Math.max(0, m.index - 40), m.index);
        if (/function\s*$|const\s+\w+\s*=\s*$|export\s+$/.test(antes)) continue;
        achados.push(path.relative(raiz, completo));
      }
    }
  })(path.join(raiz, "app"));
  return achados;
}

test("o campo não afirma aplicação que não existe", () => {
  const chamadas = chamadasDeRequirePermission();
  if (chamadas.length === 0) {
    assert.match(codigo, /backendEnforced: false/,
      "requirePermission não é chamada em lugar nenhum — o campo não pode dizer true");
    assert.match(codigo, /matrizAplicada: false/);
  } else {
    // Se um dia passar a ser aplicada, este teste cobra o campo de volta.
    assert.match(codigo, /backendEnforced: true/,
      `requirePermission é chamada em ${chamadas.length} lugar(es) — o campo pode voltar a dizer true`);
  }
});

test("a resposta explica PARA QUE a lista de permissões serve", () => {
  // Sem isso, quem integra usa a lista para autorizar — e autoriza errado,
  // porque ela diverge do que a rota faz.
  assert.match(codigo, /useAPermissionsPara/);
  assert.match(corrido, /orientar a interface/);
  assert.match(corrido, /pode divergir/, "a divergência precisa estar dita, não subentendida");
});

test("a evidência da divergência está registrada junto da regra", () => {
  // Sem o exemplo concreto, o próximo a ler acha que é purismo e volta o `true`.
  assert.match(corrido, /ZERO chamadas/i);
  assert.match(corrido, /403/, "a prova de que as rotas protegem, medida com login real");
  assert.match(corrido, /corretor` N[ÃA]O recebe `leads\.export`/i,
    "o caso concreto, medido, em que as duas listas discordam");
  assert.match(corrido, /portugu[êe]s[\s\S]{0,120}?ingl[êe]s/i,
    "e o descompasso de vocabulário entre a matriz e os perfis");
});

test("o campo antigo continua existindo, marcado como obsoleto", () => {
  // Removê-lo quebraria quem já integra. Mentir de novo seria pior. Fica, com
  // o valor certo e a marca de obsoleto apontando para o substituto.
  assert.match(corrido, /@deprecated/);
  assert.match(codigo, /backendEnforced:/, "o campo não pode sumir sem aviso");
  assert.match(codigo, /enforcement: \{/, "e precisa haver um substituto nomeado");
});
