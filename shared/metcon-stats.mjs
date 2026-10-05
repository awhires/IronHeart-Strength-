import {metconKey,performanceMovementKey} from './workout-blocks.mjs';
import {convertWeight} from './ai/contract.mjs';
import {workoutDate} from './volume-stats.mjs';
export function metconPerformances(logs,athleteId){return logs.filter(l=>l.athleteId===athleteId).flatMap(l=>(l.blockResults||[]).map((r,i)=>({...r,id:l.id,index:i,date:workoutDate(l),key:metconKey(r.metcon)}))).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||String(a.id).localeCompare(String(b.id)));}
export function metconStats(logs,athleteId,key,rx='RX'){
 const all=metconPerformances(logs,athleteId).filter(r=>r.key===key&&r.score.rx===rx);
 const latest=all.at(-1),type=latest?.metcon.scoreType;
 // Scaled descriptions and actual loads must match before comparing results.
 const sessions=latest?all.filter(r=>(rx==='RX'||(r.score.performedMovements&&latest.score.performedMovements?performanceMovementKey(r.score.performedMovements,r.metcon.repScheme)===performanceMovementKey(latest.score.performedMovements,latest.metcon.repScheme):!r.score.performedMovements&&!latest.score.performedMovements&&r.score.notes===latest.score.notes))&&(type==='Load'||(r.score.load==null?null:convertWeight(r.score.load,r.score.loadUnit,'lbs'))===(latest.score.load==null?null:convertWeight(latest.score.load,latest.score.loadUnit,'lbs')))):[];
 const lower=['For Time','Rounds for Time','Time Cap','Chipper'].includes(type);
 const value=r=>lower?(r.score.completed===false?null:r.score.timeSeconds??null):type==='Load'?convertWeight(r.score.load,r.score.loadUnit,'lbs'):['EMOM','Intervals'].includes(type)?r.score.successfulMinutes:r.score.rounds*100000+r.score.reps;
 const valid=sessions.filter(r=>Number.isFinite(value(r))),previous=valid.at(-2)||null,best=valid.reduce((a,r)=>!a||(lower?value(r)<value(a):value(r)>value(a))?r:a,null);
 const improvement=latest&&previous&&value(latest)!=null?(value(latest)-value(previous))*(lower?-1:1):null;
 return {sessions,latest,previous,best,improvement,status:improvement==null?'Not enough comparable data':improvement>0?'Improving':improvement<0?'Declining':'Maintaining',points:valid.map(r=>({...r,value:value(r)}))};
}
