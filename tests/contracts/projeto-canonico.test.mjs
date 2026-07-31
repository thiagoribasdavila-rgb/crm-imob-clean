/**
 * Contrato: O REPOSITÓRIO SÓ APONTA PARA O BANCO CERTO.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * A organização tem DOIS projetos Supabase, e o repositório apontava para o
 * ERRADO em 19 arquivos — incluindo TODOS os documentos de deploy e dois scripts
 * executáveis. Medido em 2026-07-29.
 *
 *   atlas-v3-homologacao  pozbrcsfthnhmnebfoxv  183 tabelas ·    470 leads
 *   atlas-ai-crm-v1       ietwopslgqxlenfyghqk   24 tabelas · 17.151 leads
 *
 * Os dois piores casos não eram documentação velha:
 *
 *   scripts/atlas-go-live.sh imprimia a instrução
 *       supabase link --project-ref ietwopslgqxlenfyghqk && supabase db push
 *   — o script de go-live MANDAVA o operador empurrar 166 migrations desenhadas
 *   para 183 tabelas contra a base legada de 24, com 17.151 leads reais dentro.
 *
 *   scripts/validate-env-hostinger.sh registrava "DATABASE_URL parece correto"
 *   quando ela apontava para o projeto antigo. O validador CERTIFICAVA o erro.
 *
 * Foi assim que o `.temp/project-ref` do CLI acabou no projeto antigo, e foi por
 * isso que um cético mediu que o único caminho sugerido pela ferramenta apontava
 * para a base errada.
 *
 * ── POR QUE ISTO NÃO SE RESOLVE APAGANDO O PROJETO ANTIGO ───────────────────
 *
 * Porque ele NÃO ESTÁ VAZIO: 17.126 dos 17.151 leads têm nome, são 7.509
 * telefones distintos, 15.743 e-mails, e só 15 parecem teste. As origens não
 * existem no canônico — 16.733 estão rotulados "Memória histórica protegida".
 * São populações diferentes: apagar destrói dado comercial que não existe em
 * nenhum outro lugar.
 *
 * O defeito nunca foi o projeto antigo existir. Foi o repositório não declarar
 * qual é o certo. Este contrato é a declaração com dentes.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const declaracao = JSON.parse(fs.readFileSync(path.join(raiz, "config", "supabase-projetos.json"), "utf8"));

const CANONICO = declaracao.canonico.ref;
const APOSENTADOS = declaracao.aposentados.map((p) => p.ref);
const PODEM_CITAR = new Set(declaracao.podemCitarAposentado);

/**
 * Só o que é VERSIONADO. `git ls-files`, não uma varredura do disco.
 *
 * A primeira versão andava o diretório e acusava `.env.hostinger`,
 * `.env.hostinger-template` e `.env.local` — que estão FORA do git (corretamente
 * ignorados; nenhum segredo no repositório). O contrato estava opinando sobre o
 * ambiente da máquina de quem roda, que varia e não é o que o repo entrega. Um
 * contrato assim reprova por motivo que o autor do commit não controla, e a
 * primeira coisa que alguém faz com ele é desligá-lo.
 *
 * A fronteira certa: **contrato guarda o que é versionado; portão de ambiente
 * guarda a máquina.** O caso dos `.env` não foi perdido — ele é do
 * `scripts/check-coerencia-de-ambiente.mjs`, que confere os arquivos de deploy
 * contra o ref aposentado e reprova. E ele MEDIU o que importa:
 * `.env.hostinger` aponta `NEXT_PUBLIC_SUPABASE_URL` para o projeto aposentado,
 * então deploy com aquele arquivo conecta a app no banco de 17.151 leads.
 */
