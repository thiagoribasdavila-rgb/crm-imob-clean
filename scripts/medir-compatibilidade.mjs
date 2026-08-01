#!/usr/bin/env node
/**
 * MEDE O MOTOR DE COMPATIBILIDADE CONTRA O BANCO VIVO.
 *
 * A pergunta que este script responde com NÚMERO, não com adjetivo: para quantos
 * clientes da carteira o motor consegue recomendar imóvel HOJE — e, quando não
 * consegue, o que exatamente falta e de QUEM é a lacuna.
 *
 * Existe porque "o motor está pronto" é afirmação vazia se ninguém executou o
 * motor contra o dado real. Ele não escreve nada: só lê e conta.
 *
 *   set -a && . ./.env.local && set +a && node scripts/medir-compatibilidade.mjs
 */

import {
  agregarOfertas,
  diagnosticarCarteira,
  recomendarPara,
  CRITERIOS,
} from "../lib/crm/compatibilidade-imovel.ts";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !SERVICE) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Rode com: set -a && . ./.env.local && set +a");
  process.exit(2);
}

/**
 * Lê PAGINANDO.
 *
 * ⚠ A primeira versão deste script não paginava, e a medição saiu ERRADA de um
 * jeito que quase passou: PostgREST corta em 1000 linhas por padrão, as 1000
 * primeiras leads eram todas de uma organização só, e o relatório informou UMA
 * organização — escondendo justamente a que tem o catálogo (7c8c71c1, 482
 * leads). O número "0% de cobertura" estava certo por acidente e pelo motivo
 * errado. Medição que não pagina mede o limite da página, não a base.
 */
async function rest(caminho, { paginar = true } = {}) {
  const juntar = [];
  const passo = 1000;
  for (let inicio = 0; ; inicio += passo) {
    const resposta = await fetch(`${URL_SB}/rest/v1/${caminho}`, {
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        Accept: "application/json",
        Range: `${inicio}-${inicio + passo - 1}`,
      },
    });
    if (!resposta.ok) {
      console.error(`REST ${caminho} → ${resposta.status} ${await resposta.text()}`);
      process.exit(2);
    }
    const pagina = await resposta.json();
    juntar.push(...pagina);
    if (!paginar || pagina.length < passo) return juntar;
  }
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

// ── Quais organizações têm catálogo, e quais não ────────────────────────────
const orgsComLeads = await rest("leads?select=organization_id");
const contagem = new Map();
for (const l of orgsComLeads) contagem.set(l.organization_id, (contagem.get(l.organization_id) ?? 0) + 1);

const devs = await rest(
  "developments?select=id,organization_id,name,neighborhood,city,latitude,longitude,market_segment,product_type,bedrooms_min,bedrooms_max,private_area_min,private_area_max,price_min,price_max,sales_cycle_status,delivery_date,status,updated_at",
);
const tipologias = await rest(
  "development_typologies?select=id,development_id,parking_spaces,units_available,price_from,price_to,bedrooms,private_area,status,updated_at",
);
const regras = await rest("developer_payment_flow_rules?select=down_payment_percent,installments_count,active,valid_until&active=is.true");

console.log("═══ CATÁLOGO (lado da OFERTA) ═══");
console.log(`developments: ${devs.length} · development_typologies: ${tipologias.length} · developer_payment_flow_rules: ${regras.length}`);
const semPreco = devs.filter((d) => d.price_min === null && d.price_max === null).length;
const semEntrega = devs.filter((d) => !d.delivery_date).length;
const semGeo = devs.filter((d) => d.latitude === null || d.longitude === null).length;
const semDorm = devs.filter((d) => d.bedrooms_min === null && d.bedrooms_max === null).length;
const semBairro = devs.filter((d) => !d.neighborhood && !d.city).length;
console.log(`  sem preço: ${semPreco}/${devs.length} · sem data de entrega: ${semEntrega}/${devs.length} · sem geo: ${semGeo}/${devs.length}`);
console.log(`  sem dormitórios: ${semDorm}/${devs.length} · sem bairro/cidade: ${semBairro}/${devs.length}`);
const tipSemPreco = tipologias.filter((t) => t.price_from === null && t.price_to === null).length;
const tipSemVaga = tipologias.filter((t) => t.parking_spaces === null).length;
const tipSemEstoque = tipologias.filter((t) => t.units_available === null).length;
console.log(`  tipologias sem preço: ${tipSemPreco}/${tipologias.length} · sem vagas: ${tipSemVaga}/${tipologias.length} · sem units_available: ${tipSemEstoque}/${tipologias.length}`);

