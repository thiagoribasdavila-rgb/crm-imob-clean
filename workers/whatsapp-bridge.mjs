#!/usr/bin/env node
/**
 * PONTE DE WHATSAPP — processo de vida longa, uma aplicação PM2 própria.
 *
 * Segura um socket aberto por corretor conectado, entrega o QR Code para quem
 * está pareando, e empurra cada mensagem para o CRM.
 *
 * ── Por que não é um worker de cron como os outros ──────────────────────────
 *
 * Os workers deste projeto são rotas HTTP acordadas por crontab. O WhatsApp por
 * QR precisa de socket ABERTO: fechar e reabrir a cada requisição é exatamente
 * o comportamento que faz o WhatsApp derrubar a conta. Daí um processo à parte.
 *
 * ── Credenciais ─────────────────────────────────────────────────────────────
 *
 * As credenciais de sessão ficam SÓ em ATLAS_WHATSAPP_SESSION_DIR, no disco do
 * servidor, fora do repositório. Nunca no banco, nunca no ZIP, nunca em log.
 * Este processo escuta apenas em 127.0.0.1 e exige o segredo compartilhado.
 *
 * ── Dependência ─────────────────────────────────────────────────────────────
 *
 * `@whiskeysockets/baileys` NÃO é instalada por padrão — é biblioteca não
 * oficial e a instalação é uma decisão consciente do operador:
 *
 *     npm install @whiskeysockets/baileys qrcode
 *
 * Sem ela, a ponte sobe assim mesmo e responde a todas as chamadas com um
 * estado honesto ("biblioteca ausente") em vez de estourar. É de propósito: o
 * CRM inteiro precisa continuar funcionando em quem não usa esta ponte, e o
 * `npm run verify` não pode depender de uma biblioteca fora dos termos.
 *
 * Subir:  node workers/whatsapp-bridge.mjs
 * PM2:    pm2 start ecosystem.config.cjs --only atlas-whatsapp-bridge
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORTA = Number(process.env.ATLAS_WHATSAPP_BRIDGE_PORT || 8790);
const SEGREDO = process.env.ATLAS_WHATSAPP_BRIDGE_SECRET || "";
const DIR_SESSOES = process.env.ATLAS_WHATSAPP_SESSION_DIR || "";
const CRM = process.env.ATLAS_CRM_URL || "http://127.0.0.1:3000";

if (SEGREDO.length < 16) {
  console.error("[ponte] ATLAS_WHATSAPP_BRIDGE_SECRET ausente ou curto demais (mín. 16 chars). Sem ele qualquer processo local mandaria mensagem pelo WhatsApp de um corretor.");
  process.exit(1);
}
if (!DIR_SESSOES) {
  console.error("[ponte] ATLAS_WHATSAPP_SESSION_DIR não definido. As credenciais precisam de um lugar FORA do repositório.");
  process.exit(1);
}
fs.mkdirSync(DIR_SESSOES, { recursive: true, mode: 0o700 });

// ── A biblioteca, se o operador escolheu instalá-la ─────────────────────────

let baileys = null;
let qrcode = null;
let motivoAusencia = null;
try {
  baileys = await import("@whiskeysockets/baileys");
  qrcode = await import("qrcode");
  console.log("[ponte] biblioteca carregada — conexão por QR disponível");
} catch {
  motivoAusencia = "biblioteca @whiskeysockets/baileys não instalada — rode `npm install @whiskeysockets/baileys qrcode` no servidor";
  console.warn(`[ponte] ${motivoAusencia}`);
  console.warn("[ponte] subindo mesmo assim: as chamadas respondem com estado honesto em vez de estourar");
}

/** profileId → { sock, status, qr, phoneE164, organizationId, ... } */
const sessoes = new Map();

const agora = () => new Date().toISOString();

/** Nunca deixa credencial vazar para o log. */
function logar(profileId, msg) {
  console.log(`[ponte][${String(profileId).slice(0, 8)}] ${msg}`);
}

