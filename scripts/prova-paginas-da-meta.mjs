#!/usr/bin/env node
/**
 * A PÁGINA QUE ANUNCIA É A PÁGINA QUE O CRM ESCUTA?
 *
 * ── O DEFEITO QUE ISTO EXISTE PARA PEGAR ────────────────────────────────────
 *
 * Medido em 2026-07-30, na conta real "Inside - Senna" (`act_2169318190556460`):
 *
 *   anúncios ATIVOS publicam na página ....... 1115087091694606
 *   o CRM escuta (29 fontes, 4 eventos) ...... 582258611872380
 *   o token alcança .......................... 582258611872380 apenas
 *
 * São páginas DIFERENTES. Enquanto a conta está com `amount_spent == spend_cap`
 * (R$ 5.271,00 ao centavo), os anúncios não entregam e nada acontece. No minuto
 * em que a verba for recarregada, cada lead paga nasce numa página que o CRM não
 * escuta e que o token não consegue ler — e some sem erro em tela nenhuma.
 *
 * Esse é o pior formato de defeito deste projeto: silencioso, caro, e só visível
 * para quem desconfiar e cruzar duas fontes à mão. Foi assim que ele foi achado.
 *
 * ── POR QUE PROVA E NÃO PORTÃO ──────────────────────────────────────────────
 *
 * Precisa da Graph API e de credencial real. Portão que depende de rede externa
 * reprova por ambiente e é desligado na primeira semana — a quarentena declarada
 * de `portoes:todos` existe justamente para esses. Aqui vale o padrão das outras
 * 13 provas: roda por nome, contra o mundo real, quando alguém precisa da resposta.
 *
 *   npm run prova:paginas-da-meta
 */
import { createClient } from "@supabase/supabase-js";

const V = process.env.META_GRAPH_API_VERSION || "v23.0";
const TOKEN_ADS = process.env.META_ADS_ACCESS_TOKEN;
const TOKEN_LEAD = process.env.META_LEAD_ACCESS_TOKEN || TOKEN_ADS;
const CONTA = process.env.META_AD_ACCOUNT_ID;
const ORG = process.env.ATLAS_ORG_ID || "7c8c71c1-e963-464c-be5c-ff8c7936f51a";

let falhas = 0;
const checa = (nome, cond, extra = "") => {
  if (!cond) falhas += 1;
  console.log(`  ${cond ? "✔" : "✘"} ${nome}${extra ? " — " + extra : ""}`);
};

if (!TOKEN_ADS || !CONTA) {
  console.log("NÃO EXECUTADO — falta META_ADS_ACCESS_TOKEN ou META_AD_ACCOUNT_ID no ambiente.");
  console.log("Ausência de credencial não é aprovação: esta prova não afirma nada sem elas.");
  process.exit(2);
}

const grafo = async (caminho, token) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${caminho}${caminho.includes("?") ? "&" : "?"}access_token=${token}`);
  return r.json();
};

console.log(`\n═══ 1. A CONTA E O TETO ═══`);
const conta = await grafo(`${CONTA}?fields=name,account_status,amount_spent,spend_cap`, TOKEN_ADS);
if (conta.error) {
  console.log(`  ✘ a conta não respondeu: ${conta.error.message.slice(0, 120)}`);
  process.exit(1);
}
const gasto = Number(conta.amount_spent ?? 0);
const teto = Number(conta.spend_cap ?? 0);
console.log(`  conta: ${conta.name} · status ${conta.account_status}`);
const brl = (centavos) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Teto batido não é falha da integração — é informação que muda a leitura de
// tudo abaixo: anúncio ATIVO numa conta no teto não entrega nada.
console.log(`  gasto ${brl(gasto)} de teto ${brl(teto)}${teto > 0 && gasto >= teto ? "  ⚠ TETO BATIDO: os ativos não entregam" : ""}`);

console.log(`\n═══ 2. AS PÁGINAS DOS ANÚNCIOS ATIVOS ═══`);
const anuncios = await grafo(`${CONTA}/ads?fields=name,effective_status,creative&limit=50`, TOKEN_ADS);
const ativos = (anuncios.data ?? []).filter((a) => a.effective_status === "ACTIVE");
checa("existe anúncio ATIVO na conta", ativos.length > 0, `${ativos.length} de ${(anuncios.data ?? []).length}`);

const paginasDosAnuncios = new Set();
for (const anuncio of ativos) {
  const id = anuncio.creative?.id;
  if (!id) continue;
  const criativo = await grafo(`${id}?fields=effective_object_story_id`, TOKEN_ADS);
  // O formato é `{page_id}_{post_id}` — o prefixo é a página que publica.
  const pagina = String(criativo.effective_object_story_id ?? "").split("_")[0];
  if (pagina) paginasDosAnuncios.add(pagina);
}
console.log(`  páginas que publicam: ${[...paginasDosAnuncios].join(", ") || "(nenhuma identificada)"}`);

console.log(`\n═══ 3. AS PÁGINAS QUE O CRM ESCUTA ═══`);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: fontes, error: erroFontes } = await admin
  .from("meta_lead_sources")
  .select("page_id,form_id,name,active")
  .eq("organization_id", ORG);
if (erroFontes) {
  console.log(`  ✘ não foi possível ler meta_lead_sources: ${erroFontes.message}`);
  process.exit(1);
}
const paginasDoCrm = new Set((fontes ?? []).map((f) => String(f.page_id)).filter(Boolean));
console.log(`  ${(fontes ?? []).length} fontes cadastradas em: ${[...paginasDoCrm].join(", ") || "(nenhuma)"}`);

console.log(`\n═══ 4. O CRUZAMENTO — é aqui que o dinheiro se perde ═══`);
const semEscuta = [...paginasDosAnuncios].filter((p) => !paginasDoCrm.has(p));
checa(
  "toda página que anuncia está cadastrada no CRM",
  semEscuta.length === 0,
  semEscuta.length ? `SEM ESCUTA: ${semEscuta.join(", ")}` : `${paginasDosAnuncios.size} página(s) conferida(s)`,
);

console.log(`\n═══ 5. O TOKEN LÊ CADA UMA DELAS? ═══`);
for (const pagina of paginasDosAnuncios) {
  const r = await grafo(`${pagina}?fields=id,name`, TOKEN_LEAD);
  checa(`o token lê a página ${pagina}`, !r.error, r.error ? r.error.message.slice(0, 90) : r.name);
}

if (semEscuta.length) {
  console.log(
    `\n⚠ CONSEQUÊNCIA CONCRETA: enquanto o teto estiver batido, nada acontece.\n` +
      `  Ao recarregar a verba, cada lead paga nascida em ${semEscuta.join(", ")} vai sumir\n` +
      `  sem erro em tela nenhuma — o CRM não escuta essa página, e o token não a lê.\n` +
      `  Conserto: cadastrar o formulário dessa página como fonte E liberar a página\n` +
      `  ao System User no Business Manager; ou mover os anúncios para a página cadastrada.`,
  );
}

console.log(`\n${falhas === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
