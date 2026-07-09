export class EmotionVoiceEngine {


analyze(

audio:string

){


return {


confidence:

85,


emotion:

"interessado",


risk:

"baixo"


};


}


}


export const emotionVoiceEngine =
new EmotionVoiceEngine();
