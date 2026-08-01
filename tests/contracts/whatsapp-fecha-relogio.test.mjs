/**
 * Contrato: O WHATSAPP FECHA O RELÓGIO DO PRIMEIRO CONTATO.
 *
 * Medido: 217 leads, **1 contatada**. O WhatsApp — o canal que a operação de
 * fato usa — não tocava em `first_contacted_at` em nenhuma das direções. Uma
 * conversa inteira acontecia e a lead seguia como "SLA vencido, sem primeiro
 * contato": o corretor atendia e o próprio Atlas cobrava.
 *
 * A única porta que fechava o relógio era o botão manual, que depende de
 * alguém lembrar de clicar DEPOIS de já ter falado com a pessoa.
 *
 * Rodar: node --test tests/contracts/whatsapp-fecha-relogio.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "crm", "whatsapp-first-contact.ts"), "utf8");
const webhook = fs.readFileSync(path.join(raiz, "app", "api", "webhooks", "whatsapp", "route.ts"), "utf8");
const outbox = fs.readFileSync(path.join(raiz, "app", "api", "v2", "outbox", "process", "route.ts"), "utf8");
const { fecharPrimeiroContatoPorWhatsapp, descreverContatoDeWhatsapp } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

/** Supabase de mentira, só o suficiente para exercitar os caminhos. */
function bancoFalso({ lead, erroDaRpc = null, erroDaLeitura = null }) {
  const chamadas = { rpc: 0 };
  return {
    chamadas,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: lead, error: erroDaLeitura }),
          }),
        }),
      }),
    }),
    rpc: async () => {
      chamadas.rpc += 1;
      return { error: erroDaRpc };
    },
  };
}

const entrada = { organizationId: "o1", leadId: "l1", origem: "entrada", ocorridoEm: "2026-07-26T12:00:00Z" };

test("fecha quando a lead ainda não tinha primeiro contato", async () => {
  const banco = bancoFalso({ lead: { id: "l1", first_contacted_at: null } });
  const r = await fecharPrimeiroContatoPorWhatsapp(banco, entrada);
  assert.equal(r.fechou, true);
  assert.equal(banco.chamadas.rpc, 1);
});

test("não chama a RPC de novo quando já estava fechado", async () => {
  // A RPC é idempotente por si (`where first_contacted_at is null`), mas evitar
  // a chamada mantém o log limpo — mesma decisão da rota manual.
  const banco = bancoFalso({ lead: { id: "l1", first_contacted_at: "2026-07-20T10:00:00Z" } });
  const r = await fecharPrimeiroContatoPorWhatsapp(banco, entrada);
  assert.equal(r.jaEstavaFechado, true);
  assert.equal(r.fechou, false);
  assert.equal(banco.chamadas.rpc, 0, "chamada desnecessária polui o log");
});

test("banco sem a migration do SLA não derruba nada", async () => {
  // Melhor perder a métrica do que perder o contato.
  const banco = bancoFalso({ lead: { id: "l1", first_contacted_at: null }, erroDaRpc: { code: "42883" } });
  const r = await fecharPrimeiroContatoPorWhatsapp(banco, entrada);
  assert.equal(r.indisponivel, true);
  assert.equal(r.fechou, false);
});

test("NUNCA lança — roda dentro de webhook", async () => {
  // Derrubar a entrega da mensagem porque a medição falhou seria trocar um dado
  // por outro maior.
  const explosivo = { from: () => { throw new Error("banco caiu"); }, rpc: async () => ({ error: null }) };
  const r = await fecharPrimeiroContatoPorWhatsapp(explosivo, entrada);
  assert.equal(r.fechou, false);
  assert.match(String(r.motivo), /banco caiu/);
});

test("lead inexistente não vira fechamento fantasma", async () => {
  const banco = bancoFalso({ lead: null });
  const r = await fecharPrimeiroContatoPorWhatsapp(banco, entrada);
  assert.equal(r.fechou, false);
  assert.equal(r.motivo, "lead_nao_encontrada");
});

test("a origem distingue quem procurou quem", () => {
  // Sem isso, daqui a um mês ninguém sabe se o tempo de resposta de 4 minutos
  // foi mérito do corretor ou uma lead ansiosa.
  assert.match(descreverContatoDeWhatsapp("saida"), /enviada pelo Atlas/);
  assert.match(descreverContatoDeWhatsapp("entrada"), /a lead escreveu primeiro/);
});

// ── As duas pontas estão ligadas ────────────────────────────────────────────

test("a mensagem RECEBIDA fecha o relógio", () => {
  assert.match(webhook, /fecharPrimeiroContatoPorWhatsapp\(admin, \{/);
  assert.match(webhook, /origem: "entrada"/);
  assert.match(webhook, /!optedOut/,
    "quem pediu para não ser contatado não entra na medição");
});

test("a lead achada por telefone AGORA também fecha", () => {
  // A primeira mensagem de uma lead nova — justamente a que mais importa — cria
  // a conversa no mesmo evento. Se só `conversationLeadId` chegasse ao
  // fechamento, ela não fecharia nada.
  assert.match(webhook, /let leadDesteEvento: string \| null = conversationLeadId;/);
  assert.match(webhook, /leadDesteEvento = matchedLeadId;/);
});

test("a mensagem ENVIADA pelo CRM fecha o relógio", () => {
  assert.match(outbox, /origem: "saida"/);
  assert.match(outbox, /select\("id,channel,recipient,content,media,conversation_id"\)/,
    "sem a conversa no select não há como chegar na lead");
});

test("o fechamento vem DEPOIS da entrega confirmada", () => {
  // Marcar contato antes de a mensagem sair diria que falamos com alguém que
  // nunca recebeu nada.
  const posEnvio = outbox.indexOf("const externalMessageId = await deliverWhatsApp");
  const posFechamento = outbox.indexOf('origem: "saida"');
  assert.ok(posEnvio > 0 && posEnvio < posFechamento,
    "o fechamento precisa vir depois do envio bem-sucedido");
});
