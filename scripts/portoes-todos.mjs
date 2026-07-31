/**
 * TODOS OS PORTÕES, DE UMA VEZ — e a quarentena declarada em voz alta.
 *
 * ── O DEFEITO QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * Medido em 2026-07-29, executando os 223 `*:check` do package.json um por um:
 *
 *   223 checks · 211 verdes · 12 vermelhos
 *   mas só 80 alcançados por release:prebuild-check / validate / verify / test:real
 *   => 143 portões só rodavam se alguém digitasse o nome
 *
 * O custo disso não é teórico. `final-navigation:check` ficou VERMELHO por 8 dias
 * sem ninguém ver: a reescrita da barra lateral removeu a variável `visibleItems`
 * que ele exigia por literal. Portão que ninguém chama não protege — esconde. Foi
 * assim que a cadeia de evolução morreu na fase 018 e escondeu as fases 019 a 047.
 *
 * ── POR QUE A LISTA É DERIVADA, E NÃO ESCRITA ───────────────────────────────
 *
 * Uma lista com os 135 nomes apodreceria na primeira vez que alguém criasse um
 * check novo — e "check novo que ninguém liga" é exatamente o problema que este
 * arquivo existe para acabar. Aqui a lista sai do package.json: todo `*:check`
 * entra, e sair exige entrar na QUARENTENA com um motivo escrito.
 *
 * Tempo medido: ~60 s para o conjunto inteiro, mediana de 139 ms por check.
 * Serial de propósito — paralelo embaralha quem escreve no banco e nos logs, e
 * 60 s não justifica trocar determinismo por velocidade.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * A QUARENTENA. Cada entrada precisa de um motivo — o `assert` abaixo recusa
 * entrada sem ele. Quarentena silenciosa é pior que portão vermelho: o vermelho
 * incomoda até alguém resolver, o silêncio parece cobertura.
 *
 * Regra: só duas razões são legítimas aqui.
 *   AMBIENTE — o portão precisa de credencial/conexão que a máquina de quem roda
 *              não tem. Ele NÃO é dispensado: roda no ambiente que tem.
 *   EM CORREÇÃO — vermelho real, com dono e destino. Não é lugar para morar.
 */
