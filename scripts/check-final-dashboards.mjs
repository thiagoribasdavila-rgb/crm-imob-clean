/**
 * PORTÃO DOS DASHBOARDS POR PAPEL — Fase Final 7.
 *
 * ── REAPONTADO EM 2026-07-29, COM A CAUSA MEDIDA ───────────────────────────
 *
 * A versão anterior cobrava dez tokens de `app/(crm)/dashboard/page.tsx` e os
 * dez estavam vermelhos. Executado o portão e lido o arquivo, o motivo eram
 * DOIS problemas diferentes empilhados sob o mesmo vermelho:
 *
 *  1. A TELA MUDOU DE LUGAR. Desde a fusão Início + Command Center (commit
 *     d7112d24), `app/(crm)/dashboard/page.tsx` é um redirect de 18 linhas e a
 *     casa de decisão por papel é `app/(crm)/command-center/page.tsx`. Medido:
 *     8 dos 10 tokens (`const isBroker`, `if (!isBroker)`, `isBroker ?`,
 *     "Perfil comercial não identificado", `brokerDaily`, `managerDaily`,
 *     `superintendentSummary`, `directorDaily`) JÁ ESTAVAM lá, intactos. O
 *     portão apontava para um arquivo aposentado — e cobrar de tela aposentada
 *     é o mesmo que não cobrar.
 *
 *  2. METADE DA PROPRIEDADE NÃO EXISTIA. `DASHBOARD_PERIOD_KEY` não existia em
 *     lugar nenhum do repositório (medido: 0 ocorrências fora deste script e do
 *     motivo da quarentena). O doc da Fase Final 7 prometia por escrito, em
 *     "## Relatórios", que "o resumo operacional alterna entre dia, semana e
 *     mês" e que "o período escolhido permanece durante a sessão". A primeira
 *     metade era verdade em `app/(crm)/reports/page.tsx` desde sempre; a
 *     segunda — a MEMÓRIA da escolha — nunca foi implementada. A hipótese da
 *     auditoria de 2026-07-21 ("a funcionalidade não existe") estava certa para
 *     esta metade e errada para a outra.
 *
 * ── POR QUE A GUARDA FICOU MAIS FORTE, E NÃO MAIS FROUXA ───────────────────
 *
 *  · Ela EXECUTA. A parte que decide se a escolha volta deixou de ser texto num
 *    `useEffect` e virou função pura em `lib/dashboards/periodo-do-resumo.ts`;
 *    este portão a importa e a chama. Antes, `DASHBOARD_PERIOD_KEY` presente
 *    num comentário bastava para o verde.
 *  · Ela prova OS DOIS LADOS: a escolha válida volta E o valor corrompido cai
 *    no padrão; o recorte deixa passar o de uma hora atrás E barra o de dez
 *    dias na janela de sete.
 *  · Ela proíbe a REGRESSÃO ESTRUTURAL que criou este vermelho: `/dashboard`
 *    tem de continuar só reencaminhando, e as pastilhas têm de nascer do mesmo
 *    vocabulário que valida o valor salvo (uma lista, não duas).
 *  · Controles: 20 antes (10 deles apontados para arquivo aposentado), 49 agora
 *    — 12 deles EXECUTANDO as funções, não procurando o nome delas.
 *
 * O grão fino do comportamento é contrato executável, com mutação:
 * `tests/contracts/periodo-do-resumo-persiste.test.mjs`.
 */

import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const checks = [];
const lido = new Map();
const fonte = (file) => {
  if (!lido.has(file)) lido.set(file, fs.readFileSync(file, "utf8"));
  return lido.get(file);
};
const need = (file, ...tokens) => {
  const source = fonte(file);
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};
/** O outro lado: o que NÃO pode aparecer. Regressão estrutural também é vermelho. */
const proibe = (file, motivo, ...tokens) => {
  const source = fonte(file);
  for (const token of tokens) checks.push([`${file}: sem "${token}" (${motivo})`, !source.includes(token)]);
};
const executa = (rotulo, resultado) => checks.push([`executado — ${rotulo}`, resultado]);

// ── Declaração da fase ─────────────────────────────────────────────────────
need("config/final-role-dashboards.json", '"phase": 7', '"role_resolved_before_render": true', '"wrong_role_request_prevented": true');
const program = JSON.parse(fs.readFileSync("config/final-10-phases-improvement.json", "utf8"));
checks.push(["config/final-10-phases-improvement.json: fase atual não regrediu", Number(program.current_phase) >= 7]);
checks.push(["config/final-10-phases-improvement.json: fases 1 a 7 concluídas", [1, 2, 3, 4, 5, 6, 7].every((phase) => program.completed?.includes(phase))]);

// ── A casa de decisão por papel: /command-center, não /dashboard ────────────
const CASA = "app/(crm)/command-center/page.tsx";
need(CASA, "const isBroker", "if (!isBroker)", "Perfil comercial não identificado", "isBroker ?");
need(CASA, "brokerDaily", "managerDaily", "superintendentSummary", "directorDaily");

