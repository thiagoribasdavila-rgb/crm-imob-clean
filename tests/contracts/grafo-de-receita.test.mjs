/**
 * Contrato do GRAFO DE OPORTUNIDADE DE RECEITA (6.3).
 *
 * ── POR QUE ESTE ARQUIVO EXECUTA CONSULTA, E NÃO LÊ .sql ────────────────────
 *
 * O grafo mora em views e funções do Postgres. Um contrato que fizesse grep no
 * arquivo de migration provaria que alguém escreveu o texto certo — não que o
 * banco RESPONDE assim. Neste repositório a diferença já custou cinco vezes: o
 * identificador sobrevive dentro do `import`, e a asserção fica verde sobre
 * código morto.
 *
 * Então aqui: PARTE 1 prova o juiz (TypeScript puro, roda sempre). PARTE 2 prova
 * que a régua de carteira em SQL concorda com a de TypeScript caso a caso.
 * PARTE 3 constrói um grafo SINTÉTICO num tenant descartável e cobra as sete
 * perguntas do dono contra ele — achando o que deve e NÃO achando o que não deve.
 *
 * ── O TENANT DE PROVA, E POR QUE NÃO A ORGANIZAÇÃO REAL ─────────────────────
 *
 * Tudo nasce dentro de "Atlas AI" (87036a39), organização sem acervo e sem
 * perfis. A organização viva (Atlas One) é só CONTADA — antes e depois — e o
 * teste exige que ela não mude. Já houve, neste repositório, um contrato que
 * carimbou dono e prazo em 9 leads reais porque o pool de descartáveis acabou no
 * meio da execução; a lição virou desenho.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MINIMO_DESFECHOS_PARA_RANQUEAR,
  MINIMO_GRUPOS_PARA_COMPARAR,
  MINIMO_COBERTURA_DECLARADA,
  PERGUNTAS_DO_DONO,
  avaliarProntidao,
  veredicto,
  nivelDeEvidencia,
  avisoDaBase,
} from "../../lib/crm/grafo-de-receita.ts";
import { estaNaMinhaCarteira, leLiderancaInteira } from "../../lib/crm/escopo-de-leitura.ts";

const RAIZ = process.cwd();

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1 — O JUIZ. Sem banco, roda sempre.
// ═══════════════════════════════════════════════════════════════════════════

/** A medição REAL da organização viva em 2026-07-30, lida de grafo_censo_de_prontidao. */
const MEDIDO_EM_2026_07_30 = Object.freeze({
  leads_na_organizacao: 482,
  lead_interesse_revelado: 192 / 482,
  lead_bairro_declarado: 6 / 482,
  pares_de_oferta_comparaveis: 0,
  leads_com_co_interesse: 1,
  desfechos_por_corretor_maximo: 87,
  desfechos_por_corretor_2o_maior: 1,
  corretores_com_desfecho: 2,
  desfechos_por_campanha_2o_maior: 12,
  campanhas_com_desfecho: 3,
  ganhos_rotulados: 2,
  leads_recuperaveis: 474,
  unidades_no_acervo: 0,
});

test("as 7 perguntas do dono estão todas catalogadas, e cada uma exige algo", () => {
  assert.equal(PERGUNTAS_DO_DONO.length, 7, "o dono escreveu sete perguntas; o catálogo tem de ter as sete");
  for (const p of PERGUNTAS_DO_DONO) {
    assert.ok(p.exige.length > 0, `${p.chave} não exige nada — pergunta sem exigência PASSA sempre e o veredicto vira propaganda`);
    assert.ok(p.coletar.length > 20, `${p.chave} sem recomendação de coleta: reprovar sem dizer o que falta é lamento, não entrega`);
  }
});

test("VEREDICTO MEDIDO: 2 das 7 perguntas têm dado suficiente hoje", () => {
  const v = veredicto(MEDIDO_EM_2026_07_30);
  assert.equal(v.total, 7);
  assert.equal(
    v.respondiveis,
    2,
    "o veredicto da frente mudou. Se foi porque a operação coletou dado, ótimo — atualize " +
      "MEDIDO_EM_2026_07_30 com a saída de grafo_censo_de_prontidao. Se foi porque um limiar " +
      "foi afrouxado, isto é o portão fazendo o trabalho dele.",
  );

  const porChave = new Map(avaliarProntidao(MEDIDO_EM_2026_07_30).map((a) => [a.chave, a]));
  assert.equal(porChave.get("leads_semelhantes").suficiente, true, "192 leads com empreendimento e 8 fontes respondem semelhança");
  assert.equal(porChave.get("oportunidades_de_recuperacao").suficiente, true, "474 leads recuperáveis respondem recuperação");
  for (const chave of [
    "clientes_para_estoque_novo",
    "imoveis_substitutos",
    "corretor_mais_adequado",
    "campanha_por_perfil",
    "demanda_x_oferta",
  ]) {
    assert.equal(porChave.get(chave).suficiente, false, `${chave} não tem dado hoje e o juiz precisa dizer isso`);
  }
});

