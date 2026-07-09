export interface Memory {

 event:string;
 result:string;
 date:Date;

}


export class DecisionMemory {


 private memories:Memory[]=[];


 save(memory:Memory){

  this.memories.push(memory);

 }


 history(){

  return this.memories;

 }


}
