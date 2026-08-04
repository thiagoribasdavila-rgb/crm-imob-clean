/**
 * PROVA: a represa mostra as leads pagas que ainda não entraram.
 *
 * ── O que esta prova existe para impedir de voltar ─────────────────────────
 *
 * Em 03/08/2026, com 122 leads acumuladas na Página DA'Vila Consultoria e
 * apenas 20 eventos registrados no CRM, `/api/v1/marketing/held-leads`
 * respondia **200 OK com `totalRepresado: 0`**. A causa era ler a Página de
 * `process.env.META_PAGE_ID`, variável ausente no servidor. O diretor via zero
 * e não havia erro nenhum para investigar.
 *
 * Um contrato de unidade já trava a regra de resolução. Esta prova é outra
 * coisa: percorre a ROTA VIVA, autenticada, contra a Meta de verdade — porque
 * a pergunta "a variável existe no ambiente deste processo?" só o processo
 * responde, e foi exatamente essa pergunta que ninguém fez.
 *
 * NÃO importa lead nenhuma. Só LÊ. Liberar a represa dispara relógio de SLA e
 * continua sendo decisão da diretoria.
 *
 * Uso:  node scripts/prova-represa-nao-mente-zero.mjs
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const APP = process.env.TESTE_BASE_URL || "http://localhost:3000";
const ORG = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const marca = `represa-${Date.now()}`;
const criado = { usuario: null };
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✔" : "✘"} ${msg}`); if (!cond) falhas++; };

try {
  // ── 1. um diretor descartável ────────────────────────────────────────────
  // Descartável de propósito: usar uma conta real deixaria rastro de acesso no
  // histórico de alguém que não executou nada.
  const senha = crypto.randomBytes(24).toString("base64url");
  const email = `${marca}@atlas-teste.local`;
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(`createUser: ${e1.message}`);
  criado.usuario = u.user.id;

  // A represa é da diretoria: `podeLiberar` exige director/superintendent/admin.
  //
  // A TRÍADE tem de ser uma que a hierarquia aceite. `access_role: "director"`
  // com `role: "admin"` é recusado por `valid_supervisor_required` — combinação
  // que não existe na base. Esta é a forma dos 8 diretores reais desta
  // organização, e diretor é topo: `reports_to` fica nulo de propósito.
  const { error: e2 } = await admin.from("profiles").upsert({
    id: u.user.id, name: "Prova Represa", full_name: "Prova Represa", email, organization_id: ORG,
    role: "admin", access_role: "admin", commercial_role: "director", reports_to: null, active: true,
  });
  if (e2) throw new Error(`profile: ${e2.message}`);

  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(`login: ${e3.message}`);

  // ── 2. a rota viva, sem META_PAGE_ID no ambiente ─────────────────────────
  const resposta = await fetch(`${APP}/api/v1/marketing/held-leads`, {
    headers: { authorization: `Bearer ${sess.session.access_token}` },
  });
  const corpo = await resposta.json().catch(() => ({}));
  const dados = corpo?.data ?? corpo;

  ok(resposta.status === 200, `a rota responde 200 (veio ${resposta.status})`);
  ok(dados?.disponivel === true, `a represa está disponível — não "não sei" disfarçado de zero (motivo: ${dados?.motivo ?? "—"})`);

  // ── 3. O NÚMERO ──────────────────────────────────────────────────────────
  // O valor exato sobe conforme campanhas rodam; o que a prova trava é o zero.
  const total = Number(dados?.totalRepresado ?? 0);
  ok(total > 0, `há represa de verdade: ${total} lead(s) pagas fora do CRM`);
  ok(
    Number(dados?.formulariosComRepresa ?? 0) > 0,
    `${dados?.formulariosComRepresa ?? 0} formulário(s) com represa`,
  );

  // ── 4. cada linha precisa dizer o que a operação faz com ela ─────────────
  const linhas = Array.isArray(dados?.represadas) ? dados.represadas : [];
  const semNome = linhas.filter((l) => !l.formId).length;
  ok(semNome === 0, "toda linha traz o formId — sem ele não há o que liberar");

  const descartando = linhas.filter((l) => l.descartaLeadNova);
  ok(
    true,
    `${descartando.length} formulário(s) descartariam lead NOVA (sem fonte ativa)` +
      (descartando.length ? ` — ex.: ${descartando.slice(0, 3).map((l) => l.nome || l.formId).join(", ")}` : ""),
  );

  console.log("\n  as 6 maiores represas:");
  for (const l of linhas.slice(0, 6)) {
    console.log(
      `   ${String(l.represadas).padStart(4)} represadas | ${String(l.leadsNaMeta).padStart(4)} na Meta | ` +
        `${String(l.jaEntraram).padStart(3)} entraram | ${l.ativa ? "ativa " : "INATIVA"} | ${(l.nome || l.formId).slice(0, 40)}`,
    );
  }

  // ── 5. A ORIGEM DA PÁGINA, OBSERVADA — não deduzida ──────────────────────
  //
  // A primeira versão desta prova conferia `.env.local` e avisava que "não
  // separa banco de variável". Conferia o arquivo errado: o que decide é o que
  // o PROCESSO do servidor carregou, e nada garante que sejam iguais. Uma prova
  // que olha para a fonte errada é pior que nenhuma, porque passa.
  //
  // A rota agora declara `origemDaPagina`. Isto aqui é leitura, não inferência.
  const { data: fontes } = await admin
    .from("meta_lead_sources")
    .select("page_id")
    .eq("organization_id", ORG)
    .limit(1000);
  const paginasNoBanco = [...new Set((fontes ?? []).map((f) => String(f.page_id)))];

  ok(
    dados?.origemDaPagina === "fonte",
    `a Página veio do CADASTRO, não de variável de ambiente (origem: ${dados?.origemDaPagina ?? "—"})`,
  );
  ok(
    paginasNoBanco.includes(String(dados?.pageId)),
    `a Página respondida (${dados?.pageId}) é uma das registradas no banco: ${paginasNoBanco.join(", ")}`,
  );
  if (dados?.paginaAmbigua) {
    console.log(`  ⚠ ${dados.paginasRegistradas} Páginas registradas — houve escolha, e a tela precisa dizer isso.`);
  }
} catch (erro) {
  falhas += 1;
  console.error("✘ prova interrompida:", erro.message);
} finally {
  // ── 6. não deixar rastro ───────────────────────────────────────────────────
  if (criado.usuario) {
    await admin.from("profiles").delete().eq("id", criado.usuario);
    await admin.auth.admin.deleteUser(criado.usuario).catch(() => {});
    console.log("\n  usuário de prova removido");
  }
  console.log(falhas ? `\n✘ ${falhas} falha(s)` : "\n✔ represa provada");
  process.exit(falhas ? 1 : 0);
}
