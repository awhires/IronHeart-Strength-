import {trackingProfile,FIELDS,expandBlocks,MODIFIERS,complexLabel,DISTANCE_METERS} from './tracking.mjs';
import {inPounds} from './ai/contract.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const optional=(v,min,max)=>v==null||(finite(v)&&v>=min&&v<=max);
export function prepareJournalEntry(entry,exercise,library){
 const trackingType=trackingProfile(exercise),strength=trackingType==='strength';
 if(entry.blocks&&entry.sets)throw Error('Use either set blocks or individual sets.');
 const raw=entry.blocks?expandBlocks(entry.blocks):entry.sets;
 if(!Array.isArray(raw)||!raw.length||raw.length>30)throw Error('Log 1–30 sets per exercise.');
 const complex=entry.complex??[];
 if(!Array.isArray(complex)||complex.length>10||(!strength&&complex.length))throw Error('Use up to 10 movements in a strength complex.');
 const parts=complex.map(p=>{
  const base=library.find(e=>e.id===p.exerciseId);
  if(!base||trackingProfile(base)!=='strength'||!Number.isInteger(p.reps)||p.reps<1||p.reps>100|| (p.modifier&&!MODIFIERS.includes(p.modifier)))throw Error('Check complex movement, reps and modifier.');
  return {exerciseId:base.id,exerciseName:base.name,reps:p.reps,modifier:p.modifier||''};
 });
 const complexReps=parts.reduce((n,p)=>n+p.reps,0);
 if(complexReps>100)throw Error('Use at most 100 repetitions per complex.');
 const sets=raw.map(s=>{
  const out={};
  if(strength){out.reps=parts.length?complexReps:s.reps;if(!Number.isInteger(out.reps)||out.reps<0||out.reps>100)throw Error('Check each set: reps 0–100.');}
  if(FIELDS[trackingType].includes('load')){out.load=s.load??null;out.loadUnit=s.loadUnit??'lbs';if(!['lbs','kg'].includes(out.loadUnit)||!optional(out.load,0,1200)||(out.load!==null&&inPounds(out.load,out.loadUnit)>1200))throw Error('Check each set: load up to 1200 lb equivalent.');}
  if(strength){out.rpe=s.rpe??null;if(!optional(out.rpe,1,10)||!optional(s.rir,0,10))throw Error('Check RPE 1–10 and RIR 0–10.');if(s.rir!=null)out.rir=s.rir;}
  for(const [key,max] of [['durationSeconds',86400],['distance',1000],['speedMph',60],['incline',100],['level',100],['paceSeconds',86400]]){
   if(FIELDS[trackingType].includes(key)&&s[key]!=null){if(!optional(s[key],0,max))throw Error(`Check ${key}.`);out[key]=s[key];}
  }
  if(out.distance!=null||FIELDS[trackingType].includes('paceSeconds')){out.distanceUnit=s.distanceUnit??(trackingType==='carry'?'m':'mi');if(!DISTANCE_METERS[out.distanceUnit])throw Error('Choose a valid distance unit.');}
  if(['timed','loadedTimed'].includes(trackingType)&&!(out.durationSeconds>0))throw Error('Enter a positive duration in seconds.');
  if(trackingType==='loadedTimed'&&out.load==null)throw Error('Enter the hold load.');
  if(trackingType==='carry'&&(!(out.distance>0)||out.load==null))throw Error('Enter carry load and distance.');
  if(['treadmill','stairs','erg','running'].includes(trackingType)&&!(out.durationSeconds>0)&&!(out.distance>0))throw Error('Enter cardio duration or distance.');
  if(s.blockIndex!=null)out.blockIndex=s.blockIndex;
  return out;
 });
 const intervals=entry.intervals??[];
 if(!Array.isArray(intervals)||intervals.length>20||(!['treadmill','stairs','erg','running'].includes(trackingType)&&intervals.length))throw Error('Intervals are for cardio; use at most 20 blocks.');
 const cleanIntervals=intervals.map(b=>{
  if(!Number.isInteger(b.rounds)||b.rounds<1||b.rounds>100)throw Error('Use 1–100 interval rounds.');
  const phase=p=>{
   if(!p||!(p.durationSeconds>0||p.distance>0))throw Error('Each interval work/recovery phase needs time or distance.');
   const result={};for(const k of FIELDS[trackingType])if(p[k]!=null){if(!optional(p[k],0,k==='durationSeconds'||k==='paceSeconds'?86400:1000))throw Error('Check interval metrics.');result[k]=p[k];}
   if(p.distance!=null||p.paceSeconds!=null){if(!DISTANCE_METERS[p.distanceUnit])throw Error('Check interval distance unit.');result.distanceUnit=p.distanceUnit;}
   return result;
  };return {rounds:b.rounds,work:phase(b.work),recovery:phase(b.recovery)};
 });
 if(typeof(entry.notes??'')!=='string'||(entry.notes||'').length>2000)throw Error('Exercise notes must be shorter than 2000 characters.');
 return {exerciseId:exercise.id,exerciseName:exercise.name,sets,
  ...(strength?{}:{trackingType}),...(entry.blocks?{setBlocks:entry.blocks.map((b,i)=>({count:b.count,...sets.find(s=>s.blockIndex===i)}))}:{}),
  ...(parts.length?{complex:parts,complexText:complexLabel(parts,library),volumeEligible:parts.every(p=>p.exerciseId===exercise.id)}:{}),
  ...(cleanIntervals.length?{intervals:cleanIntervals}:{}),...(entry.notes?{notes:entry.notes}:{})};
}
