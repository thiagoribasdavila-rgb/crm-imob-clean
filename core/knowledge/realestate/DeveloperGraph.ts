export interface Developer {


id:string;


name:string;


projects:string[];


reputationScore:number;


}



export class DeveloperGraph {


private developers:
Developer[]=[];



add(
developer:Developer
){

this.developers.push(developer);

}



find(
name:string
){

return this.developers.find(

item=>

item.name===name

);

}


}


export const developerGraph =
new DeveloperGraph();
