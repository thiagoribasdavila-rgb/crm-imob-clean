export class KnowledgeValidator{


validate(data:any){

return {

valid:true,

confidence:
data.confidence ?? 0.5

};


}


}
