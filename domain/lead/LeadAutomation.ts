export interface AutomationAction {


type:
"whatsapp"
|
"task"
|
"alert"
|
"followup";


message:string;


priority:
"normal"
|
"alta"
|
"urgente";

}



export function generateAutomation(
lead:any
):AutomationAction{


if(
lead.score>=90
){


return {


type:"alert",

message:
"Lead VIP necessita contato imediato",

priority:"urgente"


};


}



if(
lead.score>=60
){


return {


type:"whatsapp",

message:
"Enviar oportunidade personalizada",

priority:"alta"


};


}



return {


type:"followup",

message:
"Adicionar lead em nutrição automática",

priority:"normal"


};


}
