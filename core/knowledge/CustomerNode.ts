import {
Entity
}
from "./Entity";


export function createCustomerNode(

id:string,

name:string

):Entity{


return {


id,


type:"customer",


name,


createdAt:new Date()


};


}
