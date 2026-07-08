export interface CommunicationContext {


customerId:string;


channel:

"whatsapp"
|
"instagram"
|
"email"
|
"phone";


conversation:string[];


customerIntent:string;


lastMessage:Date;


}
