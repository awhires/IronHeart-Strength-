import {convertDistance} from './tracking.mjs';
import {convertWeight} from './ai/contract.mjs';
import {formatTime} from './time.mjs';
export const BLOCK_TYPES=['Strength','Hypertrophy','Metcon','Cardio','Accessory','Mobility / Recovery'];
export const SCORE_TYPES=['For Time','AMRAP','EMOM','Rounds for Time','Rounds + Reps','Time Cap','Load','Chipper','Intervals'];
const numeric=(v,max=86400)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const text=(v,max=2000)=>typeof v==='string'&&v.length<=max;
export const newMetcon=()=>({name:'',scoreType:'For Time',repScheme:[],movements:[],notes:''});
export function prepareMetcon(raw,library){
 const m=structuredClone(raw);
 if(!m||!text(m.name,200)||!m.name.trim()||!SCORE_TYPES.includes(m.scoreType)||!text(m.notes||''))throw Error('Name the Metcon and choose a scoring type.');
 if(m.format!=null&&!['standard','chipper','intervals'].includes(m.format))throw Error('Choose a valid Metcon format.');
 if(m.scoreType==='Intervals'&&(!(m.rounds>0)||!(m.workSeconds>0)))throw Error('Intervals need rounds and work duration.');
 if(!Array.isArray(m.repScheme)||m.repScheme.length>100||m.repScheme.some(n=>!Number.isInteger(n)||n<1||n>1000))throw Error('Use a rep scheme such as 50-40-30-20-10.');
 for(const k of ['rounds','durationSeconds','timeCapSeconds','workSeconds','restSeconds'])if(m[k]!=null&&!numeric(m[k]))throw Error('Check Metcon rounds and times.');
 if(m.rounds!=null&&(!Number.isInteger(m.rounds)||m.rounds<1))throw Error('Rounds must be a positive whole number.');
 if(['AMRAP','EMOM','Rounds + Reps'].includes(m.scoreType)&&!(m.durationSeconds>0))throw Error('Enter the workout duration.');
 if(m.scoreType==='Time Cap'&&!(m.timeCapSeconds>0))throw Error('Enter a time cap.');
 if(m.scoreType==='Rounds for Time'&&!(m.rounds>0))throw Error('Enter prescribed rounds.');
 if(!Array.isArray(m.movements)||!m.movements.length||m.movements.length>30)throw Error('Add 1–30 Metcon movements.');
 m.movements=m.movements.map(v=>{
  const e=library.find(e=>e.id===v.exerciseId);if(!e)throw Error('Choose a library movement.');
  for(const k of ['reps','distance','calories','load','minute'])if(v[k]!=null&&!numeric(v[k],k==='distance'?1000000:10000))throw Error('Check movement targets.');
  if(v.load!=null&&!['lbs','kg'].includes(v.loadUnit))throw Error('Choose a load unit.');
  if(v.distance!=null)convertDistance(v.distance,v.distanceUnit,'m');
  if(!text(v.notes||''))throw Error('Check movement notes.');
  if(v.scalingOptions!=null&&(!Array.isArray(v.scalingOptions)||v.scalingOptions.length>10))throw Error('Use up to ten scaling options.');
  const scalingOptions=v.scalingOptions?.map(o=>preparePerformedMovement(o));
  return {exerciseId:e.id,exerciseName:e.name,...(scalingOptions?{scalingOptions}:{}),...Object.fromEntries(['reps','distance','distanceUnit','calories','load','loadUnit','minute','notes'].filter(k=>v[k]!=null).map(k=>[k,v[k]]))};
 });return m;
}
export function scoreFields(type,cap){if(type==='Chipper')type='For Time';if(type==='Intervals')return ['completed','successfulMinutes','timeSeconds','load'];if(cap&&['For Time','Rounds for Time','Chipper'].includes(type))return ['completed','timeSeconds','rounds','reps','load'];return ({'For Time':['timeSeconds','load'],'Rounds for Time':['timeSeconds','load'],'AMRAP':['rounds','reps'],'Rounds + Reps':['rounds','reps'],'EMOM':['completed','successfulMinutes','load'],'Time Cap':['completed','timeSeconds','rounds','reps','load'],'Load':['load','reps','timeSeconds']})[type]||[];}
export function prepareMetconScore(raw,m){
 if(!raw||!['RX','Scaled','Modified'].includes(raw.rx)||!text(raw.notes||''))throw Error('Choose RX or scaled and check score notes.');
 if(raw.rx!=='RX'&&!raw.notes?.trim()&&!raw.performedMovements)throw Error('Describe the scaling so repeated results can be compared.');
 const out={rx:raw.rx,notes:raw.notes||''};
 if(raw.performedMovements!=null){if(!Array.isArray(raw.performedMovements)||raw.performedMovements.length!==m.movements.length)throw Error('Preserve one performed movement for each programmed movement.');out.performedMovements=raw.performedMovements.map(preparePerformedMovement);if(raw.rx==='RX'&&performanceMovementKey(out.performedMovements,m.repScheme)!==performanceMovementKey(m.movements,m.repScheme))throw Error('Movement changes must be marked Scaled or Modified.');}
 for(const k of scoreFields(m.scoreType,m.timeCapSeconds))if(raw[k]!=null&&raw[k]!==''){
  if(k==='completed'){if(typeof raw[k]!=='boolean')throw Error('Choose completed or failed.');}
  else if(!numeric(raw[k])||(['rounds','reps','successfulMinutes'].includes(k)&&!Number.isInteger(raw[k])))throw Error('Check Metcon result.');out[k]=raw[k];
 }
 if(m.timeCapSeconds&&['For Time','Rounds for Time','Chipper'].includes(m.scoreType)&&out.completed==null&&out.timeSeconds>0)out.completed=true;
 if(['For Time','Rounds for Time','Chipper'].includes(m.scoreType)&&out.completed!==false&&!(out.timeSeconds>0))throw Error('Enter completion time.');
 if(['AMRAP','Rounds + Reps'].includes(m.scoreType)&&(!numeric(out.rounds)||!numeric(out.reps)))throw Error('Enter rounds and additional reps (zero is allowed).');
 if(['EMOM','Intervals'].includes(m.scoreType)&&(typeof out.completed!=='boolean'||!numeric(out.successfulMinutes)))throw Error('Enter completion and successful minutes.');
 if(m.scoreType==='EMOM'&&out.successfulMinutes>Math.ceil(m.durationSeconds/60))throw Error('Successful minutes exceed the EMOM duration.');
 if((m.scoreType==='Time Cap'||m.timeCapSeconds&&['For Time','Rounds for Time','Chipper'].includes(m.scoreType))&&(typeof out.completed!=='boolean'||(out.completed?!(out.timeSeconds>0):!numeric(out.rounds)||!numeric(out.reps))))throw Error('Enter completion time or rounds and reps at the cap.');
 if(m.timeCapSeconds&&out.timeSeconds>m.timeCapSeconds)throw Error('Completion exceeds the time cap; record a capped result instead.');
 if(m.scoreType==='Load'&&!(out.load>0))throw Error('Enter the event load.');
 if(out.load!=null){if(!['lbs','kg'].includes(raw.loadUnit))throw Error('Choose result load units.');out.loadUnit=raw.loadUnit;}
 return out;
}
// Layout references the canonical exercises array, never a duplicate strength prescription.
export function prepareBlocks(blocks,exercises,library){
 if(blocks===undefined)return undefined;
 if(!Array.isArray(blocks)||!blocks.length||blocks.length>20)throw Error('Use 1–20 workout blocks.');
 const seen=new Set(),ids=new Set();
 const clean=blocks.map((b,i)=>{
  if(!BLOCK_TYPES.includes(b.type)||!text(b.name||'',200))throw Error('Choose a valid block type.');
  const id=b.id||`block-${i}`;if(typeof id!=='string'||ids.has(id))throw Error('Block IDs must be unique.');ids.add(id);
  if(b.type==='Metcon')return {id,type:b.type,name:b.name||'',metcon:prepareMetcon(b.metcon,library)};
  if(!Array.isArray(b.exerciseIndexes)||!b.exerciseIndexes.length)throw Error('Add exercises to each block.');
  for(const n of b.exerciseIndexes){if(!Number.isInteger(n)||n<0||n>=exercises.length||seen.has(n))throw Error('Each exercise must belong to exactly one block.');seen.add(n);}
  return {id,type:b.type,name:b.name||'',exerciseIndexes:[...b.exerciseIndexes]};
 });
 if(seen.size!==exercises.length)throw Error('Each exercise must belong to a block.');return clean;
}
export function recordBlockScores(scores,blocks=[]){
 const targets=blocks.filter(b=>b.type==='Metcon');
 if(!targets.length){if(scores?.length)throw Error('Unexpected Metcon results.');return [];}
 if(!Array.isArray(scores)||scores.length!==targets.length)throw Error('Log every Metcon block.');
 return targets.map((b,i)=>{if(scores[i].blockId!==b.id)throw Error('Metcon block mismatch.');return {blockId:b.id,metcon:structuredClone(b.metcon),score:prepareMetconScore(scores[i].score,b.metcon)};});
}
export function metconKey(m){
 // Names are labels; ordered structure, targets, units and instructions define the test.
 return JSON.stringify([m.scoreType,m.format||'standard',m.repScheme,m.rounds??null,m.durationSeconds??null,m.timeCapSeconds??null,m.workSeconds??null,m.restSeconds??null,m.notes||'',m.movements.map(v=>[v.exerciseId,v.reps??null,v.distance==null?null:+convertDistance(v.distance,v.distanceUnit,'m').toFixed(4),v.calories??null,v.load==null?null:+convertWeight(v.load,v.loadUnit,'lbs').toFixed(4),v.minute??null,v.notes||''])]);
}
export function scoreText(s){return [s.timeSeconds!=null?formatTime(s.timeSeconds):null,s.rounds!=null?`${s.rounds} rounds + ${s.reps??0} reps`:s.reps!=null?`${s.reps} reps`:null,s.completed!=null?(s.completed?'Completed':'Not completed'):null,s.successfulMinutes!=null?`${s.successfulMinutes} successful minutes`:null,s.load!=null?`${s.load} ${s.loadUnit}`:null,s.rx].filter(Boolean).join(' · ');}