const QUARENTENA = {
  // Os dois motivos abaixo foram REESCRITOS em 2026-07-29 depois de executar os
  // portões e ler a saída inteira. O texto anterior de `database:connection:check`
  // dizia "exige connection string; não há no .env.local" — verdade sobre a
  // máquina, mas ERRADA sobre este portão: ele nunca chegava a olhar a URL,
  // porque para antes, no crivo de rótulo de ambiente. Quarentena com motivo
  // errado convence, e foi por isso que o defeito de rótulo ficou invisível.
  "database:connection:check":
    "AMBIENTE — recusado no crivo de rótulo antes de tentar conectar: .env.local traz ATLAS_ENV=production e ATLAS_DATABASE_ENVIRONMENT com uma connection string onde o código espera o rótulo 'homologation'. Atrás disso há um segundo bloqueio real: não existe connection string usável nesta máquina (a única do repositório está em .env.hostinger, com senha [YOUR-PASSWORD] e apontando para o projeto de PRODUÇÃO). Medido em 2026-07-29: sai 2 (NÃO EXECUTADO) nos dois casos e 1 quando conecta e falha. Roda no deploy.",
  "rpc-escalacao:check":
    "AMBIENTE — precisa de DATABASE_URL para consultar pg_proc e os GRANTs de função. Existe porque em 2026-07-30 uma escalação de privilégio foi REPRODUZIDA em produção: `distribute_project_leads` é SECURITY DEFINER, tinha EXECUTE para `authenticated` e nunca comparava `p_actor_id` com `auth.uid()` — um corretor executava a rotina de distribuição passando o UUID do diretor. Foi regressão VERSIONADA (uma migration revogou, outra seis dias depois reconcedeu) e nenhum dos 220 portões pegou, porque nenhum olhava GRANT de função. Roda no deploy.",
  "rls-cerca:check":
    "AMBIENTE — precisa ler pg_policy, e nada nesta máquina alcança pg_catalog. Medido em 2026-07-29: PostgREST responde 406 'Only the following schemas are exposed: public, graphql_public'; não existe RPC que exponha policies; não há DATABASE_URL usável; e a via alternativa de provar a cerca pelo EFEITO está fechada porque ATLAS_TEST_EMAIL/PASSWORD devolvem 400 invalid_credentials. Sai com 2 e 'NÃO EXECUTADO' em vez de fingir aprovação. A propriedade foi medida à mão hoje, pelo Management API: public.leads dá 0/0/1/0 em 5 policies — cerca íntegra, e a ÚNICA das 168 tabelas com esse desenho.",
  // `api-security:check` SAIU da quarentena em 2026-07-29, no mesmo dia em que
  // entrou: o worker da CAPI ganhou `ATLAS_CRON_SECRET`, `alertas-de-lead` foi
  // declarada como mutação sem corpo (é o que ela é — marca os avisos do próprio
  // usuário como vistos, sem ler payload) e as 3 rotas de ponte ganharam
  // categoria própria, com exigência mais estrita que a genérica. Quarentena que
  // sobrevive ao problema vira teto silencioso, que é o defeito que este arquivo
  // existe para não cometer.
  // `final-dashboards:check` SAIU da quarentena em 2026-07-29. O motivo antigo
  // ("cobra DASHBOARD_PERIOD_KEY em app/(crm)/dashboard/page.tsx; lacuna real,
  // não contrato velho") estava METADE certo, e a metade errada era a que
  // escondia mais: dos 10 vermelhos, 8 eram contrato velho — `const isBroker`,
  // `if (!isBroker)`, `isBroker ?`, "Perfil comercial não identificado",
  // `brokerDaily`, `managerDaily`, `superintendentSummary` e `directorDaily`
  // JÁ ESTAVAM inteiros em app/(crm)/command-center/page.tsx, que virou a casa
  // de decisão na fusão Início + Command Center; `app/(crm)/dashboard/page.tsx`
  // é um redirect de 18 linhas desde então. Os outros 2 eram lacuna real:
  // `DASHBOARD_PERIOD_KEY` não existia em lugar nenhum, e a promessa escrita da
  // Fase Final 7 — "o período escolhido permanece durante a sessão" — nunca foi
  // implementada, embora as pastilhas de /reports já recortassem de verdade.
  // Reapontado para as propriedades e implementada a memória do recorte: 49
  // controles (eram 20), 12 deles EXECUTANDO as funções em vez de procurar o
  // nome delas, com contrato (tests/contracts/periodo-do-resumo-persiste.test.mjs)
  // e 4 mutações (M83–M86) provando os dois lados.
  // `password-recovery:check` SAIU da quarentena em 2026-07-29, com a medição que
  // o motivo antigo dizia faltar. Não era SMTP nem regressão do /auth/v1/verify:
  // o portão cobrava um MECANISMO — a página de reset não podia conter
  // `supabase.auth.updateUser` —, e a página contém, de propósito, desde o
  // conserto do "abre mas não pede a senha nova".
  //
  // Medido no projeto de homologação pozbrcsfthnhmnebfoxv com usuário descartável
  // `pwd-` e DUAS sessões vivas: a troca pelo caminho do navegador leva as duas
  // sessões antigas de GET /auth/v1/user = 200 para 403 e o refresh_token de 200
  // para 400 SEM nenhum signOut — o provedor revoga sozinho, e a suspeita de
  // "senha muda e o invasor continua dentro" está REFUTADA. O que sobrava vivo
  // era a sessão de RECUPERAÇÃO (GET = 200 depois da troca, ~1 h de validade), e
  // a resposta da rota era descartada com um catch vazio: troca sem registro e
  // sem revogação, em silêncio. Também medido: a política do provedor é só
  // "at least 6 characters" — "aaaaaa", "abc123", "12345678" e "senhasimples"
  // foram ACEITAS (HTTP 200) —, então 12/128/3 só existe no código do Atlas.
  //
  // O portão foi REAPONTADO para as propriedades (resposta não engolida,
  // revogação explícita, política antes do provedor, cookie de intenção mantido
  // na rota, troca registrada) e reprovava a situação de HOJE antes do conserto.
  // Contrato: tests/contracts/troca-de-senha-nao-e-silenciosa.test.mjs, com 3
  // mutantes provando os dois lados.
  // `conversational-qualification:check` SAIU da quarentena em 2026-07-29. O
  // motivo antigo ("cobra 'UMA PERGUNTA POR VEZ' na tela; agentes já tentaram
  // satisfazer EDITANDO O PRODUTO") descrevia certo o RISCO e errado a CAUSA — e
  // a recusa do dono estava certíssima: editar a tela nunca era o conserto.
  // As 3 frases em caixa alta ("UMA PERGUNTA POR VEZ", "CORRETOR CONFIRMA",
  // "CONVERSA BRUTA: ZERO") eram três `<AtlasBadge>` de um hero de marketing.
  // `git log -S` mede: entraram em 62cabe58 (entrega da Fase 86) e saíram em
  // 2c059a79, apagadas DE PROPÓSITO a pedido literal do dono ("essa parte
  // intuitiva de facil preenchimento") porque o hero empurrava a pergunta para
  // baixo da dobra no mobile. A tela está byte a byte idêntica ao HEAD. O
  // COMPORTAMENTO nunca saiu; saiu o cartaz que o anunciava — e o requisito
  // continua ESCRITO em docs/STRUCTURED_CONVERSATIONAL_QUALIFICATION_PHASE_86.md,
  // então não era requisito inventado por agente: era requisito de
  // COMPORTAMENTO medido por COPY.
  // Reapontado para as propriedades: 30 controles (eram 24), com a pergunta
  // única, a resposta controlada e a ausência de texto livre cobradas na REGIÃO
  // do código. Contrato executável em tests/contracts/uma-pergunta-por-vez.test.mjs
  // (15 testes, 256 estados de perfil, os dois lados de cada regra) e 7 mutações
  // (M78–M82, M87–M88) provando que a guarda não é decorativa. Duas cegueiras do
  // reapontamento foram achadas ANTES de fechar, quebrando o produto de
  // propósito numa cópia: `disabled` procurado no arquivo inteiro passava com um
  // dos DOIS gatilhos de escrita desarmado, e a ordem de duas ocorrências casava
  // o prefixo de um `QUALIFICATION_INVALID_X` inalcançável.
  // `reactivation-governance:check` SAIU da quarentena em 2026-07-29. O motivo
  // antigo ("AMBIENTE — declara official_whatsapp_api_missing; o WhatsApp está
  // NOT_VERIFIED") estava simplesmente ERRADO: executado, o portão não toca
  // WhatsApp, credencial nem rede. `official_whatsapp_api_missing` é um LITERAL
  // que ele procurava dentro de lib/commercial/consented-reactivation-policy.ts,
  // e esse literal PASSAVA. Os 9 vermelhos eram grafia: 6 por exigir
  // `officialApiOnly:true` onde o código diz `officialApiOnly: true` (um espaço),
  // e 3 por exigir copy de tela que a reescrita trocou. Reapontado para as
  // propriedades — a política agora é EXECUTADA, os defaults do SQL são
  // confrontados com os números que ela devolve, e a simulação é obrigada a não
  // escrever. 29 propriedades verdes, 5 mutações reprovadas para provar o outro
  // lado. O grão fino virou contrato: tests/contracts/reativacao-consentida.test.mjs.
  // `cc23:check` SAIU da quarentena em 2026-07-29. O motivo antigo ("26 controles
  // passam, 4 falham") era verdadeiro no número e ENGANOSO na causa: nenhuma das 4
  // falhas era do CC23. O check definia a camada como `css.slice(inicioCC23)` — do
  // marcador até o FIM DO ARQUIVO. Quando nasceu, o CC23 era a última coisa do
  // globals.css, então "do marcador ao EOF" e "o bloco CC23" eram a MESMA string.
  // Depois entraram 1.988 linhas de features vizinhas (TEMA CLARO, LÂMINA DO LEAD
  // 360, RAIL DA SIDEBAR) e passaram a responder pelas regras do CC23 por acidente
  // de POSIÇÃO NO ARQUIVO. Medido, uma a uma: caso 15 acusava `backdrop-filter:
  // blur` (L9940/L9987 — outra propriedade: desfoca o FUNDO, não o elemento, e é a
  // linguagem de vidro em 20 pontos do produto); casos 17/19 acusavam `.atlas-lamina-*`,
  // `.atlas-rail-*` e `.atlas-kanban-filtro-dono`; e o caso 18 reprovava um
  // `@media (prefers-reduced-motion: reduce)` (L10266) por não ter `pointer: fine` —
  // punindo o REMÉDIO de acessibilidade que ele próprio existe para cobrar.
  // Dentro do bloco CC23 (L8123-8301) as quatro propriedades sempre valeram.
  // Estender as regras ao arquivo inteiro não era opção (antes do CC23 há 428 hex
  // literais, 103 movimentos soltos e 9 `filter: blur`) e o CC23 é declaradamente
  // ADITIVO. Reapontado para a PROPRIEDADE: região derivada dos banners e pregada
  // pelos DOIS lados — nenhum seletor .cc23-* fora dela (caso 12c), nenhum seletor
  // estranho dentro (caso 12d, que é o que pega a deriva na raiz). 35 controles
  // verdes (eram 30), 12 mutações mortas provando os dois lados, e a região virou
  // módulo (scripts/lib/cc23-regiao.mjs) com contrato
  // (tests/contracts/regiao-do-cc23.test.mjs) porque `scripts/mutacoes.mjs` só roda
  // `test:contracts` — sem isso, a lógica que já apodreceu uma vez seguia sem rede.
  // Este é vermelho POR ESTAR CERTO, e o vermelho é do AMBIENTE, não do código.
  // Medido em 2026-07-30: ATLAS_ENV=production, ATLAS_BASE_URL=atlasaios.com.br
  // (produção) e banco = atlas-v3-homologacao. Três verdades sobre o mesmo fato,
  // duas erradas — e é essa mistura que faz o `test:real` medir um ambiente e
  // validar contra outro, APROVANDO. Já está encadeado como PRIMEIRO passo do
  // `test:real`, justamente para a suíte ponta a ponta se recusar a aprovar sem
  // sentido. Fecha quando o dono ajustar o `.env.local`, que é ambiente dele.
  "coerencia-ambiente:check":
    "EM CORREÇÃO — reprova a incoerência REAL do ambiente: ATLAS_ENV=production com banco de homologação e URL de produção. O conserto é no .env do dono; afrouxar o portão devolveria o `test:real` que aprova sem provar.",
  "release:check":
    "AGREGADO — soma outros portões; o vermelho vem de dentro e já é contado aqui. Contá-lo de novo mascararia o número.",
  "v1-v2:check": "AGREGADO — mesmo caso de release:check.",
  "v3:check": "AGREGADO — mesmo caso de release:check.",
};

