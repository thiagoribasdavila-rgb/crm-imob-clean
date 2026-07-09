export class ReasoningMemory {


private memories:any[]=[];


store(data:any){

this.memories.push({

...data,

createdAt:new Date()

});

}



retrieve(){

return this.memories;

}


}
