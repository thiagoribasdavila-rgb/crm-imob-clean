export class PropertyMatchAgent {


match(

preferences:string[]

){


return {


matches:

preferences.map(

item =>

`Imóvel compatível: ${item}`

)


};


}


}



export const propertyMatchAgent =
new PropertyMatchAgent();
