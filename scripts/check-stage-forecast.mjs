import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read=(path)=>readFileSync(resolve(process.cwd(),path),"utf8");const contract=JSON.parse(read("config/stage-forecast.json"));const engine=read(contract.engine);const api=read(contract.api);const page=read(contract.page);const failures=[];
for(const marker of ["mergePipelineStageSettings","canonicalPipelineStage","stage.probability","pipelineGross","forecastWeighted","expected_close_at","valueCoverage","closeDateCoverage","sampleSufficient","movementClaimed: false","revenueGuaranteed: false"])if(!engine.includes(marker))failures.push(`motor incompleto: ${marker}`);
for(const bucket of contract.timeBuckets)if(!engine.includes(`"${bucket}"`))failures.push(`janela ausente: ${bucket}`);
for(const marker of ["requireAccessContext","identity.supabase","pipeline_stage_settings","Cache-Control","hierarchicalRls: true"])if(!api.includes(marker))failures.push(`API sem controle: ${marker}`);
for(const marker of ["FASE 38 · FORECAST EXPLICÁVEL","Composição do forecast","Quando o pipeline pode maturar","Confiança mede completude","receita garantida"])if(!page.includes(marker))failures.push(`experiência incompleta: ${marker}`);
if(page.includes('select("value,probability,stage,expected_close_at")'))failures.push("página ainda calcula forecast fora da API canônica");
if(failures.length){console.error("FORECAST POR ETAPA Fase 38: REPROVADO");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}console.log(`FORECAST POR ETAPA Fase 38: aprovado — ${contract.dimensions.length} dimensões, ${contract.timeBuckets.length} janelas e confiança explicável.`);
