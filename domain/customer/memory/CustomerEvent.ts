export interface CustomerEvent {


id:string;


customerId:string;


event:

| "lead_created"
| "message_received"
| "visit"
| "proposal"
| "purchase"
| "lost";


description:string;


timestamp:Date;


}
