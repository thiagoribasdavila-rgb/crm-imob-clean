/**
 * Contrato da CLASSE "tabela nova sem cerca".
 *
 * ── O DEFEITO QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * `supabase/migrations/20260727040000_regras_de_comissao.sql` criou
 * `public.commission_rules` (pct_corretor, pct_gerente, pct_diretor,
 * pct_imobiliaria, premio_valor) com ZERO `enable row level security` e ZERO
 * policy. No banco de homologação a cerca EXISTE — relrowsecurity = true e 2
 * policies, lidas com pg_get_expr(pg_policy) em 2026-07-29 — porque alguém as
 * aplicou À MÃO, FORA do repositório.
 *
 * Logo o banco vivo estava certo e o REPOSITÓRIO estava errado. Quem
 * provisionasse produção rodando estas migrations ganharia a tabela ABERTA, e
 * `has_table_privilege('anon','public.commission_rules','SELECT')` = true com a
 * chave anon indo no bundle do navegador POR DESENHO: o rateio de comissão de
 * toda imobiliária legível entre inquilinos por quem soubesse o nome da tabela.
 *
 * ── POR QUE UM CONTRATO, E NÃO UM `*:check` ─────────────────────────────────
 *
 * `scripts/check-rls.mjs` percorre uma lista CURADA (`config/rls-audit.json`,
 * `criticalTables`) e não mencionava `commission_rules`. Lista curada não pega
 * tabela NOVA — é justamente a tabela que ninguém lembrou de curar que entra sem
 * cerca. Aqui a lista é DERIVADA das migrations: toda tabela criada entra, e sair
 * exige quarentena com motivo escrito.
 *
 * E é CONTRATO porque `scripts/mutacoes.mjs` executa apenas
 * `npm run test:contracts`: propriedade vigiada só por um `*:check` não sobrevive
 * a mutação.
 *
 * ── DUAS ARMADILHAS QUE ESTE ARQUIVO DESARMA DE PROPÓSITO ───────────────────
 *
 * 1. COMENTÁRIO CONTA COMO CÓDIGO se ninguém o remover. `20260729120000` e
 *    `20260728210000` traem `drop table if exists public.lead_alerts` e
 *    `...meta_leads_sem_destino` DENTRO de comentários, como instrução de
 *    rollback. Um scanner ingênuo leria "essa tabela foi dropada" e dispensaria a
 *    cerca das duas — um PASSE FALSO. Por isso `semComentarios` roda antes de tudo,
 *    e há teste provando que comentário não dispensa ninguém.
 *
 * 2. REGEX FROUXA ATRAVESSA STATEMENT. A primeira versão deste scanner casava
 *    `create policy[\s\S]{0,400}?on <tabela>` e enxergava 18 tabelas sem policy.
 *    O parser estrito — em que `on` vem imediatamente depois do NOME da policy —
 *    enxergou 33. As 15 de diferença eram policies de OUTRA tabela, casadas por
 *    cima do ponto-e-vírgula. Regex que atravessa statement inventa cobertura.
 *
 * ── O ESTADO MEDIDO EM 2026-07-29 ──────────────────────────────────────────
 *
 *   182 tabelas public criadas nas 167 migrations
 *     1 dropada por migration posterior (user_provisioning_failures) => 181 vivas
 *     0 vivas SEM `enable row level security`  <= o piso, sem exceção
 *    33 com RLS ligada e ZERO policy           <= quarentena declarada abaixo
 *
 * No banco vivo, conferido no mesmo dia: 183 tabelas em public, 0 com RLS
 * desligada. A cerca do ambiente está íntegra; a dívida é do repositório.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const dirMigrations = path.join(raiz, "supabase", "migrations");

/**
 * A QUARENTENA — tabelas dispensadas de TER POLICY, nunca de ter RLS.
 *
 * O piso (`enable row level security`) não tem quarentena nenhuma, e hoje não
 * precisa: as 181 tabelas vivas o cumprem. Se um dia precisar, que doa.
 *
 * Aqui embaixo é outra coisa: RLS LIGADA com ZERO policy é `deny-all` — o
 * Postgres não devolve linha nenhuma para anon nem para authenticated, e só
 * `service_role` (que tem BYPASSRLS) atravessa. Ou seja, FECHA, não vaza.
 *
 * ⚠ E é por isso que estas 33 NÃO devem ser "consertadas" em lote: acrescentar
 * policy a uma tabela deny-all ABRE o que hoje está fechado. Escrever 33 policies
 * às cegas seria a jogada perigosa desta tarefa, não a corajosa. Cada uma exige
 * saber quem deve ler — e isso se decide tabela por tabela, com o dono do módulo.
 *
 * Motivo por GRUPO, e não 33 textos copiados, porque 33 cópias apodrecem na
 * primeira mudança e "motivo que ninguém relê" é o mesmo mal que a lista curada.
 */
