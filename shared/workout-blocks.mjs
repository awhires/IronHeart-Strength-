import {convertDistance} from './tracking.mjs';
import {convertWeight} from './ai/contract.mjs';
import {formatTime} from './time.mjs';
export const BLOCK_TYPES=['Strength','Hypertrophy','Metcon','Cardio','Accessory','Mobility / Recovery'];
export const SCORE_TYPES=['For Time','AMRAP','EMOM','Rounds for Time','Rounds + Reps','Time Cap','Load','Chipper','Intervals'];
export const SCORE_MODES={AMRAP:['rounds_reps','total_reps','rounds'],EMOM:['completed_minutes','completed_intervals','total_reps','completion','per_interval']};
export const defaultScoreMode=type=>type==='AMRAP'?'rounds_reps':type==='EMOM'?'completed_intervals':null;
export const metconScoreMode=m=>m.scoreMode||((m.scoreType==='AMRAP'||m.scoreType==='EMOM')?m.scoreType==='EMOM'?'completed_minutes':'rounds_reps':null);
export const definitionFields=type=>({AMRAP:['durationSeconds'],EMOM:['durationSeconds','intervalSeconds'],Intervals:['rounds','workSeconds','restSeconds'],'For Time':['repScheme','timeCapSeconds'],'Rounds for Time':['repScheme','rounds','timeCapSeconds'],'Rounds + Reps':['durationSeconds'],Chipper:['repScheme','timeCapSeconds'],'Time Cap':['repScheme','timeCapSeconds'],Load:[]})[type]||[];
const numeric=(v,max=86400)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const text=(v,max=2000)=>typeof v==='string'&&v.length<=max;
export const newMetcon=()=>({name:'',scoreType:'For Time',repScheme:[],movements:[],notes:''});
export function prepareMetcon(raw,library){
 const m=structuredClone(raw);
 if(!m||!text(m.name,200)||!m.name.trim()||!SCORE_TYPES.includes(m.scoreType)||!text(m.notes||'')||(m.benchmark!==undefined&&typeof m.benchmark!=='boolean'))throw Error('Name the Metcon and choose a scoring type.');
 if(m.format!=null&&!['standard','chipper','intervals'].includes(m.format))throw Error('Choose a valid Metcon format.');
 if(m.scoreMode!=null&&!(SCORE_MODES[m.scoreType]||[]).includes(m.scoreMode))throw Error('Choose a scoring mode for this workout type.');
 if(!Array.isArray(m.repScheme)||m.repScheme.length>100||m.repScheme.some(n=>!Number.isInteger(n)||n<1||n>1000))throw Error('Use a rep scheme such as 50-40-30-20-10.');
 for(const k of ['rounds','durationSeconds','timeCapSeconds','workSeconds','restSeconds','intervalSeconds'])if(m[k]!=null&&!numeric(m[k]))throw Error('Check Metcon rounds and times.');
 if(m.rounds!=null&&(!Number.isInteger(m.rounds)||m.rounds<1))throw Error('Rounds must be a positive whole number.');
 for(const k of ['durationSeconds','timeCapSeconds','workSeconds','intervalSeconds'])if(m[k]!=null&&m[k]<=0)throw Error('Prescribed durations and work intervals must be positive; leave them blank when unspecified.');
 if(m.scoreType==='EMOM'&&m.durationSeconds!=null){const explicitInterval=m.intervalSeconds!=null||m.scoreMode!=null;m.intervalSeconds=m.intervalSeconds??60;if(explicitInterval&&(!(m.intervalSeconds>0)||m.durationSeconds%m.intervalSeconds!==0||m.durationSeconds/m.intervalSeconds>100))throw Error('EMOM duration must contain 1–100 complete work intervals.');}
 if(!Array.isArray(m.movements)||!m.movements.length||m.movements.length>30)throw Error('Add 1–30 Metcon movements.');
 m.movements=m.movements.map(v=>{
  const e=library.find(e=>e.id===v.exerciseId);if(!e)throw Error('Choose a library movement.');
  for(const k of ['sets','reps','distance','calories','load','minute'])if(v[k]!=null&&!numeric(v[k],k==='distance'?1000000:10000))throw Error('Check movement targets.');
  if(v.sets!=null&&(!Number.isInteger(v.sets)||v.sets<1))throw Error('Metcon prescription sets must be a positive whole number.');
  if(v.load!=null&&!['lbs','kg'].includes(v.loadUnit))throw Error('Choose a load unit.');
  if(v.distance!=null)convertDistance(v.distance,v.distanceUnit,'m');
  if(!text(v.notes||''))throw Error('Check movement notes.');
  if(v.scalingOptions!=null&&(!Array.isArray(v.scalingOptions)||v.scalingOptions.length>10))throw Error('Use up to ten scaling options.');
  const scalingOptions=v.scalingOptions?.map(o=>preparePerformedMovement(o));
  return {exerciseId:e.id,exerciseName:e.name,...(scalingOptions?{scalingOptions}:{}),...Object.fromEntries(['sets','reps','distance','distanceUnit','calories','load','loadUnit','minute','notes'].filter(k=>v[k]!=null).map(k=>[k,v[k]]))};
 });return m;
}
export function scoreFields(type,cap,mode){if(type==='AMRAP')return ({rounds_reps:['rounds','reps'],total_reps:['totalReps'],rounds:['rounds']})[mode||'rounds_reps']||[];if(type==='EMOM')return ({completed_minutes:['completed','successfulMinutes','load'],completed_intervals:['successfulIntervals','load'],total_reps:['totalReps'],completion:['completed'],per_interval:['intervalResults']})[mode||'completed_minutes']||[];if(type==='Chipper')type='For Time';if(type==='Intervals')return ['completed','successfulMinutes','timeSeconds','load'];if(cap&&['For Time','Rounds for Time'].includes(type))return ['completed','timeSeconds','rounds','reps','load'];return ({'For Time':['timeSeconds','load'],'Rounds for Time':['timeSeconds','load'],'Rounds + Reps':['rounds','reps'],'Time Cap':['completed','timeSeconds','rounds','reps','load'],'Load':['load','reps','timeSeconds']})[type]||[];}
export function prepareMetconScore(raw,m){
 if(!raw||!['RX','Scaled','Modified'].includes(raw.rx)||!text(raw.notes||''))throw Error('Choose RX or scaled and check score notes.');
 if(raw.rx!=='RX'&&!raw.notes?.trim()&&!raw.performedMovements)throw Error('Describe the scaling so repeated results can be compared.');
 const out={rx:raw.rx,notes:raw.notes||''};
 if(raw.performedMovements!=null){if(!Array.isArray(raw.performedMovements)||raw.performedMovements.length!==m.movements.length)throw Error('Preserve one performed movement for each programmed movement.');out.performedMovements=raw.performedMovements.map(preparePerformedMovement);if(raw.rx==='RX'&&performanceMovementKey(out.performedMovements,m.repScheme)!==performanceMovementKey(m.movements,m.repScheme))throw Error('Movement changes must be marked Scaled or Modified.');}
 const mode=metconScoreMode(m);if(m.scoreMode)out.scoreMode=mode;
 for(const k of scoreFields(m.scoreType,m.timeCapSeconds,mode))if(raw[k]!=null&&raw[k]!==''){
  if(k==='completed'){if(typeof raw[k]!=='boolean')throw Error('Choose completed or failed.');}
  else if(k==='intervalResults'){if(!Array.isArray(raw[k])||raw[k].length!==m.durationSeconds/m.intervalSeconds)throw Error('Log every prescribed EMOM interval.');out[k]=raw[k].map((v,i)=>{if(typeof v?.completed!=='boolean'||v.reps!=null&&(!Number.isInteger(v.reps)||!numeric(v.reps,10000))||v.load!=null&&(!numeric(v.load,10000)||!['lbs','kg'].includes(v.loadUnit||'lbs')))throw Error(`Check EMOM interval ${i+1}.`);return {completed:v.completed,...(v.reps!=null?{reps:v.reps}:{}),...(v.load!=null?{load:v.load}:{}),...(v.load!=null?{loadUnit:v.loadUnit||'lbs'}:{})};});}
  else if(!numeric(raw[k])||(['rounds','reps','successfulMinutes','successfulIntervals','totalReps'].includes(k)&&!Number.isInteger(raw[k])))throw Error('Check Metcon result.');out[k]=raw[k];
 }
 if(m.timeCapSeconds&&['For Time','Rounds for Time','Chipper'].includes(m.scoreType)&&out.completed==null&&out.timeSeconds>0)out.completed=true;
 if(['For Time','Rounds for Time','Chipper'].includes(m.scoreType)&&out.completed!==false&&!(out.timeSeconds>0))throw Error('Enter completion time.');
 if(m.scoreType==='AMRAP'&&((mode==='rounds_reps'&&(!Number.isInteger(out.rounds)||!Number.isInteger(out.reps)))||(mode==='rounds'&&!Number.isInteger(out.rounds))||(mode==='total_reps'&&!Number.isInteger(out.totalReps))))throw Error('Enter the selected AMRAP result.');
 if(m.scoreType==='Rounds + Reps'&&(!numeric(out.rounds)||!numeric(out.reps)))throw Error('Enter rounds and additional reps (zero is allowed).');
 if(m.scoreType==='EMOM'&&((mode==='completed_minutes'&&(typeof out.completed!=='boolean'||!Number.isInteger(out.successfulMinutes)))||(mode==='completed_intervals'&&!Number.isInteger(out.successfulIntervals))||(mode==='total_reps'&&!Number.isInteger(out.totalReps))||(mode==='completion'&&typeof out.completed!=='boolean')||(mode==='per_interval'&&!Array.isArray(out.intervalResults))))throw Error('Enter the selected EMOM result.');
 if(m.scoreType==='Intervals'&&(typeof out.completed!=='boolean'||!numeric(out.successfulMinutes)))throw Error('Enter completion and successful intervals.');
 if(m.scoreType==='EMOM'&&out.successfulMinutes>Math.ceil(m.durationSeconds/60))throw Error('Successful minutes exceed the EMOM duration.');
 if(m.scoreType==='EMOM'&&out.successfulIntervals>m.durationSeconds/m.intervalSeconds)throw Error('Successful intervals exceed the EMOM duration.');
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
 return JSON.stringify([m.scoreType,m.scoreMode||null,m.scoreType==='EMOM'?m.intervalSeconds??60:null,m.format||'standard',m.repScheme,m.rounds??null,m.durationSeconds??null,m.timeCapSeconds??null,m.workSeconds??null,m.restSeconds??null,m.notes||'',m.movements.map(v=>[v.exerciseId,v.sets??null,v.reps??null,v.distance==null?null:+convertDistance(v.distance,v.distanceUnit,'m').toFixed(4),v.calories??null,v.load==null?null:+convertWeight(v.load,v.loadUnit,'lbs').toFixed(4),v.minute??null,v.notes||''])]);
}
export function scoreText(s){return [s.timeSeconds!=null?formatTime(s.timeSeconds):null,s.totalReps!=null?`${s.totalReps} total reps`:null,s.rounds!=null?(s.scoreMode==='rounds'?`${s.rounds} rounds`:`${s.rounds} rounds + ${s.reps??0} reps`):s.reps!=null?`${s.reps} reps`:null,s.completed!=null?(s.completed?'Completed':'Not completed'):null,s.successfulMinutes!=null?`${s.successfulMinutes} successful minutes`:null,s.successfulIntervals!=null?`${s.successfulIntervals} successful intervals`:null,s.intervalResults!=null?`${s.intervalResults.filter(v=>v.completed).length}/${s.intervalResults.length} intervals completed`:null,s.load!=null?`${s.load} ${s.loadUnit}`:null,s.rx].filter(Boolean).join(' · ');}

