export class SemanticSearch {


search(
query:string,
documents:any[]
){

return documents.filter(doc=>

JSON.stringify(doc)
.toLowerCase()
.includes(query.toLowerCase())

);


}


}
