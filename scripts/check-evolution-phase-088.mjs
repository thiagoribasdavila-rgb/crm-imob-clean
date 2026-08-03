import fs from "node:fs";
import ts from "typescript";
import { elementoContem } from "./lib/jsx-estrutura.mjs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-088-explainable-context-correction-timeline.json"));
const previous = JSON.parse(read("config/evolution-phase-087-governed-lead-context-correction.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const contract = read("lib/atlas/commercial-context-timeline.ts");
const component = read("components/crm/commercial-context-timeline-entry.tsx");
const page = read("app/(crm)/leads/[id]/page.tsx");
// ── REAPONTAMENTO DE 02/08/2026: a linha do tempo MUDOU DE ARQUIVO ──────────
// Quatro asserções desta fase liam `app/(crm)/leads/[id]/page.tsx` procurando o
// tratamento do evento governado. A montagem saiu da página para um componente
// próprio — `AcompanhamentoCorretorLinhaDoTempo` — porque a mescla tem estado
// próprio (a movimentação vem de outra leitura, que pode falhar sozinha) e
// porque falha de leitura precisa virar "não medido", nunca lista vazia.
//
// A propriedade não morreu, mudou de casa: a página IMPORTA e RENDERIZA o
// componente (verificado abaixo, para que "mudou de casa" não vire "sumiu" —
// componente construído e nunca ligado é o padrão que este repositório já
// repetiu sete vezes). O mesmo tipo de reapontamento já tinha precedente na
// fase 093, quando a busca migrou da barra lateral para o ⌘K.
const linhaDoTempo = read("components/crm/acompanhamento-corretor-linha-do-tempo.tsx");
const route = read("app/api/v1/leads/[id]/route.ts");
const report = read("docs/EVOLUTION_PHASE_088_EXPLAINABLE_CONTEXT_CORRECTION_TIMELINE.md");

const compiledContract = ts.transpileModule(contract, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtimeModule = { exports: {} };
new Function("exports", "module", compiledContract)(runtimeModule.exports, runtimeModule);
const {
  commercialContextProjectLabel,
  commercialContextSourceLabel,
  parseCommercialContextCorrectionTimeline,
} = runtimeModule.exports;

const validMetadata = {
  correctionReason: "Cliente confirmou o projeto e a origem durante a ligação.",
  previousContext: { projectId: null, projectName: null, source: "Site" },
  currentContext: { projectId: "1a725388-c9cc-4b42-a66a-24f0f0ca88a1", projectName: "Inside Perdizes", source: "Meta Ads" },
  currentLeadStateOnly: true,
  humanConfirmed: true,
  historicalSnapshotsRewritten: false,
  automaticFill: false,
};
const parsed = parseCommercialContextCorrectionTimeline(validMetadata);
const sourceOnly = parseCommercialContextCorrectionTimeline({
  ...validMetadata,
  previousContext: { projectId: validMetadata.currentContext.projectId, projectName: "Inside Perdizes", source: "Site" },
});
const unsafeHistory = parseCommercialContextCorrectionTimeline({ ...validMetadata, historicalSnapshotsRewritten: true });
const automatic = parseCommercialContextCorrectionTimeline({ ...validMetadata, automaticFill: true });
const unchanged = parseCommercialContextCorrectionTimeline({ ...validMetadata, previousContext: validMetadata.currentContext });
const runtimeContractValid = parsed
  && parsed.changedDimensions.join(",") === "project,source"
  && parsed.policy.futureDecisionsUseCurrentContext === true
  && parsed.policy.historicalFactsChanged === false
  && sourceOnly?.changedDimensions.join(",") === "source"
  && unsafeHistory === null
  && automatic === null
  && unchanged === null
  && commercialContextProjectLabel(parsed.current) === "Inside Perdizes"
  && commercialContextProjectLabel(parsed.previous) === "Não informado"
  && commercialContextSourceLabel(parsed.previous) === "Site";

const checks = [
  ["Fase anterior encaminha a timeline explicável", previous.status === "completed" && previous.nextPhase.phase === 88],
  ["Fase 088 concluída sem alterar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 88", program.currentPhase >= 88],
  ["Contrato interpreta antes, agora, dimensão e política futura", contract.includes("CommercialContextCorrectionTimeline") && runtimeContractValid],
  ["Parser rejeita automação, reescrita histórica e evento sem mudança", contract.includes("record.humanConfirmed === true") && contract.includes("record.historicalSnapshotsRewritten === false") && contract.includes("changedDimensions.length === 0")],
  ["Timeline mostra antes, agora e motivo registrado", component.includes('label="Antes"') && component.includes('label="Agora"') && component.includes("Motivo registrado")],
  ["Impacto futuro e imutabilidade histórica estão explícitos", component.includes("Efeito futuro:") && component.includes("próximas decisões, recomendações e resultados") && component.includes("Histórico preservado:") && component.includes("snapshots anteriores")],
  // A página continua sendo a dona: importa e renderiza a linha do tempo. Sem
  // esta asserção, as três seguintes passariam com o componente órfão.
  ["Lead 360 monta a linha do tempo do acompanhamento",
    page.includes("AcompanhamentoCorretorLinhaDoTempo") && page.includes("<AcompanhamentoCorretorLinhaDoTempo")],
  ["Lead 360 especializa apenas o evento governado",
    elementoContem(linhaDoTempo, "article", "<CommercialContextTimelineEntry")
    && linhaDoTempo.includes('interacao.type === "commercial_context_corrected"')
    && linhaDoTempo.includes("parseCommercialContextCorrectionTimeline(interacao.metadata)")],
  // O fallback é uma RELAÇÃO: a descrição genérica só aparece quando NÃO houve
  // correção interpretada. `includes` de duas frases soltas não diria isso —
  // as duas podem viver em ramos independentes e a tela mostrar as duas.
  ["Evento inválido mantém descrição genérica como fallback",
    linhaDoTempo.includes("!correcao && interacao.description")],
  ["Responsável e horário continuam visíveis",
    elementoContem(linhaDoTempo, "article", 'interacao.authorName || "Equipe Atlas"', "dataLegivel(interacao.occurred_at)")
    && linhaDoTempo.includes('toLocaleString("pt-BR")')],
  // ── REAPONTADA EM 2026-08-03 — o nome da variável saiu, a origem entrou ──────
  //
  // A asserção exigia o texto `mapLiveLeadEvent(row)`. A rota passou a chamar
  // `mapLiveLeadEvent(event.data as JsonRow)`: a variável `row` deixou de
  // existir e o comportamento não mudou. MEDIDO: o que é mapeado é o registro
  // que `recordLiveLeadEvent` ACABOU de devolver — nenhuma segunda leitura,
  // nenhum endpoint novo, que é exatamente o que esta linha afirma.
  //
  // E `(row)` era fraco justamente no ponto: um `row` vindo de um select novo
  // passaria igual, enquanto o nome da asserção promete "sem novo endpoint".
  // Agora a ORIGEM do dado faz parte da afirmação — o que é mapeado tem de ser
  // o retorno da escrita, não algo relido depois.
  ["Leitura reutiliza metadata já carregado sem novo endpoint",
    /const\s+event\s*=\s*await\s+recordLiveLeadEvent\(/.test(route)
    && /mapLiveLeadEvent\(\s*event\.data\b/.test(route)
    && linhaDoTempo.includes("interacao.metadata")
    && !component.includes("fetch(")],
  ["Contrato de escrita continua append-only e com história imutável", route.includes('type: "commercial_context_corrected"') && route.includes("buildGovernedLeadContextAuditMetadata")],
  ["Relatório registra impacto, segurança, compatibilidade, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Segurança e governança") && report.includes("Compatibilidade") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release continua bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 088 verificada: antes/depois explicável, motivo humano, efeito futuro e história preservada.");
