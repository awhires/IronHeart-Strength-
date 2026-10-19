import {intervalSegments,intervalSetCount,validateIntervalShape} from './cardio-structure.mjs';
import {trackingProfile,CARDIO_TYPES,convertDistance,FIELDS} from './tracking.mjs';
import {formatTime} from './time.mjs';
export function measurementType(item,exercise){const inferred=trackingProfile(exercise||{id:item?.exerciseId,name:item?.exerciseName});return inferred!=='strength'?inferred:item?.trackingType||inferred;}
export function calculatedCardioMetrics(value,type){
 const out={...value},unit=out.distanceUnit||(['erg','swimming'].includes(type)?'m':'mi');
 if(type==='running')out.paceUnit=out.paceUnit||(['mi','km'].includes(unit)?unit:'km');
 if(Number.isFinite(out.distance)&&out.distance>0&&Number.isFinite(out.durationSeconds)&&out.durationSeconds>0){
  const meters=convertDistance(out.distance,unit,'m');
  if(FIELDS[type]?.includes('paceSeconds')){const paceUnit=type==='running'?(out.paceUnit||(['mi','km'].includes(unit)?unit:'km')):unit;if(type==='running')out.paceUnit=paceUnit;const base=type==='erg'?500:type==='swimming'?unit==='yd'?91.44:100:convertDistance(1,paceUnit,'m');out.paceSeconds=+(out.durationSeconds/meters*base).toFixed(6);}
  if(type==='cycling'||type==='treadmill')out.speedMph=+(meters/out.durationSeconds/.44704).toFixed(6);
 }
 return out;
}
export function cardioPrescription(item,exercise){
 const type=measurementType(item,exercise);
 if(!CARDIO_TYPES.includes(type))return null;
 // Legacy cardio with strength-shaped rows is kept, but no ambiguous reps become meters.
 return {...structuredClone(item),trackingType:type,metrics:structuredClone(item.metrics||{}),intervalCount:item.intervalCount||(item.intervals?.length?intervalSetCount(item.intervals):1),restSeconds:item.restSeconds??item.rest??0};
}
export function validateCardioPrescription(item,library){
 const exercise=library.find(e=>e.id===item.exerciseId);
 if(!exercise||!CARDIO_TYPES.includes(item.trackingType)||trackingProfile(exercise)!==item.trackingType)throw Error('Choose a matching cardio library exercise.');
 if(!Number.isInteger(item.intervalCount??1)||(item.intervalCount??1)<1||(item.intervalCount??1)>300)throw Error('Use 1–300 cardio segments.');
 if(!Number.isFinite(item.restSeconds??0)||(item.restSeconds??0)<0||(item.restSeconds??0)>3600)throw Error('Use recovery rest up to 60 minutes.');
 if(typeof(item.notes??'')!=='string'||(item.notes||'').length>2000)throw Error('Check cardio notes.');
 const metrics=item.metrics;if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))throw Error('Enter cardio targets.');
 for(const [k,v] of Object.entries(metrics)){
  if(k==='distanceUnit'){convertDistance(1,v,'m');continue;}if(k==='paceUnit'){if(item.trackingType!=='running'||!['mi','km'].includes(v))throw Error('Running pace uses mi or km.');continue;}
  if(![...FIELDS[item.trackingType],'rpe'].includes(k)||v!=null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>(k==='distance'?1000000:k==='rpe'?10:86400)))throw Error(`Check cardio ${k}.`);
 }
 if(metrics.rpe!=null&&metrics.rpe<1)throw Error('RPE must be 1–10.');
 if(metrics.distance!=null)convertDistance(metrics.distance,metrics.distanceUnit||(['erg','swimming'].includes(item.trackingType)?'m':'mi'),'m');
 if(item.intervals!=null){
  validateIntervalShape(item.intervals);
  let total=0;for(const b of item.intervals){if(b.rounds!=null&&(!Number.isInteger(b.rounds)||b.rounds<1||b.rounds>30))throw Error('Check prescribed interval rounds.');total+=(b.rounds??1)*intervalSegments(b).length;
   for(const {metrics:work} of intervalSegments(b))validateCardioPrescription({exerciseId:item.exerciseId,trackingType:item.trackingType,intervalCount:1,metrics:work||{},restSeconds:0},library);
   const recovery=b.recovery||{};if(recovery.durationSeconds!=null&&(!Number.isFinite(recovery.durationSeconds)||recovery.durationSeconds<0||recovery.durationSeconds>3600))throw Error('Check prescribed recovery.');
   if(typeof recovery!=='object'||Array.isArray(recovery))throw Error('Check prescribed recovery.');
   validateCardioPrescription({exerciseId:item.exerciseId,trackingType:item.trackingType,metrics:recovery||{},restSeconds:0,intervalCount:1},library);
  }if(total!==(item.intervalCount??1))throw Error('Prescribed interval count does not match blocks.');
 }
 return {...structuredClone(item),intervalCount:item.intervalCount??1,restSeconds:item.restSeconds??0};
}
export function cardioTargetText(item){
 if(item.intervals?.some(b=>b.segments))return item.intervals.map(b=>`${b.rounds==null?'':`${b.rounds} rounds · `}${intervalSegments(b).map(s=>`${s.label||'Work'}: ${cardioTargetText({...item,intervals:undefined,intervalCount:1,restSeconds:0,metrics:s.metrics})}`).join(' → ')}${b.recovery?.durationSeconds?` · ${formatTime(b.recovery.durationSeconds)} between rounds`:''}`).join(' / ');
 const m=item.metrics||{},type=item.trackingType,unit=m.distanceUnit||(['erg','swimming'].includes(type)?'m':'mi');
 const pace=m.paceSeconds!=null?`${formatTime(m.paceSeconds)} / ${type==='erg'?'500 m':type==='swimming'?`100 ${unit==='yd'?'yd':'m'}`:m.paceUnit||unit}`:'';
 return [item.intervalCount>1?`${item.intervalCount} intervals ×`:null,m.distance!=null?`${m.distance} ${unit}`:null,m.durationSeconds!=null?formatTime(m.durationSeconds):null,pace?`@ ${pace}`:null,item.restSeconds?`${formatTime(item.restSeconds)} recovery`:null,m.rpe!=null?`RPE ${m.rpe}`:null].filter(Boolean).join(' · ')||'Cardio targets need coach review';
}
