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

  recommendedAction: string;

  nextStage: string;

  aiSummary: string;

}



export function analyzeLeadIntelligence(
  lead: Lead
): LeadIntelligenceResult {


  // =========================
  // SCORE INTELIGENTE
  // =========================

  const score = calculateLeadScore(lead);



  // =========================
  // TEMPERATURA
  // =========================

  let temperature:
    | "frio"
    | "morno"
    | "quente"
    | "vip";


  if(score >= 90){

    temperature = "vip";

  } else if(score >= 60){

    temperature = "quente";

  } else if(score >= 30){

    temperature = "morno";

  } else {

    temperature = "frio";

  }



  // =========================
  // INTENÇÃO DE COMPRA
  // =========================

  let intent:
    | "curiosidade"
    | "pesquisa"
    | "interesse"
    | "compra"
    | "urgente";


  if(score >= 90){

    intent = "urgente";

  } else if(score >= 70){

    intent = "compra";

  } else if(score >= 40){

    intent = "interesse";

  } else if(score >= 20){

    intent = "pesquisa";

  } else {

    intent = "curiosidade";

  }



  // =========================
  // PROBABILIDADE IA
  // =========================

  const probability =
    Math.min(score + 10, 100);



  // =========================
  // AÇÃO RECOMENDADA IA
  // =========================

  const aiAction =
    generateAIAction(lead);



  // =========================
  // PRÓXIMA ETAPA FUNIL
  // =========================

  let nextStage =
    pipeline[0];


  if(score >= 90){

    nextStage = "negociacao";

  }

  else if(score >= 70){

    nextStage = "proposta";

  }

  else if(score >= 40){

    nextStage = "qualificado";

  }



  // =========================
  // RESUMO INTELIGENTE
  // =========================

  const aiSummary =

  `
  Lead analisado pela IA Atlas.

  Score atual: ${score}

  Temperatura: ${temperature}

  Intenção: ${intent}

  Probabilidade estimada:
  ${probability}%

  Próxima ação:
  ${aiAction.action}
  `;



  return {

    leadId: lead.id,

    score,

    temperature,

    intent,

    probability,

    recommendedAction:
      aiAction.action,

    nextStage,

    aiSummary

  };


}
