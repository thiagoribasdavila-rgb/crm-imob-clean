/**
 * Contrato: A OFERTA ATIVA DO ACERVO ENTREGA PARA QUEM DEVE E RECUSA QUEM NÃO DEVE.
 *
 * ── POR QUE ESTE ARQUIVO EXECUTA CONTRA O BANCO ─────────────────────────────
 *
 * A regra da oferta mora numa RPC (`public.reservar_leads_do_acervo`). Um
 * contrato que fizesse grep no arquivo `.sql` provaria que alguém escreveu o
 * texto certo — não que o banco se comporta assim. E `scripts/mutacoes.mjs` só
 * roda `npm run test:contracts`: propriedade vigiada por grep sobrevive a
 * mutação, e neste repositório isso já aconteceu três vezes.
 *
 * A saída é a inversa: os NÚMEROS vivem em `lib/crm/acervo-de-resgate.ts` e este
 * arquivo cobra que o BANCO VIVO concorde com eles. Trocar `LIMITE_SEM_TOQUE` de
 * 5 para 7 no módulo não muda o banco — e o contrato fica vermelho. É assim que
 * uma propriedade de banco de dados fica coberta por mutação.
 *
 * ── POR QUE A METADE VIVA RODA NUM TENANT VAZIO ─────────────────────────────
 *
 * Na primeira execução desta prova, o pool de disposables acabou no meio do
 * teste e o claim seguiu para as 9 leads REAIS de acervo da organização Atlas
 * One — carimbou dono, prazo e marcador nelas. Foi revertido linha por linha
 * (prazo original = `created_at + 15 min`, medido nas 4 que sobraram intactas),
 * mas o defeito era do DESENHO do teste: pool compartilhado.
 *
 * Agora tudo — corretores, lote de importação e leads — nasce dentro da
 * organização "Atlas AI", um tenant sem perfis e sem acervo. A cerca de
 * organização da própria RPC é o que torna a organização real inalcançável, e o
 * teste AFIRMA isso: conta o pool real antes e depois e exige que não mude.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  LOTE_PADRAO,
  LIMITE_SEM_TOQUE,
  LOTES_POR_DIA,
  PRAZO_RESGATE_MINUTOS,
  STATUS_FORA_DA_OFERTA,
  avaliarPedidoDeLote,
  avisoDeCanal,
  fraseDoContador,
  motivosDeRecusa,
  primeiroContatoAtrasado,
  traduzirRecusaDoAcervo,
} from "../../lib/crm/acervo-de-resgate.ts";

const RAIZ = process.cwd();
const MIGRATION = path.join(RAIZ, "supabase/migrations/20260730010000_oferta_ativa_do_acervo_de_resgate.sql");

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1 — A REGRA, sem banco. Roda sempre.
// ═══════════════════════════════════════════════════════════════════════════

test("a ordem da recusa não é cosmética: papel primeiro, acervo vazio por último", () => {
  // Quem não é corretor ouve isso mesmo com o acervo vazio: o problema dele não
  // é o acervo, e mandá-lo esperar por leads que nunca vai poder pegar é mentira.
  const naoCorretor = avaliarPedidoDeLote({ papel: "manager", semToque: 0, lotesHoje: 0, disponivel: 0 });
  assert.equal(naoCorretor.motivo, "acervo_ator_nao_e_corretor");

  // E "acervo esgotado" só aparece para quem PODERIA pegar — é a diferença entre
  // "acabou para todos" e "você já pegou o seu lote".
  const travado = avaliarPedidoDeLote({ papel: "broker", semToque: LIMITE_SEM_TOQUE, lotesHoje: 0, disponivel: 0 });
  assert.equal(travado.motivo, "acervo_recarga_bloqueada");
  const esgotado = avaliarPedidoDeLote({ papel: "broker", semToque: 0, lotesHoje: 0, disponivel: 0 });
  assert.equal(esgotado.motivo, "acervo_vazio");
});

test("a recarga libera em LIMITE_SEM_TOQUE - 1 e trava no limite", () => {
  const abaixo = avaliarPedidoDeLote({ papel: "broker", semToque: LIMITE_SEM_TOQUE - 1, lotesHoje: 0, disponivel: 50 });
  assert.equal(abaixo.pode, true, "com 4 sem toque o corretor pega o próximo lote");
  assert.equal(abaixo.lote, LOTE_PADRAO);
  const noLimite = avaliarPedidoDeLote({ papel: "broker", semToque: LIMITE_SEM_TOQUE, lotesHoje: 0, disponivel: 50 });
  assert.equal(noLimite.pode, false);
  assert.equal(noLimite.motivo, "acervo_recarga_bloqueada");
});

test("o teto diário de lotes é uma trava separada da recarga", () => {
  const noTetoDiario = avaliarPedidoDeLote({ papel: "broker", semToque: 0, lotesHoje: LOTES_POR_DIA, disponivel: 50 });
  assert.equal(noTetoDiario.motivo, "acervo_lotes_do_dia_esgotados");
  const antes = avaliarPedidoDeLote({ papel: "broker", semToque: 0, lotesHoje: LOTES_POR_DIA - 1, disponivel: 50 });
  assert.equal(antes.pode, true);
});

test("o teto de carteira CORTA o lote em vez de recusar tudo — e recusa quando não há espaço", () => {
  const cortado = avaliarPedidoDeLote({ papel: "broker", semToque: 0, lotesHoje: 0, disponivel: 50, tetoDeCarteira: 100, carteiraTotal: 97 });
  assert.equal(cortado.pode, true);
  assert.equal(cortado.lote, 3, "sobra espaço para 3, então o lote é 3 — não 10 nem zero");
  const cheio = avaliarPedidoDeLote({ papel: "broker", semToque: 0, lotesHoje: 0, disponivel: 50, tetoDeCarteira: 100, carteiraTotal: 100 });
  assert.equal(cheio.motivo, "broker_total_capacity_reached");
  // SEM teto configurado (o estado medido hoje: broker_capacity_limits tem 0
  // linhas) o lote é inteiro. O teto não pode ser inventado por ausência.
  const semTeto = avaliarPedidoDeLote({ papel: "broker", semToque: 0, lotesHoje: 0, disponivel: 50 });
  assert.equal(semTeto.lote, LOTE_PADRAO);
});

test("o lote nunca é maior que o que existe no acervo", () => {
  const parcial = avaliarPedidoDeLote({ papel: "broker", semToque: 0, lotesHoje: 0, disponivel: 3 });
  assert.equal(parcial.pode, true);
  assert.equal(parcial.lote, 3);
});

test("todo motivo de recusa tem código, status e frase — nenhum bloqueio silencioso", () => {
  for (const motivo of motivosDeRecusa()) {
    const t = traduzirRecusaDoAcervo(`erro do banco: ${motivo}`);
    assert.equal(t.motivo, motivo);
    assert.ok(t.codigo.startsWith("OFERTA_") || t.codigo === "OFERTA_TETO_DE_CARTEIRA", `${motivo} sem código próprio`);
    assert.ok(t.frase.length > 20, `${motivo} sem frase que explique`);
  }
  // 409 para estado do mundo, 403 só para porta fechada à PESSOA.
  assert.equal(traduzirRecusaDoAcervo("acervo_vazio").status, 409);
  assert.equal(traduzirRecusaDoAcervo("acervo_recarga_bloqueada").status, 409);
  assert.equal(traduzirRecusaDoAcervo("acervo_ator_nao_e_corretor").status, 403);
  assert.equal(traduzirRecusaDoAcervo("acervo_ator_fora_da_organizacao").status, 403);
  // Erro desconhecido não vira 500 opaco nem finge um motivo que não existe.
  const desconhecido = traduzirRecusaDoAcervo("deadlock detected");
  assert.equal(desconhecido.motivo, null);
  assert.equal(desconhecido.codigo, "OFERTA_RECUSADA");
});

test("o contador da tela mostra o número e o limite, sempre", () => {
  assert.equal(fraseDoContador(0), `Você tem 0 de ${LIMITE_SEM_TOQUE - 1} leads de resgate sem primeiro contato.`);
  assert.ok(fraseDoContador(4).includes("4"));
});

test("ausência de consentimento é dita como 'não perguntado', nunca como 'sem restrição'", () => {
  const aviso = avisoDeCanal({
    bloqueiosDeReativacao: ["consent_missing", "approved_template_missing"],
    semConsentimento: 13, comTelefone: 13, comEmail: 4, total: 13,
  });
  assert.equal(aviso.disparoEmMassaBloqueado, true);
  assert.match(aviso.frase, /não perguntado/i);
  // A frase PODE citar "sem restrição" — mas só para NEGAR. O que ela não pode é
  // afirmar. Ausência de "não" registrado não é permissão.
  assert.match(aviso.frase, /não é o mesmo que .sem restrição/i, "a frase deixou de negar explicitamente que isto libere contato");
  assert.match(aviso.frase, /BLOQUEAD/);
  assert.match(aviso.caminho, /Liga(ç|c)ão individual/i);
  // Pool só com e-mail: o caminho muda, e a tela não manda ninguém ligar.
  const soEmail = avisoDeCanal({ bloqueiosDeReativacao: [], semConsentimento: 0, comTelefone: 0, comEmail: 9, total: 9 });
  assert.match(soEmail.caminho, /e-mail/);
});

test("atraso de primeiro contato: acervo exige prazo gravado e vencido; demanda não", () => {
  const agora = Date.parse("2026-07-30T12:00:00Z");
  const vencido = "2026-07-29T12:00:00Z";
  const futuro = "2026-07-31T12:00:00Z";

  // Demanda que PEDIU contato: sem primeiro contato já é atraso, como sempre foi.
  assert.equal(primeiroContatoAtrasado({ first_contacted_at: null, import_batch_id: null }, agora), true);
  // Acervo no balcão (sem prazo): NÃO é atraso. Sem isso, importar 16.733 leads
  // cria ~17 mil violações na central no mesmo dia.
  assert.equal(primeiroContatoAtrasado({ first_contacted_at: null, import_batch_id: "lote", first_contact_due_at: null }, agora), false);
  // Acervo PEGO, dentro das 24h: ainda não é atraso.
  assert.equal(primeiroContatoAtrasado({ first_contacted_at: null, import_batch_id: "lote", first_contact_due_at: futuro }, agora), false);
  // Acervo pego e o prazo estourou: É atraso, e tem de aparecer.
  assert.equal(primeiroContatoAtrasado({ first_contacted_at: null, import_batch_id: "lote", first_contact_due_at: vencido }, agora), true);
  // Contatado nunca é atraso, venha de onde vier.
  assert.equal(primeiroContatoAtrasado({ first_contacted_at: vencido, import_batch_id: "lote", first_contact_due_at: vencido }, agora), false);
});

test("LIGAÇÃO: a migration aplica exatamente as travas e os números do módulo", () => {
  // Não substitui a prova viva abaixo — é a cerca contra a migration e o módulo
  // divergirem no dia em que alguém mexer num só dos dois.
  const sql = fs.readFileSync(MIGRATION, "utf8");
  // ⚠ A ÂNCORA É A CLÁUSULA EXECUTÁVEL, NÃO O TEXTO EM QUALQUER LUGAR.
  //
  // A primeira versão desta asserção era `/for update skip locked/` e SOBREVIVEU
  // à mutação M102: a expressão aparece em três comentários deste mesmo arquivo,
  // então apagá-la da consulta real deixava o teste verde casando com texto
  // morto. É exatamente o ponto cego que `scripts/mutacoes.mjs` existe para
  // achar, e ele achou. `^\s*...\s*$` só casa a linha da cláusula: comentário
  // começa com `--` e não passa.
  assert.match(sql, /^\s*for update skip locked\s*$/m, "sem skip locked dois corretores esperam um ao outro e voltam com o MESMO lote");
  assert.match(sql, /^\s*perform pg_advisory_xact_lock\($/m);
  assert.match(sql, /hashtextextended\(p_organization_id::text \|\| p_actor_id::text, 58\)/, "a trava é por corretor, seed 58");
  assert.match(sql, /and l\.assigned_to is null\s*\n\s*and l\.assigned_user_id is null/, "a re-checagem no UPDATE é a segunda cerca");
  assert.match(sql, /assigned_to = p_actor_id,\s*\n\s*assigned_user_id = p_actor_id/, "as duas colunas de dono, sempre");
  assert.ok(sql.includes(`if v_em_aberto >= ${LIMITE_SEM_TOQUE} then`), "o limite de recarga do banco tem de ser o do módulo");
  assert.ok(sql.includes(`if v_lotes_hoje >= ${LOTES_POR_DIA} then`), "o teto diário do banco tem de ser o do módulo");
  assert.ok(sql.includes(`default ${PRAZO_RESGATE_MINUTOS}`), "o prazo de resgate do banco tem de ser o do módulo");
  assert.ok(sql.includes(`p_limit > ${LOTE_PADRAO}`), "o tamanho máximo do lote tem de ser o do módulo");
  for (const status of STATUS_FORA_DA_OFERTA) {
    assert.ok(sql.includes(`'${status}'`), `o predicado do pool não exclui ${status}`);
  }
  // O rollback existe e NÃO mora em migrations/ — `.down.sql` ao lado cria
  // versão duplicada e o `db push` aborta depois de aplicar os anteriores.
  const rollback = path.join(RAIZ, "supabase/rollbacks/20260730010000_oferta_ativa_do_acervo_de_resgate.down.sql");
  assert.ok(fs.existsSync(rollback), "migration sem rollback");
  assert.ok(!fs.existsSync(path.join(RAIZ, "supabase/migrations/20260730010000_oferta_ativa_do_acervo_de_resgate.down.sql")));
});

test("LIGAÇÃO: a rota e a tela usam o módulo, e a lista mostra o acervo arquivado", () => {
  const rota = fs.readFileSync(path.join(RAIZ, "app/api/v1/crm/acervo/route.ts"), "utf8");
  assert.match(rota, /from "@\/lib\/crm\/acervo-de-resgate"/);
  assert.match(rota, /traduzirRecusaDoAcervo/);
  assert.match(rota, /reservar_leads_do_acervo/);

  // O bloqueador medido: sem isto a oferta entrega leads que não aparecem na
  // lista do corretor (16.733 das 17.151 do v1 estão em `arquivado`).
  const lista = fs.readFileSync(path.join(RAIZ, "app/api/v1/crm/leads/route.ts"), "utf8");
  assert.match(lista, /const acervo = params\.get\("acervo"\) === "1"/);
  assert.match(lista, /acervo\s*\n?\s*\?\s*query\s*\n?\s*\.not\("import_batch_id", "is", null\)/);

  // A central do corretor tem de usar a MESMA função de atraso.
  const central = fs.readFileSync(path.join(RAIZ, "app/api/v1/analytics/broker-daily/route.ts"), "utf8");
  assert.match(central, /primeiroContatoAtrasado/);
  assert.ok(!/activeLeads\.filter\(\(lead\) => !lead\.first_contacted_at\)/.test(central),
    "o predicado sem prazo voltou: o acervo conta como atrasado na central");

  // Os dois balcões não podem disputar a mesma linha.
  const distribuicao = fs.readFileSync(path.join(RAIZ, "app/api/v1/crm/distribution/route.ts"), "utf8");
  assert.match(distribuicao, /ehAcervoDeResgate/);
  const semDono = fs.readFileSync(path.join(RAIZ, "app/api/v1/ai/next-best-action/route.ts"), "utf8");
  assert.match(semDono, /\.is\("import_batch_id", null\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2 — A PROVA VIVA. Precisa de credenciais; sem elas, RECUSA em vez de
// passar em silêncio (suíte verde por ausência de credencial é pior que
// vermelha: ela declara protegido o que ninguém exerceu).
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

/** O tenant de prova: uma organização sem perfis e sem acervo. */
const ORG_PROVA = "87036a39-bb25-4290-88ae-e588d6581994";
/** A organização REAL. Só é LIDA, e o teste exige que ela não mude. */
const ORG_REAL = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
/**
 * O rótulo carrega a CORRIDA, e o prefixo comum permite varrer órfão.
 *
 * Sem a marca de corrida, duas execuções simultâneas (e neste repositório há mais
 * de um agente rodando a suíte ao mesmo tempo) apagariam os atores uma da outra no
 * meio do teste — flake que parece defeito de produto. Com só a marca, uma execução
 * que morre no meio deixa lixo para sempre. Os dois juntos resolvem: cada corrida
 * usa nomes próprios, e a varredura de órfão limpa o que ficou de corridas antigas.
 *
 * O relógio entra junto com o PID porque PID sozinho VOLTA: o sistema recicla, e
 * uma corrida que morreu sem limpar deixa lixo que a corrida seguinte confunde com
 * o próprio. `Date.now()` em base 36 desempata sem alongar o e-mail.
 */
