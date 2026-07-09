import {
operationMonitor
}
from "./OperationMonitor";


import {
alertEngine
}
from "./AlertEngine";



export class AtlasOS {


run(

data:any

){


return {


monitor:

operationMonitor.analyze(data),


alerts:

alertEngine.check(data)


};


}


}



export const atlasOS =
new AtlasOS();
