/**
 * A FILA MONTADA NA TELA PRECISA CHEGAR AO MOTOR.
 *
 * ── O defeito que este contrato existe para não deixar voltar ───────────────
 *
 * `resolveLeadOwner` sempre aceitou um 4º argumento `escopo` — e NENHUM dos
 * chamadores passava. Medido em 2026-08-03: os dois caminhos de entrada
 * automática (Meta e portais) e a execução de proposta aprovada chamavam a
 * cascata sem escopo. Com escopo indefinido, `carregarElenco()` devolve `[]`,
 * `resolverElenco()` responde "sem-elenco" e a lead vai para o corretor com
 * menor carga da equipe INTEIRA — inclusive quem foi deliberadamente deixado
 * fora do elenco daquele empreendimento.
 *
 * O elenco, a tela que o monta e a tabela que o guarda existiam há semanas. A
 * feature inteira era decorativa e nada acusava: nenhuma rota errava, nenhum
 * teste ficava vermelho, a tela gravava e lia de verdade. Só a lead ia para a
 * pessoa errada, em silêncio.
 *
 * Por isso este contrato exercita o MOTOR, não a forma da chamada. Um portão
 * que só conferisse "tem 4 argumentos" passaria com `{}` — que é exatamente o
 * mesmo defeito com outra aparência.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveLeadOwner } from "../../lib/distribution/hierarchical-cascade.ts";

const ORG = "org-1";
const ARVO = "dev-arvo";
const CAMPANHA = "camp-investidor";

const perfil = (id, extras = {}) => ({
  id, full_name: id, name: id, role: "CORRETOR", commercial_role: "broker",
  reports_to: "gerente", active: true, availability_status: "AVAILABLE",
  max_active_leads: 100, ...extras,
});

const GERENTE = perfil("gerente", { role: "GERENTE", commercial_role: "manager", reports_to: null });

/**
 * Supabase de mentira, encadeável. Cada `.from(tabela)` devolve o que o cenário
 * declarou para aquela tabela; os filtros são ignorados de propósito — o que
 * está sob teste é a DECISÃO da cascata, não a tradução dela para PostgREST.
 *
 * `carga` é o único filtro que importa para a decisão, então ele entra por
 * fora, como um mapa de profileId → leads abertos.
 */
function supabaseDeMentira(cenario) {
  const tabelas = {
    profiles: cenario.perfis ?? [],
    whatsapp_broker_sessions: (cenario.conectados ?? []).map((profile_id) => ({ profile_id, status: "conectado" })),
    distribution_roster: cenario.elenco ?? [],
    source_round_robin: cenario.rodizioDaFonte ?? [],
    lead_distribution_history: cenario.historico ?? [],
    leads: cenario.leadsDoEscopo ?? [],
  };

  return {
    from(tabela) {
      const linhas = tabelas[tabela] ?? [];
      let perfilDaContagem = null;
      const encadeavel = {
        select(_colunas, opcoes) {
          if (opcoes?.head) encadeavel.__contando = true;
          return encadeavel;
        },
        eq() { return encadeavel; },
        in() { return encadeavel; },
        not() { return encadeavel; },
        or(expressao) {
          // `assigned_to.eq.<id>,assigned_user_id.eq.<id>` — é daqui que sai de
          // quem é a carga sendo medida.
          perfilDaContagem = String(expressao).split(".eq.")[1]?.split(",")[0] ?? null;
          return encadeavel;
        },
        order() { return encadeavel; },
        limit() { return encadeavel; },
        maybeSingle() { return Promise.resolve({ data: linhas[0] ?? null, error: null }); },
        then(resolver, rejeitar) {
          const resposta = encadeavel.__contando
            ? { count: cenario.carga?.[perfilDaContagem] ?? 0, error: null, data: null }
            : { data: linhas, error: null, count: linhas.length };
          return Promise.resolve(resposta).then(resolver, rejeitar);
        },
      };
      return encadeavel;
    },
  };
}