function arquivosDoRepo() {
  /**
   * A VARREDURA É A ÚNICA BEHAVIOR, e isso foi aprendido errando duas vezes.
   *
   * 1ª tentativa: só `git ls-files`. Explodia na cópia do `teste:mutacoes` (que
   *    faz `rsync --exclude .git`), derrubando a rede de mutação INTEIRA.
   * 2ª tentativa: `git ls-files` com varredura de reserva. Passou a responder
   *    DIFERENTE nos dois contextos — com git via só o RASTREADO; sem git via
   *    também os não rastreados. O contrato ficava verde no repo e vermelho na
   *    cópia, pelo mesmo código. Um contrato que muda de opinião conforme quem o
   *    chama não protege nada: ele ensina que o vermelho é do ambiente.
   *
   * Agora é sempre a varredura, e ela pula à mão o que o `.gitignore` pularia.
   * Arquivo NOVO ainda não commitado ENTRA na conferência — e tem de entrar: é
   * exatamente no arquivo recém-criado que a referência errada nasce.
   */
  const _semGitDePropósito = true;
  if (_semGitDePropósito) {
    /**
     * SEM GIT — e este caminho não é teórico: ele é o do `teste:mutacoes`.
     *
     * `scripts/mutacoes.mjs` COPIA o repositório para uma pasta temporária, sem o
     * `.git`, e roda a suíte lá. A primeira versão desta função chamava
     * `git ls-files` sem alternativa, então ela EXPLODIA na cópia — e o harness,
     * que se recusa a medir com a suíte vermelha, saía com "a suíte já falha sem
     * nenhuma mutação". Resultado: um contrato meu derrubou a REDE DE MUTAÇÃO
     * INTEIRA, para todas as frentes, e as quebras declaradas por outras entregas
     * nunca rodaram. Foi um cético que mediu isso, não eu.
     *
     * A lição é sobre a forma: contrato que depende de ferramenta EXTERNA precisa
     * de caminho para quando ela não estiver lá. Aqui a varredura substitui o
     * `git ls-files` e pula à mão o que o `.gitignore` pularia — os `.env*` são o
     * que importa, porque é justamente por eles que a versão anterior reprovava.
     */
    const alvoRelativo = (dir, nome) => path.relative(raiz, path.join(dir, nome)).split(path.sep).join("/");
    const IGNORAR = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo", "coverage"]);
    const achados = [];
    (function andar(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORAR.has(e.name) || e.name.startsWith(".env")) continue;
        // Cache do CLI do Supabase: nao e fonte nossa e nao e versionado. O ref
        // que mora ali e vigiado pelo portao de ambiente, que e quem pode agir
        // sobre ele — o CLI aponta para o projeto APOSENTADO, e e por isso que
        // `supabase db push` mira no banco errado.
        if (alvoRelativo(dir, e.name).startsWith("supabase/.temp")) continue;
        const alvo = path.join(dir, e.name);
        if (e.isDirectory()) andar(alvo);
        else achados.push(path.relative(raiz, alvo).split(path.sep).join("/"));
      }
    })(raiz);
    return achados;
  }
}

const comAposentado = arquivosDoRepo().filter((rel) => {
  let src;
  try {
    src = fs.readFileSync(path.join(raiz, rel), "utf8");
  } catch {
    return false; // binário ou ilegível
  }
  return APOSENTADOS.some((ref) => src.includes(ref));
});

test("a declaração nomeia um canônico e ao menos um aposentado", () => {
  // Sem este piso, uma declaração vazia deixaria todo o resto verde por vacuidade.
  assert.match(CANONICO, /^[a-z]{20}$/, "o ref canônico precisa ser um ref de projeto Supabase");
  assert.ok(APOSENTADOS.length >= 1, "sem aposentado declarado, não há o que vigiar");
  assert.ok(!APOSENTADOS.includes(CANONICO), "o canônico não pode estar na lista de aposentados");
});

test("NENHUM script executável aponta para projeto aposentado", () => {
  /**
   * Separado dos documentos de propósito. Documento errado desinforma; script
   * errado EXECUTA. `atlas-go-live.sh` e `validate-env-hostinger.sh` estavam nesta
   * lista, e o segundo chamava o projeto errado de correto.
   */
  const executaveis = comAposentado.filter(
    (f) => /^(scripts|workers)\//.test(f) && /\.(sh|mjs|js|ts|cjs)$/.test(f) && !PODEM_CITAR.has(f),
  );
  assert.deepEqual(
    executaveis,
    [],
    `estes scripts apontam para um projeto APOSENTADO com dado real dentro (${APOSENTADOS.join(", ")}). ` +
      `Use o ref canônico ${CANONICO}, lido de config/supabase-projetos.json.`,
  );
});