const PREFIXO = "contrato-acervo-";
const CORRIDA = `${Date.now().toString(36)}${process.pid.toString(36)}`;
const MARCA = `${PREFIXO}${CORRIDA}-`;
const ROTULO = `CONTRATO-ACERVO-${CORRIDA}`;
/**
 * ── POR QUE O TELEFONE TAMBÉM PRECISA SER DA CORRIDA ────────────────────────
 *
 * Esta é a linha que derrubava o contrato, e ela não estava no nome nem no e-mail.
 *
 * `lead_identity_registry` tem chave primária (organization_id, 'phone', só os
 * dígitos) e o gatilho `leads_enforce_unique_identity` recusa a segunda lead com o
 * mesmo telefone na mesma organização. O rótulo e o e-mail já carregavam o PID —
 * mas o telefone era FIXO: `1196600000`..`1196600039`, os mesmos 40 números em toda
 * execução. Então duas corridas ao mesmo tempo disputavam as MESMAS 40 linhas do
 * registro: a primeira gravava, a segunda levava
 *   {"code":"P0001","message":"Este contato já pertence a uma lead única no CRM."}
 * e morria na semeadura, antes de exercer uma só regra da oferta.
 *
 * MEDIDO: duas execuções em paralelo contra o banco canônico — uma verde 24/24, a
 * outra 11/12, falhando na asserção dos 40 leads com `actual: undefined`. Rodando
 * sozinha, a mesma corrida passa. Era por isso que a falha parecia fantasma.
 *
 * O número nasce do relógio E do PID: dois processos no mesmo milissegundo têm PIDs
 * diferentes, e o mesmo PID em milissegundos diferentes muda a outra metade. Fica
 * com a forma de celular brasileiro (11 dígitos, DDD 11 + 9) porque é assim que o
 * resto do sistema lê telefone.
 */
