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
  "rls-cerca:check":
    "AMBIENTE — precisa ler pg_policy, e nada nesta máquina alcança pg_catalog. Medido em 2026-07-29: PostgREST responde 406 'Only the following schemas are exposed: public, graphql_public'; não existe RPC que exponha policies; não há DATABASE_URL usável; e a via alternativa de provar a cerca pelo EFEITO está fechada porque ATLAS_TEST_EMAIL/PASSWORD devolvem 400 invalid_credentials. Sai com 2 e 'NÃO EXECUTADO' em vez de fingir aprovação. A propriedade foi medida à mão hoje, pelo Management API: public.leads dá 0/0/1/0 em 5 policies — cerca íntegra, e a ÚNICA das 168 tabelas com esse desenho.",
  // `api-security:check` SAIU da quarentena em 2026-07-29, no mesmo dia em que
  // entrou: o worker da CAPI ganhou `ATLAS_CRON_SECRET`, `alertas-de-lead` foi
  // declarada como mutação sem corpo (é o que ela é — marca os avisos do próprio
  // usuário como vistos, sem ler payload) e as 3 rotas de ponte ganharam
  // categoria própria, com exigência mais estrita que a genérica. Quarentena que
  // sobrevive ao problema vira teto silencioso, que é o defeito que este arquivo
  // existe para não cometer.
  "final-dashboards:check":
    "EM CORREÇÃO — cobra DASHBOARD_PERIOD_KEY em app/(crm)/dashboard/page.tsx; lacuna real, não contrato velho.",
  "password-recovery:check":
    "EM CORREÇÃO — falha a apurar: pode ser SMTP ausente (ambiente) ou regressão do conserto do /auth/v1/verify. Enquanto não medir, não afirmo qual.",
  "conversational-qualification:check":
    "EM CORREÇÃO — cobra 'UMA PERGUNTA POR VEZ' na tela de qualificação. Está na lista dos portões que agentes já tentaram satisfazer EDITANDO O PRODUTO; exige revisão humana, não conserto rápido.",
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
  "cc23:check":
    "EM CORREÇÃO — 26 controles passam, 4 falham no check-cc23-foundation.",
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
