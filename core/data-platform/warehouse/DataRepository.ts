export class DataRepository {


private data:any[]=[];



insert(
item:any
){

this.data.push(item);

}



query(){

return this.data;

}



}


export const dataRepository =
new DataRepository();
