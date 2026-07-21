/**
 * Checagem adversarial dos eventos de qualidade CAPI (lib/meta/capi/quality-events).
 *
 * Standalone, sem framework: node --experimental-strip-types scripts/check-meta-capi-quality-events.mts
 * Acumula falhas em pt-BR e sai com código 1 se qualquer caso reprovar.
 */

import { createHash } from "node:crypto";
import {
  QUALITY_EVENT_NAMES,
  hashUserData,
  leadQualifiedEvent,
  visitScheduledEvent,
  saleEvent,
  buildEventsRequest,
  type QualityEventInput,
} from "../lib/meta/capi/quality-events.ts";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed += 1;
  else failures.push(name);
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// Vetores conhecidos (verificados fora do módulo, com createHash direto)
const EMAIL_HASH = "44666ae053e9c2e7e0816335b17c75c077834cc2da72c5ce72490de64adc4428"; // sha256("teste@exemplo.com")
const PHONE_HASH = "029c7290f14c4516673508635f0519db95f7daf42057fd0e4ad1de84c5408a66"; // sha256("5511987654321")

// 1) vetor conhecido de e-mail
check(
  "caso 1: hashUserData bate com vetor sha256 conhecido de e-mail",
  hashUserData({ email: "teste@exemplo.com" }).em?.[0] === EMAIL_HASH &&
  EMAIL_HASH === sha("teste@exemplo.com"),
);

// 2) e-mail normalizado (trim + lowercase) antes do hash
check(
  "caso 2: e-mail com maiúsculas/espaços gera o MESMO hash",
  hashUserData({ email: "  TESTE@Exemplo.COM " }).em?.[0] === EMAIL_HASH,
);

// 3) e-mail inválido é omitido (nunca hash de lixo, nunca cru)
{
  const out = hashUserData({ email: "nao-e-email" });
  check("caso 3: e-mail inválido → em ausente", out.em === undefined && out.ph === undefined);
}

// 4) telefone BR de 11 dígitos com máscara ganha DDI 55
check(
  "caso 4: telefone '(11) 98765-4321' → hash de 5511987654321",
  hashUserData({ phone: "(11) 98765-4321" }).ph?.[0] === PHONE_HASH && PHONE_HASH === sha("5511987654321"),
);

// 5) telefone já com 55 e com +/00 convergem para o mesmo hash
check(
  "caso 5: '+55 11 98765-4321', '5511987654321' e '005511987654321' → mesmo hash",
  hashUserData({ phone: "+55 11 98765-4321" }).ph?.[0] === PHONE_HASH &&
  hashUserData({ phone: "5511987654321" }).ph?.[0] === PHONE_HASH &&
  hashUserData({ phone: "005511987654321" }).ph?.[0] === PHONE_HASH,
);

// 6) fixo BR de 10 dígitos também ganha 55
check(
  "caso 6: fixo '11 4004-4004' → hash de 551140044004",
  hashUserData({ phone: "11 4004-4004" }).ph?.[0] === sha("551140044004"),
);

// 7) telefone curto/inválido é omitido
check(
  "caso 7: telefone curto '9999' → ph ausente",
  hashUserData({ phone: "9999" }).ph === undefined,
);

// 8) determinismo: duas chamadas idênticas → mesma saída
{
  const a = hashUserData({ email: "teste@exemplo.com", phone: "11987654321" });
  const b = hashUserData({ email: "teste@exemplo.com", phone: "11987654321" });
  check("caso 8: hashUserData é determinístico", JSON.stringify(a) === JSON.stringify(b));
}

const baseInput: QualityEventInput = {
  eventId: "crm-stage-lead-1-qualificacao",
  eventTime: 1_752_000_000,
  leadRef: { email: "teste@exemplo.com", phone: "(11) 98765-4321" },
};

// 9) leadQualifiedEvent — payload completo e correto
{
  const ev = leadQualifiedEvent(baseInput);
  check(
    "caso 9: leadQualifiedEvent → QualifiedLead com hashes, dedup id e action_source default",
    ev.event_name === QUALITY_EVENT_NAMES.leadQualified &&
    ev.event_name === "QualifiedLead" &&
    ev.event_id === "crm-stage-lead-1-qualificacao" &&
    ev.event_time === 1_752_000_000 &&
    ev.action_source === "system_generated" &&
    ev.user_data.em?.[0] === EMAIL_HASH &&
    ev.user_data.ph?.[0] === PHONE_HASH &&
    ev.custom_data === undefined,
  );
}

// 10) visitScheduledEvent → "Schedule", action_source "crm" respeitado
{
  const ev = visitScheduledEvent({ ...baseInput, eventId: "crm-visit-lead-1", actionSource: "crm" });
  check(
    "caso 10: visitScheduledEvent → Schedule com action_source crm",
    ev.event_name === "Schedule" && ev.action_source === "crm" && ev.event_id === "crm-visit-lead-1",
  );
}

// 11) saleEvent → Purchase com value/currency em custom_data (currency normalizada)
{
  const ev = saleEvent({ ...baseInput, eventId: "crm-sale-lead-1", value: 450000.505, currency: "brl" });
  check(
    "caso 11: saleEvent → Purchase com value arredondado e currency BRL",
    ev.event_name === "Purchase" &&
    ev.custom_data?.value === 450000.51 &&
    ev.custom_data?.currency === "BRL",
  );
}