const SEMENTE_TEL = String((Date.now() % 1000) * 1000 + (process.pid % 1000)).padStart(6, "0");
const telefoneDeProva = (i) => `119${SEMENTE_TEL}${String(i).padStart(2, "0")}`;
const cab = () => ({ apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" });

async function rpc(nome, args) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, { method: "POST", headers: cab(), body: JSON.stringify(args) });
  return { http: res.status, corpo: await res.json().catch(() => null) };
}
async function rest(caminho, opcoes = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${caminho}`, { ...opcoes, headers: { ...cab(), ...(opcoes.headers ?? {}) } });
  const texto = await res.text();
  return { http: res.status, corpo: texto ? JSON.parse(texto) : null };
}
const erro = (resposta) => String(resposta.corpo?.message ?? "");

/** Os atores DESTA corrida. */
async function usuarios() {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, { headers: cab() });
  return ((await r.json()).users ?? []).filter((u) => String(u.email).startsWith(MARCA));
}
/**
 * TODO ator do contrato, de qualquer corrida — e é a trava que torna isso seguro.
 *
 * Antes esta varredura só tocava no que tivesse mais de uma hora, para não apagar
 * os atores de uma execução simultânea. O preço era alto: uma corrida MORTA a
 * machadada (SIGKILL, timeout do agente, máquina reiniciada) nunca passa pelo
 * `t.after`, e as 40 leads dela ficavam no balcão do tenant de prova. A execução
 * seguinte semeava mais 40, o pool ia a 80, e `disponivel` — que o contrato exige
 * ser 40 — quebrava. Ou seja: uma morte violenta envenenava a HORA seguinte inteira.
 * É precisamente o "passa na primeira rodada e falha nas seguintes" que se procurava.
 *
 * Com a trava do tenant, a idade deixa de ser necessária: se estamos segurando a
 * trava, nenhuma outra execução está viva, então qualquer resíduo `CONTRATO-ACERVO-`
 * é de uma corrida que já morreu e pode sair agora, tenha a idade que tiver.
 *
 * ⚠ A trava é da MÁQUINA. Duas máquinas contra o mesmo banco voltariam a se
 * atropelar — mas aí o pool compartilhado já quebraria o contrato antes disto.
 */
async function todosOsAtoresDoContrato() {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, { headers: cab() });
  return ((await r.json()).users ?? []).filter((u) => String(u.email).startsWith(PREFIXO));
}
async function criar(email, perfil) {
  await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST", headers: cab(),
    body: JSON.stringify({ email, password: `Ct!${Math.random().toString(36).slice(2)}Aa1`, email_confirm: true }),
  });
  const u = (await usuarios()).find((x) => x.email === email);
  assert.ok(u, `usuário de prova não criado: ${email}`);
  // O provisionamento do perfil é assíncrono (trigger em auth.users).
  await new Promise((r) => setTimeout(r, 2200));
  const up = await rest("profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ id: u.id, ...perfil }]),
  });
  assert.ok(up.http < 300, `perfil de prova recusado (${email}): ${JSON.stringify(up.corpo)}`);
  return u.id;
}
const corretor = (nome, chefe) => ({
  organization_id: ORG_PROVA, full_name: `${ROTULO} ${nome}`, name: `${ROTULO} ${nome}`,
  role: "broker", commercial_role: "broker", access_role: "broker", reports_to: chefe, active: true,
});

/**
 * A limpeza roda no `t.after`, ou seja, TAMBÉM quando o teste morre no meio — e é
 * exatamente aí que ela não pode desistir no primeiro tropeço. Um DELETE que falha
 * (rede, FK, 5xx) não pode abortar os outros e deixar corretor, lote e leads no
 * banco canônico. Cada passo é engolido aqui e o estrago aparece na asserção do
 * pool real, que é o que de fato importa.
 */
const aTentar = async (o) => { try { return await o(); } catch { return null; } };

async function limpar() {
  const TODAS = encodeURIComponent("CONTRATO-ACERVO-%");
  // As leads saem primeiro: elas seguram o corretor por FK (dono, copilot, reserva).
  await aTentar(() => rest(`leads?name=like.${TODAS}`, { method: "DELETE" }));
  const atores = await todosOsAtoresDoContrato();
  for (const u of atores) {
    await aTentar(() => rest(`broker_capacity_limits?profile_id=eq.${u.id}`, { method: "DELETE" }));
    await aTentar(() => rest(`broker_capacity_limits?updated_by=eq.${u.id}`, { method: "DELETE" }));
    // O gatilho `leads_align_owner_copilot` cria copilot no claim; sem apagar,
    // o perfil não sai (FK sem cascade) e sobra lixo de teste no banco.
    await aTentar(() => rest(`lead_copilots?broker_id=eq.${u.id}`, { method: "DELETE" }));
    await aTentar(() => rest(`lead_assignment_reservations?broker_id=eq.${u.id}`, { method: "DELETE" }));
    await aTentar(() => rest(`lead_distribution_history?assigned_user_id=eq.${u.id}`, { method: "DELETE" }));
  }
  // Corretor antes do diretor, diretor antes da raiz: `reports_to` é FK.
  const ordem = ["-a@", "-b@", "-c@", "-d@", "-e@", "-dir@", "-raiz@"];
  for (const u of atores.sort((x, y) => ordem.findIndex((o) => x.email.includes(o)) - ordem.findIndex((o) => y.email.includes(o)))) {
    await aTentar(() => fetch(`${URL_BASE}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: cab() }));
  }
  // O lote vai por último: `leads.import_batch_id` é `on delete set null`, então
  // apagá-lo antes das leads as tiraria do acervo em vez de apagá-las, e o
  // `like.CONTRATO-ACERVO-%` acima deixaria de ser o critério que de fato limpa.
  await aTentar(() => rest(`import_batches?source_name=like.${TODAS}`, { method: "DELETE" }));
}

