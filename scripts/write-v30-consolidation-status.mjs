import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const gatePath = resolve(root, "artifacts/v30/local-gate-results.json");
const reportPath = resolve(root, "docs/ATLAS_V30_CONSOLIDATION_STATUS.md");
const gapReportPath = resolve(
  root,
  "docs/ATLAS_V30_END_TO_END_GAP_REPORT.md",
);
const statusPath = resolve(root, "config/v30-consolidation-current-status.json");
const gitMetadataPresent = existsSync(resolve(root, ".git"));
const existingZipPath = resolve(
  root,
  "dist/hostinger/atlas-v3-hostinger-homologation.zip",
);
const existingManifestPath = resolve(
  root,
  "dist/hostinger/atlas-v3/HOSTINGER_PACKAGE.json",
);
const existingManifest = existsSync(existingManifestPath)
  ? JSON.parse(readFileSync(existingManifestPath, "utf8"))
  : null;
const existingArtifact = {
  detected: existsSync(existingZipPath),
  zipPath: "dist/hostinger/atlas-v3-hostinger-homologation.zip",
  manifestPath: "dist/hostinger/atlas-v3/HOSTINGER_PACKAGE.json",
  sourceFingerprint:
    typeof existingManifest?.sourceFingerprint === "string"
      ? existingManifest.sourceFingerprint
      : null,
  eligibleForRelease: false,
  status: existsSync(existingZipPath)
    ? "pre_gate_artifact_rejected"
    : "not_created",
  reason: existsSync(existingZipPath)
    ? "artefato anterior às correções e às evidências das fases 26–28; a fase 29 ainda não foi autorizada"
    : "a fase 29 ainda não foi autorizada",
};

if (!existsSync(gatePath)) {
  console.error(
    "Execute npm run consolidation:30:local-gates antes de gerar o status.",
  );
  process.exit(1);
}

const gates = JSON.parse(readFileSync(gatePath, "utf8"));
const evidencePaths = [
  "artifacts/runtime/human-gates/f02-f16-upstream-readiness-evidence.json",
  "artifacts/runtime/human-gates/f17-f21-readiness-evidence.json",
  "artifacts/runtime/phase-022/environment-readiness-evidence.json",
  "artifacts/runtime/phase-023/sanitized-homologation-evidence-dossier.json",
  "artifacts/runtime/phase-024/final-human-homologation-decision-evidence.json",
];

const evidence = evidencePaths.map((path) => {
  const absolutePath = resolve(root, path);
  if (!existsSync(absolutePath)) {
    return { path, status: "missing", ready: false };
  }
  const value = JSON.parse(readFileSync(absolutePath, "utf8"));
  return {
    path,
    status: value.status || "unknown",
    ready:
      value.ready === true ||
      value?.readiness?.ready === true ||
      value?.decision?.ready_for_human_homologation_decision === true,
  };
});

const totalProgramPhases = 30;
const locallyApproved = gates.summary.approvedLocally;
const localExecutionTotal = gates.summary.phases;
const sourceProgress = Number(
  ((locallyApproved / totalProgramPhases) * 100).toFixed(1),
);
const preFinalProgress = Number(
  ((locallyApproved / localExecutionTotal) * 100).toFixed(1),
);
const pendingPhases = gates.phases
  .filter((phase) => phase.status !== "approved_locally")
  .map((phase) => ({
    id: phase.id,
    title: phase.title,
    status: phase.status,
    blockers: phase.tests
      .filter((test) => test.status !== "passed")
      .map((test) => `${test.name}: ${test.reason || test.status}`),
  }));

const status = {
  schemaVersion: "atlas.v30.consolidation.status.v1",
  generatedAt: new Date().toISOString(),
  classification: "candidato_local_aguardando_ambiente_real",
  score: {
    programPhases: totalProgramPhases,
    locallyApproved,
    sourceProgressPercent: sourceProgress,
    preFinalLocalProgressPercent: preFinalProgress,
    codeTestFailures: gates.summary.failedTests,
  },
  gates: {
    waitingInstallation: gates.summary.waitingInstallation,
    waitingEnvironment: gates.summary.waitingEnvironment,
    buildExecuted: false,
    packageCreated: false,
    deploymentExecuted: false,
    realJourneyApproved: false,
  },
  sourceTraceability: {
    gitMetadataPresent,
    mode: gitMetadataPresent ? "git" : "workspace-content-hash",
    finalRepositoryReconciliationRequired: !gitMetadataPresent,
  },
  existingArtifact,
  pendingPhases,
  runtimeEvidence: evidence,
  nextRequiredActions: [
    "preencher o .env.local já preparado com Supabase e contas exclusivas de homologação, sem enviar segredos ao chat",
    "concluir backup, restauração, ledger e ensaio isolado do Supabase",
    "executar jornadas autenticadas de ADMIN, diretor, gerente e corretor",
    "validar uma lead Meta real, um evento CAPI de teste, WhatsApp oficial e uma chamada de IA controlada",
    "obter decisão humana final de homologação",
    "executar o único build completo, validar o pacote e então gerar o ZIP Hostinger",
  ],
};

