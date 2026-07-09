import {
Entity
}
from "./Entity";


import {
Relationship
}
from "./Relationship";



export class KnowledgeGraph {


private entities:Entity[]=[];


private relationships:Relationship[]=[];



addEntity(
entity:Entity
){

this.entities.push(entity);

}



addRelationship(
relationship:Relationship
){

this.relationships.push(relationship);

}



findConnections(
id:string
){


return this.relationships.filter(

item=>

item.from===id
||
item.to===id

);


}



}


export const knowledgeGraph =
new KnowledgeGraph();