for (const [nome, motivo] of Object.entries(QUARENTENA)) {
  if (!/^(AMBIENTE|EM CORREÇÃO|AGREGADO) — .+/.test(motivo)) {
    console.error(`quarentena inválida: "${nome}" precisa de motivo começando por AMBIENTE, EM CORREÇÃO ou AGREGADO.`);
    process.exit(2);
  }
}

const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;

/**
 * O COMPILADOR VEM ANTES DE TUDO — e esta linha existe por um defeito medido.
 *
 * Em 2026-07-30 o build estava QUEBRADO com TS2307 (três imports apontando para
 * módulos que tinham ido para o `git stash`) e este agregado devolveu
 * **218/218 portões verdes**. Eu rodava `test:contracts` + `portoes:todos`, via
 * tudo verde, e chamava de verificado.
 *
 * O erro não foi o import pendurado: foi a régua. Portão de CONTEÚDO casa texto
 * no fonte — ele mede um programa que não compila com a mesma satisfação com que
 * mede um que compila. Import pendurado não aparece em contrato nem em `*:check`;
 * aparece só aqui. Quem pegou, por acidente, foi o `daily:check`, ao lintar um
 * arquivo alterado.
 *
 * Falha RÁPIDO de propósito: rodar 218 portões sobre código que não compila gasta
 * um minuto para produzir um número que mente. `release:prebuild-check` já
 * chamava `typecheck`; o problema era este agregado ser usado sozinho como prova.
 */
