#!/usr/bin/env node
/**
 * A CADÊNCIA TEM DE CAIR DENTRO DA JANELA QUE O PRÓPRIO VIGIA IMPÕE.
 *
 * ── O DEFEITO QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * Medido em 02/08/2026. `nightly-handoff` estava agendado para `30 3 * * *`, e a
 * rota dele só trabalha quando `nightlyWindow().morningHandoff` é verdadeiro —
 * isto é, entre 7h e 11h59 em America/Sao_Paulo.
 *
 * Às 3h30, em QUALQUER relógio plausível do servidor (São Paulo ou UTC), a
 * janela está fechada. A rota respondia `created: 0, motivo: "fora_da_janela"` e
 * ia embora. Todo dia. Para sempre.
 *
 * `nightly_broker_handoffs` está em ZERO ABSOLUTO no banco, e a explicação fácil
 * era "o agendador nunca disparou". Ela é verdadeira e é INCOMPLETA: mesmo que
 * tivesse disparado, este vigia teria recusado toda vez. Dois defeitos empilhados
 * produzindo o mesmo zero — e consertar só o de cima não teria mudado nada.
 *
 * ── POR QUE ELE É SILENCIOSO ────────────────────────────────────────────────
 *
 * "Disparei e recusei" e "não havia trabalho" produzem a MESMA resposta HTTP 200
 * com contador zero. Nenhum log de erro, nenhum alerta, nenhum teste vermelho.
 * É a família de defeito que este repositório mais paga: ausência de evidência
 * apresentada como saúde.
 *
 * ── OS DOIS LADOS SÃO DERIVADOS, NENHUM É LITERAL ───────────────────────────
 *
 * A janela sai de `lib/ai/governed-nightly-copilot.ts`, lida do código-fonte.
 * A cadência sai de `config/workers-schedule.json`.
 * O fuso sai do mesmo JSON, do campo `$fusoDaCadencia`.
 *
 * Cravar as horas aqui transformaria este portão numa terceira verdade sobre o
 * mesmo fato — exatamente o que ele existe para impedir. Se alguém mudar a
 * janela no código, o portão passa a cobrar a janela nova sozinho.
 *
 * ── E A SEGUNDA VERDADE, QUE JÁ EXISTIA ─────────────────────────────────────
 *
 * `.github/workflows/atlas-vigias.yml` repete as cadências em YAML, e o
 * agendador do GitHub roda SEMPRE em UTC — não aceita fuso. Então as cadências
 * de lá precisam ser as daqui somadas de 3 horas (o Brasil não tem horário de
 * verão desde 2019, então America/Sao_Paulo é UTC-3 o ano inteiro).
 *
 * Ninguém conferia essa conversão. Este portão confere.
 *
 * uso: node scripts/check-cadencia-vs-janela.mjs
 */
import { readFileSync } from "node:fs";

const falhas = [];
let passou = 0;
const ok = (nome) => {
  passou += 1;
  console.log(`✅ ${nome}`);
};
const falha = (nome, detalhe) => {
  falhas.push(`${nome} — ${detalhe}`);
  console.log(`❌ ${nome} — ${detalhe}`);
};

const config = JSON.parse(readFileSync("config/workers-schedule.json", "utf8"));
const workers = config.workers ?? [];
const fuso = config.$fusoDaCadencia?.fuso;

if (!fuso) {
  console.error("\n✘ config/workers-schedule.json não declara $fusoDaCadencia.fuso.");
  console.error("  Sem fuso, `0 3 * * *` significa 3h do relógio do servidor — e ninguém sabe qual é.\n");
  process.exit(1);
}
ok(`o fuso da cadência está declarado: ${fuso}`);

/**
 * Lê as janelas do CÓDIGO que as impõe, não de uma cópia.
 *
 * `governed-nightly-copilot.ts` está minificado numa linha, então o alvo são as
 * expressões `active:hour>=22||hour<7` e `morningHandoff:hour>=7&&hour<12`.
 */
function janelasDoCodigo() {
  const src = readFileSync("lib/ai/governed-nightly-copilot.ts", "utf8");
  const janelas = {};

  // `active` atravessa a meia-noite: hora >= A OU hora < B.
  const ativo = /active\s*:\s*hour\s*>=\s*(\d+)\s*\|\|\s*hour\s*<\s*(\d+)/.exec(src);
  if (ativo) janelas.active = { de: Number(ativo[1]), ate: Number(ativo[2]), atravessaMeiaNoite: true };

  // `morningHandoff` é um intervalo simples: hora >= A E hora < B.
  const manha = /morningHandoff\s*:\s*hour\s*>=\s*(\d+)\s*&&\s*hour\s*<\s*(\d+)/.exec(src);
  if (manha) janelas.morningHandoff = { de: Number(manha[1]), ate: Number(manha[2]), atravessaMeiaNoite: false };

  return janelas;
}

const JANELAS = janelasDoCodigo();
if (!JANELAS.active || !JANELAS.morningHandoff) {
  falha(
    "as janelas foram lidas de lib/ai/governed-nightly-copilot.ts",
    `não achei as duas expressões (active=${Boolean(JANELAS.active)}, morningHandoff=${Boolean(JANELAS.morningHandoff)}). ` +
      "O portão não pode conferir contra uma janela que não conseguiu ler — verde por não ter olhado é o pior desfecho.",
  );
} else {
  ok(
    `as janelas vieram do código: active ${JANELAS.active.de}h–${JANELAS.active.ate - 1}h59, ` +
      `morningHandoff ${JANELAS.morningHandoff.de}h–${JANELAS.morningHandoff.ate - 1}h59`,
  );
}

