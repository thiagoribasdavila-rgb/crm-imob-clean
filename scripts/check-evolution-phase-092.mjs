import fs from "node:fs";
import { familiaDeclara, mediaAlcanca, regrasQueCitam, valorDoToken } from "./lib/css-propriedade.mjs";

/* O prefixo que define "o shell Core V2". Escrito uma vez: repetido em cada
   asserção, um erro de digitação vira uma busca que não acha nada e passa. */
const CORE_V2 = '.atlas-app-shell[data-visual-system="atlas-core-v2"]';

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-091-detailed-structural-gap-audit.json");
const phase = json("config/evolution-phase-092-atlas-core-v2-visual-primitives.json");
const program = json("config/evolution-program-3000.json");
const tokens = read("styles/atlas-tokens.css");
const shell = read("components/atlas/app-shell.tsx");
const card = read("components/ui/AtlasCard.tsx");
const states = read("components/ui/AtlasUI.tsx");
const errorState = read("components/atlas/error-state.tsx");
const primitives = read("components/atlas/information-primitives.tsx");
const css = read("app/globals.css");
const report = read("docs/EVOLUTION_PHASE_092_ATLAS_CORE_V2_VISUAL_PRIMITIVES.md");

const semanticTokens = [
  "--atlas-canvas",
  "--atlas-navigation",
  "--atlas-surface-subtle",
  "--atlas-text-primary",
  "--atlas-text-secondary",
  "--atlas-text-tertiary",
  "--atlas-accent-soft",
  "--atlas-focus-ring",
  "--atlas-control-height-touch",
  "--atlas-transition-fast"
];

const primitiveNames = [
  "AtlasDecisionStrip",
  "AtlasSection",
  "AtlasPriorityQueue",
  "AtlasDetailDisclosure"
];

const checks = [
  ["Fase 91 foi preservada", previous.phase === 91 && previous.status === "completed"],
  ["Fase 92 conclui o sistema visual sem banco ou autenticação", phase.phase === 92 && phase.status === "completed" && phase.databaseSchemaChanged === false && phase.authenticationChanged === false && phase.productionDataModified === false],
  ["Programa contínuo avançou para 92", program.currentPhase >= 92],
  ["Tokens cobrem superfície, texto, ação, foco, densidade e movimento", semanticTokens.every((token) => tokens.includes(token))],
  ["Shell oficial usa Core V2 e decisão primeiro", shell.includes('data-visual-system="atlas-core-v2"') && shell.includes('data-information-strategy="decision-first"')],
  ["Cards e métricas declaram densidade, ênfase e relevância", card.includes("data-card-density") && card.includes("data-card-emphasis") && card.includes("data-relevance")],
  ["Primitivos de decisão e detalhe existem", primitiveNames.every((name) => primitives.includes(`function ${name}`))],
  ["Visão rápida limita ruído a cinco indicadores", css.includes(".atlas-decision-strip > :nth-child(n + 6)") && phase.principles.includes("maximum-five-decision-metrics-per-glance")],
  ["Camada visual está isolada no shell autenticado", css.includes('.atlas-app-shell[data-visual-system="atlas-core-v2"]') && css.includes("impede que estilos legados reintroduzam ruído")],
  // ── REAPONTADA EM 02/08/2026 — a asserção mais cega deste arquivo ─────────
  //
  // Era `css.includes(".atlas-ambient") && css.includes("transform: none")`.
  // MEDIDO no dia: `transform: none` aparece 33 vezes em `app/globals.css`, e
  // NENHUMA delas na família `.atlas-ambient` — as 13 regras que carregam essa
  // classe não declaram `transform: none` em lugar nenhum. A asserção estava
  // satisfeita por 33 ocorrências que não têm relação com o que ela afirma.
  // Ela não aprovava um defeito: ela não saberia.
  //
  // O que a família REALMENTE faz sob o shell Core V2, medido regra a regra:
  // o segundo orbe é desligado (`display: none`) e o que resta pinta com o
  // TOKEN de acento — não com o `#168cff` cravado da regra legada. É esse o
  // sentido de "gradiente decorativo não pertence ao shell": o ruído vira uma
  // lavagem contida no acento único.
  ["Orbes, elevação e gradientes decorativos não pertencem ao shell Core V2",
    familiaDeclara(css, `${CORE_V2} .atlas-ambient-orb-two`, "display", "none")
    && familiaDeclara(css, `${CORE_V2} .atlas-ambient-orb-one`, "background", "var(--atlas-accent)")
    && !regrasQueCitam(css, `${CORE_V2} .atlas-ambient-orb-one`).some(({ corpo }) => /#[0-9a-f]{3,8}/i.test(corpo))
    && phase.visualSystem.decorativeGradients === "removed-from-core-shell"],
  ["Estados vazios e recuperáveis usam linguagem compartilhada", states.includes("safeFailureDescription") && states.includes("atlas-recoverable-error") && states.includes("atlas-empty-orb")],
  ["Erro compartilhado não exibe schema técnico", errorState.includes("technicalFailurePattern") && errorState.includes("safeDescription(description)")],
  // ── REAPONTADA EM 02/08/2026 — três `includes` que se satisfaziam sozinhos ─
  //
  // Era `css.includes(":focus-visible") && css.includes("--atlas-control-height-touch")
  // && css.includes("prefers-reduced-motion")`. MEDIDO: 30, 1 e 25 ocorrências
  // no arquivo. Três buscas soltas que nunca perguntaram se alguma delas
  // ALCANÇA o shell Core V2 — a asserção passaria com o shell inteiro sem
  // foco, sem alvo de toque e sem movimento reduzido, desde que qualquer outra
  // parte do arquivo tivesse as palavras.
  //
  // A ocorrência única de `--atlas-control-height-touch` é o caso mais
  // eloquente: é um USO (`min-height: var(...)`), não uma declaração. O token
  // vale 44px porque `styles/atlas-tokens.css` o declara — e a asserção não
  // sabia disso, nem saberia se alguém o apagasse de lá e a altura mínima no
  // celular virasse nada.
  //
  // Agora cada uma das três é medida onde importa: o foco numa regra que
  // escopa o shell, o alvo de toque com o token RESOLVIDO em px, e o
  // movimento reduzido num bloco @media que alcança a família.
  ["Foco, mobile e movimento reduzido estão cobertos",
    regrasQueCitam(css, CORE_V2).some(({ seletor, corpo }) => seletor.includes(":focus-visible") && /outline:/.test(corpo))
    && regrasQueCitam(css, CORE_V2).some(({ corpo }) => corpo.includes("min-height: var(--atlas-control-height-touch)"))
    && (valorDoToken(tokens, "--atlas-control-height-touch") ?? 0) >= 44
    && mediaAlcanca(css, "prefers-reduced-motion: reduce", CORE_V2)],
  ["Relatório cobre problema, modelo, impacto e risco", report.includes("Problema resolvido") && report.includes("Modelo de informação") && report.includes("Impacto operacional") && report.includes("Riscos identificados")],
  ["Build e ZIP continuam reservados à fase 100", phase.release.buildExecuted === false && phase.release.zipCreated === false && phase.release.checkpointPhase === 100]
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 092 verificada: informação hierarquizada, ruído reduzido e primitivos oficiais do Core V2 ativos.");