const poolReal = async () =>
  (await rest(`leads?organization_id=eq.${ORG_REAL}&import_batch_id=not.is.null&assigned_to=is.null&assigned_user_id=is.null&select=id`))
    .corpo?.length ?? 0;

/**
 * ── POR QUE UMA TRAVA, E NÃO SÓ NOMES PRÓPRIOS ──────────────────────────────
 *
 * Dar telefone e rótulo próprios a cada corrida resolve a COLISÃO DE IDENTIDADE,
 * mas não resolve a disputa pelo BALCÃO: `reservar_leads_do_acervo` serve o pool
 * inteiro da organização — toda lead de importação sem dono —, não o lote de quem
 * chamou. Com duas corridas vivas no mesmo tenant de prova, o corretor de uma pega
 * as leads da outra, e o contrato acusa coisas que o produto não fez.
 *
 * MEDIDO, depois de já ter corrigido o telefone: duas execuções em paralelo, 19/24
 * e 20/24, falhando em "o claim saiu do conjunto de prova" e num `disponivel` de 80
 * onde o teste semeou 40. Não é defeito da oferta — é o teste disputando consigo
 * mesmo.
 *
 * Então a corrida toma posse do tenant de prova enquanto exerce a oferta. A trava é
 * um ARQUIVO criado com `wx` — criação exclusiva, atômica no sistema de arquivos:
 * quem cria é o dono, os outros esperam. A trava de uma corrida MORTA (kill,
 * timeout, queda do agente) é quebrada por quem chega depois — pelo dono já não
 * existir, ou por velhice — para que um processo morto não bloqueie o repositório
 * para sempre.
 *
 * ⚠ A JANELA ENTRE CRIAR E ASSINAR é o que derrubou a primeira versão desta trava.
 * Ela era um DIRETÓRIO com o PID num arquivo lá dentro, escrito DEPOIS do `mkdir`.
 * Quem chegasse nesse intervalo lia "sem dono", concluía "corrida morta" e QUEBRAVA
 * a trava de um processo vivo; dois quebrando ao mesmo tempo ainda estouravam
 * `ENOTEMPTY` no `rmSync`. Medido: 3 execuções simultâneas, 2 falharam. Com um
 * arquivo único o `unlink` é indivisível, e uma trava recém-nascida sem assinatura
 * é tratada como VIVA (carência) em vez de morta.
 */
