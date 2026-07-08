import {
CommunicationContext
}
from "./CommunicationContext";


export class ConversationManager {


analyze(

context:CommunicationContext

){


return {


customer:
context.customerId,


intent:
context.customerIntent,


history:
context.conversation.length,


};


}


}


export const conversationManager =
new ConversationManager();
