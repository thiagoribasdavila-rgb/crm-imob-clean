import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-050-live-lead-contract.json"));
const sprint = JSON.parse(read("config/corrective-sprint-050-059.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const route = read("app/api/v1/crm/leads/route.ts");
const pipeline = read("app/api/v1/pipeline/route.ts");
const compat = read("lib/compat/legacy-v2.ts");
const liveRepositories = read("lib/atlas/core-v2/live-repositories.ts");
const report = read("docs/EVOLUTION_PHASE_050_LIVE_LEAD_CONTRACT.md");

// ── O CATÁLOGO É EXECUTADO, NÃO LIDO POR REGEX ──────────────────────────────
//
// Um select que compila e monta a lista errada de colunas passa batido por
// qualquer grep. Aqui os três catálogos são de fato avaliados e comparados
// como conjuntos.
const compilado = ts.transpileModule(compat, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduloCompat = { exports: {} };
new Function("exports", "module", compilado)(moduloCompat.exports, moduloCompat);
const colunasBase = moduloCompat.exports.LIVE_LEAD_SELECT.split(",");
const colunasComSla = moduloCompat.exports.LIVE_LEAD_SELECT_WITH_SLA.split(",");
const colunasDegradadas = colunasComSla.filter((coluna) => !colunasBase.includes(coluna));
const grupoDeclarado = [
  ...moduloCompat.exports.FIRST_CONTACT_SLA_COLUMNS,
  ...moduloCompat.exports.NEXT_ACTION_COLUMNS,
];

const checks = [
  ["Fase 050 concluída sem alterar dados ou schema", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Sprint corretivo contém exatamente dez fases", sprint.phases.length === 10 && sprint.phases[0].phase === 50 && sprint.phases.at(-1).phase === 59],
  ["Programa contínuo avançou ao menos até a Fase 50", program.currentPhase >= 50],
  ["Contrato consulta somente campos do banco ativo", route.includes("LIVE_LEAD_SELECT") && compat.includes("score_ia") && compat.includes("assigned_user_id") && compat.includes("preferred_neighborhoods")],
  // ── REAPONTADA EM 2026-07-29 — `isMissingColumn` FICA, e aqui está o porquê ─
  //
  // A asserção original exigia a AUSÊNCIA da string `isMissingColumn` no
  // arquivo. Isso era um atalho para a propriedade que a fase 050 realmente
  // declarou em config/evolution-phase-050-live-lead-contract.json:
  // `no-failed-query-before-fallback` e `no-5000-row-memory-fallback`.
  //
  // O que a fase 050 matou (18/07/2026) foi OUTRO mecanismo: um select que
  // pedia colunas inexistentes, falhava em TODA requisição, e caía num
  // `limit(5000)` que paginava em memória. Esses dois continuam mortos e
  // continuam asseverados abaixo.
  //
  // O `isMissingColumn` que existe hoje entrou depois, no commit f89d0922
  // (fila do corretor ordenada por urgência), e é coisa diferente: recua o
  // SELECT para a versão sem SLA mantendo a paginação NO BANCO. Ele é a razão
  // de a lista continuar de pé em base sem a migration da fase 34, e a
  // resposta declara `firstContactSlaDisponivel` para a tela não confundir
  // "sem medição" com "no prazo".
  //
  // MEDIDO NO BANCO VIVO (pozbrcsfthnhmnebfoxv, 29/07/2026): as 47 colunas de
  // LIVE_LEAD_SELECT_WITH_SLA existem — a consulta primária SUCEDE, ou seja,
  // não há consulta que falha antes do recuo. Nesta base o recuo é seguro-
  // morto; ele existe pelas bases legadas, e removê-lo as quebraria em
  // silêncio. Some-se que scripts/check-first-contact-capture.mjs (caso 26)
  // EXIGE `isMissingColumn` neste mesmo arquivo: manter a asserção original
  // deixaria duas guardas contraditórias sobre a mesma linha.
  //
  // Em lugar da string ausente, afirmamos a propriedade de verdade: o recuo é
  // ESTREITO (só o grupo SLA + próxima ação) e reusa o MESMO construtor, para
  // não repetir a classe de bug dos caminhos divergentes — dois caminhos que
  // consultam a mesma coisa com filtros diferentes.
  ["Consulta inválida e fallback massivo foram removidos", !route.includes('assigned_to, campaign_id, development_id') && !route.includes("limit(5000)") && !/\.slice\(\s*offset/.test(route) && route.includes("montarConsulta(LIVE_LEAD_SELECT, false)")],
  // O recuo é tudo-ou-nada: uma coluna a mais no grupo estendido que não exista
  // na base legada derruba o grupo INTEIRO com 42703. Por isso o conjunto que o
  // recuo abre mão precisa ser exatamente o que os dois catálogos declaram —
  // comparado por execução, não por regex. Medido em 29/07/2026: são as 8
  // colunas de FIRST_CONTACT_SLA_COLUMNS + NEXT_ACTION_COLUMNS.
  ["O recuo sem SLA abre mão apenas do grupo declarado", colunasDegradadas.join(",") === grupoDeclarado.join(",") && grupoDeclarado.every((coluna) => !colunasBase.includes(coluna))],
  // ── REAPONTADA EM 2026-07-29 — o filtro é `development_id`, não `project_id` ─
  //
  // A asserção exigia `query.eq("project_id", ...)`. MEDIDO no banco vivo em
  // 29/07/2026, sobre 470 leads: `project_id` preenchido em 0, `development_id`
  // em 192, e NENHUMA lead com as duas. Filtrar por `project_id` devolve zero
  // para os 3 empreendimentos da base — e filtro que devolve vazio é pior que
  // filtro ausente: quem escolhe o empreendimento e vê a lista limpar conclui
  // que não há lead ali. Corrigido no commit 121bfc11.
  //
  // A propriedade que a fase 050 quer segue intacta — paginação, filtros e
  // ordenação continuam NO BANCO. O que mudou foi a coluna sob o filtro, então
  // a asserção aponta para a forma atual, que aceita as DUAS colunas porque a
  // base carrega histórico dos dois lados.
  ["Paginação, filtros e ordenação permanecem no banco", route.includes(".range(offset, offset + limit - 1)") && route.includes('query.gte("score_ia"') && route.includes("development_id.eq.${developmentId},project_id.eq.${developmentId}") && route.includes('query.eq("assigned_user_id"')],
  ["Etapas antigas são normalizadas", compat.includes('qualificado: "qualificacao"') && compat.includes('contato_realizado: "contato"') && compat.includes("compatibleLeadStatuses")],
  ["Pipeline mapeia o contrato antes de renderizar", pipeline.includes("readCompatiblePipeline") && liveRepositories.includes(".map(mapLegacyLead)") && pipeline.includes('stageSettingsSource = "canonical-defaults"')],
  ["Base histórica continua fora do fluxo operacional", route.includes("(arquivado,ARQUIVADO,archived,ARCHIVED)") && liveRepositories.includes("(arquivado,ARQUIVADO,archived,ARCHIVED)")],
  ["Relatório registra impacto e riscos restantes", report.includes("Impacto operacional") && report.includes("Fase 51") && phase.release.buildExecuted === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 050 verificada: leitura canônica sobre o banco real, sem consulta inválida ou paginação em memória.");
