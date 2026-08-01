#!/usr/bin/env node
/**
 * PORTÃO: o endpoint de saúde consegue dizer NÃO.
 *
 * ── O que motivou (medido em 01/08/2026) ───────────────────────────────────
 *
 * `/api/v1/health` devolvia `status:"ok"` e HTTP 200 CRAVADOS, sem ler nenhuma
 * variável, e logava `healthy: true` como literal. `/api/health` reexporta o
 * mesmo GET — os dois endereços históricos de saúde cegaram juntos.
 *
 * Antes do PR #9 a rota calculava `healthy = hasSupabaseUrl &&
 * hasSupabasePublicKey` e devolvia 503. A capacidade migrou para `/ready`, que
 * é mais forte — mas quem monitora uptime aponta para `/health`, e esse
 * endereço passou a responder "estou bem" com o Supabase desconfigurado.
 *
 * Um alerta que nunca dispara não é um alerta silencioso: é um alerta que NÃO
 * EXISTE. E nenhum portão pegaria, porque 200 é o que todo mundo espera de um
 * health check.
 *
 * ── O que este portão mede ─────────────────────────────────────────────────
 *
 * Não que a rota exista, nem que contenha a palavra "health": que ela seja
 * CAPAZ DE REPROVAR. Uma rota de saúde sem caminho de falha é decoração.
 *
 * Rodar: node scripts/check-saude-pode-dizer-nao.mjs
 */
import fs from "node:fs";

const ROTA = "app/api/v1/health/route.ts";
const fonte = fs.readFileSync(ROTA, "utf8");
/* Comentário não é implementação: esta rota tem um cabeçalho longo que CITA o
   defeito antigo, e um portão ingênuo aprovaria por causa da explicação. */
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const falhas = [];
const ok = [];

/* PRIMEIRA VERSÃO ERRADA, e ela reprovou o conserto: eu exigia `503` colado em
   `status:`, e o código escreve `status: saudavel ? 200 : 503`. A propriedade
   nunca foi a POSIÇÃO do número — é existir um caminho de resposta com 503.
   Um portão que casa a forma em vez do fato manda desfazer o que está certo. */
if (/\b503\b/.test(codigo)) ok.push("existe caminho de resposta com 503");
else falhas.push("nenhum caminho devolve 503 — a rota não consegue reprovar, e um monitor apontado nela nunca vai disparar");

if (/process\.env\.NEXT_PUBLIC_SUPABASE_URL/.test(codigo)) ok.push("lê a URL pública do ambiente");
else falhas.push("não lê NEXT_PUBLIC_SUPABASE_URL — não tem o que avaliar");

if (/NEXT_PUBLIC_SUPABASE_(PUBLISHABLE_KEY|ANON_KEY)/.test(codigo)) ok.push("lê a chave pública do ambiente");
else falhas.push("não lê a chave pública — instância sem credencial passaria por saudável");

/* `status: "ok"` literal, sem ternário, é a assinatura exata do defeito. */
if (/status:\s*["']ok["']/.test(codigo)) {
  falhas.push('`status: "ok"` está CRAVADO — foi assim que a rota passou a mentir');
} else ok.push("o status é calculado, não cravado");

if (/healthy:\s*true\b/.test(codigo)) {
  falhas.push("`healthy: true` cravado no log — o log declarava saúde sem medir nada");
} else ok.push("o log reporta o valor medido");

/* Liveness não pode fazer I/O: uma lentidão do banco viraria reinício em
   cascata. A prontidão real é `/api/v1/ready`, e a rota deve apontar para lá. */
if (/\bfetch\s*\(|getSupabaseAdmin|createClient\s*\(/.test(codigo)) {
  falhas.push("a rota faz I/O — liveness precisa ser barata; consulta ao banco é `/api/v1/ready`");
} else ok.push("sem I/O: liveness continua barata");

for (const o of ok) console.log(`  ok   ${o}`);
for (const f of falhas) console.error(`  FALHA ${f}`);

if (falhas.length) {
  console.error(`\n✗ saude-pode-dizer-nao: ${falhas.length} de ${falhas.length + ok.length} asserções reprovaram.`);
  process.exit(1);
}
console.log(`\n✓ saude-pode-dizer-nao: ${ok.length} asserções, todas verdes.`);
