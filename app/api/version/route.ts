import { NextResponse } from "next/server";
import release from "@/release.json";

export const dynamic = "force-dynamic";

/**
 * QUAL VERSÃO ESTÁ NO AR — e a diferença entre AFIRMAR e PROVAR.
 *
 * ── O DEFEITO QUE ESTA VERSÃO CORRIGE — 31/07/2026 ─────────────────────────
 *
 * A produção respondia:
 *
 *     { "commit": "935fe0e9", "identidadeConfiavel": true }
 *
 * enquanto o pacote implantado era **a3379359**. E a rota afirmava confiança.
 *
 * A causa: `ATLAS_BUILD_COMMIT` é uma **variável que alguém preenche**. O
 * arquivo de importação do hPanel tinha ficado com `935fe0e9` — o commit do
 * momento em que ele foi gerado — e continuou fixando esse valor mesmo depois
 * de um pacote novo subir.
 *
 * E a rota conferia essa variável **contra ela mesma**: formato de hash válido,
 * árvore não suja. **Uma afirmação que só confere a si mesma sempre concorda
 * consigo.**
 *
 * ── A CORREÇÃO: DUAS FONTES INDEPENDENTES ──────────────────────────────────
 *
 *   `artifactCommit` ..... vem de `release.json`, gravado pelo **git** na hora
 *                          de montar o pacote (`export-subst`). Ninguém digita.
 *   `environmentCommit` .. vem de `ATLAS_BUILD_COMMIT`, digitado por gente no
 *                          painel da hospedagem — e **assado no bundle durante o
 *                          build**, não lido em runtime. Trocar a variável e
 *                          reiniciar não muda este campo; é preciso reconstruir.
 *                          Foi exatamente assim que o incidente nasceu: o painel
 *                          tinha `935fe0e9` quando o pacote `a3379359` foi
 *                          construído, e o build assou o valor errado.
 *
 * `identidadeConfiavel` só é `true` quando as duas existem **e concordam**.
 *
 * Duas fontes que discordam expõem a mentira; uma fonte sozinha só pode
 * repeti-la. Foi por isso que o defeito passou: não faltava rigor na
 * verificação — faltava uma **segunda testemunha**.
 *
 * ── O QUE ESTA ROTA NÃO FAZ ────────────────────────────────────────────────
 *
 * Não toca banco, não toca rede, não tem `await`. Se o processo subiu, ela
 * responde — foi a lição do dia em que a prontidão caiu e levou junto a
 * identidade da versão.
 *
 * Não devolve branch, caminho, usuário, máquina nem variável de ambiente. Rota
 * pública de versão é reconhecimento gratuito para quem procura alvo.
 */

/** O marcador que o git substitui. Se sobreviveu, não veio de um pacote. */
const MARCADOR_NAO_SUBSTITUIDO = "$Format";

const limpar = (valor: unknown) => String(valor ?? "").trim();
const ehHash = (valor: string) => /^[0-9a-f]{7,40}$/i.test(valor);

export function GET() {
  // ── Fonte 1: o artefato, carimbado pelo git ────────────────────────────
  const doArtefato = limpar((release as { commit?: string }).commit);
  const artifactCommit = doArtefato.includes(MARCADOR_NAO_SUBSTITUIDO) || !ehHash(doArtefato)
    ? null
    : doArtefato;

  // ── Fonte 2: o ambiente, preenchido por gente ──────────────────────────
  // Lido de `process.env` porque `next.config.ts` o inlina no build.
  const doAmbiente = limpar(process.env.ATLAS_BUILD_COMMIT);
  // Árvore suja é marcada com sufixo pelo `scripts/build.mjs`: o build não
  // corresponde a commit nenhum do repositório.
  const arvoreSuja = doAmbiente.includes("+arvore-suja");
  const environmentCommit = doAmbiente || null;

  // ── A comparação, que é o ponto inteiro desta rota ─────────────────────
  //
  // Compara pelo prefixo porque um lado costuma trazer o hash curto (7-8) e o
  // outro o completo (40). `a3379359` e `a3379359abc…` são o mesmo commit; o
  // que não pode passar é `935fe0e9` contra `a3379359`.
  const semSufixo = doAmbiente.replace("+arvore-suja", "");
  const commitsMatch =
    artifactCommit !== null &&
    semSufixo.length >= 7 &&
    (artifactCommit.startsWith(semSufixo) || semSufixo.startsWith(artifactCommit));

  const identidadeConfiavel = commitsMatch && !arvoreSuja;

  const porqueNaoConfiavel = identidadeConfiavel
    ? null
    : artifactCommit === null
      ? "O pacote não carrega identidade própria: `release.json` não foi carimbado pelo git. Gere o artefato com `git archive` — instalação a partir de cópia de trabalho não é rastreável."
      : !semSufixo
        ? "ATLAS_BUILD_COMMIT não foi definido no ambiente. O artefato diz de onde veio, mas ninguém confirmou qual versão deveria estar no ar."
        : arvoreSuja
          ? "O build saiu de árvore de trabalho suja: não corresponde a nenhum commit do repositório."
          : `DIVERGÊNCIA: o artefato é ${artifactCommit.slice(0, 12)} e o ambiente declara ${semSufixo.slice(0, 12)}. Alguém subiu um pacote sem atualizar ATLAS_BUILD_COMMIT — ou o contrário. Não é possível afirmar qual código está servindo os usuários.`;

  return NextResponse.json(
    {
      application: "atlas-one",
      version: limpar(process.env.npm_package_version) || "3.0.0-rc.2",
      // As duas testemunhas, lado a lado e nomeadas.
      artifactCommit,
      environmentCommit,
      commitsMatch,
      identidadeConfiavel,
      porqueNaoConfiavel,
      // `commit` continua existindo para quem já consome, e passa a valer
      // apenas quando as duas fontes concordam — nunca um palpite entre elas.
      commit: identidadeConfiavel ? artifactCommit : null,
      build: identidadeConfiavel && artifactCommit ? artifactCommit.slice(0, 12) : null,
      builtAt: limpar(process.env.ATLAS_BUILD_TIME) || null,
      archivedAt: (() => {
        const d = limpar((release as { arquivadoEm?: string }).arquivadoEm);
        return d.includes(MARCADOR_NAO_SUBSTITUIDO) ? null : d || null;
      })(),
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
