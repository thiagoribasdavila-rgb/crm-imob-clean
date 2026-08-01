#!/usr/bin/env node
/**
 * PROVA OS DOIS LADOS DO RECORTE da rota de compatibilidade — contra o banco vivo.
 *
 * ── POR QUE ESTE SCRIPT EXISTE, E O QUE ELE NÃO SUBSTITUI ───────────────────
 *
 * O jeito mais forte de provar `GET /api/v1/crm/compatibilidade` seria chamá-la
 * por HTTP com dois usuários reais. Não é possível nesta sessão: `npm run dev` e
 * `npm run build` estão proibidos (quarentena de rotas, vários agentes ativos) e
 * NADA está escutando em :3000 — verificado com `lsof -nP -iTCP -sTCP:LISTEN`.
 *
 * Então este script prova a CAMADA QUE DECIDE, executando exatamente as mesmas
 * funções que a rota executa, com um PostgREST de mentira que registra o filtro
 * aplicado, e conferindo o efeito contra as contagens REAIS da base.
 *
 * O que ele prova: que `aplicarPisoDeCarteira` entra para corretor e NÃO entra
 * para liderança, e que o número de clientes visíveis de cada lado é o que a base
 * diz que deve ser.
 * O que ele NÃO prova: a autenticação, o rate limit e a serialização HTTP da
 * rota. Isso fica para o ambiente que sobe o servidor.
 *
 *   set -a && . ./.env.local && set +a && node --experimental-strip-types scripts/prova-compatibilidade-escopo.mjs
 */

import {
  aplicarPisoDeCarteira,
  filtroDaMinhaCarteira,
  leLiderancaInteira,
} from "../lib/crm/escopo-de-leitura.ts";
import { agregarOfertas, diagnosticarCarteira, recomendarPara } from "../lib/crm/compatibilidade-imovel.ts";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !SERVICE) {
  console.error("Faltam credenciais. Rode com: set -a && . ./.env.local && set +a");
  process.exit(2);
}

let ok = 0;
const falhas = [];
function checa(nome, condicao, detalhe = "") {
  if (condicao) { ok += 1; console.log(`  ✔ ${nome}`); }
  else { falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`); console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

async function rest(caminho) {
  const r = await fetch(`${URL_SB}/rest/v1/${caminho}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Accept: "application/json", Prefer: "count=exact" },
  });
  if (!r.ok) { console.error(`REST ${caminho} → ${r.status} ${await r.text()}`); process.exit(2); }
  return r.json();
}

/** Consulta de mentira: só registra o `or` que a rota aplicaria. */
function consultaFalsa() {
  const registrado = [];
  const q = { ors: registrado, or(filtro) { registrado.push(filtro); return q; } };
  return q;
}

console.log("═══ 1. O PISO É APLICADO PARA CORRETOR E NÃO PARA LIDERANÇA ═══");
const corretor = { commercialRole: "broker", role: "user" };
const diretor = { commercialRole: "director", role: "user" };
const admin = { commercialRole: null, role: "admin" };
const USER = "11111111-1111-4111-8111-111111111111";

const qCorretor = aplicarPisoDeCarteira(consultaFalsa(), corretor, USER);
checa("corretor: o filtro de posse ENTRA", qCorretor.ors.length === 1, JSON.stringify(qCorretor.ors));
checa("corretor: e é o filtro do módulo compartilhado", qCorretor.ors[0] === filtroDaMinhaCarteira(USER));

const qDiretor = aplicarPisoDeCarteira(consultaFalsa(), diretor, USER);
checa("diretor: NENHUM filtro de posse entra", qDiretor.ors.length === 0, JSON.stringify(qDiretor.ors));
const qAdmin = aplicarPisoDeCarteira(consultaFalsa(), admin, USER);
checa("admin sem papel comercial: continua liderança", qAdmin.ors.length === 0);
checa("leLiderancaInteira concorda com o piso", leLiderancaInteira(diretor) && !leLiderancaInteira(corretor));

console.log("\n═══ 2. O EFEITO NA BASE VIVA: quantos clientes cada lado vê ═══");
const orgs = await rest("developments?select=organization_id&status=eq.active");
const ORG = orgs[0]?.organization_id;
if (!ORG) { console.error("Nenhuma organização com catálogo ativo."); process.exit(2); }
console.log(`  organização com catálogo: ${ORG}`);

const todasDaOrg = await rest(`leads?organization_id=eq.${ORG}&select=id,assigned_to,assigned_user_id`);
console.log(`  leads da organização: ${todasDaOrg.length}`);

// Escolhe um corretor REAL que tenha carteira, para o recorte não ser vazio por acidente.
// ⚠ Conta LEADS DISTINTAS por dono, não ocorrências de coluna.
//
// A primeira versão somava 1 para `assigned_user_id` e 1 para `assigned_to` e,
// quando as duas colunas trazem a MESMA pessoa (o caso normal), contava a lead
// duas vezes: deu 542 onde a carteira real é 272. O teste reprovou o recorte
// CORRETO por causa da minha aritmética — exatamente o tipo de "achado" que
// vira defeito inventado se ninguém abre a conta.
const donos = new Map();
for (const l of todasDaOrg) {
  const proprietarios = new Set([l.assigned_user_id, l.assigned_to].filter(Boolean));
  for (const d of proprietarios) {
    if (!donos.has(d)) donos.set(d, new Set());
    donos.get(d).add(l.id);
  }
}
const [donoId, carteira] = [...donos.entries()].sort((a, b) => b[1].size - a[1].size)[0] ?? [];
const quantas = carteira ? carteira.size : 0;
checa("existe corretor com carteira na base", Boolean(donoId), "sem dono não dá para provar o recorte");
console.log(`  corretor real escolhido: ${donoId} com ${quantas} lead(s)`);

