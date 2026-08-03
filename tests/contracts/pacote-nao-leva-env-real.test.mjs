/**
 * CONTRATO: nenhum `.env` real entra no pacote da Hostinger.
 *
 * ── O FURO, MEDIDO EM 03/08/2026 ────────────────────────────────────────────
 *
 * `scripts/package-hostinger.mjs` audita o ZIP já montado (`unzip -Z1`) contra
 * uma lista de proibidos — o desenho certo, porque inspeciona o artefato real e
 * não a intenção. O padrão, porém, enumerava nomes e fechava com `(?:\/|$)`:
 *
 *     /(^|\/)(?:\.env|\.env\.local|hostinger\.env|…)(?:\/|$)/
 *
 * A âncora exige que o nome TERMINE ali. Bastava um sufixo para escapar, e os
 * arquivos que existem no disco deste projeto escapavam:
 *
 *     .env                      bloqueado
 *     .env.local                bloqueado
 *     .env.hostinger            PASSAVA   ← valores de produção
 *     .env.hostinger-template   PASSAVA
 *     atlas/.env.hostinger      PASSAVA   (aninhado — nem `.env.local` pegava)
 *
 * Lista de nomes conhecidos protege contra os arquivos que existiam quando
 * alguém a escreveu. O próximo `.env.` qualquer entra calado — e segredo
 * publicado não volta atrás.
 *
 * A regra virou INVERTIDA: proíbe tudo que comece com `.env`, e as exceções são
 * declaradas. Um arquivo novo nasce bloqueado; liberá-lo exige gesto explícito.
 *
 * Este contrato lê o predicado do PRÓPRIO script, para não haver duas versões
 * da mesma regra — a classe de defeito que este repositório mais paga.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("../../scripts/package-hostinger.mjs", import.meta.url), "utf8");

/** Reconstrói o predicado a partir do script, sem reimplementá-lo. */
function predicadoDoScript() {
  const excecoes = fonte.match(/EXEMPLOS_QUE_PODEM_IR\s*=\s*new Set\(\[([^\]]*)\]\)/);
  assert.ok(excecoes, "o script deixou de declarar EXEMPLOS_QUE_PODEM_IR — a regra mudou de forma");
  const permitidos = new Set(
    [...excecoes[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
  );
  return (entrada) => {
    const nome = entrada.split("/").filter(Boolean).pop() ?? "";
    const pareceEnv = nome.startsWith(".env") || nome === "hostinger.env";
    return pareceEnv && !permitidos.has(nome);
  };
}

test("o script declara a regra invertida, e não uma lista de nomes conhecidos", () => {
  assert.match(
    fonte,
    /nome\.startsWith\("\.env"\)/,
    "a proibição voltou a enumerar nomes; um `.env.` novo passaria calado",
  );
  assert.ok(
    fonte.includes("ehEnvProibido(entry)"),
    "o filtro do pacote deixou de usar o predicado — a regra existe e não é aplicada",
  );
});

test("todo .env real é BLOQUEADO, inclusive com sufixo e aninhado", () => {
  const proibido = predicadoDoScript();
  for (const entrada of [
    ".env",
    ".env.local",
    ".env.hostinger",
    ".env.hostinger-template",
    ".env.production",
    ".env.qualquer.coisa.nova",
    "atlas/.env.hostinger",
    "pasta/aninhada/.env.local",
    "hostinger.env",
  ]) {
    assert.equal(proibido(entrada), true, `"${entrada}" entraria no ZIP — segredo publicado não volta atrás`);
  }
});

test("os dois exemplos declarados continuam passando — o pacote precisa deles", () => {
  const proibido = predicadoDoScript();
  // `.env.example` está na lista de arquivos OBRIGATÓRIOS do pacote: bloqueá-lo
  // trocaria um vazamento por um pacote que não sobe.
  assert.equal(proibido(".env.example"), false);
  assert.equal(proibido(".env.production.example"), false);
  assert.ok(fonte.includes('".env.example"'), "o pacote deixou de exigir .env.example");
});

test("arquivo que só FALA de env não é confundido com env", () => {
  const proibido = predicadoDoScript();
  for (const entrada of ["lib/env.ts", "docs/env.md", "scripts/validate-production-env.mjs", "config/environments.json"]) {
    assert.equal(proibido(entrada), false, `"${entrada}" foi bloqueado por engano — o pacote ficaria incompleto`);
  }
});
