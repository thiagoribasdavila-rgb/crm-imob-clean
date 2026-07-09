import {KnowledgeNode} from "./KnowledgeNode";


export class KnowledgeGraph{


private nodes:KnowledgeNode[]=[];



add(node:KnowledgeNode){

this.nodes.push(node);

}



find(id:string){

return this.nodes.find(
node=>node.id===id
);

}



connect(
from:string,
to:string
){

const node=this.find(from);

if(node){

node.relationships.push(to);

}

}


}
