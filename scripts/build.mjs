import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";
import { createRouteQuarantine } from "./route-quarantine.mjs";

const root = process.cwd();

/**
 * ── A PROCEDÊNCIA DO BUILD ──────────────────────────────────────────────────
 *
 * Em 2026-07-30 foi preciso DEDUZIR qual commit estava em produção pela ausência
 * de uma chave na resposta de `/api/v1/ready`: `agendamento` não aparecia, logo o
 * build era anterior ao commit que a introduziu. Arqueologia só funciona
 * enquanto alguém lembra qual commit acrescentou o quê.
 *
 * A pergunta "a produção está rodando o código que eu auditei?" tem de ter
 * resposta direta — dela dependem todas as outras. Correção publicada no git e
 * ausente no servidor é correção que não existe.
 *
 * Estas três variáveis são gravadas no build e devolvidas por `/api/v1/ready`.
 * Quando o `git` não está disponível (build a partir de tarball, por exemplo),
 * elas ficam AUSENTES em vez de receber um valor inventado — e a rota declara o
 * motivo. "Não declarado" é informação diferente de "commit X".
 *
 * Nada aqui é segredo: SHA e nome de branch são públicos por natureza.
 */
function descobrirProcedencia() {
  const gitOu = (args) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    const valor = r.status === 0 ? String(r.stdout || "").trim() : "";
    return valor || null;
  };
  /**
   * O TOPO DAS MIGRATIONS DO REPOSITÓRIO.
   *
   * Sozinho não diz nada; o valor está na COMPARAÇÃO com o que o banco reporta
   * (`public.estado_das_migrations()`). Medido em 2026-07-31: 218 aplicadas no
   * banco contra 173 arquivos no repositório — o banco tem coisa que o repo não
   * reproduz, e é essa divergência que a prontidão passa a publicar em vez de
   * deixar para alguém descobrir num deploy.
   */
  let topoDeMigration = null;
  try {
    const dir = resolve(root, "supabase/migrations");
    if (existsSync(dir)) {
      // Compara por NOME, nunca por versão. O banco grava `version` como o
      // carimbo de QUANDO aplicou, não o prefixo do arquivo: medido em
      // 2026-07-31, o arquivo 20260731020000_estado_das_migrations_para_prontidao
      // virou a linha 20260731013305 no banco. Comparar números daria falso
      // vermelho PERMANENTE — e portão que grita sempre ensina a ser ignorado.
      topoDeMigration = readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.replace(/^\d+_/, "").replace(/\.sql$/, ""))
        .sort()
        .join(",");
    }
  } catch {
    topoDeMigration = null; // ausência declarada; a rota diz "não medido"
  }

  /**
   * ── O COMMIT VIAJA COM O CÓDIGO, NÃO COM O SERVIDOR ────────────────────────
   *
   * MEDIDO na produção em 03/08/2026, logo após uma implantação real: o
   * `deployId` mudou (`d-20260803022458`), a lista de migrations passou de 183
   * para 190 — provando que o código NOVO estava no ar — e o `build.commit`
   * continuava dizendo `935fe0e9`, o commit da véspera.
   *
   * A cadeia que produz a mentira:
   *
   *   1. o pacote não leva `.git` (correto: histórico não vai para produção);
   *   2. então `git rev-parse HEAD` falha no servidor e `gitOu` devolve null;
   *   3. e sobra `process.env.ATLAS_BUILD_COMMIT`, que no painel da hospedagem
   *      foi definido UMA vez, no deploy anterior, e nunca mais mudou.
   *
   * Variável de ambiente é ajustada por uma pessoa e esquecida; ela descreve o
   * dia em que foi escrita, não o código que está rodando. O
   * `HOSTINGER_PACKAGE.json` é escrito pelo empacotador no instante em que o
   * ZIP nasce e VIAJA DENTRO dele — se o arquivo está aqui, ele é a única
   * fonte que não pode estar defasada em relação ao código ao lado.
   *
   * Por isso o manifesto VENCE a variável, e não o contrário. E quando os dois
   * discordam, isso é dito em voz alta: a divergência é o sintoma de um
   * ambiente com valor velho, e calar sobre ela devolveria o defeito.
   *
   * Consequência prática: sem isto, o portão que compara "o que está no ar" com
   * "o que deveria estar" comparava um carimbo fóssil — ficava verde num deploy
   * que não aconteceu e vermelho num que aconteceu.
   */
  let commitDoManifesto = null;
  try {
    const manifesto = resolve(root, "HOSTINGER_PACKAGE.json");
    if (existsSync(manifesto)) {
      const lido = JSON.parse(readFileSync(manifesto, "utf8"))?.commit;
      if (typeof lido === "string" && /^[0-9a-f]{7,40}$/.test(lido)) commitDoManifesto = lido;
    }
  } catch {
    commitDoManifesto = null; // manifesto ilegível não inventa commit
  }

  const commitDoAmbiente = process.env.ATLAS_BUILD_COMMIT || null;
  if (commitDoManifesto && commitDoAmbiente && !commitDoManifesto.startsWith(commitDoAmbiente) && !commitDoAmbiente.startsWith(commitDoManifesto)) {
    console.warn(
      `ATLAS build: ATLAS_BUILD_COMMIT do ambiente (${commitDoAmbiente}) NÃO bate com o manifesto do pacote (${commitDoManifesto}). ` +
        `Usando o do manifesto — ele viaja com o código. Limpe a variável do painel: ela descreve um deploy antigo.`,
    );
  }

  const procedencia = {
    ATLAS_BUILD_COMMIT: commitDoManifesto || commitDoAmbiente || gitOu(["rev-parse", "HEAD"]),
    ATLAS_BUILD_BRANCH: process.env.ATLAS_BUILD_BRANCH || gitOu(["rev-parse", "--abbrev-ref", "HEAD"]),
    ATLAS_BUILD_TIME: process.env.ATLAS_BUILD_TIME || new Date().toISOString(),
    ATLAS_BUILD_MIGRATIONS: process.env.ATLAS_BUILD_MIGRATIONS || topoDeMigration,
    /**
     * Identificador do DEPLOY, não do commit. Dois builds do mesmo commit são
     * artefatos diferentes — se um deles subiu com `.env` diferente ou num
     * momento diferente, "o commit é o mesmo" não basta para explicar uma
     * divergência de comportamento. O id é derivado do horário do build, que já é
     * único por artefato, sem inventar aleatoriedade que quebraria o resume.
     */
    ATLAS_BUILD_DEPLOY_ID:
      process.env.ATLAS_BUILD_DEPLOY_ID ||
      `d-${(process.env.ATLAS_BUILD_TIME || new Date().toISOString()).replace(/[-:.TZ]/g, "").slice(0, 14)}`,
  };
  // Árvore suja significa que o que está no ar não corresponde a NENHUM commit —
  // e é exatamente essa a situação que faz a pergunta "qual versão está no ar?"
  // não ter resposta. O build não é bloqueado; a resposta passa a dizer a verdade.
  const sujo = gitOu(["status", "--porcelain"]);
  if (sujo) {
    procedencia.ATLAS_BUILD_COMMIT = `${procedencia.ATLAS_BUILD_COMMIT ?? "sem-git"}+arvore-suja`;
    console.warn(
      `ATLAS build: árvore de trabalho com ${sujo.split("\n").length} alteração(ões) não commitada(s).\n` +
        "  O commit publicado em /api/v1/ready sai marcado como `+arvore-suja`:\n" +
        "  o que está no ar não corresponde a nenhum commit do repositório.",
    );
  }
  for (const [chave, valor] of Object.entries(procedencia)) {
    if (valor) process.env[chave] = valor;
  }
  console.log(
    `ATLAS build: commit ${procedencia.ATLAS_BUILD_COMMIT ?? "(não declarado)"} · ` +
      `branch ${procedencia.ATLAS_BUILD_BRANCH ?? "(não declarada)"}`,
  );
  return procedencia;
}

