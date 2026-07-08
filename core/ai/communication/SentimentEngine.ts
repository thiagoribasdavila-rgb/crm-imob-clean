export class SentimentEngine {


analyze(

text:string

){


const positive =
text.includes("gostei")
||
text.includes("interesse");


return {


sentiment:

positive
?
"positive"
:
"neutral",


score:
positive
?
90
:
50


};


}


}


export const sentimentEngine =
new SentimentEngine();
