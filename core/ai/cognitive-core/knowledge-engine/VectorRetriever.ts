import {KnowledgeMemory} from "./KnowledgeMemory";


export class VectorRetriever {


private memories:KnowledgeMemory[]=[];



add(memory:KnowledgeMemory){

this.memories.push(memory);

}



search(query:string){


return this.memories
.sort((a,b)=>b.relevance-a.relevance)
.slice(0,10);


}


}
