#!/usr/bin/env node
/**
 * O AMBIENTE DIZ A VERDADE SOBRE QUAL AMBIENTE ELE É?
 *
 * ── O DEFEITO QUE ISTO PEGA ─────────────────────────────────────────────────
 *
 * Medido em 2026-07-30, no `.env.local` desta máquina:
 *
 *   ATLAS_ENV            = production
 *   ATLAS_BASE_URL       = https://atlasaios.com.br     (produção)
 *   NEXT_PUBLIC_APP_URL  = https://atlasaios.com.br     (produção)
 *   banco                = pozbrcsfthnhmnebfoxv         (atlas-v3-homologacao)
 *
 * O ambiente se declara PRODUÇÃO, aponta a URL para PRODUÇÃO, e aponta o banco
 * para HOMOLOGAÇÃO. Três verdades sobre o mesmo fato, e duas delas erradas.
 *
 * O que isso estraga, medido:
 *
 * · `npm run test:real` = release:check + smoke:all + routes:real +
 *   preflight:production. Os três últimos leem `ATLAS_BASE_URL`. Então o teste
 *   ponta a ponta faz smoke na URL de PRODUÇÃO e valida contra o banco de
 *   HOMOLOGAÇÃO — e APROVA. É um teste que não pode reprovar pelo motivo certo.
 * · `preflight-production.mjs:60` já confere que ATLAS_BASE_URL e
 *   NEXT_PUBLIC_APP_URL são iguais. Elas são. A checagem passa e a incoerência
 *   sobrevive, porque ninguém compara a URL com o BANCO.
 * · Todo código que ramifica em `ATLAS_ENV === "production"` roda comportamento
 *   de produção sobre dado de homologação. Concretamente:
 *   `lib/security/api-auth.ts` só aplica o fallback de organização quando
 *   `ATLAS_ENV === "homologation"` — logo, aqui ele está DESLIGADO, e um usuário
 *   sem organização vinculada é recusado como se estivéssemos em produção.
 * · Foi por isso que `database:connection:check` caiu na quarentena: ele para no
 *   crivo de rótulo de ambiente antes de tentar conectar.
 *
 * ── POR QUE ESTE PORTÃO E NÃO UMA CORREÇÃO DIRETA ───────────────────────────
 *
 * Trocar `ATLAS_ENV` para `homologation` no `.env.local` conserta a máquina de
 * hoje e não impede a próxima incoerência — que virá no dia do deploy, quando
 * alguém copiar um `.env` e trocar metade das linhas. O `.env.local` é ambiente
 * do dono; eu não o edito. O portão, sim, é meu: ele recusa a mistura de onde
 * quer que ela venha, e diz qual das três verdades está fora.
 */

import { readFileSync, existsSync } from "node:fs";

const declaracao = JSON.parse(readFileSync("config/supabase-projetos.json", "utf8"));

/** Lê uma variável do ambiente do processo OU do .env.local, sem imprimir segredo. */
function ler(chave) {
  if (process.env[chave]) return process.env[chave].trim();
  if (!existsSync(".env.local")) return "";
  const env = readFileSync(".env.local", "utf8");
  const achado = env.match(new RegExp(`^${chave}=(.*)$`, "m"));
  return achado ? achado[1].trim() : "";
}

/** O ref do projeto Supabase mora dentro da URL. Só o ref sai daqui — nunca a chave. */
function refDoProjeto(url) {
  const achado = String(url).match(/https:\/\/([a-z]{20})\.supabase\.co/);
  return achado ? achado[1] : null;
}

const atlasEnv = ler("ATLAS_ENV") || "(ausente)";
const baseUrl = (ler("ATLAS_BASE_URL") || "").replace(/\/$/, "");
const appUrl = (ler("NEXT_PUBLIC_APP_URL") || "").replace(/\/$/, "");
const refDoBanco = refDoProjeto(ler("NEXT_PUBLIC_SUPABASE_URL"));

const falhas = [];
const nomeDoRef = (ref) =>
  ref === declaracao.canonico.ref
    ? declaracao.canonico.nome
    : declaracao.aposentados.find((p) => p.ref === ref)?.nome ?? "projeto desconhecido";

