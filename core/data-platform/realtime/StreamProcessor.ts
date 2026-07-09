export class StreamProcessor {


listen(

event:any

){


console.log(

"Processing",

event

);


}


}


export const streamProcessor =
new StreamProcessor();