// ── SEM ESCOPO, NADA MUDA ───────────────────────────────────────────────────

test("sem escopo a cascata segue por menor carga, como sempre", async () => {
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["ana", "bru", "gerente"],
      carga: { ana: 9, bru: 2 },
      elenco: [{ escopo: "projeto", escopo_id: ARVO, profile_id: "ana", ativo: true, posicao: 1, created_at: "2026-01-01T00:00:00Z" }],
    }),
    ORG,
    null,
  );
  assert.equal(resultado.ownerId, "bru", "menor carga vence quando não há escopo");
  assert.equal(resultado.tier, "broker");
});

// ── COM ESCOPO, O ELENCO RESTRINGE DE VERDADE ───────────────────────────────

test("o elenco do empreendimento tira da jogada quem não está nele", async () => {
  // `bru` tem a MENOR carga — e é justamente por isso que este caso existe:
  // sem o escopo chegar ao motor, ela receberia.
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["ana", "bru", "gerente"],
      carga: { ana: 9, bru: 2 },
      elenco: [{ escopo: "projeto", escopo_id: ARVO, profile_id: "ana", ativo: true, posicao: 1, created_at: "2026-01-01T00:00:00Z" }],
    }),
    ORG,
    null,
    { projetoId: ARVO },
  );
  assert.equal(resultado.ownerId, "ana");
  assert.match(resultado.reason, /Elenco do empreendimento/);
});

test("escopo vazio não vale como escopo — é o mesmo defeito com outra cara", async () => {
  // Passar `{}` satisfaria qualquer portão que só contasse argumentos.
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["ana", "bru", "gerente"],
      carga: { ana: 9, bru: 2 },
      elenco: [{ escopo: "projeto", escopo_id: ARVO, profile_id: "ana", ativo: true, posicao: 1, created_at: "2026-01-01T00:00:00Z" }],
    }),
    ORG,
    null,
    {},
  );
  assert.equal(resultado.ownerId, "bru", "sem id de escopo o elenco não é aplicado");
});

test("campanha vence empreendimento no motor, não só na regra pura", async () => {
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["ana", "bru", "gerente"],
      carga: { ana: 1, bru: 1 },
      elenco: [
        { escopo: "projeto", escopo_id: ARVO, profile_id: "ana", ativo: true, posicao: 1, created_at: "2026-01-01T00:00:00Z" },
        { escopo: "campanha", escopo_id: CAMPANHA, profile_id: "bru", ativo: true, posicao: 1, created_at: "2026-01-01T00:00:00Z" },
      ],
    }),
    ORG,
    null,
    { projetoId: ARVO, campanhaId: CAMPANHA },
  );
  assert.equal(resultado.ownerId, "bru");
  assert.match(resultado.reason, /Elenco da campanha/);
});

// ── O RODÍZIO DECIDE, E A CARGA DEIXA DE DECIDIR ────────────────────────────

test("com fila montada, a vez vence a carga", async () => {
  // `ana` está com 1 lead e `bru` com 40. Menor carga daria `ana`; o rodízio dá
  // `bru`, porque foi `ana` quem recebeu a última lead DESTE empreendimento.
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["ana", "bru", "gerente"],
      carga: { ana: 1, bru: 40 },
      elenco: [
        { escopo: "projeto", escopo_id: ARVO, profile_id: "ana", ativo: true, posicao: 1, created_at: "2026-01-01T00:00:00Z" },
        { escopo: "projeto", escopo_id: ARVO, profile_id: "bru", ativo: true, posicao: 2, created_at: "2026-01-01T00:00:00Z" },
      ],
      leadsDoEscopo: [{ id: "lead-1" }],
      historico: [{ lead_id: "lead-1", assigned_user_id: "ana", created_at: "2026-08-03T10:00:00Z" }],
    }),
    ORG,
    null,
    { projetoId: ARVO },
  );
  assert.equal(resultado.ownerId, "bru");
  assert.match(resultado.reason, /corretor da vez/);
});

