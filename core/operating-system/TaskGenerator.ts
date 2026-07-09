export class TaskGenerator {


generate(

recommendation:string

){


return {


task:

recommendation,


status:

"created",


assigned:

true


};


}


}


export const taskGenerator =
new TaskGenerator();
