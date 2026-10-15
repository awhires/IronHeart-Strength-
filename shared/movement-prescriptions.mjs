import {trackingProfile} from './tracking.mjs';
export const MOVEMENT_TYPES=['timed','loadedTimed','carry'];
export function movementPrescription(item,exercise){
 const type=trackingProfile(exercise||{id:item.exerciseId,name:item.exerciseName,trackingType:item.trackingType});
 if(!MOVEMENT_TYPES.includes(type))return null;
 // Legacy repetitions (including breaths) are never interpreted as seconds.
 const result=structuredClone(item);
 return {...result,trackingType:type,sets:item.sets??1,rest:item.rest??60,metrics:{...(item.durationSeconds!=null?{durationSeconds:item.durationSeconds}:{}),...(type!=='timed'&&typeof item.load==='number'?{load:item.load,loadUnit:item.loadUnit||'lbs'}:{}),...item.metrics}};
}
