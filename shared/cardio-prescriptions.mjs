import {trackingProfile,CARDIO_TYPES,convertDistance,FIELDS} from './tracking.mjs';
import {formatTime} from './time.mjs';
export function measurementType(item,exercise){const inferred=trackingProfile(exercise||{id:item?.exerciseId,name:item?.exerciseName});return inferred!=='strength'?inferred:item?.trackingType||inferred;}
export function calculatedCardioMetrics(value,type){
 const out={...value},unit=out.distanceUnit||(['erg','swimming'].includes(type)?'m':'mi');
 if(Number.isFinite(out.distance)&&out.distance>0&&Number.isFinite(out.durationSeconds)&&out.durationSeconds>0){
  const meters=convertDistance(out.distance,unit,'m');
  if(FIELDS[type]?.includes('paceSeconds')){const base=type==='erg'?500:type==='swimming'?unit==='yd'?91.44:100:convertDistance(1,unit,'m');out.paceSeconds=+(out.durationSeconds/meters*base).toFixed(6);}
  if(type==='cycling'||type==='treadmill')out.speedMph=+(meters/out.durationSeconds/.44704).toFixed(6);
 }
 return out;
}
export function cardioPrescription(item,exercise){
 const type=measurementType(item,exercise);
 if(!CARDIO_TYPES.includes(type))return null;
 // Legacy cardio with strength-shaped rows is kept, but no ambiguous reps become meters.
 return {...structuredClone(item),trackingType:type,metrics:structuredClone(item.metrics||{}),intervalCount:item.intervalCount||1,restSeconds:item.restSeconds??item.rest??0};
}
export function validateCardioPrescription(item,library){
 const exercise=library.find(e=>e.id===item.exerciseId);
 if(!exercise||!CARDIO_TYPES.includes(item.trackingType)||trackingProfile(exercise)!==item.trackingType)throw Error('Choose a matching cardio library exercise.');
 if(!Number.isInteger(item.intervalCount??1)||(item.intervalCount??1)<1||(item.intervalCount??1)>30)throw Error('Use 1–30 cardio intervals.');
 if(!Number.isFinite(item.restSeconds??0)||(item.restSeconds??0)<0||(item.restSeconds??0)>3600)throw Error('Use recovery rest up to 60 minutes.');
 if(typeof(item.notes??'')!=='string'||(item.notes||'').length>2000)throw Error('Check cardio notes.');
 const metrics=item.metrics;if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))throw Error('Enter cardio targets.');
 if(!(metrics.distance>0||metrics.durationSeconds>0))throw Error('Enter a distance or duration target.');
 for(const [k,v] of Object.entries(metrics)){
  if(k==='distanceUnit'){convertDistance(1,v,'m');continue;}
  if(![...FIELDS[item.trackingType],'rpe'].includes(k)||v!=null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>(k==='distance'?1000000:k==='rpe'?10:86400)))throw Error(`Check cardio ${k}.`);
 }
 if(metrics.rpe!=null&&metrics.rpe<1)throw Error('RPE must be 1–10.');
 if(metrics.distance!=null)convertDistance(metrics.distance,metrics.distanceUnit||(['erg','swimming'].includes(item.trackingType)?'m':'mi'),'m');
 return {...structuredClone(item),intervalCount:item.intervalCount??1,restSeconds:item.restSeconds??0};
}
export function cardioTargetText(item){
 const m=item.metrics||{},type=item.trackingType,unit=m.distanceUnit||(['erg','swimming'].includes(type)?'m':'mi');
 const pace=m.paceSeconds!=null?`${formatTime(m.paceSeconds)} / ${type==='erg'?'500 m':type==='swimming'?`100 ${unit==='yd'?'yd':'m'}`:unit}`:'';
 return [item.intervalCount>1?`${item.intervalCount} intervals ×`:null,m.distance!=null?`${m.distance} ${unit}`:null,m.durationSeconds!=null?formatTime(m.durationSeconds):null,pace?`@ ${pace}`:null,item.restSeconds?`${formatTime(item.restSeconds)} recovery`:null,m.rpe!=null?`RPE ${m.rpe}`:null].filter(Boolean).join(' · ')||'Cardio targets need coach review';
}
