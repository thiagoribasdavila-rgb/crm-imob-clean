export type ExperimentCheckpoint = { elapsedDays:number;controlSpend:number;testSpend:number;controlLeads:number;testLeads:number;controlConversions:number;testConversions:number;controlGuardrailRate:number;testGuardrailRate:number };
const rate=(value:number,total:number)=>total>0?value/total:null;
const pct=(value:number)=>Math.round(value*10000)/100;
export function evaluateMediaExperiment(input:ExperimentCheckpoint,policy:{budgetCap:number;minimumLeadsPerArm:number;minimumDays:number;maximumDays:number;maximumGuardrailIncreasePercent:number}){
 const totalSpend=input.controlSpend+input.testSpend;const controlRate=rate(input.controlConversions,input.controlLeads);const testRate=rate(input.testConversions,input.testLeads);
 const relativeLift=controlRate!==null&&controlRate>0&&testRate!==null?pct((testRate-controlRate)/controlRate):null;
 const absoluteLift=controlRate!==null&&testRate!==null?pct(testRate-controlRate):null;
 const sampleReady=input.controlLeads>=policy.minimumLeadsPerArm&&input.testLeads>=policy.minimumLeadsPerArm&&input.elapsedDays>=policy.minimumDays;
 const guardrailIncrease=input.controlGuardrailRate>0?pct((input.testGuardrailRate-input.controlGuardrailRate)/input.controlGuardrailRate):input.testGuardrailRate>0?100:null;
 const stopReasons=[totalSpend>=policy.budgetCap&&"budget_cap_reached",input.elapsedDays>=policy.maximumDays&&"maximum_window_reached",guardrailIncrease!==null&&guardrailIncrease>policy.maximumGuardrailIncreasePercent&&"guardrail_deteriorated"].filter(Boolean) as string[];
 const recommendation=stopReasons.length?"stop_review":!sampleReady?"continue_collecting":relativeLift!==null&&relativeLift>10?"candidate_winner_review":relativeLift!==null&&relativeLift<-10?"candidate_loser_review":"inconclusive_review";
 return{totalSpend,controlConversionRate:controlRate===null?null:pct(controlRate),testConversionRate:testRate===null?null:pct(testRate),absoluteLiftPercentPoints:absoluteLift,relativeLiftPercent:relativeLift,guardrailIncreasePercent:guardrailIncrease,sampleReady,stopReasons,recommendation,interpretation:sampleReady?"directional_result_requires_director_review":"insufficient_sample_no_causal_claim",governance:{causalClaimAllowed:false,automaticWinner:false,automaticBudgetChange:false,directorDecisionRequired:true}};
}
