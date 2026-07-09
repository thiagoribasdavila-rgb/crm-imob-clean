export class GoalTracker {


track(

goal:number,

current:number

){


return {


progress:

(current/goal)*100,


status:

current >= goal

?

"completed"

:

"in progress"


};


}


}


export const goalTracker =
new GoalTracker();
