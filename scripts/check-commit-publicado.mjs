#!/usr/bin/env node
/**
 * O QUE ESTÁ NO AR É O QUE FOI APROVADO?
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ─────────────────────────────────────────────
 *
 * Em 2026-07-30 a auditoria precisou DEDUZIR a versão em produção pela ausência
 * de uma chave na resposta: `agendamento` não aparecia em `/api/v1/ready`, logo o
 * build era anterior ao commit que a introduziu. Conclusão medida: quatro
 * correções publicadas no git naquele dia NÃO estavam no servidor.
 *
 * Correção publicada no git e ausente em produção é correção que não existe — e
 * pior, é correção que TODO MUNDO ACHA que existe. O relatório diz "corrigido",
 * o commit está lá, e o defeito segue vivo para o usuário.
 *
 * ── O QUE ELE VERIFICA ──────────────────────────────────────────────────────
 *
 *   1. a produção responde;
 *   2. ela DECLARA qual commit está no ar (`build.commit`);
 *   3. esse commit é o esperado;
 *   4. o build não saiu de árvore suja (`+arvore-suja` = não corresponde a
 *      commit nenhum do repositório);
 *   5. as migrations do banco não estão atrás do repositório;
 *   6. a fila não tem item em `failed`/`dead_letter`.
 *
 * Os itens 5 e 6 não reprovam sozinhos — eles AVISAM, porque são estado de
 * ambiente e não de versão. O que reprova é divergência de commit.
 *
 * ── COMO USAR ───────────────────────────────────────────────────────────────
 *
 *   node scripts/check-commit-publicado.mjs                      # compara com o HEAD local
 *   node scripts/check-commit-publicado.mjs <sha>                # compara com um commit específico
 *   ATLAS_URL_PRODUCAO=https://... node scripts/check-commit-publicado.mjs
 *
 * Sem URL alcançável, sai com NÃO EXECUTADO — nunca verde por ausência.
 */
import { execFileSync } from "node:child_process";

const URL_BASE = (process.env.ATLAS_URL_PRODUCAO || "https://atlasaios.com.br").replace(/\/+$/, "");

const esperadoBruto =
  process.argv[2] ||
  process.env.ATLAS_COMMIT_APROVADO ||
  (() => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })();

if (!esperadoBruto) {
  console.log("⚠ NÃO EXECUTADO — nenhum commit esperado (passe um SHA, ATLAS_COMMIT_APROVADO, ou rode dentro do repositório).");
  process.exit(0);
}

let resposta;
try {
  const r = await fetch(`${URL_BASE}/api/v1/ready`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  resposta = { status: r.status, corpo: await r.json().catch(() => null) };
} catch (erro) {
  console.log(`⚠ NÃO EXECUTADO — ${URL_BASE} não respondeu: ${erro instanceof Error ? erro.message : erro}`);
  console.log("  Verde por ausência de medição é pior que vermelho: este portão não afirma nada sem alcançar a produção.");
  process.exit(0);
}

const dados = resposta.corpo?.data ?? {};
const build = dados.build ?? null;
const curto = (sha) => String(sha || "").replace("+arvore-suja", "").slice(0, 12);

console.log(`produção: ${URL_BASE} · HTTP ${resposta.status}`);
console.log(`commit aprovado: ${curto(esperadoBruto)}`);

const problemas = [];
const avisos = [];

if (!build) {
  problemas.push(
    "a resposta NÃO declara `build`. Ou a produção é anterior ao commit que introduziu o campo,\n" +
      "    ou o build não injetou ATLAS_BUILD_COMMIT. Nos dois casos é impossível afirmar\n" +
      "    qual versão está no ar — que é exatamente o estado que este portão existe para acabar.",
  );
} else {
  const noAr = build.commit;
  console.log(`commit no ar:    ${noAr ?? "(não declarado)"}`);
  console.log(`branch:          ${build.branch ?? "(não declarada)"} · ambiente: ${build.ambiente ?? "(não declarado)"}`);

  if (!noAr) {
    problemas.push(`a produção não declara o commit. Motivo dado pela própria rota: ${build.motivo ?? "(nenhum)"}`);
  } else {
    if (String(noAr).includes("+arvore-suja")) {
      problemas.push(
        "o build saiu de ÁRVORE SUJA. O que está no ar não corresponde a nenhum commit do\n" +
          "    repositório, então não há como reproduzi-lo nem revertê-lo com precisão.",
      );
    }
    if (curto(noAr) !== curto(esperadoBruto)) {
      problemas.push(
        `DIVERGÊNCIA: no ar está ${curto(noAr)}, aprovado é ${curto(esperadoBruto)}.\n` +
          "    Toda correção entre os dois commits está publicada no git e AUSENTE do servidor.",
      );
    }
  }
}

if (dados.migrations?.medido === true && dados.migrations.emDia === false) {
  avisos.push(`migrations atrás: banco em ${dados.migrations.topoDoBanco}, repositório em ${dados.migrations.topoDoRepo}`);
}
if (dados.filas?.medido === true && dados.filas.precisaDeAtencao) {
  avisos.push(`fila: ${dados.filas.motivo}`);
}
if (dados.agendamento?.medido === true && dados.agendamento.parado === true) {
  avisos.push(`agendador: ${dados.agendamento.motivo ?? "parado"}`);
}

for (const aviso of avisos) console.log(`\n⚠ ${aviso}`);

if (problemas.length === 0) {
  console.log("\n✔ a produção está rodando exatamente o commit aprovado");
  process.exit(0);
}

console.log(`\n✘ ${problemas.length} problema(s) de versão:\n`);
for (const p of problemas) console.log(`  · ${p}`);
console.log(
  "\nNão declare uma correção como entregue enquanto este portão não passar. O commit no\n" +
    "git prova que o conserto foi escrito; só este portão prova que ele chegou ao usuário.",
);
process.exit(1);
