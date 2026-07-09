import { CognitiveSession } from "./CognitiveSession";


export class CognitiveCore {


    private sessions: Map<string,CognitiveSession>;


    constructor(){

        this.sessions = new Map();

    }



    createSession(id:string, data:any){

        const session =
        new CognitiveSession({
            sessionId:id,
            ...data,
            createdAt:new Date()
        });


        this.sessions.set(id,session);


        return session;

    }



    getSession(id:string){

        return this.sessions.get(id);

    }



    process(input:any){


        return {

            received:true,

            input,

            timestamp:new Date()

        };


    }


}
