export class ContextResolver{


resolve(context:any){

return {

context,

priority:"high",

timestamp:new Date()

};


}


}
