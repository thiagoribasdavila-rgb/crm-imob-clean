export class ImageAnalyzer {


analyze(

image:string

){


return {


type:"image",


detected:[

"arquitetura",

"acabamento",

"ambientes"

],


commercialUse:

"Gerar argumento de venda"


};


}


}


export const imageAnalyzer =
new ImageAnalyzer();