// ── Falar com o CRM ─────────────────────────────────────────────────────────

async function avisarCrm(caminho, corpo) {
  try {
    const r = await fetch(`${CRM}${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-atlas-bridge-secret": SEGREDO },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) console.warn(`[ponte] CRM recusou ${caminho}: ${r.status}`);
    return r.ok;
  } catch (e) {
    console.warn(`[ponte] CRM inacessível em ${caminho}: ${e.message}`);
    return false;
  }
}

// ── Quem é lead: a pergunta que vem ANTES do conteúdo ───────────────────────
//
// O CRM grava conversa de LEAD, não a vida particular do corretor. Se a ponte
// mandasse tudo e o CRM descartasse, o texto da conversa com a mãe dele já
// teria trafegado, entrado em log de requisição e passado pela memória do
// servidor antes de ser jogado fora.
//
// Perguntando primeiro, a mensagem particular NUNCA SAI DAQUI. O que trafega é
// um telefone e um sim/não. É a diferença entre "não guardamos" e "não
// recebemos" — e só a segunda é uma promessa que dá para cumprir.

/** contatoE164 → { ehLead, expiraEm } */
const cacheDeLead = new Map();
// Curto de propósito: uma lead recém-criada tem que passar a ser gravada em
// poucos minutos, não no dia seguinte.
const VALIDADE_CACHE_MS = 3 * 60_000;

async function ehLead(organizationId, contatoE164) {
  const cacheado = cacheDeLead.get(contatoE164);
  if (cacheado && cacheado.expiraEm > Date.now()) return cacheado.ehLead;

  try {
    const r = await fetch(`${CRM}/api/v1/whatsapp/bridge/is-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-atlas-bridge-secret": SEGREDO },
      body: JSON.stringify({ organizationId, contatosE164: [contatoE164] }),
    });
    if (!r.ok) return false; // na dúvida, NÃO grava
    const { leads } = await r.json();
    const resposta = Array.isArray(leads) && leads.includes(contatoE164);
    cacheDeLead.set(contatoE164, { ehLead: resposta, expiraEm: Date.now() + VALIDADE_CACHE_MS });
    return resposta;
  } catch {
    // CRM fora do ar: não gravar é o lado seguro do erro. Perder o registro de
    // uma conversa é recuperável; gravar a vida particular de alguém não é.
    return false;
  }
}

// ── Conectar ────────────────────────────────────────────────────────────────