test("2 vitórias não ranqueiam corretor — e é o SEGUNDO maior que cobra base nos dois lados", () => {
  // O defeito real que isto fecha: a primeira versão exigia
  // `desfechos_por_corretor_maximo >= 10` e PASSOU com 87 — sendo que os 87 são
  // de um corretor só e o segundo tem 1. Um grupo com base e outro sem não é
  // ranking.
  const comMaximoAlto = { ...MEDIDO_EM_2026_07_30, desfechos_por_corretor_maximo: 999 };
  const r = avaliarProntidao(comMaximoAlto).find((a) => a.chave === "corretor_mais_adequado");
  assert.equal(r.suficiente, false, "inflar o MAIOR não pode aprovar o ranking — quem manda é o segundo");

  // ── A ASSERÇÃO QUE ISOLA A PROPRIEDADE ─────────────────────────────────────
  //
  // A de cima passa mesmo com a exigência trocada de volta para
  // `desfechos_por_corretor_maximo`, porque `ganhos_rotulados: 2` reprova
  // sozinho — foi assim que a mutação M159 SOBREVIVEU na primeira execução do
  // `npm run teste:mutacoes`. Duas exigências reprovando ao mesmo tempo é
  // exatamente como uma propriedade fica "protegida" sem estar.
  //
  // Aqui as vitórias são SUFICIENTES de propósito, e só resta a concentração de
  // base: um corretor com 999 desfechos e o segundo com 1. Se a exigência voltar
  // a olhar o máximo, isto aprova — e o teste cai.
  const soUmComBase = {
    ...MEDIDO_EM_2026_07_30,
    ganhos_rotulados: MINIMO_DESFECHOS_PARA_RANQUEAR,
    desfechos_por_corretor_maximo: 999,
    desfechos_por_corretor_2o_maior: 1,
  };
  const concentrado = avaliarProntidao(soUmComBase).find((a) => a.chave === "corretor_mais_adequado");
  assert.equal(
    concentrado.suficiente,
    false,
    "87 desfechos num corretor e 1 no outro NÃO ranqueiam: um grupo com base e outro sem é um número sozinho com vizinho decorativo",
  );

  // E o outro lado: com base nos dois E vitórias suficientes, aprova.
  const calibrado = {
    ...MEDIDO_EM_2026_07_30,
    desfechos_por_corretor_2o_maior: MINIMO_DESFECHOS_PARA_RANQUEAR,
    ganhos_rotulados: MINIMO_DESFECHOS_PARA_RANQUEAR,
  };
  const ok = avaliarProntidao(calibrado).find((a) => a.chave === "corretor_mais_adequado");
  assert.equal(ok.suficiente, true, "com base nos dois corretores e vitórias suficientes a pergunta TEM de aprovar");
});

test("medida ausente reprova como `null`, não como zero", () => {
  const a = avaliarProntidao({}).find((x) => x.chave === "leads_semelhantes");
  assert.equal(a.suficiente, false);
  assert.equal(a.exigencias[0].medido, null, "não medido tem de ser null: zero diria 'medi e não tem', que é outra afirmação");

  // E o oposto: zero MEDIDO é zero, não null.
  const z = avaliarProntidao({ lead_interesse_revelado: 0 }).find((x) => x.chave === "leads_semelhantes");
  assert.equal(z.exigencias[0].medido, 0);
});

test("NaN e Infinity não passam por número medido", () => {
  for (const lixo of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const a = avaliarProntidao({ lead_interesse_revelado: lixo }).find((x) => x.chave === "leads_semelhantes");
    assert.equal(a.exigencias[0].medido, null, `${lixo} não é medição`);
    assert.equal(a.suficiente, false);
  }
});

test("a ordem da coleta põe primeiro quem falha por menos", () => {
  const v = veredicto(MEDIDO_EM_2026_07_30);
  const reprovadas = v.faltando.map((f) => f.reprovadas);
  assert.deepEqual([...reprovadas].sort((a, b) => a - b), reprovadas, "faltando tem de vir ordenado por exigências reprovadas");
  assert.ok(v.faltando.length > 0);
  assert.equal(v.faltando[0].reprovadas, 1, "há pergunta a UMA exigência de destravar, e ela tem de vir primeiro");
});

test("nivelDeEvidencia separa `não sei` de `ruim`", () => {
  assert.equal(nivelDeEvidencia(0), "sem_base");
  assert.equal(nivelDeEvidencia(null), "sem_base");
  assert.equal(nivelDeEvidencia(undefined), "sem_base");
  assert.equal(nivelDeEvidencia(1), "indicativo");
  assert.equal(nivelDeEvidencia(MINIMO_DESFECHOS_PARA_RANQUEAR - 1), "indicativo");
  assert.equal(nivelDeEvidencia(MINIMO_DESFECHOS_PARA_RANQUEAR), "rankeavel");
  // O aviso existe justamente onde o número engana, e cala onde não engana.
  assert.equal(avisoDaBase(MINIMO_DESFECHOS_PARA_RANQUEAR), "");
  assert.match(avisoDaBase(2), /indicativo/);
  assert.match(avisoDaBase(0), /sem desfecho rotulado/);
  assert.doesNotMatch(avisoDaBase(0), /desempenho ruim|fraco|pior/i, "ausência de rótulo não é acusação de desempenho");
});

