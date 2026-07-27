#!/usr/bin/env node
/**
 * VARREDURA COMPLETA — toda página e toda rota, com login real.
 *
 * ── Por que assim ───────────────────────────────────────────────────────────
 *
 * São 200 páginas e 194 rotas. Pentear lendo código é como nasceram os cinco
 * diagnósticos errados desta semana: concluir por estrutura. Aqui o servidor
 * responde, e a resposta é o veredito.
 *
 * ── O que conta como falha ──────────────────────────────────────────────────
 *
 * 5xx sempre. Numa PÁGINA, também conta o corpo que renderizou a fronteira de
 * erro do Next em vez do conteúdo — a página devolve 200 e o corretor vê
 * "Application error". É o modo de falha mais enganoso que existe: verde no
 * monitor, quebrado na tela.
 *
 * 4xx em rota de API é resultado esperado (falta parâmetro, falta permissão) e
 * NÃO é falha — o que se está medindo é se a rota sabe recusar sem cair.
 *
 * ── A trava ─────────────────────────────────────────────────────────────────
 *
 * Nada que dispare ação para fora é chamado. Rota cujo caminho sugira envio,
 * publicação ou cobrança fica de fora por lista, não por sorte: o CRM tem 199
 * leads reais e um POST distraído vira mensagem no WhatsApp de gente de verdade.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const BASE = process.env.TESTE_BASE_URL || "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

/** Caminhos que NÃO podem ser tocados: agem fora do CRM ou cobram dinheiro. */
const PROIBIDO = /(send|enviar|disparo|broadcast|publish|publicar|activate|ativar|campaign\/(create|launch)|whatsapp\/(send|message)|sms|email\/send|checkout|payment|charge|billing|delete|remove|purge|reset|seed|bootstrap|logout|signout)/i;

function paginas(dir = "app", prefixo = "") {
  const achados = [];
  for (const nome of readdirSync(dir)) {
    const completo = path.join(dir, nome);
    if (!statSync(completo).isDirectory()) {
      if (nome === "page.tsx") achados.push(prefixo || "/");
      continue;
    }
    if (nome === "api" || nome.startsWith("_")) continue;
    // (grupos) não aparecem na URL; [dinâmicos] precisam de id real — fora.
    const segmento = nome.startsWith("(") ? "" : nome.startsWith("[") ? null : `/${nome}`;
    if (segmento === null) continue;
    achados.push(...paginas(completo, prefixo + segmento));
  }
  return achados;
}

function rotas(dir = "app/api", prefixo = "/api") {
  const achados = [];
  for (const nome of readdirSync(dir)) {
    const completo = path.join(dir, nome);
    if (!statSync(completo).isDirectory()) {
      if (nome === "route.ts") {
        const fonte = readFileSync(completo, "utf8");
        achados.push({
          caminho: prefixo || "/api",
          metodos: ["GET", "POST", "PATCH", "PUT", "DELETE"].filter((m) => new RegExp(`export (async )?function ${m}\\b`).test(fonte)),
        });
      }
      continue;
    }
    if (nome.startsWith("[")) continue;
    achados.push(...rotas(completo, `${prefixo}/${nome}`));
  }
  return achados;
}

// ── Usuário descartável, para não mexer em conta real ──────────────────────
const marca = `varredura-${process.pid}`;
const email = `smoke-${marca}@atlas-teste.local`;
const senha = `Vr!${process.pid}#Atlas2026`;
const papel = process.argv[2] || "director";

const { data: org } = await admin.from("organizations").select("id").limit(1).single();
const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
  email, password: senha, email_confirm: true,
  app_metadata: { access_role: papel, organization_id: org.id },
});
if (erroCriar) { console.error("Não criou o usuário de teste:", erroCriar.message); process.exit(2); }
/**
 * O gatilho `handle_new_auth_user` já cria o perfil — INATIVO, porque
 * `active = primeiro_perfil` e esta organização já tem gente. E a hierarquia
 * (`validate_commercial_hierarchy`) exige `access_role` E `commercial_role`
 * juntos: mandar só um levanta `rbac_role_required` e o update é descartado em
 * silêncio, deixando o usuário inativo — foi o que aconteceu na primeira
 * rodada e produziu 7 falsos positivos.
 *
 * Executivo (`admin`/`director_decisor`) é o único papel que dispensa
 * supervisor. Por isso a varredura roda como diretor: qualquer outro exigiria
 * montar uma cadeia inteira só para testar telas.
 */
const { error: erroPerfil } = await admin.from("profiles").update({
  full_name: "VARREDURA (apagar)",
  role: "admin", access_role: "admin", commercial_role: "director",
  reports_to: null, active: true,
}).eq("id", criado.user.id);
if (erroPerfil) {
  console.error("Não ativou o perfil de teste:", erroPerfil.message);
  await admin.auth.admin.deleteUser(criado.user.id);
  process.exit(2);
}

async function limpar() {
  await admin.from("profiles").delete().eq("id", criado.user.id);
  await admin.auth.admin.deleteUser(criado.user.id);
}

const { data: sessao, error: erroLogin } = await anon.auth.signInWithPassword({ email, password: senha });
if (erroLogin) { console.error("Login falhou:", erroLogin.message); await limpar(); process.exit(2); }
const TOKEN = sessao.session.access_token;
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const COOKIE = `sb-${ref}-auth-token=${encodeURIComponent("base64-" + Buffer.from(JSON.stringify(sessao.session)).toString("base64"))}`;

