/**
 * PROVA DO MOTOR — o botão "Distribuir" honra a fila de atendimento?
 *
 * A prova anterior (`prova-fila-de-atendimento.mjs`) cobre a fila: montar,
 * ordenar, tirar. Esta cobre a pergunta seguinte, que é a que decide se a fila
 * significa alguma coisa: quando a liderança clica em distribuir, a lead vai
 * para quem é a vez?
 *
 * ── O defeito que motivou este arquivo ──────────────────────────────────────
 *
 * `distribute_project_leads_v3` começa recusando qualquer empreendimento que não
 * esteja em `developments`, e a tela mandava id de `crm_projects`. Toda
 * distribuição feita por aquela página era recusada pelo banco e traduzida para
 * um 409 genérico — os dois botões principais nunca funcionaram. O primeiro caso
 * abaixo trava exatamente isso.
 *
 * ── O QUE ESTE ARQUIVO CRIA E APAGA ─────────────────────────────────────────
 *
 * Cria um diretor, dois corretores, presença comercial para eles, uma fila e
 * três leads num empreendimento real. Apaga TUDO no `finally`, na ordem inversa
 * das dependências. Distribuição mexe em carteira de gente; leftover aqui é lead
 * de teste na fila de um corretor de verdade.
 *
 *   node --env-file=.env.local scripts/prova-motor-da-fila.mjs
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, bad = 0;
const t = (condicao, texto, detalhe = "") => {
  if (condicao) { ok++; console.log("  ✔ " + texto); }
  else { bad++; console.log("  ✘ " + texto + (detalhe ? "\n      " + detalhe : "")); }
};

// Empreendimento SEM leads, para que a distribuição só encontre as de prova.
const { data: candidatos } = await admin.from("developments").select("id,name,organization_id");
const { data: comLead } = await admin.from("leads").select("development_id").not("development_id", "is", null);
const ocupados = new Set((comLead ?? []).map((l) => String(l.development_id)));
const alvo = (candidatos ?? []).find((d) => !ocupados.has(String(d.id))) ?? (candidatos ?? [])[0];
if (!alvo) { console.log("Sem empreendimento para provar."); process.exit(1); }
const ORG = alvo.organization_id;
const DEV = alvo.id;

const { data: crmProjeto } = await admin.from("crm_projects").select("id").eq("organization_id", ORG).limit(1).maybeSingle();

const criados = { usuarios: [], leads: [] };

/**
 * A CADEIA QUE O RBAC EXIGE — três níveis, nem um a menos.
 *
 * `private.validate_commercial_hierarchy` recusa qualquer perfil ATIVO fora
 * destas três formas, e a recusa é por exceção no upsert:
 *
 *   director_decisor → commercial_role 'director', SEM supervisor (raiz)
 *   director ........ → commercial_role 'manager',  supervisor director_decisor
 *   broker .......... → commercial_role 'broker',   supervisor director
 *
 * Um corretor pendurado direto no diretor-decisor levanta
 * `broker_requires_operational_director`; sem supervisor nenhum,
 * `valid_supervisor_required`.
 *
 * E o erro precisa DERRUBAR o script. A primeira versão deste arquivo ignorava
 * `up.error`: o perfil ficava inativo (perfil novo nasce assim), o motor não
 * achava candidato, e as onze asserções seguintes falhavam apontando para o
 * rodízio — que estava certo. Fixture que falha calado transforma um erro de
 * montagem em onze acusações falsas contra o código sob teste.
 */
async function criarPerfil(rotulo, { acesso, comercial, chefe = null }) {
  const email = `prova-motor-${rotulo}-${Date.now()}@atlas-teste.local`;
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: `Prova!M0tor#${rotulo}`, email_confirm: true });
  if (error) throw new Error(`não criou o usuário ${rotulo}: ${error.message}`);
  criados.usuarios.push(u.user.id);
  const { error: erroPerfil } = await admin.from("profiles").upsert({
    id: u.user.id, name: rotulo, full_name: rotulo, email, organization_id: ORG,
    role: comercial === "broker" ? "CORRETOR" : "admin",
    access_role: acesso, commercial_role: comercial, reports_to: chefe,
    active: true, availability_status: "AVAILABLE",
  });
  if (erroPerfil) throw new Error(`perfil ${rotulo} recusado pelo RBAC: ${erroPerfil.message}`);
  const { data: gravado } = await admin.from("profiles").select("active,commercial_role").eq("id", u.user.id).maybeSingle();
  if (!gravado?.active) throw new Error(`perfil ${rotulo} ficou INATIVO — o motor não o veria e a prova acusaria o rodízio à toa`);
  return u.user.id;
}

