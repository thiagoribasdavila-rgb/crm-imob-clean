#!/usr/bin/env node

/**
 * Self-test real do pré-disparo Meta.
 *
 * Somente leitura:
 * - lê a conta de anúncios;
 * - lê campanhas;
 * - lê Página e Formulário, quando configurados;
 * - não cria campanha;
 * - não ativa campanha;
 * - não envia orçamento;
 * - nunca imprime tokens.
 */

const GRAPH_VERSION = clean(process.env.META_GRAPH_API_VERSION) || "v23.0";
const ADS_TOKEN = clean(process.env.META_ADS_ACCESS_TOKEN);
const LEAD_TOKEN = clean(process.env.META_LEAD_ACCESS_TOKEN) || ADS_TOKEN;
const AD_ACCOUNT_ID = accountPath(clean(process.env.META_AD_ACCOUNT_ID));
const PAGE_ID = clean(process.env.META_PAGE_ID);
const LEAD_FORM_ID = clean(process.env.META_LEAD_FORM_ID);
const secrets = [
  ADS_TOKEN,
  LEAD_TOKEN,
  clean(process.env.META_CONVERSIONS_ACCESS_TOKEN),
  clean(process.env.META_APP_SECRET),
].filter(Boolean);

function clean(value) {
  return String(value ?? "").trim();
}

function accountPath(value) {
  const id = clean(value).replace(/^act_/, "");
  return id ? `act_${id}` : "";
}

function mask(value) {
  const id = clean(value).replace(/^act_/, "");
  if (!id) return "—";
  return `••••${id.slice(-4)}`;
}

function redact(value) {
  let text = String(value ?? "");
  for (const secret of secrets) text = text.split(secret).join("<token>");
  return text;
}

function statusIcon(status) {
  if (status === "ok") return "✅";
  if (status === "warning") return "🟡";
  return "🛑";
}

async function graphGet(path, token) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) {
      const error = body?.error ?? {};
      return {
        ok: false,
        status: response.status,
        body,
        message: redact(
          `Meta Graph HTTP ${response.status}: ${error.message || "erro"}${error.code ? ` [${error.code}]` : ""}${error.fbtrace_id ? ` · fbtrace ${error.fbtrace_id}` : ""}`,
        ),
      };
    }
    return { ok: true, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      message: redact(error instanceof Error ? error.message : String(error)),
    };
  }
}

function pushConfig(checks, id, label, ok, messageOk, messageFail) {
  checks.push({
    id,
    label,
    status: ok ? "ok" : "blocked",
    message: ok ? messageOk : messageFail,
  });
}

function pushRead(checks, id, label, result, messageOk, messageFail) {
  checks.push({
    id,
    label,
    status: result.ok ? "ok" : "blocked",
    message: result.ok ? messageOk : messageFail,
    ...(result.message ? { technical: result.message } : {}),
  });
}

const checks = [];
pushConfig(
  checks,
  "ads-token",
  "Token Meta Ads",
  Boolean(ADS_TOKEN),
  "Configurado.",
  "Preencha META_ADS_ACCESS_TOKEN.",
);
pushConfig(
  checks,
  "ad-account",
  "Conta de anúncios",
  Boolean(AD_ACCOUNT_ID),
  "Configurada.",
  "Preencha META_AD_ACCOUNT_ID.",
);

let accountRead = null;
if (ADS_TOKEN && AD_ACCOUNT_ID) {
  accountRead = await graphGet(
    `${AD_ACCOUNT_ID}?fields=id,name,account_status,currency,timezone_name,disable_reason`,
    ADS_TOKEN,
  );
  pushRead(
    checks,
    "account-read",
    "Leitura da conta",
    accountRead,
    `Conta lida: ${accountRead.body?.name || mask(AD_ACCOUNT_ID)}.`,
    "A Meta recusou a leitura da conta.",
  );
}

