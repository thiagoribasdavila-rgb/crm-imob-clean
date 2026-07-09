import {
knowledgeGraph
}
from "./KnowledgeGraph";



export function getCustomerNetwork(

customerId:string

){


return knowledgeGraph.findConnections(
customerId
);


}