console.log("\n═══ POR ORGANIZAÇÃO ═══");
for (const [org, leads] of [...contagem.entries()].sort((a, b) => b[1] - a[1])) {
  const catalogo = devs.filter((d) => d.organization_id === org).length;
  console.log(`  ${org} — ${leads} leads · ${catalogo} empreendimento(s)${catalogo === 0 ? "  ← SEM OFERTA: matching impossível por falta de catálogo" : ""}`);
}

// ── O diagnóstico, organização por organização ──────────────────────────────
let totalClientes = 0;
let totalComRecomendacao = 0;

for (const [org] of [...contagem.entries()].sort((a, b) => b[1] - a[1])) {
  const ofertas = agregarOfertas(
    devs.filter((d) => d.organization_id === org),
    tipologias,
    regras[0] ?? null,
  );
  const leads = await rest(
    `leads?organization_id=eq.${org}&select=id,name,budget_min,budget_max,preferred_bedrooms,bedrooms,preferred_min_area,preferred_neighborhoods,preferred_regions,purpose,monthly_income,available_down_payment,fgts_balance,desired_monthly_payment,financing_required,financing_term_months,payment_method,purchase_timeline`,
  );
  const d = diagnosticarCarteira(leads, ofertas);
  totalClientes += d.clientes;
  totalComRecomendacao += d.comRecomendacao;

  console.log(`\n─── org ${org} · ${ofertas.length} oferta(s) ───`);
  console.log(`  clientes: ${d.clientes} · COM recomendação: ${d.comRecomendacao} (${pct(d.proporcaoComRecomendacao)}) · SEM: ${d.semRecomendacao}`);
  if (d.perguntasMaisFrequentes.length > 0) {
    console.log("  PERGUNTAS que destravam (lacuna do CLIENTE — o corretor pergunta):");
    for (const p of d.perguntasMaisFrequentes.slice(0, 6)) {
      console.log(`    · ${p.rotulo}: ${p.clientes} cliente(s) — "${p.pergunta}"`);
    }
  }
  if (d.lacunasDoCatalogo.length > 0) {
    console.log("  LACUNAS DO CATÁLOGO (lacuna da OFERTA — nenhuma ligação resolve):");
    for (const l of d.lacunasDoCatalogo.slice(0, 6)) {
      console.log(`    · ${l.rotulo}: afeta ${l.clientes} cliente(s) — preencher ${l.preencher}`);
    }
  }
}

console.log("\n═══ TOTAL ═══");
console.log(`clientes: ${totalClientes} · com recomendação hoje: ${totalComRecomendacao} (${pct(totalClientes === 0 ? 0 : totalComRecomendacao / totalClientes)})`);

// ── Uma recomendação de verdade, impressa por inteiro ───────────────────────
const orgComCatalogo = devs[0]?.organization_id;
if (orgComCatalogo) {
  const ofertas = agregarOfertas(devs.filter((d) => d.organization_id === orgComCatalogo), tipologias, regras[0] ?? null);
  const candidatos = await rest(
    `leads?organization_id=eq.${orgComCatalogo}&or=(preferred_bedrooms.not.is.null,preferred_neighborhoods.neq.{})&select=id,name,budget_min,budget_max,preferred_bedrooms,preferred_neighborhoods,purpose&limit=3`,
  );
  for (const cliente of candidatos) {
    const r = recomendarPara(cliente, ofertas);
    console.log(`\n═══ EXEMPLO REAL · lead ${r.clienteId} ═══`);
    console.log(`  recomendável: ${r.recomendavel}${r.motivoDaRecusa ? ` — ${r.motivoDaRecusa}` : ""}`);
    for (const t of r.top) {
      console.log(`  · ${t.nome} — pontos ${t.pontos}/${t.pontosTotais} · aderência ${t.aderencia === null ? "—" : pct(t.aderencia)} · cobertura ${pct(t.cobertura)} · confiança ${t.confianca}`);
      console.log(`      atendidos: ${t.atendidos.map((c) => c.rotulo).join(", ") || "nenhum"}`);
      console.log(`      NÃO atendidos: ${t.naoAtendidos.map((c) => c.rotulo).join(", ") || "nenhum"}`);
      console.log(`      risco de estoque: ${t.riscoDeEstoque.suspeito ? "SUSPEITO" : "ok"} — ${t.riscoDeEstoque.motivo}`);
    }
    for (const n of r.ofertasNaoAvaliaveis) {
      console.log(`  · FORA do ranking — ${n.nome}: ${n.porque}`);
    }
    console.log(`  alternativa mais barata: ${JSON.stringify(r.alternativaMaisBarata)}`);
    console.log(`  alternativa próxima: ${JSON.stringify(r.alternativaProxima)}`);
    console.log(`  perguntas: ${r.perguntasQueDestravam.map((p) => p.rotulo).join(", ") || "nenhuma"}`);
  }
}

console.log(`\n(${CRITERIOS.length} critérios no catálogo do motor)`);
