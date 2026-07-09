export class OperationMonitor {


analyze(

operation:any

){


const alerts=[];



if(operation.pendingLeads > 10){

alerts.push({

type:"alert",

description:
"Existem leads sem atendimento",

priority:"high"

});

}



return alerts;


}


}


export const operationMonitor =
new OperationMonitor();
