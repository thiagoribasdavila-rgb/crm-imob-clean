import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8"); const contract = JSON.parse(read("config/modern-kanban.json")); const page = read(contract.page); const css = read(contract.styles); const failures = [];
for (const marker of ["atlas-kanban-mobile-nav", "activeMobileStage", "is-mobile-hidden", "atlas-kanban-scroll", "atlas-pipeline-column-header", "AtlasSkeleton", "atlas-card-shortcuts", "moveByKeyboard", 'event.altKey && event.key === "ArrowLeft"', 'event.altKey && event.key === "ArrowRight"', "undoLastMove", "Visão compacta", "Mostrando etapas ativas"]) if (!page.includes(marker)) failures.push(`controle de experiência ausente: ${marker}`);
for (const marker of ["scroll-snap-type", "scroll-snap-align", ":focus-visible", "overscroll-behavior-inline", "@media (max-width: 820px)", ".atlas-pipeline-column.is-mobile-hidden"]) if (!css.includes(marker)) failures.push(`comportamento visual ausente: ${marker}`);
if (!page.includes('aria-label="Quadro Kanban com rolagem horizontal"') || !page.includes("aria-busy={loading}") || !page.includes("tabIndex={0}")) failures.push("Kanban sem semântica de carregamento, foco ou navegação");
if (failures.length) { console.error("KANBAN MODERNO Fase 32: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`KANBAN MODERNO Fase 32: aprovado — ${contract.experienceControls.length} controles, mobile por etapa e três formas de movimentação.`);