test("nenhuma configuração ou variável de ambiente aponta para aposentado", () => {
  const configs = comAposentado.filter(
    (f) => /^(config|supabase)\//.test(f) || /^\.env/.test(f) || /^(package\.json|ecosystem)/.test(f),
  );
  assert.deepEqual(
    configs.filter((f) => !PODEM_CITAR.has(f)),
    [],
    "configuração apontando para projeto aposentado: a app conectaria no banco errado",
  );
});

test("roteiro de deploy que cita o aposentado precisa estar declarado como aviso", () => {
  /**
   * Documento PODE citar o projeto antigo — é assim que se avisa sobre ele. Mas a
   * permissão é por ARQUIVO, para que um roteiro novo não herde a licença sem
   * alguém decidir. Foi a falta disso que deixou o go-live com a instrução errada.
   */
  const naoDeclarados = comAposentado.filter((f) => !PODEM_CITAR.has(f));
  assert.deepEqual(
    naoDeclarados,
    [],
    "arquivos citam o projeto aposentado sem estar em `podemCitarAposentado`. Se o arquivo AVISA " +
      "sobre o projeto antigo, declare-o na lista com essa intenção; se ele MANDA usar o projeto " +
      "antigo, corrija-o.",
  );
});

/**
 * O arquivo é local POR DESENHO? Só o `.gitignore` responde isso — e ele é a
 * declaração versionada da intenção, que é justamente o que falta quando um
 * arquivo simplesmente some.
 */
function ignoradoPeloGit(arquivo) {
  try {
    execFileSync("git", ["check-ignore", "-q", arquivo], { cwd: raiz, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("toda exceção declarada existe e realmente cita o aposentado", () => {
  // Exceção que sobrevive ao problema é teto silencioso: ela vira licença para o
  // próximo arquivo entrar sem ninguém notar.
  //
  // ── POR QUE A AUSÊNCIA TEM DOIS SIGNIFICADOS ──────────────────────────────
  //
  // Descoberto em 2026-07-31 pela prova do pacote: este contrato passava aqui e
  // FALHAVA num clone limpo extraído do ZIP. A exceção `hostinger.env` aponta
  // para um arquivo de ambiente que está no `.gitignore` — ele existe nesta
  // máquina e NÃO existe no pacote, por desenho.
  //
  // "Arquivo sumiu do repositório" e "arquivo nunca entra no repositório" são
  // coisas opostas: a primeira é exceção podre e precisa falhar; a segunda é
  // exceção legítima para um arquivo local. Tratar as duas como ausência fazia
  // o contrato ser verde aqui e vermelho no pacote — e um contrato que só passa
  // na máquina de quem escreveu não prova nada sobre o produto entregue.
  //
  // A regra fica MAIS forte, não mais frouxa: exceção sem arquivo só é aceita
  // quando o `.gitignore` a explica. Sem essa prova, continua reprovando.
  for (const f of PODEM_CITAR) {
    const caminho = path.join(raiz, f);
    if (!fs.existsSync(caminho)) {
      assert.ok(
        ignoradoPeloGit(f),
        `exceção declarada para arquivo inexistente: ${f}. Se ele é local por desenho, precisa estar no .gitignore; se sumiu, tire-o da lista.`,
      );
      continue;
    }
    const src = fs.readFileSync(path.join(raiz, f), "utf8");
    assert.ok(
      APOSENTADOS.some((ref) => src.includes(ref)),
      `"${f}" está na lista de exceções e não cita projeto aposentado nenhum — tire-o da lista`,
    );
  }
});

test("o aposentado com dado real carrega o motivo de não ser apagado", () => {
  /**
   * O pedido que originou isto foi "excluir o supabase que não usamos". A premissa
   * estava errada, e o número é o que impede a próxima pessoa de repeti-la. Um
   * campo vazio aqui deixaria o projeto virar "aquele que ninguém sabe por que
   * existe" — e aí alguém apaga.
   */
  for (const p of declaracao.aposentados) {
    if (!p.leads) continue;
    assert.ok(
      typeof p.porQueNaoApagar === "string" && p.porQueNaoApagar.length > 120,
      `"${p.nome}" tem ${p.leads} leads e não explica por que não se apaga`,
    );
    assert.ok(
      typeof p.decisaoPendente === "string" && p.decisaoPendente.length > 40,
      `"${p.nome}" não diz o que precisa acontecer antes de qualquer exclusão`,
    );
  }
});