test("os limiares são coerentes entre si", () => {
  assert.ok(MINIMO_DESFECHOS_PARA_RANQUEAR > MINIMO_GRUPOS_PARA_COMPARAR);
  assert.ok(MINIMO_COBERTURA_DECLARADA > 0 && MINIMO_COBERTURA_DECLARADA < 1, "cobertura é fração, não contagem");
});

test("a migration não cria tabela nem exige serviço pago — é view sobre o que já existe", () => {
  const sql = fs.readFileSync(
    path.join(RAIZ, "supabase/migrations/20260730100000_grafo_de_oportunidade_de_receita.sql"),
    "utf8",
  );
  const semComentarios = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  assert.doesNotMatch(semComentarios, /create\s+table/i, "grafo de receita é LEITURA: tabela nova seria segunda cópia dos dados");
  assert.doesNotMatch(semComentarios, /create\s+extension/i, "extensão nova é custo e superfície que a frente não pediu");
  // security_invoker em TODA view: sem ele a view roda como o dono e atravessa a
  // RLS de quem consulta. Este é o primeiro objeto view do banco, então não há
  // precedente que garanta o hábito.
  const views = [...semComentarios.matchAll(/create\s+(?:or\s+replace\s+)?view\s+([a-z_.]+)/gi)].map((m) => m[1]);
  assert.ok(views.length >= 3, "a frente entrega ao menos três views (censo, demanda, oferta)");
  // ⚠ A OPÇÃO, não a MENÇÃO. A primeira versão contava /security_invoker\s*=\s*true/
  // e achou 4 para 3 views: a quarta estava dentro do TEXTO de um
  // `comment on view ... is '... security_invoker=true ...'`. `semComentarios`
  // tira comentário de SQL (`--`), não string literal — e uma asserção que conta
  // a palavra em vez da cláusula aprovaria uma view que só FALA de cerca.
  const clausulas = [...semComentarios.matchAll(/with\s*\(\s*security_invoker\s*=\s*true\s*\)/gi)].length;
  assert.equal(
    clausulas, views.length,
    `${views.length} views e ${clausulas} cláusulas \`with (security_invoker = true)\` — view sem ela roda como o dono e atravessa a RLS de quem consulta`,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2 e 3 — PRECISAM DO BANCO. Sem credencial, RECUSA em vez de passar em
// silêncio: suíte verde por ausência de credencial declara protegido o que
// ninguém exerceu.
// ═══════════════════════════════════════════════════════════════════════════

function ambiente() {
  const arquivo = path.join(RAIZ, ".env.local");
  if (!fs.existsSync(arquivo)) return {};
  const env = {};
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const ENV = ambiente();
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY;
const TEM_BANCO = Boolean(URL_BASE && CHAVE);

const ORG_PROVA = "87036a39-bb25-4290-88ae-e588d6581994";
const ORG_REAL = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";

const PREFIXO = "contrato-grafo-";
const MARCA = `${PREFIXO}${process.pid}-`;
const ROTULO = `CONTRATO-GRAFO-${process.pid}`;
const UMA_HORA = 3_600_000;
const cab = () => ({ apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" });

async function rest(caminho, opcoes = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${caminho}`, { ...opcoes, headers: { ...cab(), ...(opcoes.headers ?? {}) } });
  const texto = await res.text();
  return { http: res.status, corpo: texto ? JSON.parse(texto) : null };
}
async function rpc(nome, args) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, {
    method: "POST", headers: cab(), body: JSON.stringify(args),
  });
  const texto = await res.text();
  return { http: res.status, corpo: texto ? JSON.parse(texto) : null };
}
async function inserir(tabela, linhas) {
  const r = await rest(`${tabela}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(linhas),
  });
  assert.ok(r.http < 300, `insert em ${tabela} recusado: ${JSON.stringify(r.corpo)}`);
  return r.corpo;
}

async function usuarios() {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, { headers: cab() });
  return ((await r.json()).users ?? []).filter((u) => String(u.email).startsWith(MARCA));
}
async function orfaos() {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, { headers: cab() });
  return ((await r.json()).users ?? []).filter(
    (u) => String(u.email).startsWith(PREFIXO) && !String(u.email).startsWith(MARCA)
      && Date.now() - Date.parse(u.created_at) > UMA_HORA,
  );
}
async function criarPerfil(email, perfil) {
  await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST", headers: cab(),
    body: JSON.stringify({ email, password: `Ct!${Math.random().toString(36).slice(2)}Aa1`, email_confirm: true }),
  });
  const u = (await usuarios()).find((x) => x.email === email);
  assert.ok(u, `usuário de prova não criado: ${email}`);
  await new Promise((r) => setTimeout(r, 2200)); // provisionamento do perfil é trigger em auth.users
  const up = await rest("profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ id: u.id, ...perfil }]),
  });
  assert.ok(up.http < 300, `perfil de prova recusado (${email}): ${JSON.stringify(up.corpo)}`);
  return u.id;
}