test("lead de OUTRO escopo não move o ponteiro deste", async () => {
  // O histórico registra que `ana` recebeu — mas de uma lead que não pertence a
  // este empreendimento. A vez continua sendo dela.
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["ana", "bru", "gerente"],
      carga: { ana: 1, bru: 40 },
      elenco: [
        { escopo: "projeto", escopo_id: ARVO, profile_id: "ana", ativo: true, posicao: 1, created_at: "2026-01-01T00:00:00Z" },
        { escopo: "projeto", escopo_id: ARVO, profile_id: "bru", ativo: true, posicao: 2, created_at: "2026-01-01T00:00:00Z" },
      ],
      leadsDoEscopo: [{ id: "lead-do-arvo" }],
      historico: [{ lead_id: "lead-de-outro-projeto", assigned_user_id: "ana", created_at: "2026-08-03T10:00:00Z" }],
    }),
    ORG,
    null,
    { projetoId: ARVO },
  );
  assert.equal(resultado.ownerId, "ana");
});

// ── O DEGRAU DE ESCAPE CONTINUA DE PÉ ───────────────────────────────────────

test("elenco existe e ninguém dele pode atender: sobe para o gerente", async () => {
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      // `ana` está no elenco e SEM WhatsApp; `bru` está conectada e fora dele.
      conectados: ["bru", "gerente"],
      carga: { ana: 0, bru: 0 },
      elenco: [{ escopo: "projeto", escopo_id: ARVO, profile_id: "ana", ativo: true, posicao: 1, created_at: "2026-01-01T00:00:00Z" }],
    }),
    ORG,
    null,
    { projetoId: ARVO },
  );
  assert.equal(resultado.ownerId, "gerente", "a lead NÃO cai para quem foi deixado de fora");
  assert.equal(resultado.tier, "manager");
});

// ── O RODÍZIO DA FONTE ──────────────────────────────────────────────────────

test("com rodízio na fonte, o dono único NÃO decide mais", async () => {
  // Medido em 03/08/2026: oito fontes ativas apontavam para o mesmo
  // `default_owner_id`, que sozinho segurava 485 das 613 leads. O degrau do
  // dono único passa na frente de tudo — inclusive da fila de atendimento.
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["ana", "bru", "gerente"],
      carga: { ana: 0, bru: 0 },
      rodizioDaFonte: [
        { profile_id: "ana", posicao: 1, active: true },
        { profile_id: "bru", posicao: 2, active: true },
      ],
    }),
    ORG,
    "gerente",                       // dono único da fonte
    { fonteId: "fonte-1" },
  );
  assert.equal(resultado.tier, "source_default");
  assert.ok(["ana", "bru"].includes(resultado.ownerId), "quem recebe sai do rodízio, não do dono único");
  assert.match(resultado.reason, /Rodízio da fonte/);
});

test("fonte SEM rodízio configurado não muda de comportamento", async () => {
  // Tabela vazia para esta fonte: o dono único continua valendo, exatamente
  // como antes. Ligar o rodízio não pode mexer em quem não o configurou.
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana")],
      conectados: ["ana", "gerente"],
      carga: { ana: 0 },
      rodizioDaFonte: [],
    }),
    ORG,
    "ana",
    { fonteId: "fonte-sem-rodizio" },
  );
  assert.equal(resultado.ownerId, "ana");
  assert.match(resultado.reason, /Dono padrão da fonte/);
});

test("sem `fonteId` no escopo, o rodízio nem é consultado", async () => {
  // O campo viaja dentro de `escopo` de propósito: um argumento solto seria
  // mais um parâmetro para ninguém passar.
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["ana", "bru", "gerente"],
      carga: { ana: 0, bru: 0 },
      rodizioDaFonte: [{ profile_id: "bru", posicao: 1, active: true }],
    }),
    ORG,
    "ana",
    {},
  );
  assert.equal(resultado.ownerId, "ana", "sem fonte declarada, quem manda é o dono único");
});