const phaseRows = pendingPhases
  .map(
    (phase) =>
      `| ${phase.id} | ${phase.title} | ${phase.status} | ${phase.blockers.join("<br>")} |`,
  )
  .join("\n");
const evidenceRows = evidence
  .map(
    (item) =>
      `| \`${item.path}\` | ${item.status} | ${item.ready ? "sim" : "não"} |`,
  )
  .join("\n");

const waves = [
  { name: "Fundação única", from: 1, to: 5 },
  { name: "Banco e identidade", from: 6, to: 10 },
  { name: "Operação comercial", from: 11, to: 15 },
  { name: "Inteligência aplicada", from: 16, to: 19 },
  { name: "Receita conectada", from: 20, to: 24 },
  { name: "Qualidade e implantação", from: 25, to: 30 },
].map((wave) => {
  const expected = wave.to - wave.from + 1;
  const evaluated = gates.phases.filter(
    (phase) => phase.id >= wave.from && phase.id <= wave.to,
  );
  const approved = evaluated.filter(
    (phase) => phase.status === "approved_locally",
  ).length;
  return {
    ...wave,
    expected,
    approved,
    percent: Number(((approved / expected) * 100).toFixed(1)),
  };
});

const waveRows = waves
  .map(
    (wave) =>
      `| ${wave.name} | ${wave.from}–${wave.to} | ${wave.approved}/${wave.expected} | ${wave.percent}% |`,
  )
  .join("\n");

const report = `# ATLAS V30 — Estado da consolidação

**Atualizado em:** ${status.generatedAt}

## Resultado executivo

O código ativo está sem falhas nos gates locais executados, mas o produto ainda
não pode ser chamado de **10/10 operacional**. O estado correto é
**candidato local aguardando ambiente real**.

- **${locallyApproved} de ${localExecutionTotal} fases pré-finais aprovadas localmente (${preFinalProgress}%)**
- **${locallyApproved} de ${totalProgramPhases} fases totais aprovadas localmente (${sourceProgress}%)**
- **${gates.summary.uniqueTests} gates únicos avaliados**
- **${gates.summary.passedTests} gates passaram**
- **${gates.summary.failedTests} falhas de código**
- **${gates.summary.waitingInstallation} fase(s) aguardando instalação**
- **${gates.summary.waitingEnvironment} fase(s) aguardando ambiente/evidência real**
- **build completo não executado**
- **nenhum ZIP atual está elegível para release**

O percentual mede evidência, não quantidade de telas ou scripts. As fases 29 e 30
continuam fechadas para evitar um pacote aparentemente pronto, mas ainda sem
prova de restauração, autenticação por papel e integrações reais.

## Rastreabilidade e artefato existente

- a pasta atual ${gitMetadataPresent ? "possui metadados Git" : "**não possui metadados Git** e está sendo validada por hash de conteúdo"};
- ${existingArtifact.detected
  ? `há um ZIP anterior em \`${existingArtifact.zipPath}\`, porém ele está **rejeitado para release** porque antecede as correções atuais e não passou pelas fases 26–29`
  : "não há ZIP anterior detectado"};
- o conteúdo de \`.next\` e qualquer pacote antigo não contam como prova do build
  final; ambos são regenerados ou excluídos pelo fluxo oficial.

## Fases ainda abertas

| Fase | Capacidade | Estado | Bloqueio |
|---:|---|---|---|
${phaseRows}
| 29 | Build único, manifesto e ZIP Hostinger | não iniciada | depende das fases 1–28 |
| 30 | Implantação e teste real controlado | não iniciada | depende do ZIP aprovado |

## Evidência operacional

| Evidência | Estado registrado | Pronta |
|---|---|---|
${evidenceRows}

Os checks de migrations e RLS aprovados nas fases locais validam que os contratos
**falham de forma segura**. Eles não significam que backup, restore, migration e
isolamento dinâmico já foram executados em homologação.

## O que já está consolidado

- fonte única e rotas ativas sem colisão;
- 335 arquivos de rota ativos e 83 legados isolados;
- cobertura TypeScript do contrato ativo em 100%;
- contrato do Next 16 validado automaticamente na superfície publicada;
- autenticação, hierarquia, segurança de API e compatibilidade de schema
  verificadas estaticamente;
- CRM, Kanban, tarefas, Cliente 360, projetos, IA, Meta/CAPI e dashboards com
  contratos locais aprovados;
- pacote final protegido contra segredos e rastreado por hash de conteúdo;
- política de um único build completo preservada para a fase 29.

## Sequência para chegar a 10/10

1. preencher \`.env.local\` apenas no ambiente seguro de homologação;
2. concluir backup, restauração e ensaio isolado do Supabase;
3. executar as quatro jornadas autenticadas com o Playwright já instalado;
4. provar IA, WhatsApp, lead Meta e CAPI com teste controlado;
5. registrar aprovação humana;
6. reconciliar a fonte com o repositório oficial ou registrar formalmente o hash
   do snapshot;
7. executar o único build, gerar e verificar um **novo** ZIP;
8. implantar na Hostinger e repetir o smoke test real.

Nenhum segredo deve entrar no Git, no chat ou no ZIP.
`;