async function conectar(profileId, organizationId) {
  if (!baileys) {
    return { profileId, status: "falhou", erro: motivoAusencia };
  }

  const existente = sessoes.get(profileId);
  if (existente?.status === "conectado") return estadoDe(profileId);
  if (existente?.sock) { try { existente.sock.end(); } catch { /* já morto */ } }

  const dir = path.join(DIR_SESSOES, profileId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  // `useMultiFileAuthState` é função do Baileys, não React Hook — renomeada na
  // desestruturação porque o ESLint casa qualquer coisa que comece com "use".
  const { default: makeWASocket, useMultiFileAuthState: abrirEstadoDeAuth, DisconnectReason, fetchLatestBaileysVersion } = baileys;
  const { state, saveCreds } = await abrirEstadoDeAuth(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    // Aparecer como um navegador comum reduz a chance de o WhatsApp tratar a
    // sessão como automação. Não elimina o risco — nada elimina.
    browser: ["Atlas CRM", "Chrome", "121.0.0"],
    markOnlineOnConnect: false, // não roubar as notificações do celular do corretor
  });

  const sessao = {
    sock, status: "aguardando_qr", qr: null, phoneE164: null,
    organizationId, erro: null, conectadoEm: null, ultimaAtividadeEm: null,
    tentativas: existente?.tentativas ?? 0,
  };
  sessoes.set(profileId, sessao);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr && qrcode) {
      sessao.qr = await qrcode.toDataURL(qr, { margin: 1, width: 300 });
      // O texto cru serve para desenhar o QR no TERMINAL do servidor, sem
      // gerar arquivo de imagem — arquivo de QR em disco é chave de pareamento
      // esquecida no disco.
      sessao.qrPayload = qr;
      sessao.status = "aguardando_qr";
      logar(profileId, "QR gerado, aguardando leitura");
      await sincronizar(profileId);
    }

    if (connection === "open") {
      sessao.status = "conectado";
      sessao.qr = null;
      sessao.qrPayload = null;
      sessao.erro = null;
      sessao.tentativas = 0;
      sessao.conectadoEm = agora();
      // O número vem do WhatsApp, não do corretor — assim não há divergência
      // entre o que ele diz e o número que de fato está na ponta.
      sessao.phoneE164 = String(sock.user?.id || "").split(":")[0].replace(/\D/g, "") || null;
      logar(profileId, "conectado");
      await sincronizar(profileId);
    }

    if (connection === "close") {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const deslogado = codigo === DisconnectReason?.loggedOut;
      // 401/403 do WhatsApp = a conta foi derrubada. Reconectar aqui é insistir
      // com quem já disse não, e é assim que um número vira banido de vez.
      const banido = codigo === 401 || codigo === 403;

      sessao.qr = null;
      sessao.tentativas += 1;

      if (deslogado || banido) {
        sessao.status = banido ? "banido" : "desconectado";
        sessao.erro = banido
          ? "O WhatsApp recusou esta sessão. Não vamos reconectar sozinhos — insistir é o que transforma recusa em banimento definitivo."
          : "Sessão encerrada pelo aparelho (Aparelhos conectados › sair).";
        try { fs.rmSync(path.join(DIR_SESSOES, profileId), { recursive: true, force: true }); } catch { /* já foi */ }
        logar(profileId, `encerrado (${sessao.status})`);
      } else if (sessao.tentativas <= 5) {
        sessao.status = "desconectado";
        sessao.erro = `Queda de conexão — tentativa ${sessao.tentativas} de 5.`;
        logar(profileId, `queda, reconectando (${sessao.tentativas}/5)`);
        setTimeout(() => { void conectar(profileId, organizationId); }, Math.min(30_000, 2000 * sessao.tentativas));
      } else {
        sessao.status = "falhou";
        sessao.erro = "Cinco quedas seguidas. Paramos de tentar — reconecte lendo o QR de novo.";
        logar(profileId, "desistindo após 5 quedas");
      }
      await sincronizar(profileId);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      const jid = m.key?.remoteJid || "";
      // Grupos e status não são atendimento de lead.
      if (!jid.endsWith("@s.whatsapp.net")) continue;

      const texto = m.message?.conversation
        ?? m.message?.extendedTextMessage?.text
        ?? m.message?.imageMessage?.caption
        ?? m.message?.videoMessage?.caption
        ?? null;

      const tipo = m.message?.imageMessage ? "imagem"
        : m.message?.audioMessage ? "audio"
        : m.message?.videoMessage ? "video"
        : m.message?.documentMessage ? "documento"
        : texto != null ? "texto" : "outro";

      sessao.ultimaAtividadeEm = agora();

      const contato = jid.split("@")[0].replace(/\D/g, "");
      // A PERGUNTA VEM ANTES. Se não é lead, o texto morre aqui dentro.
      if (!(await ehLead(organizationId, contato))) continue;

      await avisarCrm("/api/v1/whatsapp/bridge/inbound", {
        profileId,
        organizationId,
        contatoE164: contato,
        externalMessageId: m.key?.id || "",
        direcao: m.key?.fromMe ? "saida" : "entrada",
        texto,
        tipo,
        enviadaEm: new Date(Number(m.messageTimestamp || 0) * 1000).toISOString(),
        nomeDoContato: m.pushName || null,
      });
    }
  });

  return estadoDe(profileId);
}