/**
 * ── O BUILD SE RECUSA A PRODUZIR UM ARTEFATO QUE NÃO PODE FUNCIONAR ─────────
 *
 * ESTA FUNÇÃO EXISTE POR CAUSA DE UM INCIDENTE REAL, em 2026-07-31.
 *
 * Um deploy subiu sem `NEXT_PUBLIC_SUPABASE_URL`. O build passou, o pacote foi
 * gerado, o processo iniciou, o domínio respondeu HTTP 200 — e o CRM ficou fora
 * do ar para todos os usuários:
 *
 *   /api/v1/auth/me ................... HTTP 500
 *   /api/v1/crm/leads ................. HTTP 500
 *   /login ............................ 200, SEM CAMPO DE SENHA
 *
 * ── POR QUE A FALHA FOI SILENCIOSA ─────────────────────────────────────────
 *
 * Variáveis `NEXT_PUBLIC_*` são **assadas no bundle do navegador durante o
 * build**. Faltando no build, o cliente recebe `undefined` no lugar do endereço
 * do Supabase — e a tela de login não tem para onde autenticar. Não há erro no
 * build, não há erro no start: há uma aplicação que sobe e não serve.
 *
 * Pior: reiniciar não conserta. Corrigir o `.env` e dar `restart` deixa o bundle
 * quebrado no lugar, porque o valor já foi assado. **É preciso construir de
 * novo** — e quem não sabe disso passa horas reiniciando.
 *
 * ── A CORREÇÃO: FALHAR NO BUILD, NÃO EM PRODUÇÃO ───────────────────────────
 *
 * Um artefato sem estas variáveis é, por construção, um artefato inútil. Gerá-lo
 * é produzir um objeto cuja única função é enganar quem o instala.
 *
 * O build passa a RECUSAR. Custa segundos ao operador e evita horas de sistema
 * fora do ar.
 *
 * ── A SAÍDA, QUE É DECLARADA E NÃO ESCONDIDA ───────────────────────────────
 *
 * `ATLAS_BUILD_SEM_AMBIENTE=1` permite construir sem as variáveis — para
 * verificar compilação em CI, por exemplo. Ela IMPRIME um aviso gritante, e o
 * artefato resultante não deve ir para produção. A saída existe porque uma
 * guarda sem escotilha é desligada de vez na primeira vez que atrapalha.
 */
