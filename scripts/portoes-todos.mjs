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
  "database:connection:check":
    "AMBIENTE — exige connection string de Postgres; não há no .env.local. Roda no deploy.",
  "rls-cerca:check":
    "AMBIENTE — exige DATABASE_URL para ler pg_policy (o PostgREST não alcança pg_catalog). Sai com código 2 e a mensagem 'NÃO EXECUTADO' quando falta, em vez de fingir aprovação.",
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
  "reactivation-governance:check":
    "AMBIENTE — declara official_whatsapp_api_missing. O WhatsApp está NOT_VERIFIED e em plataforma antiga; é bloqueio de fora do código.",
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
