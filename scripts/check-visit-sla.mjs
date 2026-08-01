import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read=(path)=>readFileSync(resolve(process.cwd(),path),"utf8");const contract=JSON.parse(read("config/visit-sla.json"));const sql=read(contract.migration).toLowerCase();const api=read(contract.api);const schedule=read(contract.schedulePage);const calendar=read(contract.calendarPage);const calendarApi=read(contract.calendarApi);const failures=[];
for(const state of contract.states)if(!sql.includes(`'${state}'`)||!schedule.includes(state))failures.push(`estado incompleto: ${state}`);
for(const marker of ["lead_visits","validate_visit_transition","visit_terminal_state","visit_no_show_before_schedule","one_active_slot","enable row level security","can_access_commercial_lead"])if(!sql.includes(marker))failures.push(`controle ausente: ${marker}`);
for(const marker of contract.measurements)if(!sql.includes(marker)||!api.includes(marker))failures.push(`medição ausente: ${marker}`);
for(const marker of ["requireLeadAccess","TRANSITIONS","scheduledAt","next_action_at","activities"])if(!api.includes(marker))failures.push(`API incompleta: ${marker}`);
/* CC-6/live-schema: o calendário lê tarefas via readCompatibleTasks (camada compat) e continua unindo visitas (from("lead_visits")) + follow-ups; o selo textual "AGENDA COMERCIAL UNIFICADA" virou data-phase="46-commercial-calendar". Unificação preservada. */
if(!calendarApi.includes('readCompatibleTasks')||!calendarApi.includes('from("lead_visits")')||!calendar.includes('data-phase="46-commercial-calendar"'))failures.push("calendário não unifica tarefas e visitas");
if(!schedule.includes("FASE 36 · VISITAS")||!schedule.includes("Agendar visita")||!schedule.includes("Não compareceu"))failures.push("experiência de visita incompleta");
if(failures.length){console.error("SLA DE VISITAS Fase 36: REPROVADO");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}console.log(`SLA DE VISITAS Fase 36: aprovado — ${contract.states.length} estados, ${contract.formats.length} formatos e agenda unificada.`);
