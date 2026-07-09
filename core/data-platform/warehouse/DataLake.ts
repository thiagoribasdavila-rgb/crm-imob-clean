export class DataLake {


store(

data:any

){


return {


stored:true,


timestamp:new Date()


};


}


}



export const dataLake =
new DataLake();
