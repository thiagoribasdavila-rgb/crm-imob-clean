export interface VoiceAnalysis {


intent:string;


sentiment:string;


urgency:number;


}



export class VoiceAnalyzer {


analyze(

text:string

):VoiceAnalysis{


return {


intent:

"compra de imóvel",


sentiment:

"positivo",


urgency:

80


};


}


}



export const voiceAnalyzer =
new VoiceAnalyzer();
