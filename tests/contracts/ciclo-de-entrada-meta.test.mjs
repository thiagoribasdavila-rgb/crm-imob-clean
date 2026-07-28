/**
 * Contrato do CICLO DE ENTRADA — do anúncio até a lead na carteira.
 *
 * O ciclo de saída (venda → Meta) tem contrato próprio em
 * ciclo-fechado-meta.test.mjs. Este é o outro lado, e guarda os invariantes da
 * cadeia por onde TODA lead de campanha entra.
 *
 * Prova comportamental viva: scripts/prova-entrada-meta.mjs (11 verificações,
 * assina o webhook de verdade e limpa o que cria).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const webhook = ler("app", "api", "webhooks", "meta", "route.ts");
const outbox = ler("lib", "integrations", "outbox-task.ts");
const ingestao = ler("app", "api", "v2", "outbox", "process", "route.ts");

test("payload sem assinatura válida não entra", () => {
  // Sem esta verificação, qualquer um que descubra a URL cria lead no CRM —
  // e leads falsas envenenam a fila do corretor e o aprendizado da campanha.
  assert.match(webhook, /x-hub-signature-256/);
  assert.match(webhook, /process\.env\.META_APP_SECRET/);
  assert.match(webhook, /verifyWebhookSignature\(body, signature, secret\)/);
  // A conferência em si mora em lib/security/webhook-signature — extraída de
  // propósito, para que o webhook do WhatsApp e o da Meta usem a MESMA. Este
  // teste apontava para o arquivo da rota e reprovava um design correto.
  const assinatura = ler("lib", "security", "webhook-signature.ts");
  assert.match(assinatura, /timingSafeEqual/,
    "comparar hash com === vaza o segredo por tempo de resposta");
  assert.match(assinatura, /if \(!receivedSignature \|\| !secret\) return false/,
    "sem segredo configurado, NADA passa — nunca o contrário");
  assert.match(assinatura, /\^\[a-f0-9\]\{64\}\$/,
    "assinatura fora do formato é recusada antes de virar Buffer");
});

test("o mesmo lead entregue duas vezes não vira duas leads", () => {
  // A Meta reentrega quando não recebe 200 a tempo. Sem dedupe, uma lentidão
  // momentânea viraria lead duplicada — e o corretor ligaria duas vezes para
  // a mesma pessoa.
  assert.match(webhook, /external_lead_id: value\.leadgen_id/);
  assert.match(webhook, /insertError\.code !== "23505"/,
    "violação de unicidade é DUPLICATA esperada, não erro — precisa ser tratada à parte");
});

test("a lead é buscada por FILA, não no meio do webhook", () => {
  // Buscar os dados na Graph API dentro do webhook faria a Meta esperar pela
  // latência dela mesma — e um timeout viraria reentrega, que viraria
  // duplicata. O webhook só registra e enfileira.
  assert.match(webhook, /ensureMetaLeadFetchTask|ensureOutboxTask/);
  assert.match(outbox, /from\("integration_outbox"\)/);
  assert.match(outbox, /aggregate_id/, "a tarefa é achada pelo agregado, não por campo do payload");
});

test("a lead de anúncio nasce com dono, empreendimento e score", () => {
  // Cada um destes já faltou em algum momento, e a falta é silenciosa:
  //  · sem dono, a lead é órfã na tela e o vigia de SLA nem a cobra;
  //  · sem empreendimento, não dá para saber de qual produto ela é;
  //  · com score fixo em zero, ela nasce empatada com todas as outras.
  assert.match(ingestao, /assigned_user_id: ownership\?\.ownerId/);
  assert.match(ingestao, /development_id: developmentIdDaPonte/);
  assert.match(ingestao, /score: calculateLeadScore\(/);
});

test("o empreendimento atravessa a PONTE entre as duas tabelas", () => {
  // `meta_lead_sources.development_id` guarda id de crm_projects. Gravá-lo
  // direto na FK de developments estoura 23503 e a lead inteira se perde —
  // já aconteceu. A ponte crm_projects.development_id é o caminho.
  assert.match(ingestao, /from\("crm_projects"\)\.select\("development_id"\)/);
  assert.match(ingestao, /ponte_de_empreendimento_ausente/,
    "ponte vazia precisa VIRAR AVISO, não silêncio");
  assert.match(ingestao, /project_id: crmProjectId/,
    "cada id vai para a SUA coluna — foi a troca deles que perdia a lead");
});

test("consentimento vem do formulário e não é presumido", () => {
  // Presumir consentimento faria PII sair para a Meta sem base legal.
  const consent = ler("lib", "crm", "meta-consent.ts");
  assert.match(consent, /nao_perguntado|consentBasis/);
  assert.match(webhook, /consent|source/i);
});
