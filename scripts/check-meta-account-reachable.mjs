#!/usr/bin/env node
/**
 * A CONTA DE ANÚNCIOS CONFIGURADA É ALCANÇÁVEL PELO TOKEN?
 *
 * ── Por que este portão existe ──────────────────────────────────────────────
 *
 * Durante meses o diagnóstico deste projeto foi "falta `ads_management`, está
 * esperando App Review". Estava errado. A permissão sempre esteve concedida; o
 * `META_AD_ACCOUNT_ID` é que apontava para uma conta que o token não alcança.
 *
 * A Meta responde a isso com uma mensagem que empurra para o lado errado:
 *
 *   (#200) Ad account owner has NOT grant ads_management or ads_read permission
 *
 * Lendo isso, qualquer pessoa vai conferir permissões — e as permissões estão
 * todas lá. Ninguém pensa em conferir se o ID da conta é de uma conta que o
 * token enxerga, porque o erro não fala disso.
 *
 * Este portão fala. Lista as contas que o token REALMENTE alcança e diz se a
 * configurada está entre elas.
 *
 * Rodar: npm run meta:conta
 */

import fs from "node:fs";
import path from "node:path";

const V = "v23.0";
const raiz = path.resolve(import.meta.dirname, "..");

// Carrega .env.local para uso local; em produção as variáveis já estão no ambiente.
for (const arquivo of [".env.local", ".env"]) {
  const caminho = path.join(raiz, arquivo);
  if (!fs.existsSync(caminho)) continue;
  for (const linha of fs.readFileSync(caminho, "utf8").split("\n")) {
    const m = linha.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const CONTA = process.env.META_AD_ACCOUNT_ID;

/** Mostra o suficiente para reconhecer, nunca o valor inteiro. */
const mascarar = (v) => (!v ? "—" : `${String(v).slice(0, 8)}…${String(v).slice(-3)}`);

if (!TOKEN || !CONTA) {
  console.log("⏭️  META_ADS_ACCESS_TOKEN ou META_AD_ACCOUNT_ID ausentes — nada a conferir.");
  console.log("    (não é falha: quem não usa a Meta não precisa configurar)");
  process.exit(0);
}

const graph = async (caminho) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${caminho}`);
  return { status: r.status, corpo: await r.json() };
};

const separador = "─".repeat(70);
console.log(`\nCONTA DE ANÚNCIOS META\n${separador}`);
console.log(`  configurada: ${mascarar(CONTA)}`);

const { status, corpo } = await graph(
  `me/adaccounts?fields=account_id,name,account_status&limit=50&access_token=${TOKEN}`,
);

if (status !== 200) {
  console.error(`\n❌ O token não conseguiu listar contas: ${corpo?.error?.message ?? status}`);
  console.error("   Isso sim é problema de token ou de permissão.");
  process.exit(1);
}

const contas = corpo.data ?? [];
const alcancaveis = contas.map((c) => `act_${c.account_id}`);
const encontrada = alcancaveis.includes(CONTA);

console.log(`  o token alcança ${contas.length} conta(s):`);
for (const c of contas) {
  const id = `act_${c.account_id}`;
  const ativa = c.account_status === 1 ? "ativa" : `status ${c.account_status}`;
  console.log(`    ${id === CONTA ? "→" : " "} ${id}  ${c.name} (${ativa})`);
}

if (encontrada) {
  console.log(`\n✅ A conta configurada está entre as alcançáveis.\n`);
  process.exit(0);
}

console.error(`
❌ A CONTA CONFIGURADA NÃO ESTÁ ENTRE AS QUE O TOKEN ALCANÇA.

   Toda chamada à conta vai voltar com:
     (#200) Ad account owner has NOT grant ads_management or ads_read permission

   Essa mensagem manda conferir permissões — e as permissões podem estar todas
   concedidas. O problema é o ID, não a permissão.

   Para resolver, escolha uma das contas listadas acima e ponha em
   META_AD_ACCOUNT_ID (com o prefixo act_), OU dê acesso à conta atual para o
   usuário de sistema deste token no Gerenciador de Negócios.
`);
process.exit(1);
