import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "config", "broker-dashboard.json"), "utf8"));
const endpoint = fs.readFileSync(path.join(root, contract.endpoint), "utf8");
const page = fs.readFileSync(path.join(root, contract.page), "utf8");
const failures = [];

for (const section of contract.requiredSections) if (!endpoint.includes(section) || !page.includes(section)) failures.push(`seção diária ausente: ${section}`);
for (const signal of contract.rankingSignals) if (!endpoint.includes(signal)) failures.push(`sinal de prioridade ausente: ${signal}`);
for (const safety of contract.safety) if (!endpoint.includes(safety)) failures.push(`proteção ausente: ${safety}`);
if (!endpoint.includes('roles: ["broker"]')) failures.push("endpoint não é exclusivo do corretor");
/**
 * 2026-07-29 — a asserção pedia o LITERAL `.eq("assigned_user_id", brokerId)`.
 *
 * Ela protegia uma propriedade certa (o dia do corretor é a carteira DELE), com
 * uma medida que virou errada: filtrar por uma coluna só escondia os leads que
 * estão na carteira da pessoa pela coluna legada `assigned_to`. Medido na
 * organização viva: 3 leads abertos nessa situação — 2 do Vinicius, 1 do
 * Francisco — e um deles NUNCA contatado. Eles apareciam na lista de leads
 * daquelas pessoas e sumiam do dia delas: o painel dizia MENOS trabalho do que
 * existe, que é a direção errada do erro numa operação com 442 sem primeiro
 * contato.
 *
 * A asserção agora exige a PROPRIEDADE e ficou mais estrita em dois pontos: o
 * recorte vem do módulo compartilhado (não pode ser reimplementado aqui) e as
 * DUAS colunas de posse têm de estar cobertas. `filtroDaCarteiraDaPessoa`
 * deliberadamente NÃO inclui lead sem dono — no "Meu dia" isso seria trabalho
 * de ninguém aparecendo como se fosse de todo mundo.
 */
if (!endpoint.includes("filtroDaCarteiraDaPessoa(brokerId)")) failures.push("carteira não filtra explicitamente o corretor");
if (endpoint.includes('.eq("assigned_user_id", brokerId)')) failures.push("carteira ainda filtra por uma coluna só — a legada assigned_to fica de fora");
if (!endpoint.includes('from "@/lib/crm/escopo-de-leitura"')) failures.push("o recorte de carteira precisa vir do módulo compartilhado");
if (endpoint.includes("getSupabaseAdmin")) failures.push("dashboard do corretor não deve contornar RLS");
if (!page.includes('aria-label="Fila do dia"')) failures.push("experiência da fase 21 não está visível");
if (!page.includes("por que entrou na fila")) failures.push("ranking não está explicado ao corretor");

if (failures.length) {
  console.error(`BROKER DASHBOARD Fase ${contract.phase}: falhou\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`BROKER DASHBOARD Fase ${contract.phase}: aprovado — ${contract.requiredSections.length} blocos diários; ${contract.rankingSignals.length} sinais explicáveis; carteira própria; RLS; decisão humana.`);