const GRUPOS_EM_QUARENTENA = [
  {
    motivo:
      "SERVICE-ONLY — RLS ligada e zero policy (deny-all), E a migration revoga explicitamente os privilégios de anon/authenticated. Tabela de infraestrutura, tocada só por service_role (BYPASSRLS). Policy aqui ABRIRIA o que hoje está fechado.",
    tabelas: [
      "api_rate_limit_buckets", "atlas_worker_runs", "dead_letter_events", "geocode_cache",
      "idempotency_keys", "integration_outbox",
    ],
  },
  {
    motivo:
      "FECHA-SEM-POLICY — RLS ligada e zero policy no repositório: deny-all para anon e authenticated, atendida só por service_role. Não vaza; a dívida é de completude (a policy real de 6 destas foi aplicada fora do repositório, mesma classe de deriva de commission_rules). Definir quem lê exige o dono do módulo — 2026-07-29.",
    tabelas: [
      "ai_conversations", "ai_learning_events", "ai_messages", "ai_tool_calls", "ai_usage",
      "approval_requests", "atlas_agent_runs", "atlas_api_clients", "atlas_data_products",
      "atlas_decisions", "atlas_entities", "atlas_events", "atlas_inventory_reservations",
      "atlas_launch_rooms", "atlas_memories", "atlas_recommendations", "atlas_relationships",
      "atlas_simulations", "automation_rules", "campaign_events", "creative_assets",
      "digital_twin_snapshots", "integrations", "knowledge_chunks", "lead_identity_registry",
      "lead_scores", "message_templates", "projects", "users",
    ],
  },
];

/**
 * Número MEDIDO, não estimado. Se a quarentena crescer sem alguém mexer aqui, doa.
 *
 * 2026-07-29: 33.
 * 2026-07-30: 34. CAUSA: `geocode_cache`, criada por
 *   `20260730030000_geolocalizacao_inicial_postgis.sql` (cache de geocodificação
 *   da frente 4.6). Entra no grupo SERVICE-ONLY, não no FECHA-SEM-POLICY: a
 *   migration revoga anon/authenticated explicitamente e concede só a
 *   service_role. CONFERIDO NO BANCO no mesmo dia, com a chave publishable indo
 *   direto ao PostgREST: `/rest/v1/geocode_cache` = HTTP 401 para anon, e
 *   has_table_privilege('anon'|'authenticated', ...,'SELECT') = false nas duas.
 *   Escrever policy aqui ABRIRIA um cache global (endereço -> coordenada) que
 *   hoje nenhum inquilino alcança.
 */
/*
 * 2026-08-02: 35. CAUSA: `atlas_worker_runs`, criada por
 *   `20260802120000_livro_de_execucoes_dos_vigias.sql` — o livro de execuções
 *   dos vigias, uma linha por invocação inclusive quando não houve trabalho.
 *   Entra no grupo SERVICE-ONLY: a migration revoga public/anon/authenticated
 *   explicitamente e concede só a service_role.
 *
 *   Escrever policy aqui seria pior que inútil: daria a um usuário final a
 *   capacidade de INSERIR uma linha de execução, e linha falsa neste livro faz a
 *   operação PARECER viva — que é exatamente o defeito que a tabela existe para
 *   acabar.
 *
 *   Este contrato REPROVOU a primeira versão da migration, que tinha RLS ligada
 *   e nenhum REVOKE. Ele estava certo, e o conserto foi fechar a tabela de
 *   verdade em vez de declará-la fechada.
 */
