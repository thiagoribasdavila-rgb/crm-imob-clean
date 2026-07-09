export class InstagramAgent {


analyze(

message:string

){


return {


channel:"instagram",


intent:

"avaliar interesse comercial",


message


};


}


}


export const instagramAgent =
new InstagramAgent();