try {
  execFileSync("npm", ["run", "--silent", "typecheck"], { stdio: "pipe", timeout: 300_000, maxBuffer: 8e6 });
} catch (erro) {
  const saida = `${erro.stdout || ""}\n${erro.stderr || ""}`;
  const primeiras = saida.split("\n").filter((l) => /error TS\d+/.test(l)).slice(0, 5);
  console.error("PORTÕES: NÃO EXECUTADOS — o código não compila.\n");
  for (const l of primeiras) console.error(`  ✗ ${l.trim()}`);
  console.error(
    "\nPortão de conteúdo casa texto no fonte: ele aprovaria isto. Import pendurado" +
      "\nnão aparece em contrato nem em `*:check` — só no compilador. Conserte o tipo" +
      "\nantes de medir o resto, ou o número que sair daqui é uma mentira verde.",
  );
  process.exit(1);
}

const todos = Object.keys(scripts).filter((k) => k.endsWith(":check"));

/**
 * `route-quarantine.mjs` só permite UMA execução do repo por vez: um check que
 * dispare build ou dev derrubaria o servidor de quem estiver medindo. Derivado,
 * não listado — hoje o conjunto é vazio, e queremos saber se um dia deixar de ser.
 */
const fazemBuild = todos.filter((c) => /\bnext build\b|npm run build|npm run dev/.test(scripts[c]));

