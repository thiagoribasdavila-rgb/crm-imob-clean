#!/usr/bin/env node
/**
 * NENHUMA RPC DEIXA O CHAMADOR DIZER QUEM ELE É.
 *
 * ── A REGRESSÃO QUE ISTO EXISTE PARA IMPEDIR ────────────────────────────────
 *
 * Medido em produção em 2026-07-30: `public.distribute_project_leads` é
 * SECURITY DEFINER (atravessa a RLS), tinha EXECUTE concedido a `authenticated`,
 * e conferia se `p_actor_id` era de um diretor — sem nunca comparar esse UUID com
 * `auth.uid()`. Quem chamava dizia quem era.
 *
 * Reproduzido como `authenticated`, com auth.uid() de um corretor real:
 *
 *   CONTROLE (próprio uuid) ..... RECUSADO "Perfil sem permissão para distribuir leads."
 *   ATAQUE  (uuid do diretor) ... PASSOU
 *
 * E foi REGRESSÃO VERSIONADA, não descuido original:
 *
 *   20260716234729:209  revoke ... from public, anon, authenticated;   ← correto
 *   20260722080000:310  revoke ... from public, anon;                  ← 6 dias depois
 *   20260722080000:311  grant  ... to authenticated, service_role;     ← reabriu
 *
 * Nenhum dos 220 portões existentes pegou, porque nenhum olhava para GRANT de
 * função. Este olha.
 *
 * ── O QUE ELE VERIFICA, E POR QUE ESTE RECORTE ─────────────────────────────
 *
 * A regra não é "nenhuma função pode ter EXECUTE". É mais estreita e mais forte:
 *
 *   função SECURITY DEFINER
 *   + executável por `authenticated` ou `anon`
 *   + recebe IDENTIDADE ou ORGANIZAÇÃO como PARÂMETRO
 *   + NÃO cita `auth.uid()` no corpo
 *   = o chamador declara quem é
 *
 * Função sem parâmetro que deriva tudo da sessão (`current_organization_id()`) é
 * o desenho CERTO e passa. Função que confere `auth.uid()` passa. O que reprova é
 * exatamente a combinação que produziu o buraco.
 *
 * Exige DATABASE_URL. Sem ela, sai com NÃO EXECUTADO — nunca verde por ausência.
 *
 *   node scripts/check-rpc-sem-escalacao.mjs
 */
import { execFileSync } from "node:child_process";

const URL_BANCO = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!URL_BANCO) {
  console.log("⚠ NÃO EXECUTADO — falta DATABASE_URL (ou SUPABASE_DB_URL).");
  console.log("  Verde por ausência de medição é pior que vermelho: este portão");
  console.log("  não afirma nada sem conseguir consultar o banco.");
  process.exit(0);
}

/** Parâmetros que carregam identidade ou tenancy. Se a função recebe um destes e
 *  não confere auth.uid(), quem chama escolhe de quem é a permissão. */
const PARAMETROS_DE_IDENTIDADE = ["p_actor_id", "p_user_id", "p_profile_id", "p_organization_id", "p_org_id", "p_tenant_id"];

const SQL = `
select p.proname as nome,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       (pg_get_functiondef(p.oid) ilike '%auth.uid()%') as confere,
       (pg_get_function_result(p.oid) = 'trigger') as eh_gatilho
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE'))
order by p.proname;
`;

let linhas;
try {
  const saida = execFileSync("psql", [URL_BANCO, "-At", "-F", "|", "-c", SQL], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  linhas = saida.split("\n").map((l) => l.trim()).filter(Boolean);
} catch (erro) {
  console.log(`⚠ NÃO EXECUTADO — psql falhou: ${erro.message.split("\n")[0]}`);
  process.exit(0);
}

const expostas = [];
for (const linha of linhas) {
  const [nome, args, authExec, anonExec, confere, ehGatilho] = linha.split("|");
  const recebeIdentidade = PARAMETROS_DE_IDENTIDADE.some((p) => (args || "").includes(p));
  const confereUid = confere === "t";
  const gatilho = ehGatilho === "t";

  // `anon` executando função SECURITY DEFINER é errado por definição, gatilho ou não.
  if (anonExec === "t") {
    expostas.push({ nome, args, motivo: "executável por `anon`", gatilho });
    continue;
  }
  if (gatilho) continue; // gatilho não passa pelo EXECUTE de quem dispara
  if (authExec === "t" && recebeIdentidade && !confereUid) {
    expostas.push({ nome, args, motivo: "recebe identidade/organização por parâmetro e NÃO confere auth.uid()", gatilho });
  }
}

console.log(`funções SECURITY DEFINER alcançáveis por authenticated/anon: ${linhas.length}`);

if (expostas.length === 0) {
  console.log("✔ nenhuma função deixa o chamador declarar quem é");
  process.exit(0);
}

console.log(`\n✘ ${expostas.length} função(ões) permitem que o chamador escolha a identidade:\n`);
for (const f of expostas) {
  console.log(`  public.${f.nome}(${f.args})`);
  console.log(`      ${f.motivo}`);
}
console.log(
  "\nSECURITY DEFINER atravessa a RLS. Uma função que RECEBE o ator em vez de derivá-lo\n" +
    "da sessão aceita a palavra de quem chama — e o UUID de um diretor não é segredo:\n" +
    "`profiles` é legível por qualquer autenticado da organização.\n\n" +
    "Dois consertos legítimos:\n" +
    "  1. REVOKE EXECUTE ... FROM authenticated, anon, public;  (se a função é chamada\n" +
    "     por service_role, o GRANT é irrelevante e revogar não quebra nada);\n" +
    "  2. dentro da função:  if p_actor_id <> (select auth.uid()) then\n" +
    "                          raise exception 'ator_diferente_do_chamador'; end if;\n\n" +
    "Não afrouxe este portão para passar. Foi exatamente uma migration reconcedendo\n" +
    "EXECUTE, seis dias depois de outra revogar, que abriu o buraco original.",
);
process.exit(1);
