import {
ExtractedContent
}
from "./ContentExtractor";


export class DocumentAnalyzer {


analyze(

document:string

):ExtractedContent{


return {


type:"document",


summary:

`Documento analisado: ${document}`,


entities:[

"empreendimento",

"unidades",

"preços",

"condições"

],


confidence:90


};


}


}


export const documentAnalyzer =
new DocumentAnalyzer();