// `/dashboard` é porta de compatibilidade para deep links antigos. Se voltar a
// ter estado e fetch próprios, passam a existir duas verdades sobre os mesmos
// números — e foi assim que este portão ficou apontado para o lugar errado.
need("app/(crm)/dashboard/page.tsx", 'redirect("/command-center")');
proibe("app/(crm)/dashboard/page.tsx", "porta de compatibilidade não pode virar segunda casa", "useState", "useEffect", "fetch(");

// ── O recorte do resumo operacional: vocabulário único e memória de sessão ──
const MODULO = "lib/dashboards/periodo-do-resumo.ts";
const RELATORIOS = "app/(crm)/reports/page.tsx";
need(MODULO, "DASHBOARD_PERIOD_KEY", '"day", "week", "month"', "PERIODO_PADRAO", "periodoParaGravar", "dentroDoPeriodo");
need(RELATORIOS, "DASHBOARD_PERIOD_KEY", "lerPeriodoSalvo", "periodoParaGravar", "PERIODOS_DO_RESUMO.map(", "dentroDoPeriodo(period,");
proibe(RELATORIOS, "a chave tem de vir da constante; literal redigitado divergiria da leitura", "atlas:dashboard-period");
proibe(RELATORIOS, "reenumerar os recortes cria duas listas que divergem", '"day", "week", "month"');
// Ancorado na REGIÃO de cada uso da chave: proibir a palavra na página toda
// reprovaria por uma preferência futura sem relação com o recorte, e guarda que
// reprova por motivo errado é guarda que alguém afrouxa.
{
  const corpo = fonte(RELATORIOS);
  let vizinhoErrado = false;
  for (let i = corpo.indexOf("DASHBOARD_PERIOD_KEY"); i >= 0; i = corpo.indexOf("DASHBOARD_PERIOD_KEY", i + 1)) {
    if (corpo.slice(Math.max(0, i - 120), i + 120).includes("localStorage")) vizinhoErrado = true;
  }
  checks.push([`${RELATORIOS}: a chave do recorte só aparece perto de sessionStorage (o doc promete "durante a sessão")`, !vizinhoErrado]);
}

// ── Executado: as funções que decidem, chamadas de verdade ──────────────────
const periodo = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte(MODULO)))}`
);
const { PERIODOS_DO_RESUMO, PERIODO_PADRAO, lerPeriodoSalvo, periodoParaGravar, diasDoPeriodo, dentroDoPeriodo } = periodo;

executa("dia, semana e mês estão no vocabulário", ["day", "week", "month"].every((p) => PERIODOS_DO_RESUMO.includes(p)));
executa("a escolha válida volta como ela mesma", PERIODOS_DO_RESUMO.every((p) => lerPeriodoSalvo(p) === p));
executa("sem escolha salva cai no padrão", [null, undefined, "", "   "].every((v) => lerPeriodoSalvo(v) === PERIODO_PADRAO));
executa("valor corrompido cai no padrão, não recorta às cegas", ["semana", "DAY", "quarter", '{"periodo":"week"}'].every((v) => lerPeriodoSalvo(v) === PERIODO_PADRAO));
executa("o padrão pertence ao vocabulário", PERIODOS_DO_RESUMO.includes(PERIODO_PADRAO));
executa("depois de hidratar, a escolha é gravada", PERIODOS_DO_RESUMO.every((p) => periodoParaGravar(p, true) === p));
executa("antes de hidratar, nada é gravado", PERIODOS_DO_RESUMO.every((p) => periodoParaGravar(p, false) === null));
executa("lixo nunca chega ao armazenamento", ["semana", "", null, 7].every((v) => periodoParaGravar(v, true) === null));
executa("as janelas são 1, 7 e 30 dias, e histórico não recorta", diasDoPeriodo("day") === 1 && diasDoPeriodo("week") === 7 && diasDoPeriodo("month") === 30 && diasDoPeriodo("all") === null);
const AGORA = Date.parse("2026-07-29T12:00:00.000Z");
const DEZ_DIAS = new Date(AGORA - 10 * 86_400_000).toISOString();
const UMA_HORA = new Date(AGORA - 3_600_000).toISOString();
executa("a pastilha mexe no número: 10 dias entra em mês e sai de semana", dentroDoPeriodo("month", DEZ_DIAS, AGORA) === true && dentroDoPeriodo("week", DEZ_DIAS, AGORA) === false);
executa("o recorte deixa passar quem deve: uma hora atrás entra em todos", PERIODOS_DO_RESUMO.every((p) => dentroDoPeriodo(p, UMA_HORA, AGORA) === true));
executa("linha sem data fica fora da janela fechada e dentro do histórico", dentroDoPeriodo("month", null, AGORA) === false && dentroDoPeriodo("all", null, AGORA) === true);

// ── Escopo e governança das rotas de papel ─────────────────────────────────
need("app/api/v1/analytics/director-daily/route.ts", 'roles: ["admin", "director"]', "organizationWide", "humanApprovalRequired");

// ── O doc tem de dizer ONDE a propriedade mora, para não desapontar de novo ─
need("docs/FINAL_PHASE_7_ROLE_DASHBOARDS.md", "Estruturas paralelas permanecem excluídas", "dia, semana e mês", "app/(crm)/command-center/page.tsx", "lib/dashboards/periodo-do-resumo.ts");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nDashboards aprovados: ${checks.length} controles; Fase Final 7 concluída.`);