console.log(`\nVarredura como ${papel} · ${BASE}\n`);

/**
 * Prazo por chamada.
 *
 * Sem isto uma única rota pendurada trava a varredura inteira e não se descobre
 * nem qual foi — que foi o que aconteceu na primeira tentativa. Pendurar É
 * falha: o corretor olhando a tela vê exatamente isso, uma página que nunca
 * carrega.
 */
const PRAZO_MS = 20_000;
const buscar = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(PRAZO_MS) });

/** A fronteira de erro do Next renderiza estas frases no lugar do conteúdo. */
const TELA_QUEBRADA = /Application error|client-side exception|Internal Server Error|Unhandled Runtime Error|__next_error__/i;

const falhas = [];
/** Recusas corretas por falta de configuração — informam, não reprovam. */
const pendentes = [];
// Saída incremental: uma varredura de 400 chamadas que só fala no fim é uma
// varredura que ninguem consegue interromper com informacao na mao.
function anota(tipo, alvo, motivo) {
  falhas.push({ tipo, alvo, motivo });
  console.log(`  ✘ [${tipo}] ${alvo} — ${motivo}`);
}
let okPaginas = 0, okRotas = 0;

// ── Páginas ────────────────────────────────────────────────────────────────
const listaPaginas = [...new Set(paginas())].sort();
console.log(`Páginas: ${listaPaginas.length}`);
for (const p of listaPaginas) {
  try {
    const r = await buscar(`${BASE}${p}`, { headers: { Cookie: COOKIE }, redirect: "manual" });
    if (r.status >= 500) { anota("página", p, `HTTP ${r.status}`); continue; }
    if (r.status === 200) {
      const corpo = await r.text();
      if (TELA_QUEBRADA.test(corpo)) { anota("página", p, "renderizou fronteira de erro (200 mentiroso)"); continue; }
      if (corpo.length < 800) { anota("página", p, `corpo de ${corpo.length} bytes — página vazia?`); continue; }
    }
    okPaginas++;
  } catch (e) {
    anota("página", p, `não respondeu: ${e.message}`);
  }
}
console.log(`  ${okPaginas} ok · ${falhas.filter((f) => f.tipo === "página").length} com problema`);

// ── Rotas ──────────────────────────────────────────────────────────────────
const listaRotas = rotas();
const testaveis = listaRotas.filter((r) => !PROIBIDO.test(r.caminho));
const puladas = listaRotas.length - testaveis.length;
console.log(`\nRotas: ${listaRotas.length} (${puladas} puladas por agirem fora do CRM)`);

for (const rota of testaveis) {
  for (const metodo of rota.metodos) {
    // Métodos que gravam são chamados com corpo vazio de propósito: o que se
    // mede é se a rota RECUSA sem cair. Rota que age com `{}` é o defeito.
    if (metodo === "DELETE") continue;
    try {
      const r = await buscar(`${BASE}${rota.caminho}`, {
        method: metodo,
        headers: { Cookie: COOKIE, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: metodo === "GET" ? undefined : "{}",
      });
      if (r.status >= 500) {
        const corpo = await r.text().catch(() => "");
        // ── DEFEITO vs. NÃO CONFIGURADO ────────────────────────────────────
        //
        // 502/503 com código nomeado e mensagem que diz o que falta não é
        // defeito: é a rota recusando direito porque a chave da OpenAI, a
        // tabela de preços ou a ponte de WhatsApp não existem NESTE servidor.
        //
        // Misturar as duas coisas faz a varredura gritar sempre — e varredura
        // que grita sempre ninguém lê. 500 continua sendo defeito sem apelo:
        // significa que a rota caiu em vez de recusar.
        const naoConfigurado = r.status !== 500
          && /NOT_CONFIGURED|NAO_CONFIGURAD|bridge disabled|_TEST_FAILED|disabled/i.test(corpo);
        if (naoConfigurado) {
          pendentes.push({ alvo: `${metodo} ${rota.caminho}`, motivo: (corpo.match(/"code":"([A-Z_]+)"/)?.[1]) || `HTTP ${r.status}` });
          continue;
        }
        anota("rota", `${metodo} ${rota.caminho}`, `HTTP ${r.status} ${corpo.slice(0, 160)}`);
        continue;
      }
      okRotas++;
    } catch (e) {
      anota("rota", `${metodo} ${rota.caminho}`, `não respondeu: ${e.message}`);
    }
  }
}
console.log(`  ${okRotas} ok · ${falhas.filter((f) => f.tipo === "rota").length} com problema`);

await limpar();

console.log(`\n${"─".repeat(70)}`);
if (pendentes.length) {
  console.log(`\n${pendentes.length} rota(s) aguardando CONFIGURAÇÃO (recusaram direito, não são defeito):`);
  for (const p of pendentes) console.log(`  · ${p.alvo} — ${p.motivo}`);
  console.log("");
}
if (!falhas.length) {
  console.log(`TUDO VERDE como ${papel}: ${okPaginas} páginas, ${okRotas} chamadas de rota, 0 quedas.`);
} else {
  console.log(`${falhas.length} PROBLEMA(S) como ${papel}:\n`);
  for (const f of falhas) console.log(`  [${f.tipo}] ${f.alvo}\n      ${f.motivo}`);
}
process.exit(falhas.length ? 1 : 0);
