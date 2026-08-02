/**
 * PROVA DAS TRÊS LEITURAS DE ACOMPANHAMENTO DO CORRETOR.
 *
 * Segue o padrão já estabelecido nos `scripts/prova-*.mjs`: cria uma identidade
 * DESCARTÁVEL, prova as rotas contra o banco vivo e some. Nenhuma senha é usada
 * — a sessão vem de magiclink gerado pelo service role e verificado aqui mesmo.
 *
 * Cada asserção compara a resposta HTTP com uma contagem feita direto no banco.
 * Toda lista é provada dos DOIS lados: o que ela mostra e o que ela esconde.
 *
 *   node --env-file=.env.local scripts/acompanhamento-corretor-prova.mjs
 *
 * Deixa os usuários vivos e imprime o link de entrada do navegador. Apagar:
 *   node --env-file=.env.local scripts/acompanhamento-corretor-limpa.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const env = process.env;
const APP = env.ATLAS_PROVA_APP || "http://127.0.0.1:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const publico = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);

let ok = 0;
let bad = 0;
const t = (condicao, texto, detalhe = "") => {
  if (condicao) {
    ok += 1;
    console.log("  ✔ " + texto);
  } else {
    bad += 1;
    console.log("  ✘ " + texto + (detalhe ? "\n      " + detalhe : ""));
  }
};

const TENTATIVA = ["call", "ligacao", "whatsapp", "email", "sms", "message"];
const SAIDA = ["perdido", "comprou_outro"];

// A organização operacional é a que tem leads.
const { data: leadsParaOrg } = await admin.from("leads").select("organization_id").limit(1000);
const contagemPorOrg = new Map();
for (const linha of leadsParaOrg ?? []) {
  contagemPorOrg.set(linha.organization_id, (contagemPorOrg.get(linha.organization_id) ?? 0) + 1);
}
const org = [...contagemPorOrg.entries()].sort((a, b) => b[1] - a[1])[0][0];

const carimbo = Date.now();
async function criarIdentidade(nome, perfil) {
  const email = `acompanhamento-${nome}-${carimbo}@atlas-teste.local`;
  const { data: criado, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`createUser ${nome}: ${error.message}`);
  const { error: erroPerfil } = await admin.from("profiles").upsert({
    id: criado.user.id,
    name: `Prova ${nome}`,
    full_name: `Prova ${nome}`,
    email,
    organization_id: org,
    active: true,
    ...perfil,
  });
  if (erroPerfil) throw new Error(`profile ${nome}: ${erroPerfil.message}`);
  return { id: criado.user.id, email };
}

async function sessaoDe(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink: ${error.message}`);
  const { data: sessao, error: erroOtp } = await publico.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (erroOtp) throw new Error(`verifyOtp: ${erroOtp.message}`);
  return sessao.session.access_token;
}

/* A cadeia que `private.validate_commercial_hierarchy` admite, e só ela:
   raiz director_decisor/director → operacional director/manager → broker/broker.
   Pular um degrau levanta `broker_requires_operational_director` e o upsert
   volta com zero linhas — falha silenciosa se o erro não for lido. */
const diretor = await criarIdentidade("diretor", {
  role: "admin",
  access_role: "director_decisor",
  commercial_role: "director",
  reports_to: null,
});
const gerente = await criarIdentidade("gerente", {
  role: "manager",
  access_role: "director",
  commercial_role: "manager",
  reports_to: diretor.id,
});
const corretor = await criarIdentidade("corretor", {
  role: "broker",
  access_role: "broker",
  commercial_role: "broker",
  reports_to: gerente.id,
});

const tokenDiretor = await sessaoDe(diretor.email);
const tokenCorretor = await sessaoDe(corretor.email);
const cabecalho = (token) => ({ authorization: `Bearer ${token}` });
const pegar = async (caminho, token) => {
  const resposta = await fetch(`${APP}${caminho}`, { headers: cabecalho(token) });
  const corpo = await resposta.json().catch(() => null);
  return { status: resposta.status, corpo, dados: corpo?.data ?? corpo };
};

