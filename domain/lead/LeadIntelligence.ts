import { Lead } from "./Lead";
import { calculateLeadScore } from "./LeadScoring";
import { generateAIAction } from "./LeadAI";
import { pipeline } from "./LeadPipeline";


export interface LeadIntelligenceResult {

  leadId: string;

  score: number;

  temperature:
  | "frio"
  | "morno"
  | "quente"
  | "vip";

  intent:
  | "curiosidade"
  | "pesquisa"
  | "interesse"
  | "compra"
  | "urgente";


  probability: number;

  priority:
  | "baixa"
  | "media"
  | "alta"
  | "critica";


  nextAction: string;

  pipelineStage: string;


  summary: string;


  insights: string[];

}



export function analyzeLead(
  lead: Lead
): LeadIntelligenceResult {


  const score =
    calculateLeadScore(lead);


  const action =
    generateAIAction(lead);



  const temperature =
    getTemperature(score);



  const intent =
    detectIntent(lead);



  const probability =
    calculateProbability(score);



  const priority =
    calculatePriority(score);



  const stage =
    pipeline.includes(lead.status)
      ? lead.status
      : "novo";



  return {


    leadId: lead.id,


    score,


    temperature,


    intent,


    probability,
