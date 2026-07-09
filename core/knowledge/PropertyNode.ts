import {
Entity
}
from "./Entity";


export function createPropertyNode(

id:string,

name:string

):Entity{


return {


id,


type:"property",


name,


createdAt:new Date()


};


}