export function referencesExercise(value,id){if(!value||typeof value!=='object')return false;if(value.exerciseId===id)return true;return Object.values(value).some(v=>referencesExercise(v,id));}

export function preparePerformedMovement(v){
 if(!v||typeof v!=='object'||!text(v.exerciseName,200)||!v.exerciseName.trim()||(v.exerciseId!=null&&!text(v.exerciseId,200)))throw Error('Name the performed or substitute movement.');
 const out={exerciseId:v.exerciseId??null,exerciseName:v.exerciseName.trim()};
 for(const k of ['reps','distance','calories','load','minute'])if(v[k]!=null){if(!numeric(v[k],k==='distance'?1000000:10000))throw Error('Check performed movement targets.');out[k]=v[k];}
 if(v.repScheme!=null){if(!Array.isArray(v.repScheme)||v.repScheme.length>100||v.repScheme.some(n=>!Number.isInteger(n)||n<1||n>10000))throw Error('Check performed rep scheme.');out.repScheme=[...v.repScheme];}
 if(v.distance!=null){convertDistance(v.distance,v.distanceUnit,'m');out.distanceUnit=v.distanceUnit;}
 if(v.load!=null){if(!['lbs','kg'].includes(v.loadUnit))throw Error('Choose performed load units.');out.loadUnit=v.loadUnit;}
 if(!text(v.notes||''))throw Error('Check performed movement notes.');if(v.notes)out.notes=v.notes;return out;
}
export function performanceMovementKey(movements,scheme=[]){return JSON.stringify(movements.map(v=>[v.exerciseId||v.exerciseName.trim().toLowerCase(),v.reps??null,v.repScheme||scheme,v.distance==null?null:+convertDistance(v.distance,v.distanceUnit,'m').toFixed(4),v.calories??null,v.load==null?null:+convertWeight(v.load,v.loadUnit,'lbs').toFixed(4),v.minute??null]));}