/**
 * O ELENCO, na ordem que o banco aceita.
 *
 * Descoberto por RECUSA, não por leitura: criar um `broker` pendurado direto num
 * `director` devolve `valid_supervisor_required` — a trigger
 * `private.validate_commercial_hierarchy` exige a cadeia inteira. Diretor na raiz
 * (sem chefe), gerente sob ele, corretor sob o gerente.
 *
 * O diretor é o ator de LIDERANÇA dos testes (lê o funil inteiro) e os dois
 * corretores são os que provam a cerca: cada um só alcança a própria carteira.
 */
async function elenco() {
  const dir = await criarPerfil(`${MARCA}dir@atlas-teste.local`, {
    organization_id: ORG_PROVA, full_name: `${ROTULO} DIR`, name: `${ROTULO} DIR`,
    role: "admin", commercial_role: "director", access_role: "director_decisor",
    reports_to: null, active: true,
  });
  const ger = await criarPerfil(`${MARCA}gerente@atlas-teste.local`, {
    organization_id: ORG_PROVA, full_name: `${ROTULO} GER`, name: `${ROTULO} GER`,
    role: "manager", commercial_role: "manager", access_role: "director",
    reports_to: dir, active: true,
  });
  const a = await criarPerfil(`${MARCA}corretor-a@atlas-teste.local`, {
    organization_id: ORG_PROVA, full_name: `${ROTULO} A`, name: `${ROTULO} A`,
    role: "broker", commercial_role: "broker", access_role: "broker", reports_to: ger, active: true,
  });
  const b = await criarPerfil(`${MARCA}corretor-b@atlas-teste.local`, {
    organization_id: ORG_PROVA, full_name: `${ROTULO} B`, name: `${ROTULO} B`,
    role: "broker", commercial_role: "broker", access_role: "broker", reports_to: ger, active: true,
  });
  return { dir, ger, a, b };
}

