export class CognitiveSession {

    private state:any;


    constructor(initialState:any){

        this.state = initialState;

    }


    getState(){

        return this.state;

    }


    update(data:any){

        this.state = {
            ...this.state,
            ...data,
            updatedAt:new Date()
        };

    }

}