// 12) Purchase exige value > 0
check(
  "caso 12: saleEvent rejeita value ausente, zero e negativo",
  throws(() => saleEvent({ ...baseInput, currency: "BRL" })) &&
  throws(() => saleEvent({ ...baseInput, value: 0, currency: "BRL" })) &&
  throws(() => saleEvent({ ...baseInput, value: -10, currency: "BRL" })),
);

// 13) Purchase exige currency ISO-4217 válida
check(
  "caso 13: saleEvent rejeita currency ausente ou fora do formato de 3 letras",
  throws(() => saleEvent({ ...baseInput, value: 100 })) &&
  throws(() => saleEvent({ ...baseInput, value: 100, currency: "REAIS" })) &&
  throws(() => saleEvent({ ...baseInput, value: 100, currency: "R$" })),
);

// 14) sem identificador correspondível → Error (nunca evento órfão)
check(
  "caso 14: builders rejeitam lead sem e-mail/telefone válidos",
  throws(() => leadQualifiedEvent({ ...baseInput, leadRef: {} })) &&
  throws(() => visitScheduledEvent({ ...baseInput, leadRef: { email: "invalido", phone: "12" } })),
);

// 15) eventTime inválido → Error; float é truncado para segundos inteiros
check(
  "caso 15: eventTime NaN/zero rejeitados e float vira inteiro",
  throws(() => leadQualifiedEvent({ ...baseInput, eventTime: Number.NaN })) &&
  throws(() => leadQualifiedEvent({ ...baseInput, eventTime: 0 })) &&
  leadQualifiedEvent({ ...baseInput, eventTime: 1_752_000_000.9 }).event_time === 1_752_000_000,
);

// 16) eventId vazio → Error (dedup é obrigatório)
check(
  "caso 16: eventId vazio/whitespace rejeitado",
  throws(() => leadQualifiedEvent({ ...baseInput, eventId: "   " })),
);

// 17) buildEventsRequest → path sem versão/barra e body com data
{
  const ev = leadQualifiedEvent(baseInput);
  const req = buildEventsRequest([ev], { datasetId: "123456789" });
  check(
    "caso 17: buildEventsRequest monta path dataset/events e body.data",
    req.path === "123456789/events" &&
    req.body.data.length === 1 &&
    req.body.test_event_code === undefined,
  );
}

// 18) testEventCode entra somente quando informado
{
  const ev = leadQualifiedEvent(baseInput);
  const req = buildEventsRequest([ev], { datasetId: "123456789", testEventCode: "TEST123" });
  check("caso 18: testEventCode presente quando informado", req.body.test_event_code === "TEST123");
}

// 19) dedup por event_id: duplicatas caem, primeira ocorrência vence
{
  const a = leadQualifiedEvent(baseInput);
  const b = visitScheduledEvent({ ...baseInput }); // MESMO eventId de propósito
  const c = saleEvent({ ...baseInput, eventId: "crm-sale-lead-1", value: 100, currency: "BRL" });
  const req = buildEventsRequest([a, b, c], { datasetId: "123456789" });
  check(
    "caso 19: dedup por event_id mantém a primeira ocorrência",
    req.body.data.length === 2 &&
    req.body.data[0]?.event_name === "QualifiedLead" &&
    req.body.data[1]?.event_id === "crm-sale-lead-1",
  );
}

// 20) datasetId inválido → Error
check(
  "caso 20: datasetId não-numérico ou vazio rejeitado",
  throws(() => buildEventsRequest([], { datasetId: "abc" })) &&
  throws(() => buildEventsRequest([], { datasetId: "" })) &&
  throws(() => buildEventsRequest([], { datasetId: "123" })),
);

// 21) NENHUM campo cru de PII em nenhum payload serializado
{
  const events = [
    leadQualifiedEvent(baseInput),
    visitScheduledEvent({ ...baseInput, eventId: "crm-visit-lead-1" }),
    saleEvent({ ...baseInput, eventId: "crm-sale-lead-1", value: 890000, currency: "BRL" }),
  ];
  const serialized = JSON.stringify(buildEventsRequest(events, { datasetId: "123456789", testEventCode: "TEST123" }));
  check(
    "caso 21: payload serializado não contém e-mail nem telefone crus",
    !serialized.includes("teste@exemplo.com") &&
    !serialized.includes("@") &&
    !serialized.includes("11987654321") &&
    !serialized.includes("98765"),
  );
}

// 22) pureza observável: mesmos inputs → request byte a byte idêntico
{
  const build = () =>
    JSON.stringify(
      buildEventsRequest(
        [saleEvent({ ...baseInput, eventId: "crm-sale-lead-1", value: 500000, currency: "BRL" })],
        { datasetId: "987654321" },
      ),
    );
  check("caso 22: núcleo determinístico (duas execuções idênticas)", build() === build());
}

if (failures.length > 0) {
  console.error(`REPROVADO: ${failures.length} caso(s) falharam (${passed} passaram)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: ${passed} casos passaram (check-meta-capi-quality-events)`);
