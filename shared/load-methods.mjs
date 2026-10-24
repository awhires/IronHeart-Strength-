import {LOAD_MODE as L} from './ai/contract.mjs';

export const LOAD_METHOD_OPTIONS=Object.freeze([
  [L.FIXED,'Fixed'],[L.PERCENTAGE,'% 1RM'],[L.BODYWEIGHT,'Bodyweight'],
  [L.ATHLETE_SELECTED,'Athlete chooses'],[L.PREVIOUS_PERFORMANCE,'Previous Performance ±'],
  [L.NONE,'No load prescribed']
]);

// A mode switch clears only fields belonging to the old loading method.
// This also keeps legacy prescriptions readable without mutating saved data.
export function loadModePatch(item,mode,{movement=false}={}){
  const patch={loadMode:mode,loadDelta:mode===L.PREVIOUS_PERFORMANCE?(item.loadDelta??0):null,
    percent1RM:mode===L.PERCENTAGE?(item.percent1RM??null):null,
    referenceExerciseId:mode===L.PERCENTAGE?(item.referenceExerciseId??item.reference1RM?.exerciseId??null):null,
    referenceExerciseName:mode===L.PERCENTAGE?(item.referenceExerciseName??null):null,
    reference1RM:mode===L.PERCENTAGE?(item.reference1RM??null):null,
    referenceLoad:mode===L.ATHLETE_SELECTED?(item.referenceLoad??null):null};
  if(movement){patch.metrics={...item.metrics,load:null};delete patch.reference1RM;delete patch.referenceLoad;}
  else patch.load=null;
  return patch;
}
