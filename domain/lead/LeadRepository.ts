import {Lead} from "./Lead"


export interface LeadRepository{


findAll():Promise<Lead[]>


findById(
id:string
):Promise<Lead | null>


create(
lead:Lead
):Promise<Lead>


update(
lead:Lead
):Promise<Lead>


delete(
id:string
):Promise<void>


}
