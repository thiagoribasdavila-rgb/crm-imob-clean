export interface Customer {


id:string


name:string


email:string


phone:string


cpf?:string


birthDate?:Date


preferences?:{

location?:string

budget?:number

rooms?:number

}


createdAt:Date


}
