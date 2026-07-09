import {
AtlasEvent
}
from "./Event";


export class EventStore {


private events:AtlasEvent[]=[];



save(
event:AtlasEvent
){

this.events.push(event);

}



findByEntity(
id:string
){

return this.events.filter(

event=>

event.entityId===id

);


}



all(){

return this.events;

}


}



export const eventStore =
new EventStore();
