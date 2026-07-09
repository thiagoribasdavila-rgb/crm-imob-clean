export class KnowledgeEngine {


private knowledge:any[]=[];


add(data:any){

this.knowledge.push(data);

}


search(query:string){

return this.knowledge.filter(
item =>
JSON.stringify(item)
.toLowerCase()
.includes(query.toLowerCase())
);

}


}