let campaignRead = null;
if (ADS_TOKEN && AD_ACCOUNT_ID && accountRead?.ok) {
  campaignRead = await graphGet(
    `${AD_ACCOUNT_ID}/campaigns?fields=id,name,status,effective_status,objective,special_ad_categories&limit=5`,
    ADS_TOKEN,
  );
  const count = Array.isArray(campaignRead.body?.data)
    ? campaignRead.body.data.length
    : 0;
  const active = Array.isArray(campaignRead.body?.data)
    ? campaignRead.body.data.filter((campaign) =>
        ["ACTIVE", "PAUSED"].includes(String(campaign.effective_status || campaign.status)),
      ).length
    : 0;
  pushRead(
    checks,
    "campaigns-read",
    "Leitura de campanhas",
    campaignRead,
    `${count} campanhas lidas (${active} operacionais na amostra).`,
    "A Meta recusou a leitura de campanhas.",
  );
}

if (!PAGE_ID) {
  checks.push({
    id: "page-id",
    label: "Página Meta",
    status: "warning",
    message: "Preencha META_PAGE_ID antes da criação real de anúncio de leads.",
  });
} else if (LEAD_TOKEN) {
  const pageRead = await graphGet(`${encodeURIComponent(PAGE_ID)}?fields=id,name`, LEAD_TOKEN);
  pushRead(
    checks,
    "page-read",
    "Página Meta",
    pageRead,
    `Página lida: ${pageRead.body?.name || mask(PAGE_ID)}.`,
    "Não foi possível ler a Página.",
  );
}

if (!LEAD_FORM_ID) {
  checks.push({
    id: "lead-form-id",
    label: "Formulário Lead Ads",
    status: "warning",
    message: "Preencha META_LEAD_FORM_ID antes da criação real de anúncio de leads.",
  });
} else if (LEAD_TOKEN) {
  const formRead = await graphGet(`${encodeURIComponent(LEAD_FORM_ID)}?fields=id,name,status`, LEAD_TOKEN);
  pushRead(
    checks,
    "lead-form-read",
    "Formulário Lead Ads",
    formRead,
    `Formulário lido: ${formRead.body?.name || mask(LEAD_FORM_ID)}${formRead.body?.status ? ` · ${formRead.body.status}` : ""}.`,
    "Não foi possível ler o formulário Lead Ads.",
  );
}

checks.push({
  id: "safe-publication-mode",
  label: "Modo seguro",
  status: "ok",
  message: "Pré-disparo não cria campanha, não ativa verba e não executa mutação externa.",
});
checks.push({
  id: "media-commit",
  label: "Mídia",
  status: "warning",
  message: "Na criação real, informe imagem ou vídeo para gerar image_hash/video_id.",
});

const blockers = checks.filter((check) => check.status === "blocked");
const warnings = checks.filter((check) => check.status === "warning");
const score = Math.round(((checks.length - blockers.length - warnings.length * 0.35) / checks.length) * 100);
const canCreatePausedCampaign =
  blockers.length === 0 &&
  warnings.every((check) => !["page-id", "lead-form-id"].includes(check.id));
const status = blockers.length ? "blocked" : warnings.length ? "warning" : "ok";

console.log("ATLAS META CAMPAIGN DISPATCH SELFTEST");
console.log(`Status: ${statusIcon(status)} ${status.toUpperCase()} · score ${Math.max(0, Math.min(100, score))}%`);
console.log(`Graph: ${GRAPH_VERSION}`);
console.log(`Conta: ${mask(AD_ACCOUNT_ID)} · Página: ${mask(PAGE_ID)} · Formulário: ${mask(LEAD_FORM_ID)}`);
console.log("Mutação externa: NÃO · gasto automático: NÃO · aprovação humana: OBRIGATÓRIA");
console.log("");

for (const check of checks) {
  console.log(`${statusIcon(check.status)} ${check.label}: ${check.message}`);
  if (check.technical) console.log(`   detalhe: ${check.technical}`);
}

console.log("");
if (canCreatePausedCampaign) {
  console.log("Próximo passo: gerar prévia da campanha, coletar aprovação humana e criar estrutura PAUSED.");
} else if (blockers.length) {
  console.log("Bloqueado por:");
  for (const check of blockers) console.log(`- ${check.message}`);
} else {
  console.log("Avisos antes da criação pausada:");
  for (const check of warnings) console.log(`- ${check.message}`);
}

process.exit(blockers.length ? 1 : 0);
