import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * QUAL VERSÃO ESTÁ NO AR — a pergunta que a produção não conseguiu responder.
 *
 * ── Por que esta rota existe, se `/api/v1/ready` já traz `build` ────────────
 *
 * Porque `/api/v1/ready` consulta o banco, e em 31/07/2026 a produção subiu sem
 * as variáveis do Supabase: a prontidão passou a responder `banco_fora` e a
 * identidade da versão foi junto. Ficamos sem saber **o que** estava no ar
 * justamente no momento em que isso mais importava.
 *
 * Esta rota não toca em banco, não toca em rede e não depende de integração
 * nenhuma. Ela responde a partir de constantes assadas no build. Se o processo
 * subiu, ela responde — e é isso que uma rota de versão precisa garantir.
 *
 * ── O que ela NUNCA devolve ────────────────────────────────────────────────
 *
 * Branch, caminho local, usuário, nome de máquina, variável de ambiente, token.
 * Uma rota pública de versão é reconhecimento gratuito para quem procura alvo:
 * ela diz o suficiente para o operador confirmar o deploy e nada além disso.
 *
 * ── Sem `unknown` silencioso ───────────────────────────────────────────────
 *
 * Quando `ATLAS_BUILD_COMMIT` não foi injetado, o campo vem `null` e
 * `identidadeConfiavel: false`, com o motivo escrito. `"unknown"` seria uma
 * string plausível ocupando o lugar de uma ausência — e é exatamente assim que
 * um deploy não rastreável passa despercebido.
 */
export function GET() {
  // Lidos de `process.env` porque `next.config.ts` os inlina no build (bloco
  // `env`). Em runtime puro eles não existiriam — foi o defeito que fez
  // `ATLAS_BUILD_MIGRATIONS` morrer entre o build e a rota, em 30/07.
  const commit = (process.env.ATLAS_BUILD_COMMIT || "").trim();
  const builtAt = (process.env.ATLAS_BUILD_TIME || "").trim();
  const version = (process.env.npm_package_version || "3.0.0-rc.2").trim();

  // Árvore suja é marcada com sufixo pelo `scripts/build.mjs`. Um build assim
  // não corresponde a commit nenhum do repositório, e afirmar que corresponde
  // seria pior que não declarar.
  const arvoreSuja = commit.includes("+arvore-suja");
  const confiavel = commit.length >= 7 && !arvoreSuja;

  return NextResponse.json(
    {
      application: "atlas-one",
      version,
      commit: commit || null,
      build: commit ? commit.slice(0, 12) : null,
      builtAt: builtAt || null,
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      identidadeConfiavel: confiavel,
      porqueNaoConfiavel: confiavel
        ? null
        : arvoreSuja
          ? "O build saiu de árvore de trabalho suja: não corresponde a nenhum commit do repositório."
          : "ATLAS_BUILD_COMMIT não foi injetado no build. Exporte-o antes de `npm run build` — sem ele é impossível afirmar qual versão está no ar.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
