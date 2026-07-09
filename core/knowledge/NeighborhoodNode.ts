import {
Entity
}
from "./Entity";


export function createNeighborhoodNode(

id:string,

name:string

):Entity{


return {


id,


type:"neighborhood",


name,


createdAt:new Date()


};


}