const QUARENTENA_MEDIDA_EM_2026_07_30 = 35;

const QUARENTENA = new Map();
for (const grupo of GRUPOS_EM_QUARENTENA) {
  for (const t of grupo.tabelas) QUARENTENA.set(t, grupo.motivo);
}

// ── O SCANNER ───────────────────────────────────────────────────────────────

/**
 * Comentário fora primeiro. Ver armadilha 1 no cabeçalho: sem isto, um
 * `drop table` escrito como instrução de rollback dispensa a cerca de uma tabela
 * que existe de verdade.
 */
function semComentarios(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const RE_CREATE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?/gi;
const RE_DROP = /drop\s+table\s+(?:if\s+exists\s+)?(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?/gi;
/** `on` imediatamente depois do NOME da policy. Ver armadilha 2. */
const RE_POLICY = /create\s+policy\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?\s+on\s+(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?/gi;

const ehPublic = (schema) => !schema || schema.toLowerCase() === "public";

/**
 * Recebe um corpus {arquivo -> sql} e devolve o diagnóstico. Recebe o corpus por
 * parâmetro DE PROPÓSITO: é o que permite provar o outro lado, alimentando o
 * mesmo detector com uma migration sintética sem cerca.
 */
function diagnosticar(corpus) {
  const arquivos = [...corpus.keys()].sort();
  const criada = new Map();
  const dropada = new Map();
  const comPolicy = new Set();
  const comRls = new Set();

  for (const arquivo of arquivos) {
    const sql = semComentarios(corpus.get(arquivo));
    for (const m of sql.matchAll(RE_CREATE)) {
      if (!ehPublic(m[1])) continue;
      const t = m[2].toLowerCase();
      if (!criada.has(t)) criada.set(t, arquivo);
    }
    for (const m of sql.matchAll(RE_DROP)) {
      if (!ehPublic(m[1])) continue;
      dropada.set(m[2].toLowerCase(), arquivo);
    }
    for (const m of sql.matchAll(RE_POLICY)) {
      if (!ehPublic(m[2])) continue;
      comPolicy.add(m[3].toLowerCase());
    }
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?\s+enable\s+row\s+level\s+security/gi,
    )) {
      if (!ehPublic(m[1])) continue;
      comRls.add(m[2].toLowerCase());
    }
  }

  const vivas = [];
  for (const [t, arquivoCriacao] of criada) {
    const arquivoDrop = dropada.get(t);
    // Dropada por migration POSTERIOR => não existe no fim. Isenção CALCULADA,
    // não declarada: ninguém precisa escrever motivo para tabela que não existe.
    if (arquivoDrop && arquivoDrop > arquivoCriacao) continue;
    vivas.push({ tabela: t, arquivoCriacao });
  }

  return {
    criadas: criada.size,
    vivas,
    semRls: vivas.filter((v) => !comRls.has(v.tabela)),
    semPolicy: vivas.filter((v) => comRls.has(v.tabela) && !comPolicy.has(v.tabela)),
    temPolicy: (t) => comPolicy.has(t),
  };
}

function corpusDoRepo() {
  const corpus = new Map();
  for (const nome of fs.readdirSync(dirMigrations).filter((n) => n.endsWith(".sql"))) {
    corpus.set(nome, fs.readFileSync(path.join(dirMigrations, nome), "utf8"));
  }
  return corpus;
}

const repo = diagnosticar(corpusDoRepo());

// ── O PISO: TODA TABELA VIVA TEM RLS ───────────────────────────────────────

test("toda tabela public criada por migration habilita RLS — sem exceção", () => {
  assert.deepEqual(
    repo.semRls.map((v) => `${v.tabela} (${v.arquivoCriacao})`),
    [],
    "tabela public criada sem `enable row level security`. A chave anon vai no bundle do " +
      "navegador por desenho, então sem RLS a única barreira é ninguém saber o nome da tabela. " +
      "Não existe quarentena para este piso: habilite RLS na mesma migration que cria.",
  );
});

test("o repositório reconstrói a cerca de todas as tabelas que ele cria", () => {
  // Guarda de sanidade do próprio scanner: se um refactor de regex fizer o
  // detector parar de VER tabelas, os testes acima passariam vazios e a suíte
  // ficaria verde protegendo nada. Ancorado num piso medido, não no número exato.
  assert.ok(
    repo.vivas.length >= 180,
    `o scanner só encontrou ${repo.vivas.length} tabelas vivas; em 2026-07-29 eram 181. ` +
      `Queda assim grande é regex quebrada, não migration removida — um detector cego ` +
      `deixa a suíte verde sem proteger nada.`,
  );
});

// ── A COMPLETUDE: POLICY OU QUARENTENA COM MOTIVO ──────────────────────────

test("toda tabela viva tem policy no repo, ou quarentena declarada com motivo", () => {
  const clandestinas = repo.semPolicy.filter((v) => !QUARENTENA.has(v.tabela));
  assert.deepEqual(
    clandestinas.map((v) => `${v.tabela} (${v.arquivoCriacao})`),
    [],
    "tabela com RLS ligada e ZERO policy que NÃO está na quarentena. Hoje ela é deny-all " +
      "(fecha, não vaza), mas ninguém declarou isso: ou escreva a policy, ou entre na " +
      "quarentena com motivo. Silenciar sem contar é o defeito.",
  );
});

test("a quarentena recusa motivo vazio ou sem categoria", () => {
  for (const grupo of GRUPOS_EM_QUARENTENA) {
    assert.match(
      grupo.motivo,
      /^(SERVICE-ONLY|FECHA-SEM-POLICY) — .{40,}/,
      `motivo inválido: precisa começar por SERVICE-ONLY ou FECHA-SEM-POLICY e explicar. ` +
        `Recebido: ${JSON.stringify(grupo.motivo.slice(0, 60))}`,
    );
    assert.ok(grupo.tabelas.length > 0, "grupo de quarentena sem tabela nenhuma");
  }
  for (const [tabela, motivo] of QUARENTENA) {
    assert.ok(motivo && motivo.trim().length > 40, `${tabela} está na quarentena sem motivo utilizável`);
  }
});

test("quarentena que sobreviveu ao problema sai — teto silencioso não fica", () => {
  // O mal que `scripts/portoes-todos.mjs` documenta: quarentena que dura mais que
  // o defeito passa a parecer cobertura. Se alguém escrever a policy, o nome tem
  // de SAIR daqui, senão a lista vira decoração.
  const jaResolvidas = [...QUARENTENA.keys()].filter((t) => repo.temPolicy(t));
  assert.deepEqual(
    jaResolvidas,
    [],
    "estas tabelas JÁ têm policy no repositório e continuam na quarentena. Remova-as da " +
      "lista: quarentena que sobrevive ao problema esconde a próxima tabela sem cerca.",
  );

  const inexistentes = [...QUARENTENA.keys()].filter(
    (t) => !repo.vivas.some((v) => v.tabela === t),
  );
  assert.deepEqual(inexistentes, [], "quarentena cita tabela que nenhuma migration cria (ou que foi dropada)");
});

test("o tamanho da quarentena é o número MEDIDO — crescer exige medir de novo", () => {
  assert.equal(
    repo.semPolicy.length,
    QUARENTENA_MEDIDA_EM_2026_07_30,
    `a quarentena foi medida em ${QUARENTENA_MEDIDA_EM_2026_07_30} tabelas em 2026-07-30 e ` +
      `agora são ${repo.semPolicy.length}. Se subiu, uma tabela nova entrou deny-all sem ninguém ` +
      `declarar; se caiu, alguém escreveu policy e esqueceu de tirar o nome da lista. ` +
      `Reapontar este número exige MEDIR e escrever a data e a causa.`,
  );
});

// ── O OUTRO LADO: O DETECTOR REPROVA DE VERDADE ────────────────────────────

test("REPROVA uma tabela criada sem RLS — o outro lado do filtro", () => {
  const sintetico = new Map([
    [
      "29990101000000_tabela_sem_cerca.sql",
      "create table if not exists public.segredo_comercial (\n  id uuid primary key,\n  organization_id uuid not null,\n  pct_corretor numeric(6,3)\n);\n",
    ],
  ]);
  const d = diagnosticar(sintetico);
  assert.deepEqual(
    d.semRls.map((v) => v.tabela),
    ["segredo_comercial"],
    "o detector NÃO viu uma tabela sem RLS. Sem esta prova, o teste do piso passaria " +
      "vazio para sempre e nenhum vazamento seria pego.",
  );
});

test("APROVA a mesma tabela quando a cerca está no lugar", () => {
  const sintetico = new Map([
    [
      "29990101000000_tabela_com_cerca.sql",
      "create table if not exists public.segredo_comercial (\n  id uuid primary key,\n  organization_id uuid not null\n);\n" +
        "alter table public.segredo_comercial enable row level security;\n" +
        "create policy segredo_leitura\n  on public.segredo_comercial\n  for select\n  using (true);\n",
    ],
  ]);
  const d = diagnosticar(sintetico);
  assert.deepEqual(d.semRls, [], "cerca no lugar e o detector reprovou — filtro que barra todos não protege, destrói");
  assert.deepEqual(d.semPolicy, [], "policy no lugar e o detector não a viu");
  assert.ok(d.temPolicy("segredo_comercial"));
});

test("comentário NÃO habilita cerca nem dispensa tabela", () => {
  // Armadilha 1, nos dois sentidos. `-- alter table ... enable row level security`
  // não pode satisfazer o piso, e `-- drop table ...` não pode isentar a tabela.
  const sintetico = new Map([
    [
      "29990101000000_so_comentario.sql",
      "create table if not exists public.quase_cercada (id uuid primary key);\n" +
        "-- alter table public.quase_cercada enable row level security;\n" +
        "-- drop table if exists public.quase_cercada;\n" +
        "/* create policy tudo on public.quase_cercada for select using (true); */\n",
    ],
  ]);
  const d = diagnosticar(sintetico);
  assert.deepEqual(
    d.semRls.map((v) => v.tabela),
    ["quase_cercada"],
    "cerca escrita em COMENTÁRIO passou por cerca de verdade — foi assim que " +
      "lead_alerts e meta_leads_sem_destino quase saíram da varredura por um rollback comentado",
  );
  assert.equal(d.temPolicy("quase_cercada"), false, "policy em comentário de bloco contou como policy");
});

test("policy de OUTRA tabela não conta — regex não atravessa statement", () => {
  // Armadilha 2. Antes do parser estrito, o `;` era atravessado e a policy de
  // `vizinha` era creditada a `desprotegida`.
  const sintetico = new Map([
    [
      "29990101000000_vizinhas.sql",
      "create table if not exists public.desprotegida (id uuid primary key);\n" +
        "alter table public.desprotegida enable row level security;\n" +
        "create table if not exists public.vizinha (id uuid primary key);\n" +
        "alter table public.vizinha enable row level security;\n" +
        "create policy vizinha_leitura\n  on public.vizinha\n  for select\n  using (true);\n",
    ],
  ]);
  const d = diagnosticar(sintetico);
  assert.equal(d.temPolicy("vizinha"), true);
  assert.equal(
    d.temPolicy("desprotegida"),
    false,
    "a policy de `vizinha` foi creditada a `desprotegida` — é o falso positivo que " +
      "fazia 33 tabelas sem policy parecerem 18",
  );
  assert.deepEqual(d.semPolicy.map((v) => v.tabela), ["desprotegida"]);
});

test("tabela dropada por migration POSTERIOR não exige cerca; por anterior, exige", () => {
  const dropDepois = diagnosticar(
    new Map([
      ["29990101000000_cria.sql", "create table public.temporaria (id uuid primary key);\n"],
      ["29990102000000_apaga.sql", "drop table if exists public.temporaria;\n"],
    ]),
  );
  assert.deepEqual(dropDepois.semRls, [], "tabela que não existe no fim não precisa de cerca");

  const dropAntes = diagnosticar(
    new Map([
      ["29990101000000_apaga.sql", "drop table if exists public.temporaria;\n"],
      ["29990102000000_cria.sql", "create table public.temporaria (id uuid primary key);\n"],
    ]),
  );
  assert.deepEqual(
    dropAntes.semRls.map((v) => v.tabela),
    ["temporaria"],
    "drop ANTES do create não apaga nada: a tabela existe no fim e precisa de cerca. " +
      "Sem isto, bastaria um `drop table` no topo do arquivo para escapar da varredura.",
  );
});

// ── O CASO QUE ORIGINOU A CLASSE ───────────────────────────────────────────

test("commission_rules tem a cerca que o banco vivo já tinha", () => {
  const sql = fs.readFileSync(
    path.join(dirMigrations, "20260727040000_regras_de_comissao.sql"),
    "utf8",
  );
  const executavel = semComentarios(sql);

  assert.match(
    executavel,
    /^alter table public\.commission_rules enable row level security;/m,
    "sem RLS aqui, provisionar produção pelo repo publica o rateio de comissão para a chave anon",
  );

  // As DUAS policies vivas, lidas com pg_get_expr(pg_policy) em 2026-07-29.
  assert.match(executavel, /^create policy commission_rules_leitura/m);
  assert.match(executavel, /^create policy commission_rules_escrita_diretoria/m);

  // A leitura é cercada por organização — é o que impede vazar entre inquilinos.
  const leitura = executavel.slice(executavel.indexOf("create policy commission_rules_leitura"));
  const corpoLeitura = leitura.slice(0, leitura.indexOf(";"));
  assert.match(corpoLeitura, /for select/);
  assert.match(
    corpoLeitura,
    /p\.organization_id = commission_rules\.organization_id/,
    "sem o casamento de organization_id a policy devolve a comissão das outras imobiliárias",
  );
  assert.match(corpoLeitura, /p\.id = auth\.uid\(\)/, "sem auth.uid() a cerca não sabe quem pergunta");

  // A ESCRITA é mais estrita que a leitura: quem é pago pelo percentual não o edita.
  const escrita = executavel.slice(executavel.indexOf("create policy commission_rules_escrita_diretoria"));
  const corpoEscrita = escrita.slice(0, escrita.indexOf("with check"));
  assert.match(
    corpoEscrita,
    /p\.role = 'admin' or p\.commercial_role = 'director'/,
    "a escrita precisa ser de diretoria: sem isso o corretor edita o próprio percentual",
  );
  // O outro lado: a policy de LEITURA não pode exigir diretoria, senão o corretor
  // abre a tela de comissão vazia — filtro que barra todo mundo destrói o produto.
  assert.doesNotMatch(
    corpoLeitura,
    /commercial_role = 'director'/,
    "leitura restrita à diretoria deixaria o corretor sem conferir o próprio rateio",
  );

  // `with check` é obrigatório: sem ele, o UPDATE passa a gravar linha para fora
  // da organização mesmo com o `using` correto.
  assert.match(escrita, /with check/, "sem with check, INSERT/UPDATE grava para fora da própria organização");

  // Idempotente: esta migration RODA em bancos que já têm as policies (homologação
  // é um deles). `create policy` cru aborta com 42710 e derruba o deploy inteiro.
  for (const nome of ["commission_rules_leitura", "commission_rules_escrita_diretoria"]) {
    assert.match(
      executavel,
      new RegExp(`^drop policy if exists ${nome} on public\\.commission_rules;`, "m"),
      `falta o drop idempotente de ${nome}: no banco que já tem a policy, o deploy aborta com 42710`,
    );
  }
});