try {
  // ── VERDADE DO BANCO ─────────────────────────────────────────────────────
  const { data: movimentos } = await admin
    .from("pipeline_stage_moves")
    .select("id,lead_id,actor_id,from_stage,to_stage,discard_reason_key,reversal_of,occurred_at")
    .eq("organization_id", org)
    .limit(20000);
  const { data: leadsDoBanco } = await admin
    .from("leads")
    .select("id,status,first_contacted_at,assigned_to,assigned_user_id")
    .eq("organization_id", org)
    .limit(5000);
  const { data: eventos } = await admin
    .from("lead_events")
    .select("lead_id,event_type")
    .eq("organization_id", org)
    .in("event_type", TENTATIVA)
    .limit(5000);

  const desfeitos = new Set(movimentos.map((m) => m.reversal_of).filter(Boolean));
  const vivos = movimentos.filter((m) => !desfeitos.has(m.id));
  const tentativasPorLead = new Map();
  for (const e of eventos ?? []) {
    tentativasPorLead.set(e.lead_id, (tentativasPorLead.get(e.lead_id) ?? 0) + 1);
  }
  const fechadasDoBanco = leadsDoBanco.filter((l) => SAIDA.includes(String(l.status)));
  const idsFechadas = new Set(fechadasDoBanco.map((l) => l.id));
  const saidasOrdenadas = vivos
    .filter((m) => SAIDA.includes(String(m.to_stage)) && idsFechadas.has(m.lead_id))
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const ultimaSaida = new Map();
  for (const m of saidasOrdenadas) if (!ultimaSaida.has(m.lead_id)) ultimaSaida.set(m.lead_id, m);
  const leadPorId = new Map(leadsDoBanco.map((l) => [l.id, l]));
  const semSinal = (leadId) =>
    (tentativasPorLead.get(leadId) ?? 0) === 0 && !leadPorId.get(leadId)?.first_contacted_at;
  const inalcancaveis = [...ultimaSaida.entries()].filter(([, m]) => m.discard_reason_key === "inalcancavel");
  const inalcancaveisSemSinal = inalcancaveis.filter(([leadId]) => semSinal(leadId));
  const semMotivoNoBanco = [...ultimaSaida.values()].filter((m) => !m.discard_reason_key).length;

  console.log(`\nbanco: ${leadsDoBanco.length} leads · ${movimentos.length} movimentos · ${vivos.length} não desfeitos`);
  console.log(
    `banco: ${fechadasDoBanco.length} fechadas · ${ultimaSaida.size} com saída no ledger · ${inalcancaveis.length} "inalcancavel" (${inalcancaveisSemSinal.length} sem sinal de contato)\n`,
  );

  // ── 1 · LINHA DO TEMPO DA LEAD ───────────────────────────────────────────
  console.log("── linha do tempo: mostra o que deve ──");
  const porLead = new Map();
  for (const m of movimentos) porLead.set(m.lead_id, (porLead.get(m.lead_id) ?? 0) + 1);
  const [leadComMovimento, quantosMovimentos] = [...porLead.entries()].sort((a, b) => b[1] - a[1])[0];
  const linha = await pegar(`/api/v1/acompanhamento-corretor/linha-do-tempo?leadId=${leadComMovimento}`, tokenDiretor);
  t(linha.status === 200, `lead com movimento responde 200 (veio ${linha.status})`);
  t(
    linha.dados?.total === quantosMovimentos,
    `devolve os ${quantosMovimentos} movimentos que o banco tem (rota disse ${linha.dados?.total})`,
  );
  t(
    (linha.dados?.movimentos ?? []).every((m) => m.de && m.para && m.autor),
    "toda linha traz etapa de origem, destino e autor — nenhuma em branco",
  );
  const comMotivo = (linha.dados?.movimentos ?? []).filter((m) => m.motivoRotulo);
  const motivoNoBanco = movimentos.filter((m) => m.lead_id === leadComMovimento && m.discard_reason_key).length;
  t(
    comMotivo.length === motivoNoBanco,
    `os ${motivoNoBanco} motivo(s) gravado(s) chegam à tela (rota trouxe ${comMotivo.length})`,
  );

  console.log("\n── linha do tempo: esconde o que deve, e não mente no vazio ──");
  const leadSemMovimento = leadsDoBanco.find((l) => !porLead.has(l.id));
  if (leadSemMovimento) {
    const vazia = await pegar(`/api/v1/acompanhamento-corretor/linha-do-tempo?leadId=${leadSemMovimento.id}`, tokenDiretor);
    t(vazia.status === 200 && vazia.dados?.total === 0, "lead sem movimento devolve zero movimentos, não erro");
    t(
      Boolean(vazia.dados?.ledgerDesde),
      "e devolve desde quando o registro existe — sem isso, zero se leria como “ninguém tocou”",
      `ledgerDesde: ${vazia.dados?.ledgerDesde}`,
    );
  } else {
    t(false, "havia uma lead sem movimento para provar o caso vazio", "nenhuma encontrada");
  }
  const inventada = await pegar(
    "/api/v1/acompanhamento-corretor/linha-do-tempo?leadId=00000000-0000-4000-8000-000000000000",
    tokenDiretor,
  );
  t(inventada.status === 404, `lead inexistente recusa com 404, nunca lista vazia (veio ${inventada.status})`);
  const malformada = await pegar("/api/v1/acompanhamento-corretor/linha-do-tempo?leadId=xpto", tokenDiretor);
  t(malformada.status === 400, `id inválido recusa com 400 (veio ${malformada.status})`);
  const foraDaCarteira = await pegar(
    `/api/v1/acompanhamento-corretor/linha-do-tempo?leadId=${leadComMovimento}`,
    tokenCorretor,
  );
  t(
    foraDaCarteira.status === 403,
    `corretor sem a lead na carteira recebe 403, não os dados (veio ${foraDaCarteira.status})`,
  );

  // ── 2 · FILA DE RECUPERAÇÃO ──────────────────────────────────────────────
  console.log("\n── fila de recuperação: os dois lados do recorte ──");
  const fila = await pegar("/api/v1/acompanhamento-corretor/fila-de-recuperacao", tokenDiretor);
  t(fila.status === 200, `responde 200 (veio ${fila.status})`);
  t(
    fila.dados?.fechadas === fechadasDoBanco.length,
    `conta as ${fechadasDoBanco.length} leads fechadas do banco (rota disse ${fila.dados?.fechadas})`,
  );
  t(
    fila.dados?.comSaidaNoLedger === ultimaSaida.size,
    `${ultimaSaida.size} têm saída registrada (rota disse ${fila.dados?.comSaidaNoLedger})`,
  );
  t(
    fila.dados?.semSaidaNoLedger === fechadasDoBanco.length - ultimaSaida.size,
    `${fechadasDoBanco.length - ultimaSaida.size} fecharam antes do registro — balde separado de “sem motivo”`,
  );
  t(
    fila.dados?.semMotivoGravado === semMotivoNoBanco,
    `${semMotivoNoBanco} saídas sem motivo gravado (rota disse ${fila.dados?.semMotivoGravado})`,
  );
  const rec = fila.dados?.recuperaveis;
  t(
    rec?.total === inalcancaveis.length,
    `${inalcancaveis.length} saídas por “sem resposta” (rota disse ${rec?.total})`,
  );
  t(
    rec?.semSinalDeContato === inalcancaveisSemSinal.length,
    `${inalcancaveisSemSinal.length} dessas sem nenhum sinal de contato (rota disse ${rec?.semSinalDeContato})`,
  );
  t(
    rec && rec.semSinalDeContato + rec.comSinalDeContato === rec.total,
    "os dois lados somam o total — nada sai da conta em silêncio",
    `${rec?.semSinalDeContato} + ${rec?.comSinalDeContato} vs ${rec?.total}`,
  );
  const idsListados = new Set((rec?.itens ?? []).map((i) => i.leadId));
  t(
    [...idsListados].every((id) => ultimaSaida.get(id)?.discard_reason_key === "inalcancavel"),
    "toda lead listada saiu de fato por “sem resposta” — nenhuma entrou por engano",
  );
  t([...idsListados].every((id) => semSinal(id)), "e nenhuma delas tem tentativa registrada");
  const comContato = inalcancaveis.filter(([leadId]) => !semSinal(leadId)).map(([leadId]) => leadId);
  t(
    comContato.every((id) => !idsListados.has(id)),
    `as ${comContato.length} com contato registrado ficam FORA da lista — o recorte esconde o que deve`,
  );
  t(
    rec?.mostrando === Math.min(rec?.semSinalDeContato ?? 0, 60) && (rec?.itens ?? []).length === rec?.mostrando,
    `a lista declara quantas mostra (${rec?.mostrando}) e entrega exatamente isso (${(rec?.itens ?? []).length})`,
  );

  console.log("\n── fila de recuperação: o piso de carteira ──");
  const filaDoCorretor = await pegar("/api/v1/acompanhamento-corretor/fila-de-recuperacao", tokenCorretor);
  t(filaDoCorretor.status === 200, `corretor recebe 200 (veio ${filaDoCorretor.status})`);
  t(filaDoCorretor.dados?.escopo === "carteira", `e o escopo declarado é “carteira” (veio ${filaDoCorretor.dados?.escopo})`);
  t(
    filaDoCorretor.dados?.fechadas === 0,
    `corretor sem carteira não vê as ${fechadasDoBanco.length} fechadas dos outros (viu ${filaDoCorretor.dados?.fechadas})`,
  );

  // ── 3 · MOVIMENTAÇÃO POR PESSOA ──────────────────────────────────────────
  console.log("\n── movimentação por pessoa ──");
  const pessoas = await pegar("/api/v1/acompanhamento-corretor/movimentacao-por-pessoa?dias=30", tokenDiretor);
  t(pessoas.status === 200, `responde 200 (veio ${pessoas.status})`);
  const corte = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const vivosNaJanela = vivos.filter((m) => String(m.occurred_at) >= corte);
  t(
    pessoas.dados?.totalMovimentos === vivosNaJanela.length,
    `${vivosNaJanela.length} movimentos não desfeitos na janela (rota disse ${pessoas.dados?.totalMovimentos})`,
  );
  const somaDasLinhas = (pessoas.dados?.pessoas ?? []).reduce((total, p) => total + p.movimentos, 0);
  t(
    somaDasLinhas === pessoas.dados?.totalMovimentos,
    `a soma das pessoas bate com o total (${somaDasLinhas} vs ${pessoas.dados?.totalMovimentos}) — ninguém foi omitido`,
  );
  /* A posição de cada etapa é a mesma de lib/atlas/pipeline-stages.ts. Avanço é
     ir para uma posição MAIOR sem sair do funil — voltar de "proposta" para
     "contato" não é avanço, e uma contagem que só olhasse "não é saída" contaria
     os seis retrocessos registrados como trabalho. */
  const POSICAO = { novo: 10, contato: 20, qualificacao: 30, visita: 40, proposta: 50, contrato: 60, ganho: 70, perdido: 80, comprou_outro: 90 };
  const ABERTA_OU_GANHA = new Set(["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho"]);
  const porAtor = new Map();
  for (const m of vivosNaJanela) {
    const linhaDoAtor = porAtor.get(m.actor_id) ?? { movimentos: 0, saidas: 0, diretas: 0, avancos: 0 };
    linhaDoAtor.movimentos += 1;
    if (SAIDA.includes(String(m.to_stage))) {
      linhaDoAtor.saidas += 1;
      if (String(m.from_stage) === "novo") linhaDoAtor.diretas += 1;
    } else if (
      ABERTA_OU_GANHA.has(String(m.to_stage))
      && (POSICAO[String(m.to_stage)] ?? 0) > (POSICAO[String(m.from_stage)] ?? 0)
    ) {
      linhaDoAtor.avancos += 1;
    }
    porAtor.set(m.actor_id, linhaDoAtor);
  }
  for (const pessoa of pessoas.dados?.pessoas ?? []) {
    const doBanco = porAtor.get(pessoa.id) ?? { movimentos: 0, saidas: 0, diretas: 0, avancos: 0 };
    t(
      pessoa.movimentos === doBanco.movimentos && pessoa.saidas === doBanco.saidas,
      `${pessoa.nome}: ${doBanco.movimentos} movimentos e ${doBanco.saidas} saídas conferem`,
      `rota: ${pessoa.movimentos}/${pessoa.saidas}`,
    );
    t(
      pessoa.saidasSemPassarPorContato === doBanco.diretas,
      `${pessoa.nome}: ${doBanco.diretas} saídas partindo de “Novos” conferem (rota disse ${pessoa.saidasSemPassarPorContato})`,
    );
    t(
      pessoa.avancos === doBanco.avancos,
      `${pessoa.nome}: ${doBanco.avancos} avanços de etapa conferem — retrocesso não conta como avanço (rota disse ${pessoa.avancos})`,
    );
    const carteiraNoBanco = leadsDoBanco.filter(
      (l) => (l.assigned_user_id || l.assigned_to) === pessoa.id && !SAIDA.includes(String(l.status)) && String(l.status) !== "ganho",
    );
    const semMovimentoNoBanco = carteiraNoBanco.filter((l) => !porLead.has(l.id)).length;
    t(
      pessoa.carteiraAberta === carteiraNoBanco.length && pessoa.carteiraSemMovimento === semMovimentoNoBanco,
      `${pessoa.nome}: carteira aberta ${carteiraNoBanco.length} e ${semMovimentoNoBanco} sem movimento nenhum conferem`,
      `rota: ${pessoa.carteiraAberta}/${pessoa.carteiraSemMovimento}`,
    );
  }
  const pessoasDoCorretor = await pegar(
    "/api/v1/acompanhamento-corretor/movimentacao-por-pessoa?dias=30",
    tokenCorretor,
  );
  t(
    pessoasDoCorretor.dados?.escopo === "carteira" && (pessoasDoCorretor.dados?.pessoas ?? []).length === 0,
    "corretor sem movimentação nem carteira vê a própria linha vazia, nunca a do time",
    `pessoas devolvidas: ${(pessoasDoCorretor.dados?.pessoas ?? []).length}`,
  );

  // ── ENTRADA DO NAVEGADOR ─────────────────────────────────────────────────
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: diretor.email });
  const entrada = `${APP}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=/leads`;
  writeFileSync(env.ATLAS_PROVA_SAIDA || "/tmp/acompanhamento-corretor-entrada.txt", `${entrada}\n${leadComMovimento}\n`);
  console.log(`\nlead com mais movimento (para a ficha): ${leadComMovimento}`);
  console.log(`entrada do navegador gravada em ${env.ATLAS_PROVA_SAIDA || "/tmp/acompanhamento-corretor-entrada.txt"}`);
} finally {
  console.log(`\nidentidades descartáveis vivas: ${diretor.email} · ${gerente.email} · ${corretor.email}`);
}

console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
