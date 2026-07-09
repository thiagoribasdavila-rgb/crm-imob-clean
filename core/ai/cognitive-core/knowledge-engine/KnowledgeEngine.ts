import {KnowledgeGraph} from "./KnowledgeGraph";
import {VectorRetriever} from "./VectorRetriever";


export class KnowledgeEngine{


graph:KnowledgeGraph;

retriever:VectorRetriever;



constructor(){

this.graph=new KnowledgeGraph();

this.retriever=new VectorRetriever();

}



learn(data:any){

return {

stored:true,

data

};


}



query(question:string){

return {

answer:"knowledge retrieval",

question

};


}



}