const alvo = todos.filter((c) => !QUARENTENA[c] && !fazemBuild.includes(c));

console.log(`PORTÕES: ${todos.length} no package.json · ${alvo.length} para rodar agora`);
if (fazemBuild.length) {
  console.log(`  fora por fazerem build/dev (quarentena de rotas): ${fazemBuild.join(", ")}`);
}
console.log(`  em quarentena declarada: ${Object.keys(QUARENTENA).length}`);
for (const [nome, motivo] of Object.entries(QUARENTENA)) console.log(`    · ${nome} — ${motivo}`);
console.log();

const falhas = [];
for (const [i, nome] of alvo.entries()) {
  process.stdout.write(`\r[${i + 1}/${alvo.length}] ${nome}`.padEnd(80));
  try {
    execFileSync("npm", ["run", "--silent", nome], { stdio: "pipe", timeout: 180_000, maxBuffer: 8e6 });
  } catch (erro) {
    const saida = `${erro.stdout || ""}\n${erro.stderr || ""}`;
    falhas.push({
      nome,
      // A PRIMEIRA linha de veredito, não o rodapé: ler a última linha já fez
      // esta sessão concluir "verde" numa guarda cuja asserção quebrada estava no meio.
      primeira:
        (saida.split("\n").find((l) => /✗|✖|not ok|REPROVA|falhou|ausente|missing/i.test(l)) || "").trim().slice(0, 160),
    });
  }
}
process.stdout.write(`\r${" ".repeat(80)}\r`);

console.log(`\n${alvo.length - falhas.length}/${alvo.length} portões verdes\n`);
if (falhas.length) {
  console.error("VERMELHOS (fora da quarentena — estes não eram esperados):");
  for (const f of falhas) console.error(`  ✗ ${f.nome.padEnd(46)} ${f.primeira}`);
  console.error(
    "\nTrês desfechos legítimos, e só três: consertar o código; reapontar a asserção" +
      "\npara a propriedade (documentando data e causa MEDIDA); ou parar e relatar." +
      "\nNunca afrouxar, remover para passar, nem fixar número novo às cegas.",
  );
  process.exit(1);
}
console.log("Nenhum portão fora da quarentena está vermelho.");
