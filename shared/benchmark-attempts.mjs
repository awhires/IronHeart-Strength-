import {prepareSession} from './prescriptions.mjs';
import {metconKey,performanceMovementKey,scoreText} from './workout-blocks.mjs';
import {trackingProfile,convertDistance} from './tracking.mjs';
import {convertWeight} from './ai/contract.mjs';

const TYPES=['strength_load','fastest_time','greatest_distance','metcon'];
const dateOf=log=>log.workoutDate||log.createdAt?.slice(0,10)||'';
// Structural equality is intentional: no lossy hash may group different tests.
const signature=value=>JSON.stringify(value);
// A definition is immutable. An edited program may produce a new definition, never rewrite this one.
export function prepareBenchmark(input,program,library,{id,coachId,createdAt}){
  if(!program||!Number.isInteger(input.week)||!Number.isInteger(input.session))throw Error('Choose a saved workout.');
  const source=program.plan?.find(w=>w.week===input.week)?.sessions?.[input.session]||(!program.plan&&input.week===1?program.sessions?.[input.session]:null);
  if(!source)throw Error('Workout was not found in this program.');
  const session=prepareSession(source,library),type=input.scoring?.type;
  if(!TYPES.includes(type))throw Error('Choose a supported benchmark scoring method.');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200||typeof(input.description??'')!=='string'||(input.description||'').length>2000)throw Error('Enter a benchmark name and optional description.');
  const scoring={type};
  if(type==='metcon'){
    const block=session.blocks?.find(b=>b.id===input.scoring.blockId&&b.type==='Metcon');
    if(!block)throw Error('Choose a Metcon block in this workout.');
    scoring.blockId=block.id;scoring.metconKey=metconKey(block.metcon);
  }else{
    const exercise=session.exercises.find(e=>e.exerciseId===input.scoring.exerciseId),profile=trackingProfile(library.find(e=>e.id===exercise?.exerciseId));
    if(!exercise)throw Error('Choose an exercise in this workout.');
    scoring.exerciseId=exercise.exerciseId;
    if(type==='strength_load'){
      if(profile!=='strength'||!Number.isInteger(input.scoring.reps)||input.scoring.reps<1||input.scoring.reps>100)throw Error('Choose a strength exercise and exact rep count.');
      scoring.reps=input.scoring.reps;
    }else{
      if(!['running','treadmill','cycling','erg','swimming','cardio','stairs'].includes(profile))throw Error('Choose a cardio exercise.');
      if(type==='fastest_time'){
        const distance=input.scoring.distanceMeters;
        if(typeof distance!=='number'||!Number.isFinite(distance)||distance<=0||distance>1000000)throw Error('Fastest time needs a fixed comparison distance in meters.');
        scoring.distanceMeters=distance;
      }else{
        const seconds=input.scoring.durationSeconds;
        if(!Number.isInteger(seconds)||seconds<1||seconds>86400)throw Error('Greatest distance needs a fixed duration in seconds.');
        scoring.durationSeconds=seconds;
        if(input.scoring.protocol!==undefined){
          if(input.scoring.protocol!=='six_minute_max_run'||seconds!==360||!['running','treadmill'].includes(profile))throw Error('Six-minute maximal-effort assessment requires a running exercise and a 360-second test.');
          const prescribed=exercise.metrics?.durationSeconds===360&&!(exercise.intervals?.length)&&(!exercise.intervalCount||exercise.intervalCount===1);
          if(!prescribed)throw Error('Prescribe one six-minute running effort in the workout before saving this assessment.');
          scoring.protocol='six_minute_max_run';
        }
      }
    }
  }
  const definition={id,coachId,programId:program.id,week:input.week,sessionIndex:input.session,name:input.name.trim(),description:input.description||'',session:structuredClone(session),scoring,createdAt};
  return {...definition,signature:benchmarkSignature(definition)};
}
export function benchmarkSignature(definition){return signature({exercises:definition.session.exercises,blocks:definition.session.blocks||[],scoring:definition.scoring});}
export function benchmarkAttemptSignature(exercises,blocks,scoring){return signature({exercises:exercises.map(e=>e.target),blocks:blocks||[],scoring});}
function matchingSignature(actual,expected){
 if(actual===expected)return true;
 try{
  const normalize=raw=>{const data=JSON.parse(raw);for(const exercise of data.exercises||[])if(exercise?.trackingType&&exercise.trackingType!=='strength'&&exercise.restSeconds===0)delete exercise.restSeconds;return JSON.stringify(data);};
  return normalize(actual)===normalize(expected);
 }catch{return false;}
}
export function scoredBenchmarkAttempt(log,definition){
  const scoring=definition.scoring;
  // A six-minute field test is the same comparison when its linked definition,
  // running exercise, actual continuous duration and actual distance are intact.
  // Prescription snapshots may differ on legacy assigned logs; other benchmark
  // types still require an exact structural signature.
  if(log.benchmarkId!==definition.id||scoring.protocol!=='six_minute_max_run'&&!matchingSignature(log.benchmarkSignature,definition.signature)||log.status&&log.status!=='completed')return null;
  if(scoring.type==='metcon'){
    const row=log.blockResults?.find(r=>r.blockId===scoring.blockId&&r.status!=='skipped'&&metconKey(r.metcon)===scoring.metconKey);
    if(!row?.score)return null;
    const score=row.score,kind=row.metcon.scoreType,division=score.rx==='RX'?'RX':`${score.rx}:${performanceMovementKey(score.performedMovements||row.metcon.movements,row.metcon.repScheme)}`;
    let value,direction='higher',measure;
    if(kind==='For Time'||kind==='Rounds for Time'||kind==='Chipper'||kind==='Time Cap'){if(!(score.timeSeconds>0)||score.completed===false)return null;value=score.timeSeconds;direction='lower';measure='seconds';}
    else if(kind==='Load'){if(!(score.load>0))return null;value=convertWeight(score.load,score.loadUnit,'lbs');measure='lb';}
    else if(Number.isInteger(score.rounds)){value=score.rounds*100000+(score.reps||0);measure='rounds_reps';}
    else if(Number.isInteger(score.totalReps)){value=score.totalReps;measure='reps';}
    else if(Number.isInteger(score.successfulIntervals)){value=score.successfulIntervals;measure='intervals';}
    else return null;
    return {id:log.id,date:dateOf(log),value,direction,measure,division,label:scoreText(score)};
  }
  const rows=(log.exercises||[]).filter(e=>e.exerciseId===scoring.exerciseId&&e.status!=='skipped').flatMap(e=>(e.sets||[]).filter(s=>s.completed!==false));
  let candidates=[];
  if(scoring.type==='strength_load')candidates=rows.filter(s=>s.reps===scoring.reps&&s.load!=null).map(s=>({value:convertWeight(s.load,s.loadUnit||'lbs','lbs'),label:`${s.load} ${s.loadUnit||'lbs'} × ${s.reps}`}));
  if(scoring.type==='fastest_time')candidates=rows.filter(s=>s.distance>0&&s.durationSeconds>0&&Math.abs(convertDistance(s.distance,s.distanceUnit||'m','m')-scoring.distanceMeters)/scoring.distanceMeters<=0.005).map(s=>({value:s.durationSeconds,label:`${s.durationSeconds}s for ${s.distance} ${s.distanceUnit||'m'}`}));
  if(scoring.type==='greatest_distance'){
    const tolerance=scoring.protocol==='six_minute_max_run'?5:1;
    candidates=rows.filter(s=>s.distance>0&&s.durationSeconds>0&&Math.abs(s.durationSeconds-scoring.durationSeconds)<=tolerance).map(s=>({value:convertDistance(s.distance,s.distanceUnit||'m','m'),label:`${s.distance} ${s.distanceUnit||'m'} in ${s.durationSeconds}s`}));
  }
  if(rows.length>1&&rows.every(s=>s.distance>0&&s.durationSeconds>0)){
    const meters=rows.reduce((sum,s)=>sum+convertDistance(s.distance,s.distanceUnit||'m','m'),0),seconds=rows.reduce((sum,s)=>sum+s.durationSeconds,0);
    if(scoring.type==='fastest_time'&&Math.abs(meters-scoring.distanceMeters)/scoring.distanceMeters<=0.005)candidates.push({value:seconds,label:`${seconds}s for ${Math.round(meters)} m of completed work intervals`});
    if(scoring.type==='greatest_distance'&&Math.abs(seconds-scoring.durationSeconds)<=1)candidates.push({value:meters,label:`${Math.round(meters)} m in ${seconds}s of completed work intervals`});
  }
  if(!candidates.length)return null;
  const direction=scoring.type==='fastest_time'?'lower':'higher';const best=candidates.reduce((a,b)=>direction==='lower'?(a.value<b.value?a:b):(a.value>b.value?a:b));
  return {id:log.id,date:dateOf(log),...best,direction,measure:scoring.type==='strength_load'?'lb':scoring.type==='fastest_time'?'seconds':'m',division:null};
}
export function benchmarkHistory(definition,logs){
  const attempts=logs.filter(l=>l.benchmarkId===definition.id).sort((a,b)=>dateOf(a).localeCompare(dateOf(b))||String(a.createdAt).localeCompare(String(b.createdAt))).map(log=>{const score=scoredBenchmarkAttempt(log,definition);return {logId:log.id,date:dateOf(log),status:log.status||(score?'completed':'partially_completed'),score};});
  const scored=attempts.filter(a=>a.score),latest=scored.at(-1),comparable=scored.filter(a=>a.score.division===latest?.score.division),previous=comparable.at(-2);
  const best=comparable.reduce((a,b)=>!a||(b.score.direction==='lower'?b.score.value<a.score.value:b.score.value>a.score.value)?b:a,null);
  const delta=latest&&previous?latest.score.value-previous.score.value:null;
  const meaningfulDelta=latest?.score.measure!=='rounds_reps';
  const label=delta==null?null:meaningfulDelta?`${delta>=0?'+':''}${Number(delta.toFixed(2))} ${latest.score.measure}`:latest.score.value>previous.score.value?'More rounds/reps':latest.score.value<previous.score.value?'Fewer rounds/reps':'Same rounds/reps';
  return {attempts,latest,previous:delta==null?null:previous,best,change:delta==null?null:{absolute:meaningfulDelta?delta:null,label,percent:meaningfulDelta&&previous.score.value?delta/previous.score.value*100:null,improved:latest.score.direction==='lower'?delta<0:delta>0}};
}
