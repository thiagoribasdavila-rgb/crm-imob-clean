import { createClient } from "@/lib/supabase/client";

import {

Lead,

calculateLeadScore,

getTemperature,

generateAIAction

}

from "@/domain/lead";



export class LeadService {


private supabase =
createClient();



/*
================================
BUSCA DE LEADS
================================
*/


async getLeads(){


const {

data,

error

}

=
await this.supabase

.from("leads")

.select("*")

.order(

"created_at",

{

ascending:false

}

);



if(error)

throw error;



return data || [];


}




/*
================================
BUSCA POR ID
================================
*/


async getLeadById(
id:string
){


const {

data,

error

}

=
await this.supabase

.from("leads")

.select("*")

.eq(

"id",

id

)

.single();



if(error)

throw error;



return data;


}





/*
================================
CRIAR LEAD
================================
*/


async createLead(
lead:Partial<Lead>
){


const {

data,

error

}

=
await this.supabase

.from("leads")

.insert({

...lead,

status:"novo",

scoreIA:0

})

.select()

.single();



if(error)

throw error;



await this.logEvent({

type:"lead_created",

leadId:data.id,

payload:data

});



return data;


}




/*
================================
ATUALIZAR LEAD
================================
*/


async updateLead(

id:string,

payload:any

){


const {

data,

error

}

=
await this.supabase

.from("leads")

.update(payload)

.eq(

"id",

id

)

.select()

.single();



if(error)

throw error;



return data;


}



/*
================================
DELETAR LEAD
================================
*/


async deleteLead(
id:string
){


const {

error

}

=
await this.supabase

.from("leads")

.delete()

.eq(

"id",

id

);



if(error)

throw error;



return true;


}




/*
================================
IA ANALYSIS ENGINE
================================
*/


async runAIAnalysis(
leadId:string
){


const lead =
await this.getLeadById(
leadId
);



const analyzed =
this.analyzeLead(
lead
);



await this.updateLead(

leadId,

{

scoreIA:
analyzed.scoreIA,


temperature:
analyzed.temperature,


next_action:
analyzed.ai.action


}

);



return analyzed;


}





/*
================================
CÁLCULO INTELIGENTE
================================
*/


analyzeLead(
lead:any
){



const score =
calculateLeadScore(
lead
);



return {


...lead,


scoreIA:
score,


temperature:
getTemperature(score),



ai:
generateAIAction({

...lead,

scoreIA:score

})



}



}





/*
================================
RANKING IA
================================
*/


async rankLeads(){



const leads =
await this.getLeads();



return leads

.map(
lead=>

this.analyzeLead(lead)

)

.sort(

(a,b)=>

b.scoreIA-a.scoreIA

);



}





/*
================================
EVENTOS DO SISTEMA
================================
*/


async logEvent(
event:any
){


await this.supabase

.from(

"system_events"

)

.insert({

type:event.type,

lead_id:event.leadId,

payload:event.payload

});


}





/*
================================
PIPELINE AUTOMÁTICO
================================
*/


async movePipelineAutomatically(
leadId:string
){


const lead =
await this.getLeadById(
leadId
);



const analyzed =
this.analyzeLead(
lead
);



let newStatus =
lead.status;



if(
analyzed.scoreIA >=90
)

newStatus =
"negociacao";



else if(
analyzed.scoreIA >=70
)

newStatus =
"proposta";



else if(
analyzed.scoreIA >=40
)

newStatus =
"qualificado";




await this.updateLead(

leadId,

{

status:newStatus

}

);



return newStatus;


}



}


export const leadService =
new LeadService();
