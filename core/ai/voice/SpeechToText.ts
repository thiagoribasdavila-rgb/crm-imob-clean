export interface Transcript {


text:string;


language:string;


confidence:number;


}



export class SpeechToText {


convert(

audio:string

):Transcript{


return {


text:

"Transcrição gerada pela inteligência Atlas",


language:

"pt-BR",


confidence:

95


};


}


}



export const speechToText =
new SpeechToText();
