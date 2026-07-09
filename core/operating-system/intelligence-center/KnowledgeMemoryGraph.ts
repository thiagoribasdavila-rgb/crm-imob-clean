export interface KnowledgeNode {

 id:string;
 type:string;
 data:any;

}



export class KnowledgeMemoryGraph {


 private nodes:KnowledgeNode[]=[];


 add(node:KnowledgeNode){

  this.nodes.push(node);

 }


 search(type:string){

  return this.nodes.filter(
   node=>node.type===type
  );

 }


}