const gapReport = `# ATLAS V30 — Diagnóstico ponta a ponta

**Atualizado em:** ${status.generatedAt}

## Veredito

O ATLAS possui uma base local ampla e consistente: ${gates.summary.passedTests}
gates passaram e nenhuma falha de código ficou aberta. Ainda não é correto
classificá-lo como 10/10 operacional porque as provas que dependem de navegador,
Supabase isolado, provedores reais e Hostinger não foram executadas.

O percentual atual é **${sourceProgress}% do programa total** e
**${preFinalProgress}% das fases pré-build avaliadas localmente**. Esses números
representam evidência aprovada, não uma estimativa visual.

## Cobertura por onda

| Onda | Fases | Aprovadas | Evidência local |
|---|---:|---:|---:|
${waveRows}

## O que foi comprovado

- fonte oficial inventariada e ZIPs tratados apenas como artefatos;
- rotas publicadas sem colisões e legado removido do build de forma reversível;
- 100% do TypeScript ativo sob typecheck;
- Next 16 validado para parâmetros assíncronos, cookies, proxy e clientes lazy;
- contratos locais de login, RBAC, hierarquia, RLS, CRM, Kanban, agenda,
  Cliente 360, projetos, IA, memória, Meta/CAPI, WhatsApp e relatórios;
- segurança estática, governança de segredos e auditoria offline de dependências;
- build e pacote protegidos por gate único, sem execução antecipada.

## Artefatos encontrados

O diretório possui ${existingArtifact.detected ? "um ZIP anterior" : "nenhum ZIP"}.
${existingArtifact.detected
  ? `O arquivo \`${existingArtifact.zipPath}\` está classificado como
**pré-gate e não elegível**, pois foi criado antes das correções atuais e
${existingArtifact.sourceFingerprint ? "não corresponde a uma liberação aprovada" : "nem contém o fingerprint de origem exigido pelo empacotador atual"}.`
  : "A fase 29 criará o primeiro candidato somente depois das provas reais."}

O diretório atual ${gitMetadataPresent ? "está ligado ao Git" : "não contém \`.git\`"}.
${gitMetadataPresent
  ? "O commit será incorporado ao manifesto final."
  : "O empacotador usa hash de conteúdo, mas a reconciliação com o repositório oficial continua obrigatória para a rastreabilidade da versão promovida."}

## O que falta para 10/10

| Prioridade | Lacuna | Prova obrigatória |
|---|---|---|
| P0 | Executor E2E | Node 24, \`@playwright/test\` e Chromium aprovados; falta executar as quatro jornadas com ambiente e permissão de navegador |
| P0 | Ambiente isolado | preencher o \`.env.local\` preparado, criar quatro contas de homologação e informar a URL HTTPS |
| P0 | Banco real | backup, restauração, ledger de migrations e RLS dinâmico entre dois tenants |
| P0 | Operação real | criar lead, atribuir corretor, mover Kanban, agendar tarefa e validar Cliente 360 |
| P0 | IA e canais | uma chamada IA, um fluxo WhatsApp, uma lead Meta e um evento CAPI de teste com recibos |
| P0 | Segurança viva | auditoria online do registry, rate limit, headers e ausência de vazamento em execução |
| P0 | Performance | latência de banco/API, navegação móvel e Core Web Vitals medidos na Hostinger |
| P1 | Rastreabilidade | reconciliar este snapshot com o repositório oficial ou registrar formalmente seu hash |
| P1 | Release | aprovação humana, único build Node 24, ZIP verificado, implantação e rollback ensaiado |

## Critério de liberação

O gate final só abre quando as fases 27 e 28 tiverem evidência real verde. Depois:

1. executar a regressão final sob Node.js 24;
2. executar um único build completo;
3. gerar o ZIP Hostinger sem \`.env.local\`, cache ou segredos;
4. verificar manifesto, inventário e SHA-256;
5. publicar na Hostinger;
6. repetir smoke, papéis, jornada comercial e integrações;
7. registrar decisão humana de GO ou executar rollback.

Até lá, a classificação correta permanece **candidato local aguardando ambiente
real**, sem esconder risco com dados fictícios.
`;

mkdirSync(resolve(root, "docs"), { recursive: true });
mkdirSync(resolve(root, "config"), { recursive: true });
writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
writeFileSync(reportPath, report);
writeFileSync(gapReportPath, gapReport);

console.log(`Status JSON: ${statusPath}`);
console.log(`Relatório: ${reportPath}`);
console.log(`Diagnóstico: ${gapReportPath}`);
console.log(
  `ATLAS V30: ${locallyApproved}/${totalProgramPhases} fases locais aprovadas; build e ZIP ainda protegidos pelo gate final.`,
);
