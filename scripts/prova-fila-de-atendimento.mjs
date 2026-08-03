/**
 * PROVA DA FILA DE ATENDIMENTO — contra o banco vivo, pela rota real.
 *
 * Os contratos provam a REGRA (rodízio puro) e o MOTOR (cascata com Supabase de
 * mentira). Falta o que nenhum dos dois alcança: se a rota grava mesmo, se a
 * ordem sobrevive à ida e volta do banco, e se o volume de leads que a tela
 * mostra ao lado de cada campanha bate com o que a organização de fato tem.
 *
 * Cria um usuário descartável, monta uma fila num escopo real, mexe nela e
 * DESFAZ tudo no `finally` — inclusive as linhas de `distribution_roster`, que
 * não podem sobrar: linha esquecida aqui é elenco fantasma restringindo a
 * distribuição de verdade amanhã.
 *
 *   node --env-file=.env.local scripts/prova-fila-de-atendimento.mjs
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const APP = env.PROVA_APP_URL || "http://127.0.0.1:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, bad = 0;
const t = (condicao, texto, detalhe = "") => {
  if (condicao) { ok++; console.log("  ✔ " + texto); }
  else { bad++; console.log("  ✘ " + texto + (detalhe ? "\n      " + detalhe : "")); }
};

const { data: empreendimentos } = await admin.from("developments").select("id,name,organization_id").limit(1);
if (!empreendimentos?.length) { console.log("Sem empreendimento para provar."); process.exit(1); }
const org = empreendimentos[0].organization_id;
const ESCOPO_ID = empreendimentos[0].id;

const email = `prova-fila-${Date.now()}@atlas-teste.local`;
const senha = "Prova!F1la#Atend";
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
await admin.from("profiles").upsert({
  id: u.user.id, name: "Prova Fila", full_name: "Prova Fila", email,
  organization_id: org, role: "admin", access_role: "admin", commercial_role: "director", active: true,
});
const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s } = await pub.auth.signInWithPassword({ email, password: senha });
const H = { authorization: `Bearer ${s.session.access_token}`, "content-type": "application/json" };

const ROTA = `${APP}/api/v1/crm/elenco-de-distribuicao`;
const ler = async (busca = "") => (await fetch(`${ROTA}${busca}`, { headers: H })).json();
const escrever = async (corpo) => (await fetch(ROTA, { method: "POST", headers: H, body: JSON.stringify(corpo) })).json();

const tocados = [];
/** O vínculo que a campanha tinha antes da prova, para devolver no `finally`. */
let vinculoOriginal = null;

