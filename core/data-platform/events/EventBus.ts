export class EventBus {


publish(

event:any

){

console.log(
"Atlas Event:",
event
);


}


}



export const eventBus =
new EventBus();
