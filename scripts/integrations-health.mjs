/**
 * CENTRAL DE SAÚDE DAS INTEGRAÇÕES — teste controlado de todas as credenciais.
 *
 * Regras que este script respeita, e que valem para qualquer evolução dele:
 *  - nunca imprime o valor integral de uma credencial (só os 4 últimos caracteres);
 *  - nunca publica campanha, gasta verba ou envia mensagem para cliente real;
 *  - nas IAs, usa o prompt mais curto possível e teto de saída mínimo;
 *  - toda escrita de teste é desfeita no fim;
 *  - falha de credencial NÃO derruba o script: cada integração é isolada.
 *
 * Uso: node --env-file=.env.local scripts/integrations-health.mjs
 *      node --env-file=.env.local scripts/integrations-health.mjs --json
 */
import { createClient } from "@supabase/supabase-js";

const comoJson = process.argv.includes("--json");
const resultados = [];
const mascara = (v) => (v ? `…${String(v).slice(-4)}` : null);

function registrar(grupo, item, status, detalhe, extra = {}) {
  resultados.push({ grupo, item, status, detalhe, ...extra });
}

/** Executa um teste isolando falha: integração quebrada não derruba as outras. */
async function testar(grupo, item, fn) {
  const inicio = Date.now();
  try {
    const r = await fn();
    registrar(grupo, item, r?.status ?? "ok", r?.detalhe ?? "", { latenciaMs: Date.now() - inicio, ...r?.extra });
  } catch (erro) {
    // Sanitiza: mensagens de API às vezes ecoam parte do token.
    const bruta = erro instanceof Error ? erro.message : String(erro);
    const limpa = bruta.replace(/[A-Za-z0-9_-]{24,}/g, "[REDIGIDO]").slice(0, 180);
    registrar(grupo, item, "erro", limpa, { latenciaMs: Date.now() - inicio });
  }
}

const env = process.env;
const temp = (v) => typeof v === "string" && v.trim().length > 0;

// ─────────────────────────────────────────────────────────── SUPABASE
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = temp(supabaseUrl) && temp(serviceKey)
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  : null;

await testar("Supabase", "conexão e leitura", async () => {
  if (!admin) return { status: "nao_configurado", detalhe: "URL ou service role ausente" };
  const { error, count } = await admin.from("organizations").select("id", { count: "exact", head: true });
  if (error) throw error;
  return { detalhe: `${count} organização(ões) visíveis`, extra: { projeto: supabaseUrl.split("//")[1]?.split(".")[0] } };
});

await testar("Supabase", "escrita e remoção", async () => {
  if (!admin) return { status: "nao_configurado", detalhe: "sem credencial" };
  // Escreve em atlas_events (append-only de diagnóstico) e remove em seguida.
  const org = await admin.from("organizations").select("id").limit(1).maybeSingle();
  if (!org.data) return { status: "atencao", detalhe: "nenhuma organização para escopar o teste" };
  const chave = `health:${Date.now()}`;
  const ins = await admin.from("atlas_events").insert({
    organization_id: org.data.id, event_type: "integration_health_probe",
    source: "integrations-health", payload: { chave },
  }).select("id").single();
  if (ins.error) return { status: "atencao", detalhe: `escrita indisponível: ${ins.error.code} ${String(ins.error.message).slice(0, 60)}` };
  await admin.from("atlas_events").delete().eq("id", ins.data.id);
  return { detalhe: "escrita e remoção confirmadas" };
});

await testar("Supabase", "storage", async () => {
  if (!admin) return { status: "nao_configurado", detalhe: "sem credencial" };
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw error;
  const b = data.map((x) => `${x.name}(${Math.round((x.file_size_limit ?? 0) / 1048576)}MB)`).join(", ");
  return { detalhe: b || "nenhum bucket" };
});

