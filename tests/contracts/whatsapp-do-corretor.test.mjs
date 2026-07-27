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

test("a biblioteca não oficial não é dependência do projeto", () => {
  const pkg = JSON.parse(ler("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(!Object.keys(deps).some((d) => /baileys|whatsapp-web|venom|wppconnect/i.test(d)),
    "instalar é decisão consciente do operador no servidor, não efeito de um npm install");
  assert.match(ponte, /catch \{[\s\S]{0,200}não instalada/,
    "sem a biblioteca a ponte sobe e responde estado honesto, em vez de estourar");
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

test("a conversa adota a lead se ela for criada depois", () => {
  assert.match(rotaEntrada, /\.\.\.\(lead\?\.id \? \{ lead_id: lead\.id \} : \{\}\)/);
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
