export interface BehaviorEvent {

type:
"click"
|
"visit"
|
"message"
|
"download"
|
"proposal"
|
"return";


value:number;

date:string;

}



export interface BehaviorAnalysis {


engagement:number;

interestLevel:
"baixo"
|
"medio"
|
"alto";


signals:string[];


}



export function analyzeBehavior(
events:BehaviorEvent[]
):BehaviorAnalysis{


let score=0;

const signals:string[]=[];


events.forEach(event=>{


score += event.value;


switch(event.type){


case "visit":

signals.push(
"Visitou empreendimento"
);

break;


case "download":

signals.push(
"Baixou material"
);

break;


case "proposal":

signals.push(
"Recebeu proposta"
);

break;


case "return":

signals.push(
"Retornou ao canal"
);

break;


}

});



let interestLevel:
"baixo"|
"medio"|
"alto";


if(score>=80)

interestLevel="alto";


else if(score>=40)

interestLevel="medio";


else

interestLevel="baixo";



return {


engagement:
Math.min(score,100),


interestLevel,


signals


};


}