const dentro = (hora, j) =>
  j.atravessaMeiaNoite ? hora >= j.de || hora < j.ate : hora >= j.de && hora < j.ate;

// Horas em que a cadência dispara. Coringa e passo (asterisco-barra-N) cobrem
// todas as formas usadas hoje; faixa e lista entram por robustez.
//
// Este comentário é de LINHA e não de bloco de propósito: escrever o passo com
// asterisco e barra dentro de um bloco fecha o bloco na hora errada. Foi a
// segunda vez hoje que isso me pegou — a primeira foi em check-atlas-logo.
function horasDaCadencia(cadencia) {
  const campo = cadencia.trim().split(/\s+/)[1];
  if (campo === "*") return "todas";
  const passo = /^\*\/(\d+)$/.exec(campo);
  if (passo) {
    const n = Number(passo[1]);
    return Array.from({ length: Math.ceil(24 / n) }, (_, i) => i * n);
  }
  return campo.split(",").flatMap((parte) => {
    const faixa = /^(\d+)-(\d+)$/.exec(parte);
    if (faixa) {
      const saida = [];
      for (let h = Number(faixa[1]); h <= Number(faixa[2]); h += 1) saida.push(h);
      return saida;
    }
    return [Number(parte)];
  });
}

// ── 1. cadência × janela ────────────────────────────────────────────────────
for (const w of workers) {
  const arquivo = `app${w.rota}/route.ts`;
  let src;
  try {
    src = readFileSync(arquivo, "utf8");
  } catch {
    falha(`${w.nome}: a rota existe`, `${arquivo} não encontrado — o agendador chamaria um 404`);
    continue;
  }
  if (!src.includes("nightlyWindow")) continue;

  // Qual guarda esta rota usa? Ela decide qual janela vale.
  const usaManha = /window\.morningHandoff|!\s*window\.morningHandoff/.test(src);
  const usaAtivo = /window\.active|!\s*window\.active/.test(src);
  const chave = usaManha ? "morningHandoff" : usaAtivo ? "active" : null;
  if (!chave || !JANELAS[chave]) continue;

  const j = JANELAS[chave];
  const horas = horasDaCadencia(w.cadencia);
  if (horas === "todas") {
    ok(`${w.nome}: dispara de hora em hora, então cai na janela ${chave} em algum momento`);
    continue;
  }
  const foraDaJanela = horas.filter((h) => !dentro(h, j));
  if (foraDaJanela.length === horas.length) {
    falha(
      `${w.nome}: a cadência cai dentro da janela ${chave}`,
      `cadência "${w.cadencia}" dispara às ${horas.map((h) => `${h}h`).join(", ")} em ${fuso}, e a janela é ` +
        `${j.de}h–${j.ate - 1}h59. NENHUM disparo cai dentro: a rota vai responder "fora_da_janela" toda vez, ` +
        `com HTTP 200 e contador zero — indistinguível de "não havia trabalho".`,
    );
  } else if (foraDaJanela.length) {
    falha(
      `${w.nome}: a cadência cai dentro da janela ${chave}`,
      `${foraDaJanela.length} de ${horas.length} disparos caem fora (${foraDaJanela.map((h) => `${h}h`).join(", ")})`,
    );
  } else {
    ok(`${w.nome}: os ${horas.length} disparo(s) caem dentro da janela ${chave} (${j.de}h–${j.ate - 1}h59 ${fuso})`);
  }
}

// ── 2. a segunda verdade: o YAML do GitHub roda em UTC ──────────────────────
{
  const yaml = readFileSync(".github/workflows/atlas-vigias.yml", "utf8");
  // O GitHub não aceita fuso. America/Sao_Paulo é UTC-3 o ano inteiro desde que
  // o Brasil acabou com o horário de verão, em 2019.
  const DESLOCAMENTO = 3;

  const doDia = workers.filter((w) => {
    const h = w.cadencia.trim().split(/\s+/)[1];
    return h !== "*" && !h.startsWith("*/");
  });

  for (const w of doDia) {
    const [min, hora, ...resto] = w.cadencia.trim().split(/\s+/);
    const horaUtc = (Number(hora) + DESLOCAMENTO) % 24;
    const esperada = `${min} ${horaUtc} ${resto.join(" ")}`;
    // A linha do YAML precisa existir literalmente entre os `- cron:`.
    const temEsperada = new RegExp(`- cron:\\s*'${esperada.replace(/\*/g, "\\*")}'`).test(yaml);
    const temAIngenua = new RegExp(`- cron:\\s*'${w.cadencia.replace(/\*/g, "\\*")}'`).test(yaml);
    if (temEsperada) {
      ok(`${w.nome}: o YAML do GitHub usa "${esperada}" UTC, que é "${w.cadencia}" em ${fuso}`);
    } else if (temAIngenua) {
      falha(
        `${w.nome}: o YAML do GitHub converteu o fuso`,
        `o YAML repete "${w.cadencia}" como se fosse ${fuso}, mas o GitHub agenda em UTC. ` +
          `Deveria ser "${esperada}". Do jeito que está, o disparo acontece 3 horas antes do pretendido.`,
      );
    } else {
      falha(
        `${w.nome}: o YAML do GitHub tem a cadência dele`,
        `não achei "${esperada}" nem "${w.cadencia}" em .github/workflows/atlas-vigias.yml — ` +
          "cadência que existe no JSON e não existe no agendador é um vigia que ninguém chama",
      );
    }
  }
}

console.log(`\ncheck-cadencia-vs-janela: ${passou} passaram, ${falhas.length} falharam`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHOU: ${f}`);
  console.error("\n  Um vigia que dispara fora da própria janela responde 200 e não faz nada.");
  console.error("  Isso é pior que não disparar: parece saúde.\n");
  process.exit(1);
}