async function darPresenca(profileId) {
  await admin.from("commercial_presence").upsert({
    profile_id: profileId, organization_id: ORG,
    availability: "available", last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "profile_id" });
}

async function criarLead(nome) {
  const { data, error } = await admin.from("leads").insert({
    organization_id: ORG, name: nome, development_id: DEV,
    source: "prova_motor", status: "novo", created_at: new Date(Date.now() - 60_000).toISOString(),
  }).select("id").single();
  if (error) throw error;
  criados.leads.push(data.id);
  return data.id;
}

const distribuir = (actor, developmentId, limite = 1) =>
  admin.rpc("distribute_project_leads_v5", {
    p_actor_id: actor, p_organization_id: ORG, p_development_id: developmentId,
    p_limit: limite, p_acceptance_minutes: 5,
  });

const donoDe = async (leadId) => {
  const { data } = await admin.from("leads").select("assigned_to,assigned_user_id").eq("id", leadId).maybeSingle();
  return data;
};

try {
  console.log(`\nempreendimento de prova: ${alvo.name}\n`);

  const diretor = await criarPerfil("diretor", { acesso: "director_decisor", comercial: "director" });
  const gerente = await criarPerfil("gerente", { acesso: "director", comercial: "manager", chefe: diretor });
  const ana = await criarPerfil("ana", { acesso: "broker", comercial: "broker", chefe: gerente });
  const bru = await criarPerfil("bru", { acesso: "broker", comercial: "broker", chefe: gerente });
  await Promise.all([darPresenca(diretor), darPresenca(gerente), darPresenca(ana), darPresenca(bru)]);
  const nomes = { [ana]: "ana", [bru]: "bru", [gerente]: "gerente", [diretor]: "diretor" };

  console.log("── o id da tabela errada é recusado, e diz qual é o problema ──");
  if (crmProjeto?.id) {
    const recusa = await distribuir(diretor, crmProjeto.id);
    t(Boolean(recusa.error) && String(recusa.error.message).includes("distribution_project_invalid"),
      "id de crm_projects é recusado com causa nomeada — era daqui que vinha o 409 de toda distribuição",
      String(recusa.error?.message ?? "não recusou"));
  } else {
    console.log("  (sem linha em crm_projects para testar)");
  }

  console.log("\n── sem fila montada: menor carga, como sempre ──");
  const lead1 = await criarLead("Prova Motor 1");
  const semFila = await distribuir(diretor, DEV);
  t(!semFila.error, "distribui sem erro", String(semFila.error?.message ?? ""));
  t(semFila.data?.distributed === 1, `distribuiu 1 (veio ${semFila.data?.distributed})`);
  const dono1 = await donoDe(lead1);
  t(Boolean(dono1?.assigned_to), "a lead ficou com dono");
  t(dono1?.assigned_to === dono1?.assigned_user_id && Boolean(dono1?.assigned_user_id),
    "as DUAS colunas de dono foram gravadas — sem isso a lead fica órfã em metade das telas",
    `assigned_to=${dono1?.assigned_to} assigned_user_id=${dono1?.assigned_user_id}`);

  console.log("\n── com fila montada: só o elenco entra ──");
  // Só `bru` na fila. `ana` está livre e disponível — e é por isso que este caso
  // existe: sem o elenco chegar ao motor, ela poderia receber.
  await admin.from("distribution_roster").insert({
    organization_id: ORG, escopo: "projeto", escopo_id: DEV, profile_id: bru, ativo: true, posicao: 1,
  });
  const lead2 = await criarLead("Prova Motor 2");
  const comFila = await distribuir(diretor, DEV);
  t(!comFila.error, "distribui com fila montada", String(comFila.error?.message ?? ""));
  const dono2 = await donoDe(lead2);
  t(dono2?.assigned_to === bru, `a lead foi para quem está na fila (${nomes[dono2?.assigned_to] ?? dono2?.assigned_to})`);

  console.log("\n── o rodízio gira: a vez passa para o próximo ──");
  await admin.from("distribution_roster").insert({
    organization_id: ORG, escopo: "projeto", escopo_id: DEV, profile_id: ana, ativo: true, posicao: 2,
  });
  const lead3 = await criarLead("Prova Motor 3");
  const girou = await distribuir(diretor, DEV);
  t(!girou.error, "distribui de novo", String(girou.error?.message ?? ""));
  const dono3 = await donoDe(lead3);
  t(dono3?.assigned_to === ana,
    `bru recebeu por último, então a vez foi de ana (foi para ${nomes[dono3?.assigned_to] ?? dono3?.assigned_to})`,
    "se cair em bru, o ponteiro do rodízio não está lendo lead_distribution_history");

  console.log("\n── o ponteiro tem UMA casa, e o motor escreve nela ──");
  const { data: historico } = await admin.from("lead_distribution_history")
    .select("lead_id,assigned_user_id,reason").in("lead_id", [lead2, lead3]);
  t((historico ?? []).length === 2,
    `as duas distribuições da fila entraram em lead_distribution_history (${(historico ?? []).length}/2)`,
    "sem isto o rodízio não teria como saber quem recebeu por último");
  t((historico ?? []).some((h) => String(h.reason).includes("rodízio")),
    "o motivo escrito diz que foi rodízio, não carga");
  const { data: eventos } = await admin.from("lead_distribution_events")
    .select("lead_id,algorithm,score_snapshot").in("lead_id", [lead2, lead3]);
  t((eventos ?? []).length === 2, "e o livro de evidência também recebeu as duas");
  // `.every()` sobre lista vazia é `true`: sem exigir o tamanho, estas duas
  // passariam justamente quando o motor não gravou nada.
  t((eventos ?? []).length === 2 && eventos.every((e) => e.score_snapshot?.rosterScope === "projeto"),
    "cada evidência registra QUAL elenco decidiu");
  t((eventos ?? []).length === 2 && eventos.every((e) => typeof e.score_snapshot?.queuePosition === "number"),
    "e a posição na fila de quem recebeu");

  console.log("\n── fila existe e ninguém dela pode atender ──");
  // `bru` e `ana` saem da janela de presença; a fila continua montada com elas.
  await admin.from("commercial_presence").update({ last_seen_at: new Date(Date.now() - 10 * 60_000).toISOString() })
    .in("profile_id", [ana, bru]);
  const lead4 = await criarLead("Prova Motor 4");
  const travada = await distribuir(diretor, DEV);
  t(Boolean(travada.error) && String(travada.error.message).includes("distribution_roster_unavailable"),
    "recusa com causa PRÓPRIA — a lead não cai para quem foi deixado fora da fila",
    String(travada.error?.message ?? "não recusou"));
  const dono4 = await donoDe(lead4);
  t(!dono4?.assigned_to, "e a lead continua sem dono, em vez de ir para qualquer um");

  console.log("\n── acervo de resgate não é empurrado como demanda nova ──");
  await admin.from("commercial_presence").update({ last_seen_at: new Date().toISOString() }).in("profile_id", [ana, bru]);
  const { data: acervo } = await admin.from("leads").insert({
    organization_id: ORG, name: "Prova Motor Acervo", development_id: DEV,
    source: "prova_motor", status: "novo", import_batch_id: "00000000-0000-0000-0000-000000000000",
  }).select("id").single().then((r) => r, () => ({ data: null }));
  if (acervo?.id) {
    criados.leads.push(acervo.id);
    // lead4 ainda está sem dono e é mais antiga; distribui as duas de uma vez.
    await distribuir(diretor, DEV, 5);
    const donoAcervo = await donoDe(acervo.id);
    t(!donoAcervo?.assigned_to, "a lead de acervo continua sem dono — ela tem balcão próprio");
  } else {
    console.log("  (import_batch_id exige lote existente nesta base — caso pulado)");
  }
} finally {
  console.log("\n── limpeza ──");
  if (criados.leads.length) {
    await admin.from("lead_assignment_reservations").delete().in("lead_id", criados.leads);
    await admin.from("lead_distribution_events").delete().in("lead_id", criados.leads);
    await admin.from("lead_distribution_history").delete().in("lead_id", criados.leads);
    await admin.from("lead_events").delete().in("lead_id", criados.leads);
    await admin.from("leads").delete().in("id", criados.leads);
  }
  await admin.from("distribution_roster").delete().eq("organization_id", ORG).eq("escopo", "projeto").eq("escopo_id", DEV);
  if (criados.usuarios.length) {
    await admin.from("project_distribution_members").delete().in("profile_id", criados.usuarios);
    await admin.from("commercial_presence").delete().in("profile_id", criados.usuarios);
    await admin.from("profiles").delete().in("id", criados.usuarios);
    for (const id of criados.usuarios) await admin.auth.admin.deleteUser(id);
  }
  const { count: leadsSobrando } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("source", "prova_motor");
  const { count: elencoSobrando } = await admin.from("distribution_roster").select("id", { count: "exact", head: true }).eq("escopo_id", DEV);
  console.log(`leads de prova sobrando: ${leadsSobrando ?? 0} · linhas de elenco sobrando: ${elencoSobrando ?? 0}`);
}

console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