function estadoDe(profileId) {
  const s = sessoes.get(profileId);
  if (!s) return { profileId, status: "desconectado", erro: motivoAusencia };
  return {
    profileId,
    status: s.status,
    qr: s.status === "aguardando_qr" ? s.qr : null,
    qrPayload: s.status === "aguardando_qr" ? s.qrPayload ?? null : null,
    phoneE164: s.phoneE164,
    erro: s.erro,
    conectadoEm: s.conectadoEm,
    ultimaAtividadeEm: s.ultimaAtividadeEm,
  };
}

/** Espelha o estado no CRM para o banco não mentir sobre quem está conectado. */
async function sincronizar(profileId) {
  const e = estadoDe(profileId);
  // O QR não vai para o banco: é efêmero, some em segundos, e é a chave de
  // pareamento — quem tiver ele entra na conta.
  await avisarCrm("/api/v1/whatsapp/bridge/status", { ...e, qr: undefined, qrPayload: undefined });
}

async function desconectar(profileId) {
  const s = sessoes.get(profileId);
  if (s?.sock) { try { await s.sock.logout(); } catch { try { s.sock.end(); } catch { /* já morto */ } } }
  try { fs.rmSync(path.join(DIR_SESSOES, profileId), { recursive: true, force: true }); } catch { /* já foi */ }
  sessoes.set(profileId, { status: "desconectado", qr: null, phoneE164: null, erro: null, tentativas: 0 });
  logar(profileId, "desconectado a pedido");
  await sincronizar(profileId);
  return estadoDe(profileId);
}

async function enviar(profileId, paraE164, texto) {
  const s = sessoes.get(profileId);
  if (!s?.sock || s.status !== "conectado") {
    return { ok: false, erro: "Sessão não conectada." };
  }
  const r = await s.sock.sendMessage(`${paraE164}@s.whatsapp.net`, { text: texto });
  s.ultimaAtividadeEm = agora();
  return { ok: true, externalMessageId: r?.key?.id || null };
}

// ── HTTP, só em 127.0.0.1 ───────────────────────────────────────────────────

const servidor = http.createServer(async (req, res) => {
  const responder = (codigo, corpo) => {
    res.writeHead(codigo, { "Content-Type": "application/json" });
    res.end(JSON.stringify(corpo));
  };

  if (req.headers["x-atlas-bridge-secret"] !== SEGREDO) {
    return responder(401, { erro: "não autorizado" });
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);

  if (url.pathname === "/saude") {
    return responder(200, {
      ok: true,
      bibliotecaPresente: Boolean(baileys),
      motivoAusencia,
      sessoes: [...sessoes.entries()].map(([id, s]) => ({ profileId: id, status: s.status })),
    });
  }

  let corpo = {};
  if (req.method === "POST") {
    const bruto = await new Promise((ok) => { let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => ok(b)); });
    try { corpo = JSON.parse(bruto || "{}"); } catch { return responder(400, { erro: "json inválido" }); }
  }

  const { profileId, organizationId } = corpo;
  if (!profileId) return responder(400, { erro: "profileId obrigatório" });

  try {
    if (url.pathname === "/conectar") return responder(200, await conectar(profileId, organizationId));
    if (url.pathname === "/estado") return responder(200, estadoDe(profileId));
    if (url.pathname === "/desconectar") return responder(200, await desconectar(profileId));
    if (url.pathname === "/enviar") return responder(200, await enviar(profileId, corpo.paraE164, corpo.texto));
    return responder(404, { erro: "rota desconhecida" });
  } catch (e) {
    console.error(`[ponte] erro em ${url.pathname}: ${e.message}`);
    return responder(500, { erro: e.message });
  }
});

servidor.listen(PORTA, "127.0.0.1", () => {
  console.log(`[ponte] escutando em 127.0.0.1:${PORTA} — sessões em ${DIR_SESSOES}`);
  console.log(`[ponte] biblioteca: ${baileys ? "presente" : "AUSENTE — conexão indisponível até instalar"}`);
});

for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => {
    console.log("[ponte] encerrando — fechando sockets");
    for (const [, s] of sessoes) { try { s.sock?.end(); } catch { /* já morto */ } }
    servidor.close(() => process.exit(0));
  });
}