test("membro do rodízio sem WhatsApp é pulado, e o motivo fica escrito", async () => {
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["bru", "gerente"],          // ana sem canal
      carga: { ana: 0, bru: 0 },
      rodizioDaFonte: [
        { profile_id: "ana", posicao: 1, active: true },
        { profile_id: "bru", posicao: 2, active: true },
      ],
    }),
    ORG,
    null,
    { fonteId: "fonte-1" },
  );
  assert.equal(resultado.ownerId, "bru");
  assert.match(resultado.reason, /Rodízio da fonte/);
});

test("rodízio inteiro indisponível cai para a cascata, não trava a lead", async () => {
  const resultado = await resolveLeadOwner(
    supabaseDeMentira({
      perfis: [GERENTE, perfil("ana"), perfil("bru")],
      conectados: ["bru", "gerente"],
      carga: { ana: 0, bru: 0 },
      rodizioDaFonte: [{ profile_id: "ana", posicao: 1, active: true }],
    }),
    ORG,
    null,
    { fonteId: "fonte-1" },
  );
  // `bru` está conectada e fora do rodízio: a cascata segue e a lead tem dono.
  assert.equal(resultado.ownerId, "bru");
  assert.equal(resultado.tier, "broker");
});

// ── OS CHAMADORES ───────────────────────────────────────────────────────────
//
// Os casos acima provam o MOTOR. Este prova a LIGAÇÃO — e a ligação é
// exatamente o que faltava. Exercitar as rotas de entrada de verdade exigiria
// levantar o outbox inteiro (Graph da Meta, webhook do portal, aprovações), e
// nesse caso a leitura do código é o instrumento que resta: é o critério de
// `atlas-v3-mutation-testing` — grep serve para o que não dá para executar.
//
// Não confere ARIDADE, confere SUBSTÂNCIA: um `escopo` que não mencione
// `projetoId` nem `campanhaId` (nem venha de uma variável de escopo) passaria
// num portão de contagem de argumentos e reintroduziria o defeito inteiro.

const CHAMADORES = [
  "app/api/v2/outbox/process/route.ts",
  "app/api/v2/approvals/[id]/route.ts",
];

/** Devolve o texto dos argumentos de cada chamada a `resolveLeadOwner(`. */
function chamadas(fonte) {
  const encontradas = [];
  let indice = fonte.indexOf("resolveLeadOwner(");
  while (indice !== -1) {
    let profundidade = 0;
    let fim = indice + "resolveLeadOwner(".length - 1;
    for (; fim < fonte.length; fim += 1) {
      if (fonte[fim] === "(") profundidade += 1;
      else if (fonte[fim] === ")") {
        profundidade -= 1;
        if (profundidade === 0) break;
      }
    }
    encontradas.push(fonte.slice(indice, fim + 1));
    indice = fonte.indexOf("resolveLeadOwner(", fim);
  }
  return encontradas;
}

test("toda entrada de lead resolve o dono COM o escopo da lead", () => {
  for (const arquivo of CHAMADORES) {
    const fonte = readFileSync(new URL(`../../${arquivo}`, import.meta.url), "utf8");
    const invocacoes = chamadas(fonte).filter((texto) => !texto.startsWith("resolveLeadOwner()"));
    assert.ok(invocacoes.length > 0, `${arquivo} deveria chamar resolveLeadOwner`);
    for (const invocacao of invocacoes) {
      assert.ok(
        /projetoId|campanhaId|escopoDaLead/.test(invocacao),
        `${arquivo}: chamada sem escopo da lead — o elenco e o rodízio voltam a ser decorativos.\n${invocacao}`,
      );
    }
  }
});
