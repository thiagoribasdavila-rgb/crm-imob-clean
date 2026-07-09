import {
patternDetector
}
from "./PatternDetector";


import {
insightGenerator
}
from "./InsightGenerator";



export class LearningEngine {


learn(

data:any

){


const pattern =
patternDetector.detect(data);



const insight =
insightGenerator.generate(pattern);



return {


pattern,

insight,


};


}


}



export const learningEngine =
new LearningEngine();
