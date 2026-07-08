import { Lead } from "./Lead";



export interface LeadRecommendationResult {


 leadId:string;


 recommendedAction:string;


 recommendedProperty?:string;


 salesArgument:string;


 messageSuggestion:string;


 channel:
 | "whatsapp"
 | "telefone"
 | "email";


 priority:
 | "baixa"
 | "media"
 | "alta"
 | "vip";


 reasoning:string[];

}




export function generateLeadRecommendation(
lead:Lead

):LeadRecommendationResult{


 const profile =
 identifyProfile(
 lead
 );


 const priority =
 definePriority(
 lead
 );


 const property =
 recommendProperty(
 profile
 );


 const argument =
 createSalesArgument(
 profile
 );


 const action =
 createAction(
 lead
 );



 return {


 leadId:
 lead.id,


 recommendedAction:
 action,


 recommendedProperty:
 property,


 salesArgument:
 argument,


 messageSuggestion:
 createMessage(
 lead,
 property,
 argument
 ),


 channel:
 chooseChannel(
 lead
 ),


 priority,


 reasoning:[

 `Perfil identificado: ${profile}`,

 `Status comercial: ${lead.status}`,

 `Estratégia criada pela IA Atlas`

 ]

 };

}






function identifyProfile(
lead:Lead

){


 if(
 lead.budget &&
 lead.budget >=1000000
 )

 return "investidor alto padrão";



 if(
 lead.budget &&
 lead.budget >=500000
 )

 return "comprador premium";



 return "comprador residencial";


}






function recommendProperty(
profile:string

){


 switch(profile){


 case "investidor alto padrão":

 return "Empreendimentos com alta valorização e liquidez";


 case "comprador premium":

 return "Unidades premium próximas a centros valorizados";


 default:

 return "Unidade compatível com orçamento e necessidade";


 }


}






function createSalesArgument(
profile:string

){


 if(
 profile==="investidor alto padrão"
 )

 return "Foco em valorização patrimonial, liquidez e retorno.";




 if(
 profile==="comprador premium"
 )

 return "Foco em localização, experiência e qualidade de vida.";





 return "Foco em condição comercial e adequação ao perfil.";

}





function createAction(
lead:Lead

){


 if(
 lead.status==="novo"
 )

 return "Realizar primeiro contato inteligente";


 if(
 lead.status==="qualificado"
 )

 return "Enviar opções personalizadas";


 if(
 lead.status==="proposta"
 )

 return "Acompanhar negociação";


 if(
 lead.status==="negociacao"
 )

 return "Contato prioritário para fechamento";


 return "Nutrir relacionamento";

}






function createMessage(
lead:Lead,
property:string,
argument:string

){


 return `

Olá ${lead.name},

analisamos seu perfil e encontramos uma oportunidade alinhada.

Produto:
${property}

Destaque:
${argument}

Posso apresentar essa oportunidade para você?

`;

}






function chooseChannel(
lead:Lead

){


 if(
 lead.source==="meta"
 )

 return "whatsapp";


 if(
 lead.source==="google"
 )

 return "telefone";


 return "whatsapp";


}






function definePriority(
lead:Lead

){


 if(
 lead.status==="negociacao"
 )

 return "vip";


 if(
 lead.status==="proposta"
 )

 return "alta";


 if(
 lead.status==="qualificado"
 )

 return "media";


 return "baixa";


}