try {
  console.log(`\nempreendimento de prova: ${empreendimentos[0].name}\n`);

  console.log("── o contexto que a tela desenha ──");
  const contexto = await ler("?contexto=1");
  t(contexto?.ok === true, "a rota responde o contexto", JSON.stringify(contexto?.error ?? {}));
  const corretores = contexto?.data?.contexto?.corretores ?? [];
  const escopos = contexto?.data?.contexto?.escopos ?? [];
  t(corretores.length > 0, `traz os corretores da organização (${corretores.length})`);
  t(escopos.some((e) => e.escopo === "projeto"), "traz empreendimentos como escopo");
  t(escopos.some((e) => e.escopo === "campanha"), "traz campanhas como escopo");
  t(corretores.every((c) => typeof c.elegivelAgora === "boolean"),
    "todo corretor diz se pode receber agora — a tela não precisa adivinhar");
  t(corretores.filter((c) => !c.elegivelAgora).every((c) => typeof c.porQueNao === "string" && c.porQueNao.length > 0),
    "quem não pode receber vem com o motivo escrito, nunca só com a recusa");

  console.log("\n── o volume de cada escopo bate com o banco ──");
  for (const escopo of escopos.slice(0, 6)) {
    const coluna = escopo.escopo === "projeto" ? "development_id" : "campaign_id";
    const { count } = await admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", org).eq(coluna, escopo.id);
    t(escopo.leadsTotal === (count ?? 0),
      `${escopo.nome.slice(0, 40)}: ${escopo.leadsTotal} = ${count} no banco`);
  }

  const doTeste = corretores.slice(0, 3);
  if (doTeste.length < 2) {
    console.log("\n(menos de 2 corretores na organização — os casos de ordem não têm o que ordenar)");
  } else {
    console.log("\n── colocar na fila ──");
    for (const corretor of doTeste) {
      const gravado = await escrever({ escopo: "projeto", escopoId: ESCOPO_ID, profileId: corretor.id, ativo: true });
      if (gravado?.ok) tocados.push(corretor.id);
      t(gravado?.ok === true, `${corretor.nome} entra na fila`, JSON.stringify(gravado?.error ?? {}));
    }

    const comFila = await ler(`?contexto=1&escopo=projeto&escopoId=${ESCOPO_ID}`);
    const lugares = comFila?.data?.fila?.lugares ?? [];
    t(lugares.length === doTeste.length, `a fila tem ${doTeste.length} (veio ${lugares.length})`);
    t(lugares.every((lugar, indice) => lugar.ordem === indice + 1), "a ordem é 1..N, sem buraco");
    t(lugares.map((l) => l.profileId).join(",") === doTeste.map((c) => c.id).join(","),
      "quem entrou primeiro está na frente — entrar não fura a fila",
      `${lugares.map((l) => l.nome).join(" → ")}`);
    // Assertiva que não é vazia em nenhum dos dois mundos. `<= 1` sozinho
    // passaria com ZERO marcados — que é exatamente o estado desta base hoje
    // (ninguém com WhatsApp conectado) e o que a tela precisa EXPLICAR em vez
    // de mostrar uma fila sem próximo e sem motivo.
    const filaResposta = comFila?.data?.fila ?? {};
    const marcados = lugares.filter((l) => l.proximo).length;
    const algumElegivel = lugares.some((l) => l.elegivelAgora);
    if (algumElegivel) {
      t(marcados === 1 && filaResposta.proximoId, "havendo quem possa receber, EXATAMENTE um é o próximo");
      t(/vez do \d+º/.test(String(filaResposta.porque)), "o motivo diz de quem era a vez", String(filaResposta.porque));
    } else {
      t(marcados === 0 && filaResposta.proximoId === null,
        "não havendo ninguém elegível, ninguém é marcado como próximo");
      t(/NENHUM pode receber agora/.test(String(filaResposta.porque)),
        "e o motivo diz POR QUE a fila não gira — fila sem próximo e sem explicação parece defeito de tela",
        String(filaResposta.porque));
      t(typeof comFila?.data?.contexto?.travaGeral === "string" && comFila.data.contexto.travaGeral.length > 0,
        "a trava geral aparece no contexto, acima da fila",
        String(comFila?.data?.contexto?.travaGeral));
    }
    t(lugares.every((l) => "ultimaLeadEm" in l), "cada lugar diz quando recebeu a última deste escopo");

    console.log("\n── mover ──");
    const ultimo = lugares[lugares.length - 1];
    const subiu = await escrever({ escopo: "projeto", escopoId: ESCOPO_ID, profileId: ultimo.profileId, acao: "mover", direcao: "subir" });
    t(subiu?.ok === true, "subir responde ok", JSON.stringify(subiu?.error ?? {}));
    const depois = await ler(`?contexto=1&escopo=projeto&escopoId=${ESCOPO_ID}`);
    const ordemDepois = (depois?.data?.fila?.lugares ?? []).map((l) => l.profileId);
    t(ordemDepois.indexOf(ultimo.profileId) === lugares.length - 2,
      "quem estava por último subiu uma casa E a mudança sobreviveu ao banco",
      `${(depois?.data?.fila?.lugares ?? []).map((l) => `${l.ordem}.${l.nome}`).join(" ")}`);
    t((depois?.data?.fila?.lugares ?? []).every((l, i) => l.ordem === i + 1), "continua 1..N depois do movimento");

    const primeiro = (depois?.data?.fila?.lugares ?? [])[0];
    const naoSobe = await escrever({ escopo: "projeto", escopoId: ESCOPO_ID, profileId: primeiro.profileId, acao: "mover", direcao: "subir" });
    t(naoSobe?.ok === true, "o 1º subindo não vira erro — o botão já vem desabilitado, a rota não pune");

    console.log("\n── tirar da fila ──");
    const saiu = await escrever({ escopo: "projeto", escopoId: ESCOPO_ID, profileId: primeiro.profileId, ativo: false });
    t(saiu?.ok === true, "tirar responde ok", JSON.stringify(saiu?.error ?? {}));
    const semEle = await ler(`?contexto=1&escopo=projeto&escopoId=${ESCOPO_ID}`);
    const restantes = (semEle?.data?.fila?.lugares ?? []).map((l) => l.profileId);
    t(!restantes.includes(primeiro.profileId), "quem saiu não aparece mais na fila");
    t((semEle?.data?.fila?.lugares ?? []).every((l, i) => l.ordem === i + 1),
      "a ordem fecha o buraco de quem saiu",
      `${(semEle?.data?.fila?.lugares ?? []).map((l) => `${l.ordem}.${l.nome}`).join(" ")}`);

    console.log("\n── o que a fila NÃO faz ──");
    const deOutraOrg = await escrever({ escopo: "projeto", escopoId: ESCOPO_ID, profileId: "00000000-0000-0000-0000-000000000000", ativo: true });
    t(deOutraOrg?.ok !== true, "perfil de fora da organização é recusado");
    const escopoInventado = await escrever({ escopo: "inventado", escopoId: ESCOPO_ID, profileId: doTeste[0].id, ativo: true });
    t(escopoInventado?.ok !== true, "escopo inventado é recusado, não gravado em silêncio");
    const semDirecao = await escrever({ escopo: "projeto", escopoId: ESCOPO_ID, profileId: doTeste[0].id, acao: "mover", direcao: "de-lado" });
    t(semDirecao?.ok !== true, "direção inválida é recusada");

    console.log("\n── a contagem de OUTRO escopo não some com a fila selecionada ──");
    const outro = escopos.find((e) => e.id !== ESCOPO_ID);
    if (outro) {
      const membrosTodos = (semEle?.data?.membros ?? []);
      t(membrosTodos.some((m) => m.escopoId === ESCOPO_ID),
        "pedindo a fila de um escopo, os membros de todos continuam vindo",
        "sem isso a lista lateral mostraria 'livre' em escopos que têm fila montada");
    }
  }
  console.log("\n── vincular campanha a empreendimento ──");
  const campanha = escopos.find((e) => e.escopo === "campanha");
  if (campanha) {
    const { data: antes } = await admin.from("marketing_campaigns").select("project_id").eq("id", campanha.id).maybeSingle();
    vinculoOriginal = { id: campanha.id, projectId: antes?.project_id ?? null };
    const vinculou = await escrever({ escopo: "campanha", escopoId: campanha.id, acao: "vincular", empreendimentoId: ESCOPO_ID });
    t(vinculou?.ok === true, "vincula sem exigir corretor nenhum", JSON.stringify(vinculou?.error ?? {}));
    // O id gravado é o da FK (`crm_projects`), não o que a tela mandou.
    t(vinculou?.data?.projetoDaFk && vinculou.data.projetoDaFk !== ESCOPO_ID,
      "a ponte traduziu: a tela manda `developments`, o banco guarda `crm_projects`",
      `enviado ${ESCOPO_ID} · gravado ${vinculou?.data?.projetoDaFk}`);
    const depoisDoVinculo = await ler("?contexto=1");
    const naLista = (depoisDoVinculo?.data?.contexto?.escopos ?? []).find((e) => e.id === campanha.id);
    t(naLista?.empreendimentoId === ESCOPO_ID,
      "e a tela lê de volta o id CANÔNICO, não o da FK",
      `veio ${naLista?.empreendimentoId}`);
    t(typeof naLista?.empreendimentoNome === "string" && naLista.empreendimentoNome.length > 0,
      `com o nome resolvido (${naLista?.empreendimentoNome})`);
    const desvinculou = await escrever({ escopo: "campanha", escopoId: campanha.id, acao: "vincular", empreendimentoId: null });
    t(desvinculou?.ok === true, "desvincular é aceito — nulo não é erro de validação");
    const empreendimentoComoCampanha = await escrever({ escopo: "projeto", escopoId: ESCOPO_ID, acao: "vincular", empreendimentoId: ESCOPO_ID });
    t(empreendimentoComoCampanha?.ok !== true, "vincular um EMPREENDIMENTO a outro é recusado");
  }
} finally {
  if (vinculoOriginal) {
    await admin.from("marketing_campaigns").update({ project_id: vinculoOriginal.projectId }).eq("id", vinculoOriginal.id);
  }
  for (const profileId of tocados) {
    await admin.from("distribution_roster").delete()
      .eq("organization_id", org).eq("escopo", "projeto").eq("escopo_id", ESCOPO_ID).eq("profile_id", profileId);
  }
  const { count: sobrou } = await admin.from("distribution_roster").select("id", { count: "exact", head: true })
    .eq("organization_id", org).eq("escopo_id", ESCOPO_ID);
  console.log(`\nlinhas de elenco deixadas para trás: ${sobrou ?? 0}`);
  await admin.from("profiles").delete().eq("id", u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
  console.log("usuário descartável removido: sim");
}

console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
