export interface Campaign{


id:string


name:string


channel:

"meta" |
"google" |
"whatsapp" |
"organic"


budget:number


leads:number


costPerLead:number


conversion:number


active:boolean


createdAt:Date


}