const ambiente = declaracao.ambientes.find((a) => a.atlasEnv === atlasEnv);

if (!ambiente) {
  falhas.push(
    `ATLAS_ENV="${atlasEnv}" não está declarado em config/supabase-projetos.json. ` +
      `Ambientes conhecidos: ${declaracao.ambientes.map((a) => a.atlasEnv).join(", ")}.`,
  );
} else {
  // 1. O banco pertence a este ambiente?
  if (ambiente.supabaseRef === null) {
    falhas.push(
      `ATLAS_ENV="${atlasEnv}" não tem projeto Supabase conhecido por este repositório ` +
        `(supabaseRef: null). Declarar este ambiente aqui é sempre incoerente: ` +
        `o banco configurado é ${refDoBanco} (${nomeDoRef(refDoBanco)}).`,
    );
  } else if (refDoBanco !== ambiente.supabaseRef) {
    falhas.push(
      `ATLAS_ENV="${atlasEnv}" espera o banco ${ambiente.supabaseRef} ` +
        `(${nomeDoRef(ambiente.supabaseRef)}) e o configurado é ${refDoBanco} ` +
        `(${nomeDoRef(refDoBanco)}). Testar uma coisa e medir outra aprova sem provar.`,
    );
  }

  // 2. A URL pertence a este ambiente?
  for (const [nome, valor] of [
    ["ATLAS_BASE_URL", baseUrl],
    ["NEXT_PUBLIC_APP_URL", appUrl],
  ]) {
    if (!valor) {
      falhas.push(`${nome} está vazia — os smokes cairiam no localhost por omissão, sem avisar.`);
      continue;
    }
    if (!ambiente.urlsPermitidas.includes(valor)) {
      falhas.push(
        `${nome}="${valor}" não pertence a ATLAS_ENV="${atlasEnv}". ` +
          `Permitidas: ${ambiente.urlsPermitidas.join(", ")}. ` +
          `É esta a mistura que faz \`test:real\` fazer smoke num deploy e validar contra outro banco.`,
      );
    }
  }
}

// 3. As duas URLs entre si. `preflight-production.mjs` já confere isto, e de
//    propósito repetimos: aqui a falha vem NOMEADA junto com as outras duas, e é
//    a combinação que engana — lá ela passa sozinha e parece que está tudo certo.
if (baseUrl && appUrl && baseUrl !== appUrl) {
  falhas.push(`ATLAS_BASE_URL="${baseUrl}" e NEXT_PUBLIC_APP_URL="${appUrl}" divergem.`);
}

// 4. O banco configurado não pode ser um projeto aposentado, em nenhum ambiente.
const aposentado = declaracao.aposentados.find((p) => p.ref === refDoBanco);
if (aposentado) {
  falhas.push(
    `o banco configurado é ${refDoBanco} (${aposentado.nome}), que está APOSENTADO e tem ` +
      `${aposentado.leads} leads reais. ${aposentado.decisaoPendente}`,
  );
}

console.log("COERÊNCIA DE AMBIENTE");
console.log(`  ATLAS_ENV .......... ${atlasEnv}`);
console.log(`  ATLAS_BASE_URL ..... ${baseUrl || "(vazia)"}`);
console.log(`  NEXT_PUBLIC_APP_URL  ${appUrl || "(vazia)"}`);
console.log(`  banco .............. ${refDoBanco ?? "(não identificado)"} (${nomeDoRef(refDoBanco)})`);
console.log();

if (falhas.length) {
  console.error(`REPROVADO — ${falhas.length} incoerência(s):`);
  for (const f of falhas) console.error(`  ✗ ${f}`);
  console.error(
    "\nEnquanto isto não fechar, `npm run test:real` não prova nada: ele mede um" +
      "\nambiente e valida contra outro. Corrija no ambiente (.env), não afrouxando" +
      "\neste portão — ele é a única coisa que compara as TRÊS verdades.",
  );
  process.exit(1);
}

console.log("Aprovado: ambiente, URL e banco concordam.");