const TRAVA = path.join(os.tmpdir(), "contrato-oferta-ativa-do-acervo.trava");
const TRAVA_VELHA = 5 * 60_000;
const CARENCIA = 10_000;
const ESPERA_MAXIMA = 4 * 60_000;

function donoVivo() {
  let assinatura = "";
  try { assinatura = fs.readFileSync(TRAVA, "utf8").trim(); } catch { return false; }
  if (!assinatura) {
    // Criada e ainda não assinada: o dono está nascendo, não morto.
    try { return Date.now() - fs.statSync(TRAVA).mtimeMs < CARENCIA; } catch { return false; }
  }
  const pid = Number(assinatura);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  // ESRCH = o dono morreu. EPERM = existe, mas é de outro usuário: está vivo.
  catch (e) { return e?.code === "EPERM"; }
}

async function tomarOTenantDeProva() {
  const limite = Date.now() + ESPERA_MAXIMA;
  for (;;) {
    try {
      fs.writeFileSync(TRAVA, String(process.pid), { flag: "wx" });
      return;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let idade = Infinity;
      try { idade = Date.now() - fs.statSync(TRAVA).mtimeMs; } catch { idade = Infinity; }
      if (!donoVivo() || idade > TRAVA_VELHA) {
        // `force` para o caso de outro contendor ter apagado primeiro.
        fs.rmSync(TRAVA, { force: true });
        continue;
      }
      assert.ok(Date.now() < limite, `outra execução deste contrato segurou o tenant de prova por mais de ${ESPERA_MAXIMA / 60_000} min`);
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}
/** Só o dono solta: quebrar a trava de quem herdou o tenant seria pior que vazar. */
const soltarOTenantDeProva = () => {
  try {
    if (fs.readFileSync(TRAVA, "utf8").trim() === String(process.pid)) fs.rmSync(TRAVA, { force: true });
  } catch { /* já foi */ }
};
// Rede para o processo que morre sem passar pelo `t.after`.
process.on("exit", soltarOTenantDeProva);

test("PROVA VIVA: a oferta entrega, recusa, não duplica e não toca a organização real", { skip: TEM_BANCO ? false : "sem credenciais do Supabase em .env.local" }, async (t) => {
  await tomarOTenantDeProva();
  const antesReal = await poolReal();
  t.after(async () => {
    // A limpeza vem antes da asserção de propósito: se o pool real mudou, o banco
    // já está limpo quando o teste grita. E a trava só cai no fim, aconteça o que
    // acontecer — inclusive se a própria asserção falhar.
    try {
      await limpar();
      assert.equal(await poolReal(), antesReal, "o pool da organização REAL mudou — o teste vazou para fora do tenant de prova");
    } finally {
      soltarOTenantDeProva();
    }
  });
  await limpar();

  // ── o tenant de prova ────────────────────────────────────────────────────
  const raiz = await criar(`${MARCA}raiz@atlas-teste.local`, {
    organization_id: ORG_PROVA, full_name: `${ROTULO} Raiz`, name: `${ROTULO} Raiz`,
    role: "admin", commercial_role: "director", access_role: "director_decisor", reports_to: null, active: true,
  });
  const diretor = await criar(`${MARCA}dir@atlas-teste.local`, {
    organization_id: ORG_PROVA, full_name: `${ROTULO} Diretor`, name: `${ROTULO} Diretor`,
    role: "manager", commercial_role: "manager", access_role: "director", reports_to: raiz, active: true,
  });
  const [a, b, c, d, e] = await Promise.all([
    criar(`${MARCA}a@atlas-teste.local`, corretor("A", diretor)),
    criar(`${MARCA}b@atlas-teste.local`, corretor("B", diretor)),
    criar(`${MARCA}c@atlas-teste.local`, corretor("C", diretor)),
    criar(`${MARCA}d@atlas-teste.local`, corretor("D", diretor)),
    criar(`${MARCA}e@atlas-teste.local`, corretor("E", diretor)),
  ]);

  const lote = await rest("import_batches", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ organization_id: ORG_PROVA, source_name: `${ROTULO} lote de prova`, total_rows: 40, imported_rows: 40 }]),
  });
  const loteId = lote.corpo?.[0]?.id;
  assert.ok(loteId, `lote de importação de prova não criado: ${JSON.stringify(lote.corpo)}`);

  const semear = [];
  for (let i = 0; i < 40; i += 1) {
    semear.push({
      organization_id: ORG_PROVA, name: `${ROTULO} lead ${String(i).padStart(2, "0")}`,
      phone: telefoneDeProva(i), source: "importacao_v1",
      status: i % 3 === 0 ? "perdido" : i % 3 === 1 ? "novo" : "contato",
      import_batch_id: loteId, created_at: new Date(Date.UTC(1990, 0, 1 + i)).toISOString(),
    });
  }
  const criadas = await rest("leads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(semear) });
  assert.equal(criadas.corpo?.length, 40, `leads de prova: ${JSON.stringify(criadas.corpo)?.slice(0, 300)}`);
  const meus = new Set(criadas.corpo.map((l) => l.id));

  await t.test("acervo entra SEM prazo de primeiro contato", () => {
    const comPrazo = criadas.corpo.filter((l) => l.first_contact_due_at !== null);
    assert.deepEqual(comPrazo, [], "lead de importação nasceu com prazo — a central mostraria ~17 mil violações");
    assert.deepEqual(criadas.corpo.filter((l) => l.first_contact_sla_minutes !== null), []);
  });

  await t.test("a regra de SLA da demanda NÃO regrediu: meta_ads continua com 5 minutos", async () => {
    const demanda = await rest("leads", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ organization_id: ORG_PROVA, name: `${ROTULO} demanda meta`, phone: telefoneDeProva(90), source: "meta_ads", status: "novo" }]),
    });
    const linha = demanda.corpo?.[0];
    assert.equal(linha?.first_contact_sla_minutes, 5);
    const minutos = (Date.parse(linha.first_contact_due_at) - Date.parse(linha.created_at)) / 60_000;
    assert.equal(Math.round(minutos), 5);
    await rest(`leads?id=eq.${linha.id}`, { method: "DELETE" });
  });

  // uma lead com prazo VENCIDO gravado à mão: o claim tem de SOBRESCREVER
  const vencida = criadas.corpo[0].id;
  await rest(`leads?id=eq.${vencida}`, { method: "PATCH", body: JSON.stringify({ first_contact_due_at: "2026-06-01T00:00:00Z", first_contact_sla_minutes: 15 }) });

  await t.test("o contador e a prévia dizem a verdade antes do clique", async () => {
    const g = await rpc("oferta_do_acervo", { p_actor_id: a, p_organization_id: ORG_PROVA, p_previa: LOTE_PADRAO });
    assert.equal(g.http, 200, JSON.stringify(g.corpo));
    assert.equal(g.corpo.disponivel, 40);
    assert.equal(g.corpo.semToque, 0);
    assert.equal(g.corpo.lotesHoje, 0);
    assert.equal(g.corpo.prazoMinutos, PRAZO_RESGATE_MINUTOS, "o prazo do banco divergiu do módulo");
    assert.equal(g.corpo.previa.length, LOTE_PADRAO);
    assert.equal(g.corpo.piiExposed, false);
    for (const item of g.corpo.previa) {
      assert.equal(item.consentimento, "nao_perguntado", "prévia afirmando consentimento que ninguém registrou");
      assert.ok(!("name" in item) && !("phone" in item), "a prévia vazou PII antes do claim");
    }
  });

  await t.test("RECUSA quem não deve: liderança não se serve do balcão", async () => {
    for (const [quem, id] of [["diretor", diretor], ["raiz", raiz]]) {
      const r = await rpc("reservar_leads_do_acervo", { p_actor_id: id, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO });
      assert.match(erro(r), /acervo_ator_nao_e_corretor/, `${quem} conseguiu pegar lead do acervo`);
    }
  });

  await t.test("RECUSA quem não deve: a cerca da organização", async () => {
    const r = await rpc("reservar_leads_do_acervo", { p_actor_id: a, p_organization_id: ORG_REAL, p_limit: LOTE_PADRAO });
    assert.match(erro(r), /acervo_ator_fora_da_organizacao|acervo_ator_nao_e_corretor/);
    const g = await rpc("oferta_do_acervo", { p_actor_id: a, p_organization_id: ORG_REAL, p_previa: 1 });
    assert.match(erro(g), /acervo_ator_fora_da_organizacao/, "o contador entregou o balcão de outra imobiliária");
  });

  await t.test("RECUSA lote fora do tamanho", async () => {
    const r = await rpc("reservar_leads_do_acervo", { p_actor_id: a, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO + 1 });
    assert.match(erro(r), /acervo_limite_invalido/);
  });

  let deA = [];
  await t.test("CONCORRÊNCIA REAL: dois claims simultâneos levam leads DIFERENTES", async () => {
    // O transporte REST não serializa: medido com uma função de sonda que dorme
    // 3s dentro da transação, duas chamadas paralelas ficaram 2.999ms
    // sobrepostas, em backends distintos. Então "paralelo" aqui é paralelo.
    const [rA, rB] = await Promise.all([
      rpc("reservar_leads_do_acervo", { p_actor_id: a, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO }),
      rpc("reservar_leads_do_acervo", { p_actor_id: b, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO }),
    ]);
    assert.equal(rA.http, 200, JSON.stringify(rA.corpo));
    assert.equal(rB.http, 200, JSON.stringify(rB.corpo));
    const idsA = rA.corpo.leadIds ?? [];
    const idsB = rB.corpo.leadIds ?? [];
    deA = idsA;
    assert.equal(idsA.length, LOTE_PADRAO);
    assert.equal(idsB.length, LOTE_PADRAO);
    const juntos = [...idsA, ...idsB];
    assert.equal(new Set(juntos).size, juntos.length, "a MESMA lead foi para dois corretores");
    assert.ok(juntos.every((id) => meus.has(id)), "o claim saiu do conjunto de prova");
    // Nenhum dos dois esperou o outro: sem `skip locked` um deles bloquearia e
    // voltaria com lote CURTO (as linhas do primeiro somem no EvalPlanQual).
    assert.equal(await naoAtribuidas(), 20);
  });

  async function naoAtribuidas() {
    const r = await rest(`leads?organization_id=eq.${ORG_PROVA}&import_batch_id=eq.${loteId}&assigned_to=is.null&assigned_user_id=is.null&select=id`);
    return r.corpo?.length ?? 0;
  }

  await t.test("o claim grava AS DUAS colunas, carimba 24h e SOBRESCREVE prazo vencido", async () => {
    const r = await rest(`leads?id=in.(${deA.join(",")})&select=id,assigned_to,assigned_user_id,first_contact_due_at,first_contact_sla_minutes,metadata,status`);
    const linhas = r.corpo ?? [];
    assert.equal(linhas.length, LOTE_PADRAO);
    for (const l of linhas) {
      assert.equal(l.assigned_to, a, "assigned_to não foi gravado — o teto de carteira só dispara nessa coluna");
      assert.equal(l.assigned_user_id, a, "assigned_user_id não foi gravado — a lista e a central leem essa");
      assert.equal(l.first_contact_sla_minutes, PRAZO_RESGATE_MINUTOS);
      assert.ok(Date.parse(l.first_contact_due_at) > Date.now(), "prazo carimbado no passado não é prazo");
      assert.ok(l.metadata?.acervo?.pegoEm, "sem marcador da oferta a regra de recarga contaria o lote da liderança");
      assert.equal(l.metadata.acervo.pegoPor, a);
    }
    // O status NÃO é reescrito: a história das 16,7 mil leads fica de pé.
    assert.ok(linhas.some((l) => l.status === "perdido"), "o claim reescreveu o status histórico");
    const aVencida = linhas.find((l) => l.id === vencida);
    if (aVencida) assert.ok(Date.parse(aVencida.first_contact_due_at) > Date.now(), "o prazo vencido herdado sobreviveu ao claim");
  });

  await t.test("o rastro existe: distribuição, evento e reserva ACEITA", async () => {
    const hist = await rest(`lead_distribution_history?assigned_user_id=eq.${a}&select=reason`);
    assert.equal(hist.corpo.length, LOTE_PADRAO);
    assert.ok(hist.corpo.every((h) => h.reason === "acervo:auto-servico"));
    const reservas = await rest(`lead_assignment_reservations?broker_id=eq.${a}&select=status`);
    assert.equal(reservas.corpo.length, LOTE_PADRAO);
    // 'pending' faria `process_expired_lead_reservations` devolver ao balcão uma
    // lead que o corretor acabou de assumir.
    assert.ok(reservas.corpo.every((r) => r.status === "accepted"));
  });

  await t.test("RECARGA: bloqueia com o lote intocado e LIBERA depois dos toques", async () => {
    const bloqueado = await rpc("reservar_leads_do_acervo", { p_actor_id: a, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO });
    assert.match(erro(bloqueado), /acervo_recarga_bloqueada/, "o corretor acumulou lote sem falar com ninguém");

    // Tocar exatamente LOTE - (LIMITE - 1) = 6 leads é o mínimo que libera.
    const precisaTocar = LOTE_PADRAO - (LIMITE_SEM_TOQUE - 1);
    await rest(`leads?id=in.(${deA.slice(0, precisaTocar).join(",")})`, {
      method: "PATCH", body: JSON.stringify({ first_contacted_at: new Date().toISOString() }),
    });
    const g = await rpc("oferta_do_acervo", { p_actor_id: a, p_organization_id: ORG_PROVA, p_previa: 1 });
    assert.equal(g.corpo.semToque, LIMITE_SEM_TOQUE - 1, "o contador do banco divergiu do limite do módulo");

    const liberado = await rpc("reservar_leads_do_acervo", { p_actor_id: a, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO });
    assert.equal(liberado.http, 200, `com ${LIMITE_SEM_TOQUE - 1} sem toque o lote tinha de liberar: ${erro(liberado)}`);
    assert.equal(liberado.corpo.pegos, LOTE_PADRAO);
    assert.ok((liberado.corpo.leadIds ?? []).every((id) => meus.has(id)));
    assert.equal(g.corpo.lotesHoje, 1, "o contador de lotes do dia não subiu");
  });

  await t.test("TETO DE CARTEIRA: corta o lote no espaço livre e depois recusa com nome", async () => {
    const carteira = await rest(`leads?organization_id=eq.${ORG_PROVA}&or=(assigned_to.eq.${c},assigned_user_id.eq.${c})&select=id`);
    const limite = (carteira.corpo?.length ?? 0) + 3;
    const posto = await rest("broker_capacity_limits", {
      method: "POST",
      body: JSON.stringify([{ organization_id: ORG_PROVA, profile_id: c, max_active_leads: limite, max_project_leads: 50, warning_percent: 80, updated_by: raiz, reason: "contrato executavel do teto de carteira na oferta ativa" }]),
    });
    assert.ok(posto.http < 300, JSON.stringify(posto.corpo));

    const cortado = await rpc("reservar_leads_do_acervo", { p_actor_id: c, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO });
    assert.equal(cortado.http, 200, erro(cortado));
    assert.equal(cortado.corpo.pegos, 3, "o teto não cortou o lote — o gatilho é cego para lead em status fechado");
    assert.equal(cortado.corpo.tetoConfigurado, true);

    const cheio = await rpc("reservar_leads_do_acervo", { p_actor_id: c, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO });
    assert.match(erro(cheio), /broker_total_capacity_reached/, "estourou o teto configurado pela liderança");
    await rest(`broker_capacity_limits?profile_id=eq.${c}`, { method: "DELETE" });
  });

  await t.test("ACERVO ESGOTADO é diferente de lote curto: D leva o que sobrou, E ouve o nome", async () => {
    const sobra = await naoAtribuidas();
    assert.ok(sobra > 0 && sobra < LOTE_PADRAO, `o teste precisa de sobra entre 1 e 9 para provar o lote parcial (tem ${sobra})`);
    const parcial = await rpc("reservar_leads_do_acervo", { p_actor_id: d, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO });
    assert.equal(parcial.http, 200, erro(parcial));
    assert.equal(parcial.corpo.pegos, sobra, "pediu 10, havia menos: tem de entregar o que existe, não falhar");
    assert.equal(await naoAtribuidas(), 0);

    const vazio = await rpc("reservar_leads_do_acervo", { p_actor_id: e, p_organization_id: ORG_PROVA, p_limit: LOTE_PADRAO });
    assert.match(erro(vazio), /acervo_vazio/, "acervo vazio tem de ter nome próprio, não silêncio");
  });
});
