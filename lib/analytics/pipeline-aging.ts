import { canonicalPipelineStage, mergePipelineStageSettings, type PipelineStageDefinition } from "@/lib/atlas/pipeline-stages";

export type AgingLead={id:string;name:string|null;status:string|null;score:number|null;assigned_to:string|null;created_at:string;updated_at:string|null;next_action_at:string|null};
export type StageMove={id:string;lead_id:string;from_stage:string;to_stage:string;occurred_at:string};
type StageInput=Partial<PipelineStageDefinition>&{stage_key?:string};
const day=86_400_000; const validTime=(value:string|null|undefined)=>{const time=value?new Date(value).getTime():Number.NaN;return Number.isFinite(time)?time:null};
const round=(value:number)=>Math.round(value*10)/10;
const stageLimits:Record<string,number>={novo:1,contato:2,qualificacao:3,visita:7,proposta:5,contrato:7};

export function buildPipelineAging(leads:AgingLead[],moves:StageMove[],settings:StageInput[]=[],now=new Date()){
  const stages=mergePipelineStageSettings(settings.map(item=>({key:item.key,stage_key:item.stage_key,label:item.label,probability:item.probability,position:item.position,visible:item.visible})));
  const openStages=new Map(stages.filter(stage=>stage.outcome==="open").map(stage=>[stage.key,stage]));
  const latest=new Map<string,StageMove>(); const movementCount30d=moves.filter(move=>(validTime(move.occurred_at)??0)>=now.getTime()-30*day).length;
  for(const move of moves){const previous=latest.get(move.lead_id);if(!previous||(validTime(move.occurred_at)??0)>(validTime(previous.occurred_at)??0))latest.set(move.lead_id,move);}
  const items=leads.flatMap(lead=>{const key=canonicalPipelineStage(lead.status);const stage=key?openStages.get(key):null;if(!stage)return[];const move=latest.get(lead.id);const enteredAt=validTime(move?.occurred_at)??validTime(lead.created_at)??now.getTime();const ageDays=Math.max(0,Math.floor((now.getTime()-enteredAt)/day));const limit=stageLimits[stage.key]??7;const ratio=ageDays/limit;const severity=ratio>=2?"critical":ratio>=1?"stalled":ratio>=.7?"attention":"healthy";return[{id:lead.id,name:lead.name||"Lead sem nome",stageKey:stage.key,stageLabel:stage.label,ageDays,limitDays:limit,severity,score:Number(lead.score||0),nextActionAt:lead.next_action_at,assignedTo:lead.assigned_to,enteredAt:new Date(enteredAt).toISOString(),source:move?"stage_move":"lead_created"}];}).sort((a,b)=>b.ageDays-a.ageDays||b.score-a.score);
  const stalled=items.filter(item=>item.severity==="stalled"||item.severity==="critical");const critical=items.filter(item=>item.severity==="critical");const withoutNextAction=stalled.filter(item=>!validTime(item.nextActionAt));
  const ages=items.map(item=>item.ageDays).sort((a,b)=>a-b);const median=ages.length?(ages[Math.floor((ages.length-1)/2)]+ages[Math.ceil((ages.length-1)/2)])/2:0;
  const byStage=stages.filter(stage=>stage.outcome==="open").map(stage=>{const rows=items.filter(item=>item.stageKey===stage.key);const stageStalled=rows.filter(item=>item.severity==="stalled"||item.severity==="critical");return{key:stage.key,label:stage.label,leads:rows.length,averageDays:rows.length?round(rows.reduce((sum,item)=>sum+item.ageDays,0)/rows.length):0,oldestDays:Math.max(0,...rows.map(item=>item.ageDays)),stalled:stageStalled.length,stalledRate:rows.length?round(stageStalled.length/rows.length*100):0,limitDays:rows[0]?.limitDays??stageLimits[stage.key]??7};});
  return{summary:{active:items.length,stalled:stalled.length,critical:critical.length,medianDays:round(median),movementCount30d,withoutNextAction},byStage,priorityQueue:items.filter(item=>item.severity!=="healthy").slice(0,50),quality:{withRecordedEntry:items.filter(item=>item.source==="stage_move").length,estimatedEntry:items.filter(item=>item.source==="lead_created").length,coverage:items.length?round(items.filter(item=>item.source==="stage_move").length/items.length*100):0},governance:{readOnly:true,hierarchicalRls:true,automaticTransfer:false,automaticPeopleDecision:false,velocityClaimed:movementCount30d>0}};
}
