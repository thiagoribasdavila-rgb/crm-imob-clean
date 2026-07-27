/**
 * Contrato do WHATSAPP DO CORRETOR e da PRESENÇA VIVA.
 *
 * Duas coisas medidas no banco vivo antes de escrever qualquer código:
 *   · 7 de 7 perfis estavam AVAILABLE — inclusive a conta de sistema — porque
 *     a bandeira nunca é abaixada. E nada dizia QUANDO isso foi verdade: a rota
 *     devolvia `last_seen_at: profile.created_at`, a data de criação da conta.
 *   · conversations = 0 linhas, messages = 0 linhas. A memória de conversa era
 *     código real e vazio: nenhum número jamais foi conectado.
 *
 * O que este contrato guarda é sobretudo o que NÃO pode acontecer: credencial
 * vazando, QR indo para o banco, e a ponte virando um jeito de qualquer
 * processo local mandar mensagem pelo WhatsApp de um corretor.
 *
 * Rodar: node --test tests/contracts/whatsapp-do-corretor.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const contrato = ler("lib", "whatsapp", "bridge-contract.ts");
const ponte = ler("workers", "whatsapp-bridge.mjs");
const rotaSessao = ler("app", "api", "v1", "whatsapp", "session", "route.ts");
const rotaEntrada = ler("app", "api", "v1", "whatsapp", "bridge", "inbound", "route.ts");
const rotaEstado = ler("app", "api", "v1", "whatsapp", "bridge", "status", "route.ts");
const painel = ler("components", "whatsapp", "broker-connection-panel.tsx");
const distribuicao = ler("app", "api", "v1", "crm", "distribution", "route.ts");
const migracao = ler("supabase", "migrations", "20260727030000_presenca_viva_e_sessao_whatsapp.sql");
const pm2 = ler("ecosystem.config.cjs");

const lib = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(contrato))}`
);

// ── Credenciais nunca saem do disco do servidor ─────────────────────────────

test("a tabela de sessão NÃO tem coluna de credencial", () => {
  const criacao = migracao.slice(migracao.indexOf("create table if not exists public.whatsapp_broker_sessions"));
  for (const proibida of ["creds", "credential", "auth_state", "session_data", "keys", "token"]) {
    assert.ok(!new RegExp(`^\\s+${proibida}\\b`, "im").test(criacao.slice(0, criacao.indexOf(");"))),
      `\`${proibida}\` não pode existir: credencial de sessão dá acesso total à conta do corretor`);
  }
});

test("as credenciais vivem fora do repositório, por variável de ambiente", () => {
  assert.match(ponte, /ATLAS_WHATSAPP_SESSION_DIR/);
  assert.match(ponte, /if \(!DIR_SESSOES\)[\s\S]{0,200}process\.exit\(1\)/,
    "sem diretório definido a ponte recusa subir — não escolhe um lugar sozinha");
  assert.match(ler(".gitignore"), /whatsapp-sessions\//,
    "defesa em profundidade: se alguém apontar o diretório para dentro do repo");
});

test("o QR não é gravado no banco", () => {
  assert.match(ponte, /qr: undefined/, "a sincronização com o CRM tira o QR do corpo");
  // `/qr/i` solto casava em `aguardando_qr`, que é NOME DE STATUS e legítimo.
  // O que não pode existir é COLUNA guardando a imagem/código do QR.
  const colunas = migracao.slice(migracao.indexOf("create table if not exists public.whatsapp_broker_sessions"));
  assert.ok(!/^\s+qr(_code|_data|_image)?\s+(text|bytea|jsonb)/im.test(colunas.slice(0, colunas.indexOf(");"))),
    "o QR é a chave de pareamento — quem tiver ele entra na conta");
  assert.match(rotaSessao, /nunca do banco/);
});

test("o número aparece mascarado", () => {
  assert.equal(lib.mascararTelefone("5511987654321"), "+55 11 *****-4321");
  assert.equal(lib.mascararTelefone(null), "—");
  assert.match(rotaSessao, /mascararTelefone\(telefone\)/);
});

// ── Só a ponte fala com as rotas da ponte ───────────────────────────────────

test("as rotas da ponte exigem segredo e comparam em tempo constante", () => {
  for (const [nome, rota] of [["inbound", rotaEntrada], ["status", rotaEstado]]) {
    assert.match(rota, /x-atlas-bridge-secret/, `${nome} precisa exigir o segredo`);
    assert.match(rota, /diferenca \|= recebido\.charCodeAt\(i\) \^ esperado\.charCodeAt\(i\)/,
      `${nome}: comparar com !== vaza o prefixo correto pelo tempo de resposta`);
    assert.match(rota, /status: 401/);
  }
});

test("sem segredo configurado a ponte inteira fica desligada", () => {
  assert.match(ponte, /SEGREDO\.length < 16[\s\S]{0,300}process\.exit\(1\)/);
  assert.equal(lib.segredoDaPonte(), null, "sem env, não há segredo");
  assert.equal(lib.ponteConfigurada(), false);
  for (const rota of [rotaEntrada, rotaEstado]) assert.match(rota, /bridge disabled/);
});

test("a ponte escuta só em 127.0.0.1", () => {
  assert.match(ponte, /servidor\.listen\(PORTA, "127\.0\.0\.1"/);
  assert.match(lib.enderecoDaPonte(), /^http:\/\/127\.0\.0\.1/);
});

test("a organização vem do perfil, nunca do corpo da requisição", () => {
  // Se o segredo vazasse, aceitar organization_id do corpo deixaria gravar
  // sessão em organização alheia.
  assert.match(rotaEstado, /from\("profiles"\)\.select\("organization_id"\)/);
  assert.match(rotaEstado, /organization_id: perfil\.organization_id/);
});

// ── Quem manda na sessão é o dono do número ─────────────────────────────────

test("o corretor só mexe na própria sessão", () => {
  assert.match(migracao, /using \(profile_id = auth\.uid\(\)\)/);
  assert.match(migracao, /with check \(profile_id = auth\.uid\(\)\)/);
  assert.match(rotaSessao, /const profileId = identity\.access\.profile\.id;/);
  assert.ok(!/body\?\.profileId|corpo\?\.profileId/.test(rotaSessao),
    "aceitar profileId do corpo deixaria alguém desconectar o WhatsApp de outro");
});

test("a liderança enxerga, mas não conecta nem desconecta ninguém", () => {
  const politica = migracao.slice(migracao.indexOf("whatsapp_sessao_leitura_da_lideranca"));
  assert.match(politica, /for select/, "leitura apenas — é o celular do corretor");
});

// ── O risco é dito na tela de quem corre o risco ────────────────────────────

test("o aviso de risco está na interface e precisa ser marcado", () => {
  assert.match(rotaSessao, /contraria os termos do WhatsApp/);
  assert.match(painel, /atlas-wa-risco/);
  assert.match(painel, /disabled=\{ocupado \|\| !confirmouRisco/,
    "o botão de conectar fica travado até o corretor marcar que leu");
});

test("a biblioteca não oficial está declarada e travada no lockfile", () => {
  // MUDANÇA (2026-07-27): antes este contrato exigia que baileys NÃO fosse
  // dependência — instalar era decisão do operador no servidor. O dono do
  // produto decidiu instalar e versionar, para que o deploy seja reproduzível
  // em vez de depender de alguém lembrar de rodar `npm install` extra.
  //
  // O que continua valendo é a resiliência: a ponte precisa subir mesmo sem a
  // biblioteca. Um `npm ci` que falhe nela não pode derrubar o CRM inteiro.
  const pkg = JSON.parse(ler("package.json"));
  assert.ok(pkg.dependencies["@whiskeysockets/baileys"], "declarada em dependencies");
  assert.ok(pkg.dependencies.qrcode, "qrcode gera o QR");
  assert.match(ler("package-lock.json"), /@whiskeysockets\/baileys/,
    "travada no lockfile — deploy reproduzível");
});

test("a ponte sobe mesmo sem a biblioteca", () => {
  assert.match(ponte, /catch \{[\s\S]{0,200}não instalada/,
    "estado honesto em vez de estourar: um npm ci que falhe nela não pode derrubar o CRM");
  assert.match(ponte, /status: "falhou", erro: motivoAusencia/);
});

test("a ponte não sobe junto com a aplicação", () => {
  assert.match(pm2, /name: "atlas-whatsapp-bridge"/);
  assert.match(pm2, /--only atlas-whatsapp-bridge/);
  assert.match(pm2, /max_restarts: 5/,
    "reiniciar em laço é sinal que o WhatsApp usa para derrubar contas");
});

test("recusa do WhatsApp NÃO vira tentativa de reconexão", () => {
  // Insistir com quem já disse não é o que transforma recusa em banimento.
  assert.match(ponte, /const banido = codigo === 401 \|\| codigo === 403;/);
  assert.match(ponte, /if \(deslogado \|\| banido\) \{/);
  assert.match(ponte, /Não vamos reconectar sozinhos/);
});

// ── A memória usa as tabelas que já existiam ────────────────────────────────

test("escreve em conversations/messages, não numa segunda memória", () => {
  assert.match(rotaEntrada, /\.from\("conversations"\)/);
  assert.match(rotaEntrada, /\.from\("messages"\)/);
  // Sem os comentários: o cabeçalho da rota CITA `whatsapp_broker_messages`
  // justamente para explicar por que ela não existe.
  const codigo = rotaEntrada.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/from\("whatsapp_broker_messages"|from\("whatsapp_conversas"/.test(codigo),
    "duas memórias dariam duas respostas para 'quantas conversas essa lead teve'");
});

test("reentrega do WhatsApp não duplica mensagem", () => {
  assert.match(rotaEntrada, /\.eq\("external_message_id", externalMessageId\)/);
  assert.match(rotaEntrada, /duplicada: true/);
});

test("só o que ENTRA conta como não lido", () => {
  assert.match(rotaEntrada, /corpo\?\.direcao === "entrada" \? \(existente\?\.unread_count \?\? 0\) \+ 1/,
    "contar o que o próprio corretor mandou deixaria um badge que nunca zera");
});

test("toda conversa gravada tem lead — não existe conversa órfã", () => {
  // Antes da regra de privacidade, a conversa podia nascer sem lead e "adotar"
  // uma criada depois. Com a regra nova isso deixou de existir: mensagem de
  // quem não é lead é recusada antes de qualquer escrita, então não há
  // conversa órfã para adotar ninguém.
  assert.match(rotaEntrada, /lead_id: lead\.id,/);
  assert.ok(!/lead_id: lead\?\.id \?\? null/.test(rotaEntrada),
    "conversa sem lead não é mais criada — a recusa acontece antes");
});

test("o telefone é normalizado do mesmo jeito nos dois lados", () => {
  assert.equal(lib.paraE164("(11) 98765-4321"), "5511987654321");
  assert.equal(lib.paraE164("5511987654321"), "5511987654321");
  assert.equal(lib.paraE164(""), "");
  assert.match(rotaEntrada, /paraE164\(corpo\?\.contatoE164 \?\? ""\)/,
    "duas normalizações fariam a mesma pessoa virar dois contatos");
});

// ── Presença viva ───────────────────────────────────────────────────────────

test("o heartbeat grava QUANDO, não só a bandeira", () => {
  assert.match(distribuicao, /last_seen_at: new Date\(\)\.toISOString\(\)/);
  assert.match(ler("lib", "compat", "legacy-v2.ts"), /availability_status,last_seen_at/,
    "sem a coluna no select compartilhado a leitura seria undefined em silêncio");
});

test("o GET parou de devolver a data de criação como 'visto por último'", () => {
  assert.ok(!/last_seen_at: profile\.created_at/.test(distribuicao));
  assert.match(distribuicao, /const vistoEm = text\(profile\.last_seen_at\) \|\| null;/);
});

test("presença viva NÃO substitui a bandeira que a distribuição usa", () => {
  // `hierarchical-cascade.ts` documenta a escolha de distribuir mesmo para quem
  // está com a aba fechada: lead que chega às 2h precisa de dono às 2h.
  assert.match(distribuicao, /online: availability !== "offline"/,
    "`online` continua significando 'aceita lead'");
  assert.match(distribuicao, /na_mesa_agora: naMesaAgora/,
    "a presença viva é um sinal NOVO, ao lado — não no lugar");
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /NÃO exigimos presença online/,
    "a decisão documentada da cascata continua valendo");
});

test("a janela de presença está declarada uma vez só", () => {
  assert.match(distribuicao, /const JANELA_PRESENCA_MS = 5 \* 60_000;/);
  assert.equal([...distribuicao.matchAll(/5 \* 60_000/g)].length, 1);
});

// ── REGRA: só conversa de LEAD é gravada ────────────────────────────────────

test("a ponte PERGUNTA antes de mandar o conteúdo", () => {
  // Receber tudo e descartar depois deixaria o texto da conversa particular do
  // corretor trafegar, entrar em log de requisição e passar pela memória do
  // servidor antes de ser jogado fora. Perguntando primeiro, a mensagem
  // particular nunca sai do processo da ponte.
  assert.match(ponte, /if \(!\(await ehLead\(organizationId, contato\)\)\) continue;/);
  const i = ponte.indexOf("await ehLead(organizationId, contato)");
  const j = ponte.indexOf('avisarCrm("/api/v1/whatsapp/bridge/inbound"');
  assert.ok(i > -1 && j > i, "a pergunta tem que vir ANTES do envio do conteúdo");
});

test("na dúvida, NÃO grava", () => {
  const fn = ponte.slice(ponte.indexOf("async function ehLead"), ponte.indexOf("// ── Conectar"));
  assert.match(fn, /if \(!r\.ok\) return false;/, "CRM recusou → não grava");
  assert.match(fn, /catch \{[\s\S]*?return false;/,
    "CRM fora do ar → não grava; perder registro é recuperável, gravar a vida de alguém não");
});

test("a rota de consulta devolve só telefone — nem nome, nem histórico", () => {
  const consulta = ler("app", "api", "v1", "whatsapp", "bridge", "is-lead", "route.ts");
  assert.match(consulta, /\.select\("phone_normalized"\)/,
    "a ponte precisa saber SE grava, não quem é a pessoa");
  assert.ok(!/select\("[^"]*\b(name|email|full_name)\b/.test(consulta));
  assert.match(consulta, /x-atlas-bridge-secret/);
});

test("segunda tranca: o CRM recusa gravar quem não é lead", () => {
  // A primeira tranca depende de a ponte estar na versão certa. O custo de
  // errar é gravar a vida particular de alguém.
  assert.match(rotaEntrada, /if \(!lead\?\.id\) \{[\s\S]{0,200}ignorada/);
  const iRecusa = rotaEntrada.indexOf("if (!lead?.id)");
  const iInsert = rotaEntrada.indexOf('.from("messages").insert');
  assert.ok(iRecusa > -1 && iInsert > iRecusa, "a recusa vem ANTES de qualquer escrita");
  const iConversa = rotaEntrada.indexOf('.from("conversations")\n    .insert');
  if (iConversa > -1) assert.ok(iConversa > iRecusa, "nem a conversa é criada");
});

test("o corretor lê na tela o que é e o que não é gravado", () => {
  assert.match(painel, /Só conversa de lead é gravada/);
  assert.match(painel, /Suas conversas particulares continuam suas/);
  assert.match(painel, /atlas-wa-privacidade/);
});

// ── REGRA: sem WhatsApp conectado, sem lead nova ────────────────────────────

test("o corretor só entra no rodízio com o WhatsApp conectado", () => {
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /\.from\("whatsapp_broker_sessions"\)/);
  assert.match(cascata, /\.eq\("status", "conectado"\)/);
  assert.match(cascata, /const brokers = brokersDisponiveis\.filter\(\(p\) => conectados\.has\(p\.id\)\);/);
});

test("a consulta de conectados é UMA só, fora do laço", () => {
  // Perguntar por corretor faria N consultas no caminho quente de toda lead
  // que entra.
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.equal([...cascata.matchAll(/from\("whatsapp_broker_sessions"\)/g)].length, 1);
  const iConsulta = cascata.indexOf('from("whatsapp_broker_sessions")');
  const iLaco = cascata.indexOf("for (const profile of brokers)");
  assert.ok(iConsulta < iLaco, "a consulta vem antes do laço");
});

test("nenhuma lead se perde quando ninguém está conectado", () => {
  // A intenção continua a mesma: lead não some. O que MUDOU (regra nova do
  // dono do produto) é o destino — antes caía no gerente mesmo desconectado,
  // agora fica REPRESADA sem dono, visível para o diretor distribuir.
  //
  // É deliberadamente incômodo: lead sem dono aparece como problema no Command
  // Center, e o problema tem solução de trinta segundos — alguém conectar.
  // Atribuir a quem está desconectado esconderia isso e deixaria a lead
  // esfriando no nome de quem não vai vê-la.
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /gerente conectado com menor carga segura a fila/);
  assert.match(cascata, /REPRESADA: ninguém com WhatsApp conectado para receber/);
  assert.match(cascata, /ou alguém conecta e a próxima entra sozinha/,
    "o motivo precisa dizer como sair do estado, não só que se está nele");
  assert.match(cascata, /Nenhuma lead se perde por causa disto/,
    "a decisão continua escrita junto da regra");
});

test("o motivo da barreira fica ESCRITO no histórico", () => {
  // Lead empilhando no gerente sem explicação é sintoma que se investiga por
  // semanas.
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /fora do rodízio por estar\(em\) sem WhatsApp conectado/);
  assert.equal([...cascata.matchAll(/\$\{notaWhatsapp\}/g)].length, 2,
    "os dois motivos de queda (gerente e fila geral) precisam carregar a nota");
});

test("a mudança de regra está registrada, não contradiz o comentário em silêncio", () => {
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /MUDANÇA DE REGRA \(2026-07-27\), pedida pelo dono do produto/);
  assert.match(cascata, /NÃO exigimos presença online/,
    "a decisão sobre presença de ABA continua valendo — conexão de número é outra coisa");
});

test("a tela diz a consequência de não conectar", () => {
  assert.match(painel, /Você não está recebendo leads novas/);
});

// ── A regra vale para TODOS, sem porta dos fundos ──────────────────────────

test("nem o dono padrão da fonte escapa do WhatsApp", () => {
  // O degrau 1 é o caminho que MAIS lead percorre quando a fonte tem dono
  // definido. Isentá-lo seria a porta pela qual a regra deixaria de valer na
  // prática.
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /if \(owner && conectados\.has\(owner\.id\)\)/);
  assert.match(cascata, /está sem WhatsApp conectado; /,
    "o motivo distingue 'dono inativo' de 'dono sem WhatsApp'");
});

test("o gerente também precisa estar conectado", () => {
  // Gerente que segura fila ESTÁ recebendo lead: fica no nome dele, o SLA
  // corre contra ele, o cliente espera resposta dele. Isentá-lo faria dele o
  // ralo por onde a regra escoaria.
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /const managers = gerentesDisponiveis\.filter\(\(p\) => conectados\.has\(p\.id\)\);/);
  assert.match(cascata, /gerentesSemWhatsapp/);
});

test("ninguém conectado ⇒ REPRESADA, não empurrada para quem não pode atender", () => {
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /REPRESADA: ninguém com WhatsApp conectado para receber/);
  assert.match(cascata, /O diretor distribui pelo Command Center/);
  assert.match(cascata, /ownerId: null,\s*\n\s*tier: "unassigned"/);
});

test("a consulta de conectados vem ANTES do degrau 1", () => {
  // Agora todo degrau depende dela.
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  const iConsulta = cascata.indexOf('from("whatsapp_broker_sessions")');
  const iDegrau1 = cascata.indexOf("// 1) Dono padrão da fonte");
  assert.ok(iConsulta > -1 && iConsulta < iDegrau1);
  assert.equal([...cascata.matchAll(/from\("whatsapp_broker_sessions"\)/g)].length, 1,
    "uma consulta só, no caminho quente de toda lead que entra");
});

test("cada degrau barrado aparece no motivo, separadamente", () => {
  // Lead represada sem explicação é sintoma que se investiga por semanas.
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  for (const nota of ["defaultNote", "notaWhatsapp", "notaGerente"]) {
    assert.match(cascata, new RegExp(`\\$\\{${nota}\\}`), `${nota} precisa entrar no motivo`);
  }
});

test("a tela e a cascata usam a MESMA palavra para o mesmo estado", () => {
  // A cascata grava "REPRESADA" no motivo. Se a tela chamasse de outra coisa,
  // o diretor procuraria uma fila de represadas que não existe em lugar nenhum.
  const tela = ler("app", "(crm)", "leads", "page.tsx");
  const cascata = ler("lib", "distribution", "hierarchical-cascade.ts");
  assert.match(cascata, /REPRESADA/);
  assert.match(tela, /label: "Represadas"/);
  assert.match(tela, /Ninguém conectado no WhatsApp/,
    "o cartão precisa dizer o motivo, não só o estado");
});

test("o filtro de represadas existe de ponta a ponta", () => {
  // Sem isto a regra vira buraco negro: lead fica sem dono e ninguém a vê.
  const rota = ler("app", "api", "v1", "crm", "leads", "route.ts");
  assert.match(rota, /allowedAttentionFilters = new Set\(\[[^\]]*"unassigned"/);
  const tela = ler("app", "(crm)", "leads", "page.tsx");
  assert.match(tela, /if \(!lead\.assigned_to\) unassigned \+= 1;/, "precisa contar");
  assert.match(tela, /currentRole !== "broker"/, "é fila de quem distribui, não do corretor");
});