// ─────────────────────────────────────────────────────────── IA
await testar("IA", "Anthropic", async () => {
  const chave = env.ANTHROPIC_API_KEY;
  if (!temp(chave)) return { status: "nao_configurado", detalhe: "ANTHROPIC_API_KEY ausente" };
  const modelo = env.ATLAS_ANTHROPIC_MODEL || env.ATLAS_CLAUDE_MODEL || "claude-sonnet-4-5";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
    // Teto de 4 tokens: o teste custa frações de centavo.
    body: JSON.stringify({ model: modelo, max_tokens: 4, messages: [{ role: "user", content: "ok" }] }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) return { status: "erro", detalhe: `${r.status} ${corpo?.error?.type ?? ""} ${String(corpo?.error?.message ?? "").slice(0, 90)}`, extra: { chave: mascara(chave), modelo } };
  const u = corpo.usage ?? {};
  return { detalhe: `modelo ${corpo.model ?? modelo}`, extra: { chave: mascara(chave), tokensEntrada: u.input_tokens, tokensSaida: u.output_tokens } };
});

await testar("IA", "OpenAI", async () => {
  const chave = env.OPENAI_API_KEY;
  if (!temp(chave)) return { status: "nao_configurado", detalhe: "OPENAI_API_KEY ausente" };
  // GET /models não gera custo nenhum e já prova a credencial.
  const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${chave}` } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) return { status: "erro", detalhe: `${r.status} ${String(corpo?.error?.message ?? "").slice(0, 90)}`, extra: { chave: mascara(chave) } };
  const ids = (corpo.data ?? []).map((m) => m.id);
  const imagem = ids.filter((id) => /gpt-image|dall-e/.test(id));
  return { detalhe: `${ids.length} modelos`, extra: { chave: mascara(chave), modelosDeImagem: imagem.slice(0, 4) } };
});

await testar("IA", "Perplexity", async () => {
  const chave = env.PERPLEXITY_API_KEY;
  if (!temp(chave)) return { status: "nao_configurado", detalhe: "PERPLEXITY_API_KEY ausente" };
  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
    body: JSON.stringify({ model: "sonar", max_tokens: 16, messages: [{ role: "user", content: "ok" }] }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) return { status: "erro", detalhe: `${r.status} ${String(corpo?.error?.message ?? corpo?.detail ?? "").slice(0, 90)}`, extra: { chave: mascara(chave) } };
  return { detalhe: `modelo ${corpo.model ?? "sonar"}`, extra: { chave: mascara(chave), tokens: corpo.usage?.total_tokens } };
});

// ─────────────────────────────────────────────────────────── META
const versaoGraph = env.META_GRAPH_API_VERSION || "v23.0";
const tokenAds = env.META_ADS_ACCESS_TOKEN;
const tokenLead = env.META_LEAD_ACCESS_TOKEN;

async function graph(caminho, token, params = "") {
  const r = await fetch(`https://graph.facebook.com/${versaoGraph}/${caminho}?access_token=${encodeURIComponent(token)}${params}`);
  const corpo = await r.json().catch(() => ({}));
  return { ok: r.ok && !corpo.error, corpo, erro: corpo.error };
}

await testar("Meta", "conta de anúncios", async () => {
  if (!temp(tokenAds)) return { status: "nao_configurado", detalhe: "META_ADS_ACCESS_TOKEN ausente" };
  const conta = env.META_AD_ACCOUNT_ID;
  if (!temp(conta)) return { status: "nao_configurado", detalhe: "META_AD_ACCOUNT_ID ausente" };
  const { ok, corpo, erro } = await graph(`act_${conta.replace(/^act_/, "")}`, tokenAds, "&fields=name,account_status,currency,funding_source");
  if (!ok) return { status: "erro", detalhe: `${erro?.code}/${erro?.error_subcode ?? "-"} ${String(erro?.message ?? "").slice(0, 100)}`, extra: { token: mascara(tokenAds) } };
  return { detalhe: `${corpo.name} · status ${corpo.account_status} · ${corpo.currency}`, extra: { formaDePagamento: corpo.funding_source ? "configurada" : "AUSENTE" } };
});

await testar("Meta", "página", async () => {
  if (!temp(tokenLead)) return { status: "nao_configurado", detalhe: "META_LEAD_ACCESS_TOKEN ausente" };
  const pagina = env.META_PAGE_ID;
  if (!temp(pagina)) return { status: "nao_configurado", detalhe: "META_PAGE_ID ausente" };
  const { ok, corpo, erro } = await graph(pagina, tokenLead, "&fields=name,category");
  if (!ok) return { status: "erro", detalhe: `${erro?.code}/${erro?.error_subcode ?? "-"} ${String(erro?.message ?? "").slice(0, 100)}` };
  return { detalhe: `${corpo.name} (${corpo.category ?? "sem categoria"})` };
});

await testar("Meta", "formulário de leads", async () => {
  if (!temp(tokenLead)) return { status: "nao_configurado", detalhe: "sem token de leads" };
  const form = env.META_LEAD_FORM_ID;
  if (!temp(form)) return { status: "nao_configurado", detalhe: "META_LEAD_FORM_ID ausente" };
  const { ok, corpo, erro } = await graph(form, tokenLead, "&fields=name,status");
  if (!ok) return { status: "erro", detalhe: `${erro?.code} ${String(erro?.message ?? "").slice(0, 100)}` };
  return { detalhe: `${corpo.name} · ${corpo.status}` };
});

await testar("Meta", "dataset CAPI", async () => {
  const token = env.META_CONVERSIONS_ACCESS_TOKEN;
  const dataset = env.META_CAPI_DATASET_ID;
  if (!temp(token) || !temp(dataset)) return { status: "nao_configurado", detalhe: "token ou dataset de conversões ausente" };
  const { ok, corpo, erro } = await graph(dataset, token, "&fields=name");
  if (!ok) return { status: "erro", detalhe: `${erro?.code} ${String(erro?.message ?? "").slice(0, 100)}` };
  return { detalhe: corpo.name ?? "dataset acessível" };
});

// ─────────────────────────────────────────────────────────── WHATSAPP
await testar("WhatsApp", "número", async () => {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const numero = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!temp(token)) return { status: "nao_configurado", detalhe: "WHATSAPP_ACCESS_TOKEN ausente" };
  if (!temp(numero)) return { status: "nao_configurado", detalhe: "WHATSAPP_PHONE_NUMBER_ID ausente — sem ele não há envio nem recebimento" };
  const { ok, corpo, erro } = await graph(numero, token, "&fields=display_phone_number,verified_name,quality_rating");
  if (!ok) return { status: "erro", detalhe: `${erro?.code} ${String(erro?.message ?? "").slice(0, 100)}` };
  return { detalhe: `${corpo.verified_name} · ${corpo.display_phone_number} · qualidade ${corpo.quality_rating}` };
});