async function limpar() {
  const atores = [...(await usuarios()), ...(await orfaos())];
  // Filhos antes dos pais: FK sem cascade.
  const leads = (await rest(`leads?name=like.${encodeURIComponent(ROTULO + "%")}&select=id`)).corpo ?? [];
  for (const l of leads) {
    await rest(`conversion_outcome_labels?lead_id=eq.${l.id}`, { method: "DELETE" });
    await rest(`lead_attribution_touches?lead_id=eq.${l.id}`, { method: "DELETE" });
    await rest(`lead_copilots?lead_id=eq.${l.id}`, { method: "DELETE" });
  }
  await rest(`leads?name=like.${encodeURIComponent(ROTULO + "%")}`, { method: "DELETE" });
  await rest(`development_typologies?code=like.${encodeURIComponent(ROTULO + "%")}`, { method: "DELETE" });
  await rest(`developments?name=like.${encodeURIComponent(ROTULO + "%")}`, { method: "DELETE" });
  for (const u of atores) {
    await rest(`lead_copilots?broker_id=eq.${u.id}`, { method: "DELETE" });
    await rest(`broker_capacity_limits?profile_id=eq.${u.id}`, { method: "DELETE" });
  }
  // De baixo para cima: `reports_to` é FK, corretor antes do gerente, gerente
  // antes do diretor.
  const ordem = ["-corretor-a@", "-corretor-b@", "-gerente@", "-dir@"];
  for (const u of [...atores].sort((x, y) => ordem.findIndex((o) => x.email.includes(o)) - ordem.findIndex((o) => y.email.includes(o)))) {
    await fetch(`${URL_BASE}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: cab() });
  }
  // Lixo de corridas antigas que morreram no meio.
  await rest(`developments?name=like.${encodeURIComponent("CONTRATO-GRAFO-%")}&created_at=lt.${new Date(Date.now() - UMA_HORA).toISOString()}`, { method: "DELETE" });
}

const contarReal = async () =>
  (await rest(`leads?organization_id=eq.${ORG_REAL}&select=id`)).corpo?.length ?? 0;

// ── PARTE 2 — as três réguas de carteira TÊM de concordar ───────────────────

test(
  "a régua de carteira em SQL concorda com a de TypeScript, caso a caso",
  { skip: TEM_BANCO ? false : "sem credenciais do Supabase em .env.local" },
  async (t) => {
    // Por que este teste existe: passaram a haver TRÊS implementações da mesma
    // régua — `estaNaMinhaCarteira` (TS), `private.can_access_lead_row` (RLS) e
    // `private.ator_alcanca_lead` (ator explícito, para o caminho service_role
    // que tem BYPASSRLS). Duas cópias já divergiram neste repositório mais de uma
    // vez; três sem contrato é questão de tempo.
    t.after(limpar);
    await limpar();

    // A hierarquia que a trigger `private.validate_commercial_hierarchy` exige, e
    // que descobrimos pela recusa `valid_supervisor_required`: diretor sem chefe
    // na raiz, gerente sob ele, corretor sob o gerente. Corretor pendurado direto
    // no diretor é recusado pelo banco.
    // `ger` não é referenciado aqui de propósito: o gerente precisa EXISTIR para
    // a trigger aceitar os corretores, mas o teste não fala com ele.
    const { dir, a, b } = await elenco();

    // A tabela-verdade: as duas colunas de dono, órfã, e o dono errado.
    const casos = [
      { nome: "dono por assigned_to", assigned_to: a, assigned_user_id: null, esperaA: true },
      { nome: "dono por assigned_user_id", assigned_to: null, assigned_user_id: a, esperaA: true },
      { nome: "dono pelas duas", assigned_to: a, assigned_user_id: a, esperaA: true },
      { nome: "lead de outra pessoa", assigned_to: b, assigned_user_id: null, esperaA: false },
      { nome: "lead de outra pessoa (segunda coluna)", assigned_to: null, assigned_user_id: b, esperaA: false },
      { nome: "lead órfã entra de propósito", assigned_to: null, assigned_user_id: null, esperaA: true },
    ];

    // O lado TypeScript primeiro, isolado: se ele já divergir, o resto do teste
    // não tem com o que comparar.
    for (const caso of casos) {
      const ts = estaNaMinhaCarteira(a, { assigned_to: caso.assigned_to, assigned_user_id: caso.assigned_user_id });
      assert.equal(ts, caso.esperaA, `TypeScript divergiu em "${caso.nome}"`);
    }

    // O lado SQL, exercido pela função que o grafo realmente usa: uma lead por
    // caso, e a pergunta é se `grafo_leads_semelhantes` (que aplica a cerca na
    // SEMENTE) devolve algo para o ator A.
    const criadas = [];
    for (const [i, caso] of casos.entries()) {
      const [lead] = await inserir("leads", [{
        organization_id: ORG_PROVA, name: `${ROTULO} REGUA ${i}`, status: "novo",
        source: "contrato-regua", campaign: "contrato-regua",
        assigned_to: caso.assigned_to, assigned_user_id: caso.assigned_user_id,
      }]);
      criadas.push({ ...caso, id: lead.id });
    }
    // Uma vizinha órfã, para a semente ter com quem se parecer (mesma fonte).
    await inserir("leads", [{
      organization_id: ORG_PROVA, name: `${ROTULO} REGUA VIZINHA`, status: "novo",
      source: "contrato-regua", campaign: "contrato-regua", assigned_to: null, assigned_user_id: null,
    }]);

    for (const caso of criadas) {
      const r = await rpc("grafo_leads_semelhantes", { p_lead_id: caso.id, p_ator_id: a, p_limite: 50 });
      assert.equal(r.http, 200, `grafo_leads_semelhantes falhou: ${JSON.stringify(r.corpo)}`);
      const alcancou = (r.corpo ?? []).length > 0;
      assert.equal(
        alcancou, caso.esperaA,
        `SQL divergiu do TypeScript em "${caso.nome}": ator_alcanca_lead disse ${alcancou}, estaNaMinhaCarteira disse ${caso.esperaA}`,
      );
    }

    // Liderança lê o funil inteiro — nas duas linguagens.
    assert.equal(leLiderancaInteira({ commercialRole: "director", role: "admin" }), true);
    const doB = criadas.find((c) => c.nome === "lead de outra pessoa");
    const comoDiretor = await rpc("grafo_leads_semelhantes", { p_lead_id: doB.id, p_ator_id: dir, p_limite: 50 });
    assert.ok((comoDiretor.corpo ?? []).length > 0, "o diretor tem de alcançar a lead do corretor B");

    // Ator nulo não é liderança: é recusa.
    const semAtor = await rpc("grafo_leads_semelhantes", { p_lead_id: doB.id, p_ator_id: null, p_limite: 50 });
    assert.equal((semAtor.corpo ?? []).length, 0, "ator nulo tem de devolver zero — cerca que se abre sem ator é vazamento");
  },
);

// ── PARTE 3 — o grafo sintético responde às perguntas do dono ───────────────

test(
  "PROVA VIVA: o grafo acha o que deve, não acha o que não deve, e não toca a organização real",
  { skip: TEM_BANCO ? false : "sem credenciais do Supabase em .env.local" },
  async (t) => {
    const antesReal = await contarReal();
    t.after(async () => {
      await limpar();
      assert.equal(await contarReal(), antesReal, "a organização REAL mudou de tamanho — o teste vazou do tenant de prova");
    });
    await limpar();

    // A hierarquia que a trigger `private.validate_commercial_hierarchy` exige, e
    // que descobrimos pela recusa `valid_supervisor_required`: diretor sem chefe
    // na raiz, gerente sob ele, corretor sob o gerente. Corretor pendurado direto
    // no diretor é recusado pelo banco.
    // `ger` não é referenciado aqui de propósito: o gerente precisa EXISTIR para
    // a trigger aceitar os corretores, mas o teste não fala com ele.
    const { dir, a, b } = await elenco();

    // ── A OFERTA: dois no MESMO bairro (par comparável) e um em outro ────────
    const [alfa, beta, gama] = await inserir("developments", [
      { organization_id: ORG_PROVA, name: `${ROTULO} ALFA`, neighborhood: "Bairro Prova", city: "Cidade Prova" },
      { organization_id: ORG_PROVA, name: `${ROTULO} BETA`, neighborhood: "Bairro Prova", city: "Cidade Prova" },
      { organization_id: ORG_PROVA, name: `${ROTULO} GAMA`, neighborhood: "Outro Bairro", city: "Cidade Prova" },
    ]);

    // ── A DEMANDA ───────────────────────────────────────────────────────────
    // `interessada_em_beta` é a prova de transferência: ela nunca ouviu falar de
    // ALFA, e tem de aparecer como candidata a ALFA por causa do bairro comum.
    // ⚠ TODAS as linhas com as MESMAS chaves. PostgREST recusa lote heterogêneo
    // com `PGRST102: All object keys must match` — a linha que só tinha
    // `preferred_neighborhoods` derrubava o insert inteiro.
    const lead = (extra) => ({
      organization_id: ORG_PROVA, status: "novo", source: "fonte-um", campaign: "camp-um",
      // `[]`, não `null`: a coluna é NOT NULL com default `{}`. E é por isso que
      // o censo mede bairro por `array_length(...) > 0` e não por `is not null` —
      // com esta coluna, `is not null` contaria 482 de 482.
      development_id: null, preferred_neighborhoods: [],
      assigned_to: a, assigned_user_id: a, name: null, ...extra,
    });
    // Só as duas primeiras linhas são referenciadas pelo nome; as outras três
    // continuam sendo INSERIDAS porque o grafo é medido sobre a base inteira —
    // elas entram na conta, não na asserção.
    const [emBeta, emGama] = await inserir("leads", [
      lead({ name: `${ROTULO} EM-BETA`, development_id: beta.id }),
      lead({ name: `${ROTULO} EM-GAMA`, development_id: gama.id, source: "fonte-dois", campaign: "camp-dois" }),
      lead({ name: `${ROTULO} DECLAROU`, preferred_neighborhoods: ["bairro prova"] }),
      lead({ name: `${ROTULO} DO-B`, development_id: beta.id, assigned_to: b, assigned_user_id: b }),
      lead({ name: `${ROTULO} JA-GANHA`, development_id: beta.id, status: "ganho" }),
    ]);

    // ── 1) "clientes compatíveis com novo estoque" ───────────────────────────
    const paraAlfa = async (ator) =>
      (await rpc("grafo_clientes_para_empreendimento", { p_development_id: alfa.id, p_ator_id: ator, p_limite: 100 })).corpo ?? [];

    const visaoDir = await paraAlfa(dir);
    const nomes = (lista) => lista.map((r) => r.nome);

    assert.ok(nomes(visaoDir).includes(`${ROTULO} EM-BETA`), "quem se interessou por BETA é candidato a ALFA: mesmo bairro");
    assert.ok(nomes(visaoDir).includes(`${ROTULO} DECLAROU`), "quem DECLAROU o bairro de ALFA é o candidato mais forte que existe");
    // O outro lado, e é o que separa consulta de peneira: GAMA é outro bairro.
    assert.ok(!nomes(visaoDir).includes(`${ROTULO} EM-GAMA`), "interesse em bairro DIFERENTE não é compatibilidade com ALFA");
    // Etapa terminal é histórico, não oportunidade.
    assert.ok(!nomes(visaoDir).includes(`${ROTULO} JA-GANHA`), "lead ganha não é candidata a estoque novo");

    // A base da evidência viaja, e distingue declarado de proxy.
    const porNome = new Map(visaoDir.map((r) => [r.nome, r]));
    assert.equal(porNome.get(`${ROTULO} DECLAROU`).base_da_evidencia, "atributo_declarado");
    assert.equal(porNome.get(`${ROTULO} EM-BETA`).base_da_evidencia, "mesmo_bairro");
    assert.ok(
      porNome.get(`${ROTULO} DECLAROU`).forca >= porNome.get(`${ROTULO} EM-BETA`).forca,
      "o que a pessoa DISSE não pode valer menos que o proxy de interesse revelado",
    );
    // O denominador vem junto, sempre.
    assert.equal(porNome.get(`${ROTULO} EM-BETA`).leads_na_base, visaoDir.length);

    // A cerca, os dois lados: A não vê a lead de B, e B não vê as de A.
    const visaoA = await paraAlfa(a);
    const visaoB = await paraAlfa(b);
    assert.ok(!nomes(visaoA).includes(`${ROTULO} DO-B`), "corretor A não pode ver a lead de B — grafo sem cerca é vazamento com nome bonito");
    assert.ok(nomes(visaoB).includes(`${ROTULO} DO-B`), "corretor B tem de ver a própria lead");
    assert.ok(!nomes(visaoB).includes(`${ROTULO} EM-BETA`), "corretor B não pode ver a lead de A");
    assert.ok(nomes(visaoDir).includes(`${ROTULO} DO-B`), "a liderança lê o funil inteiro");
    assert.equal((await paraAlfa(null)).length, 0, "ator nulo não vê nada");

    // ── 2) "imóveis substitutos" ─────────────────────────────────────────────
    const subs = (await rpc("grafo_empreendimentos_substitutos", { p_development_id: alfa.id })).corpo ?? [];
    const subsPorNome = new Map(subs.map((r) => [r.nome, r]));
    assert.ok(subsPorNome.has(`${ROTULO} BETA`), "BETA é substituto de ALFA: mesmo bairro");
    assert.equal(subsPorNome.get(`${ROTULO} BETA`).base_da_evidencia, "mesmo_bairro");
    // GAMA aparece, mas rotulado pelo recorte GROSSO — e com força menor.
    assert.equal(subsPorNome.get(`${ROTULO} GAMA`).base_da_evidencia, "mesma_cidade");
    assert.ok(
      subsPorNome.get(`${ROTULO} BETA`).forca > subsPorNome.get(`${ROTULO} GAMA`).forca,
      "mesmo bairro tem de valer mais que mesma cidade, senão o ranking mente",
    );

    // ── 3) "leads semelhantes" ──────────────────────────────────────────────
    const sem = (await rpc("grafo_leads_semelhantes", { p_lead_id: emBeta.id, p_ator_id: dir, p_limite: 100 })).corpo ?? [];
    const semPorNome = new Map(sem.map((r) => [r.nome, r]));
    assert.ok(semPorNome.has(`${ROTULO} DO-B`), "DO-B compartilha empreendimento, fonte e campanha com EM-BETA");
    assert.ok(
      semPorNome.get(`${ROTULO} DO-B`).arestas_em_comum >= 3,
      "três arestas compartilhadas têm de ser contadas como três",
    );
    assert.ok(semPorNome.get(`${ROTULO} DO-B`).bases.includes("mesmo_empreendimento"));
    // O outro lado: EM-GAMA não compartilha NADA com EM-BETA.
    assert.ok(!semPorNome.has(`${ROTULO} EM-GAMA`), "sem aresta em comum não é semelhança — zero arestas fica de fora");
    // A semente nunca é a própria resposta.
    assert.ok(!semPorNome.has(`${ROTULO} EM-BETA`), "a semente não pode aparecer como semelhante a si mesma");

    // ── 4) "corretor mais adequado" — a ordenação é a prova ─────────────────
    // O risco real: 1 desfecho com 1 vitória dá 100%. Se a ordenação for por
    // taxa, esse corretor lidera. Aqui A recebe 12 desfechos com 3 vitórias
    // (25%) e B recebe 1 desfecho com 1 vitória (100%).
    const paraRotular = await inserir("leads", Array.from({ length: 12 }, (_, i) =>
      lead({ name: `${ROTULO} ROTULO-A-${i}`, development_id: beta.id })));
    // `label_key` único por linha: a tabela tem UNIQUE (organization_id,
    // label_key), então um rótulo fixo insere UM e recusa os outros 11.
    await inserir("conversion_outcome_labels", paraRotular.map((l, i) => ({
      organization_id: ORG_PROVA, lead_id: l.id,
      outcome: i < 3 ? "won" : "lost", label_value: i < 3 ? 1 : 0,
      label_key: `${ROTULO}-a-${i}`, outcome_at: new Date().toISOString(),
    })));
    const [umDoB] = await inserir("leads", [
      lead({ name: `${ROTULO} ROTULO-B-0`, development_id: beta.id, assigned_to: b, assigned_user_id: b })]);
    await inserir("conversion_outcome_labels", [{
      organization_id: ORG_PROVA, lead_id: umDoB.id, outcome: "won", label_value: 1,
      label_key: `${ROTULO}-b-0`, outcome_at: new Date().toISOString(),
    }]);

    const apt = (await rpc("grafo_aptidao_do_corretor", { p_organization_id: ORG_PROVA, p_development_id: null })).corpo ?? [];
    const aptA = apt.find((r) => r.nome === `${ROTULO} A`);
    const aptB = apt.find((r) => r.nome === `${ROTULO} B`);
    assert.ok(aptA && aptB, "os dois corretores têm de aparecer");
    assert.equal(Number(aptA.desfechos_na_base), 12);
    assert.equal(Number(aptB.desfechos_na_base), 1);
    assert.ok(Number(aptB.taxa_de_ganho) > Number(aptA.taxa_de_ganho), "B tem 100% e A tem 25% — é o cenário da armadilha");
    assert.ok(
      apt.findIndex((r) => r.nome === `${ROTULO} A`) < apt.findIndex((r) => r.nome === `${ROTULO} B`),
      "o corretor com 12 desfechos tem de vir ANTES do de 1 desfecho com 100%. " +
        "Ordenar por taxa elegeria a sorte; a ordem é desfechos_na_base primeiro.",
    );

    // taxa NULA, não zero, para quem não tem desfecho: 0% seria acusação.
    const semDesfecho = apt.find((r) => r.nome === `${ROTULO} DIR`);
    assert.equal(Number(semDesfecho.desfechos_na_base), 0);
    assert.equal(semDesfecho.taxa_de_ganho, null, "sem desfecho a taxa é DESCONHECIDA; 0% diria que a pessoa não vende");

    // ── 5) "campanha com melhor desempenho" — mesma disciplina ──────────────
    const camp = (await rpc("grafo_desempenho_de_campanha", { p_organization_id: ORG_PROVA })).corpo ?? [];
    const campUm = camp.find((r) => r.campanha === "camp-um");
    const campDois = camp.find((r) => r.campanha === "camp-dois");
    assert.ok(campUm, "camp-um tem de aparecer");
    assert.equal(Number(campUm.desfechos_na_base), 13);
    assert.equal(Number(campUm.ganhos), 4);
    assert.ok(campDois, "camp-dois tem de aparecer mesmo sem desfecho — ausência é informação");
    assert.equal(campDois.taxa_de_ganho, null, "campanha sem desfecho não tem taxa 0%, tem taxa desconhecida");
    assert.ok(
      camp.findIndex((r) => r.campanha === "camp-um") < camp.findIndex((r) => r.campanha === "camp-dois"),
      "base antes de taxa, aqui também",
    );

    // ── 6) "oportunidades de recuperação" ──────────────────────────────────
    await rest(`leads?id=eq.${emGama.id}`, { method: "PATCH", body: JSON.stringify({ status: "perdido" }) });
    const rec = (await rpc("grafo_oportunidades_de_recuperacao", {
      p_organization_id: ORG_PROVA, p_ator_id: dir, p_limite: 200,
    })).corpo ?? [];
    const recNomes = rec.map((r) => r.nome);
    assert.ok(recNomes.includes(`${ROTULO} EM-GAMA`), "lead perdida é oportunidade de recuperação");
    assert.equal(rec.find((r) => r.nome === `${ROTULO} EM-GAMA`).motivo, "etapa_terminal");
    assert.ok(recNomes.includes(`${ROTULO} DECLAROU`), "lead sem primeiro contato entra por `nunca_contatada`");
    assert.ok(!recNomes.includes(`${ROTULO} JA-GANHA`), "quem comprou não é oportunidade de recuperação");

    // ⚠ Consentimento em DUAS colunas, nunca fundido num `pode_contatar`.
    const umaRec = rec[0];
    assert.ok("base_legal_da_fonte" in umaRec && "preferencia_da_pessoa" in umaRec,
      "as duas origens de consentimento têm de viajar separadas");
    assert.ok(!("pode_contatar" in umaRec),
      "coluna pode_contatar inventaria consentimento de PESSOA a partir de consentimento de FORMULÁRIO");

    // A cerca vale aqui também.
    const recDoA = (await rpc("grafo_oportunidades_de_recuperacao", {
      p_organization_id: ORG_PROVA, p_ator_id: a, p_limite: 200,
    })).corpo ?? [];
    assert.ok(!recDoA.map((r) => r.nome).includes(`${ROTULO} DO-B`), "a lista de recuperação de A não pode conter lead de B");

    // ── 7) "relações entre demanda e oferta" ───────────────────────────────
    const dxo = (await rpc("grafo_demanda_x_oferta", { p_organization_id: ORG_PROVA })).corpo ?? [];
    const prova = dxo.find((r) => r.bairro === "bairro prova");
    assert.ok(prova, "o bairro com oferta E demanda tem de aparecer");
    assert.equal(Number(prova.empreendimentos), 2, "ALFA e BETA estão no mesmo bairro");
    assert.equal(Number(prova.demanda_declarada), 1, "uma lead declarou este bairro");
    assert.ok(Number(prova.demanda_revelada) >= 2, "as leads penduradas em BETA são demanda revelada do bairro");
    assert.notEqual(
      Number(prova.demanda_declarada), Number(prova.demanda_revelada),
      "declarada e revelada são medidas DIFERENTES; se colapsarem numa só, o diagnóstico morre",
    );
    assert.equal(prova.unidades_disponiveis, null,
      "sem units_available cadastrado o estoque é DESCONHECIDO; 0 leria como esgotado");

    // ── O CENSO se enxerga ─────────────────────────────────────────────────
    const censo = (await rpc("grafo_censo_de_prontidao", { p_organization_id: ORG_PROVA })).corpo ?? [];
    const medicao = Object.fromEntries(censo.map((r) => [r.medida, Number(r.valor)]));
    assert.ok(medicao.pares_de_oferta_comparaveis >= 1, "ALFA e BETA formam um par comparável — o censo tem de vê-lo");
    assert.equal(medicao.ganhos_rotulados, 4);
    // E o juiz aceita ser alimentado pelo banco: sem exceção, sem chave faltando.
    for (const v of avaliarProntidao(medicao)) {
      for (const e of v.exigencias) {
        assert.notEqual(e.medido, null, `o censo do banco não produziu a medida "${e.medida}" que o juiz exige`);
      }
    }

    // ── A view respeita a organização, e o censo de arestas conta ───────────
    const arestas = (await rest(
      `vw_grafo_censo_de_arestas?organization_id=eq.${ORG_PROVA}&aresta=eq.lead_para_empreendimento&select=arestas,nos_de_origem,cobertura,cardinalidade`,
    )).corpo ?? [];
    assert.equal(arestas.length, 1);
    assert.ok(Number(arestas[0].arestas) >= 4, "as leads penduradas em empreendimento são arestas e o censo tem de contá-las");
    assert.ok(arestas[0].cobertura !== null, "aresta uma_por_no tem cobertura");
    assert.equal(arestas[0].cardinalidade, "uma_por_no");

    const multi = (await rest(
      `vw_grafo_censo_de_arestas?organization_id=eq.${ORG_PROVA}&aresta=eq.empreendimento_para_tipologia&select=cobertura,cardinalidade`,
    )).corpo ?? [];
    assert.equal(multi[0].cardinalidade, "muitas_por_no");
    assert.equal(multi[0].cobertura, null,
      "aresta muitas_por_no NÃO pode ter cobertura: 561 toques sobre 4 empreendimentos já apareceu como '140%' de cobertura");
  },
);