const VARIAVEIS_QUE_O_BUNDLE_ASSA = [
  ["NEXT_PUBLIC_SUPABASE_URL", "sem ela o navegador não sabe onde fica o Supabase, e a tela de login não autentica"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sem ela o cliente não tem credencial pública para falar com o banco"],
];

function exigirAmbienteDeBuild() {
  const faltando = [];
  for (const [nomes, porque] of VARIAVEIS_QUE_O_BUNDLE_ASSA) {
    const alternativas = nomes.split("|");
    const achou = alternativas.some((n) => String(process.env[n] || "").trim().length > 0);
    if (!achou) faltando.push([nomes.replace(/\|/g, " ou "), porque]);
  }
  if (faltando.length === 0) return;

  if (process.env.ATLAS_BUILD_SEM_AMBIENTE === "1") {
    console.warn(
      "\n⚠️  ATLAS build SEM AMBIENTE — artefato NÃO SERVE PARA PRODUÇÃO.\n" +
        faltando.map(([n]) => `      falta ${n}`).join("\n") +
        "\n   O bundle do navegador sairá sem o endereço do Supabase e o login não vai funcionar.\n",
    );
    return;
  }

  console.error(
    "\n✘ BUILD RECUSADO — faltam variáveis que são ASSADAS NO BUNDLE.\n\n" +
      faltando.map(([nome, porque]) => `    ${nome}\n      → ${porque}`).join("\n\n") +
      "\n\n  Estas variáveis não podem ser corrigidas depois: `NEXT_PUBLIC_*` é\n" +
      "  gravada no JavaScript do navegador NESTE MOMENTO. Construir sem elas\n" +
      "  produz uma aplicação que sobe, responde HTTP 200 e NÃO DEIXA NINGUÉM\n" +
      "  ENTRAR — foi exatamente o que derrubou a produção em 31/07/2026.\n\n" +
      "  Como resolver:\n" +
      "    set -a; . ./.env; set +a\n" +
      "    node scripts/validate-production-env.mjs\n" +
      "    npm run build\n\n" +
      "  Só para verificar compilação, sem gerar artefato de produção:\n" +
      "    ATLAS_BUILD_SEM_AMBIENTE=1 npm run build\n",
  );
  process.exit(1);
}

descobrirProcedencia();
exigirAmbienteDeBuild();
const quarantine = createRouteQuarantine({ root, paths: legacyRoutePaths, mode: "build" });
const nextBin = resolve(root, "node_modules/next/dist/bin/next");
// O padrão é o turbopack porque é o que este projeto já usava (`next build` sem
// flag no Next 16) e é o perfil de chunking que o orçamento de performance mede:
// com webpack o build gera 772 chunks contra o teto de 600 e reprova
// check-performance-budget. Manter webpack como opção explícita ainda é útil —
// ele valida o contrato de página do Next, que o turbopack não checa.
const requestedBundler = (process.env.ATLAS_NEXT_BUNDLER || "turbopack").toLowerCase();

if (!existsSync(nextBin)) {
  throw new Error(
    "Next.js não está instalado localmente. Execute `npm ci` antes do build.",
  );
}

if (!["webpack", "turbopack"].includes(requestedBundler)) {
  throw new Error(
    "ATLAS_NEXT_BUNDLER deve ser `webpack` ou `turbopack`.",
  );
}

try {
  const buildArgs = [nextBin, "build"];
  if (requestedBundler === "webpack") buildArgs.push("--webpack");

  console.log(
    `ATLAS build: Next.js com ${requestedBundler} (runtime local, sem download implícito).`,
  );

  const result = spawnSync(process.execPath, buildArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  process.exitCode = result.status ?? 1;
} finally {
  quarantine.restore();
}