// ─────────────────────────────────────────────────────────── SMTP / INFRA
await testar("Infra", "SMTP", async () => {
  if (!temp(env.SMTP_HOST)) return { status: "nao_configurado", detalhe: "SMTP_HOST ausente — recuperação de senha depende do SMTP do Supabase" };
  return { detalhe: `${env.SMTP_HOST}:${env.SMTP_PORT ?? "?"}` };
});

await testar("Infra", "domínio público", async () => {
  const url = env.ATLAS_BASE_URL || env.NEXT_PUBLIC_APP_URL;
  if (!temp(url)) return { status: "nao_configurado", detalhe: "ATLAS_BASE_URL ausente" };
  return { detalhe: url };
});

// ─────────────────────────────────────────────────────────── SAÍDA
if (comoJson) {
  console.log(JSON.stringify({ geradoEm: new Date().toISOString(), resultados }, null, 2));
} else {
  const icone = { ok: "✅", erro: "❌", atencao: "⚠️ ", nao_configurado: "○ " };
  let grupoAtual = "";
  for (const r of resultados) {
    if (r.grupo !== grupoAtual) { grupoAtual = r.grupo; console.log(`\n[${grupoAtual}]`); }
    const extras = Object.entries(r)
      .filter(([k]) => !["grupo", "item", "status", "detalhe", "latenciaMs"].includes(k))
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : v}`)
      .join(" · ");
    console.log(`  ${icone[r.status] ?? "? "} ${r.item.padEnd(24)} ${r.detalhe}${extras ? `  [${extras}]` : ""}${r.latenciaMs ? `  ${r.latenciaMs}ms` : ""}`);
  }
  const c = (s) => resultados.filter((r) => r.status === s).length;
  console.log(`\n─────────────────────────────────────────────`);
  console.log(`  ${c("ok")} operacionais · ${c("erro")} com erro · ${c("atencao")} atenção · ${c("nao_configurado")} não configuradas`);
}

process.exit(resultados.some((r) => r.status === "erro") ? 1 : 0);
