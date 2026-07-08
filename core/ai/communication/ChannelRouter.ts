export class ChannelRouter {


route(

channel:string

){


switch(channel){


case "whatsapp":

return "WhatsAppAgent";


case "instagram":

return "InstagramAgent";


case "email":

return "EmailAgent";


default:

return "HumanAgent";


}


}


}


export const channelRouter =
new ChannelRouter();