export function referencesExercise(value,id){if(!value||typeof value!=='object')return false;if(value.exerciseId===id)return true;return Object.values(value).some(v=>referencesExercise(v,id));}

export function preparePerformedMovement(v){
 if(!v||typeof v!=='object'||!text(v.exerciseName,200)||!v.exerciseName.trim()||(v.exerciseId!=null&&!text(v.exerciseId,200)))throw Error('Name the performed or substitute movement.');
 const out={exerciseId:v.exerciseId??null,exerciseName:v.exerciseName.trim()};
 for(const k of ['sets','reps','distance','calories','load','minute'])if(v[k]!=null){if(!numeric(v[k],k==='distance'?1000000:10000)||k==='sets'&&(!Number.isInteger(v[k])||v[k]<1))throw Error('Check performed movement targets.');out[k]=v[k];}
 if(v.repScheme!=null){if(!Array.isArray(v.repScheme)||v.repScheme.length>100||v.repScheme.some(n=>!Number.isInteger(n)||n<1||n>10000))throw Error('Check performed rep scheme.');out.repScheme=[...v.repScheme];}
 if(v.distance!=null){convertDistance(v.distance,v.distanceUnit,'m');out.distanceUnit=v.distanceUnit;}
 if(v.load!=null){if(!['lbs','kg'].includes(v.loadUnit))throw Error('Choose performed load units.');out.loadUnit=v.loadUnit;}
 if(!text(v.notes||''))throw Error('Check performed movement notes.');if(v.notes)out.notes=v.notes;return out;
}
export function performanceMovementKey(movements,scheme=[]){return JSON.stringify(movements.map(v=>[v.exerciseId||v.exerciseName.trim().toLowerCase(),v.sets??null,v.reps??null,v.repScheme||scheme,v.distance==null?null:+convertDistance(v.distance,v.distanceUnit,'m').toFixed(4),v.calories??null,v.load==null?null:+convertWeight(v.load,v.loadUnit,'lbs').toFixed(4),v.minute??null]));}