const semDono = todasDaOrg.filter((l) => !l.assigned_user_id && !l.assigned_to).length;
const doDono = await rest(`leads?organization_id=eq.${ORG}&or=(${filtroDaMinhaCarteira(donoId)})&select=id`);
console.log(`  leads sem dono na organização: ${semDono}`);
checa(
  "corretor vê a própria carteira MAIS as leads sem dono, e nada além",
  doDono.length === quantas + semDono,
  `viu ${doDono.length}, esperado ${quantas} + ${semDono} = ${quantas + semDono}`,
);
checa("e vê MENOS que a organização inteira", doDono.length < todasDaOrg.length, `${doDono.length} vs ${todasDaOrg.length}`);

// O outro lado do filtro: a carteira de OUTRA pessoa não entra.
const outro = [...donos.keys()].find((d) => d !== donoId);
if (outro) {
  const idsDoOutro = new Set(
    (await rest(`leads?organization_id=eq.${ORG}&or=(assigned_user_id.eq.${outro},assigned_to.eq.${outro})&select=id`)).map((l) => l.id),
  );
  const idsVistos = new Set(doDono.map((l) => l.id));
  const vazou = [...idsDoOutro].filter((id) => idsVistos.has(id));
  checa("NENHUMA lead exclusiva de outro corretor aparece no recorte", vazou.length === 0, `vazaram ${vazou.length}`);
}

console.log("\n═══ 3. O MOTOR SOBRE O QUE CADA LADO VÊ ═══");
const devs = await rest(
  `developments?organization_id=eq.${ORG}&status=eq.active&select=id,name,neighborhood,city,latitude,longitude,market_segment,product_type,bedrooms_min,bedrooms_max,private_area_min,private_area_max,price_min,price_max,sales_cycle_status,delivery_date,updated_at`,
);
const tipologias = await rest(
  `development_typologies?select=id,development_id,bedrooms,parking_spaces,private_area,price_from,price_to,units_available,updated_at`,
);
const regras = await rest(`developer_payment_flow_rules?organization_id=eq.${ORG}&select=down_payment_percent,installments_count&active=is.true`);
const ofertas = agregarOfertas(devs, tipologias, regras[0] ?? null);
console.log(`  ofertas agregadas: ${ofertas.length} · regras de pagamento: ${regras.length}`);

const COLS =
  "id,name,budget_min,budget_max,preferred_bedrooms,bedrooms,preferred_min_area,preferred_neighborhoods,preferred_regions,purpose,monthly_income,available_down_payment,fgts_balance,desired_monthly_payment,financing_required,financing_term_months,payment_method,purchase_timeline";

const daLideranca = await rest(`leads?organization_id=eq.${ORG}&select=${COLS}`);
const doCorretor = await rest(`leads?organization_id=eq.${ORG}&or=(${filtroDaMinhaCarteira(donoId)})&select=${COLS}`);

const dLideranca = diagnosticarCarteira(daLideranca, ofertas);
const dCorretor = diagnosticarCarteira(doCorretor, ofertas);
console.log(`  liderança: ${dLideranca.clientes} clientes · ${dLideranca.comRecomendacao} com recomendação`);
console.log(`  corretor:  ${dCorretor.clientes} clientes · ${dCorretor.comRecomendacao} com recomendação`);
checa("o diagnóstico da liderança cobre mais clientes que o do corretor", dLideranca.clientes > dCorretor.clientes);
checa(
  "e o do corretor nunca reporta mais recomendáveis que o da liderança",
  dCorretor.comRecomendacao <= dLideranca.comRecomendacao,
);

console.log("\n═══ 4. A LEITURA DE UM CLIENTE RESPEITA O RECORTE ═══");
// Uma lead de OUTRO corretor: a consulta da rota, com o piso do nosso corretor,
// tem de voltar VAZIA. É o lado da recusa, provado com id real.
if (outro) {
  const alheia = (await rest(`leads?organization_id=eq.${ORG}&or=(assigned_user_id.eq.${outro},assigned_to.eq.${outro})&select=id&limit=1`))[0];
  if (alheia) {
    const comPiso = await rest(`leads?organization_id=eq.${ORG}&id=eq.${alheia.id}&or=(${filtroDaMinhaCarteira(donoId)})&select=id`);
    checa("lead de outro corretor NÃO volta com o piso do nosso corretor (404 na rota)", comPiso.length === 0, JSON.stringify(comPiso));
    const semPiso = await rest(`leads?organization_id=eq.${ORG}&id=eq.${alheia.id}&select=id`);
    checa("e a MESMA lead volta para a liderança (sem piso)", semPiso.length === 1);
  }
}

// E uma lead da própria carteira volta e produz recomendação ou perguntas.
const minha = doCorretor[0];
if (minha) {
  const r = recomendarPara(minha, ofertas);
  console.log(`  lead ${r.clienteId}: recomendável=${r.recomendavel} · top=${r.top.length} · perguntas=${r.perguntasQueDestravam.length} · lacunas de catálogo=${r.lacunasDoCatalogo.length}`);
  checa(
    "cliente da própria carteira recebe OU imóveis OU perguntas — nunca silêncio",
    r.top.length > 0 || r.perguntasQueDestravam.length > 0 || r.lacunasDoCatalogo.length > 0,
  );
  checa("quando não é recomendável, a lista vem vazia e o motivo escrito", r.recomendavel || (r.top.length === 0 && Boolean(r.motivoDaRecusa)));
}

console.log(`\n═══ ${ok} verificações passaram · ${falhas.length} falharam ═══`);
if (falhas.length) { for (const f of falhas) console.log(`  ✘ ${f}`); process.exit(1); }
