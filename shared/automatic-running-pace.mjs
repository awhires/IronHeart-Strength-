import {runningAssessments,runningTimeTrials,runningPaceRecommendations,applyRunningPace} from './running-analytics.mjs';
import {RUNNING_PACE_SOURCES,validateRunningPaceMethod} from './running-pace-method.mjs';
import {convertDistance} from './tracking.mjs';

export {RUNNING_PACE_SOURCES,RUNNING_PACE_CATEGORIES,validateRunningPaceMethod} from './running-pace-method.mjs';

export function withoutAutomaticPace(item){
 if(item?.paceMethod?.type!=='assessment'||item.paceMethod.locked===true)return item;
 const strip=metrics=>{const next={...metrics};delete next.paceSeconds;delete next.paceUnit;return next;};
 const next={...item,metrics:strip(item.metrics||{})};delete next.paceRecommendation;
 if(item.intervals)next.intervals=item.intervals.map(b=>b.segments?{...b,segments:b.segments.map(s=>s.kind==='recovery'?s:{...s,metrics:strip(s.metrics||{})})}:{...b,work:strip(b.work||{})});
 return next;
}

export function resolveAutomaticRunningPace(item,{logs=[],definitions=[],library=[],athleteId}={}){
 const rule=item?.paceMethod;
 if(rule?.type!=='assessment'||rule.locked===true)return item;
 validateRunningPaceMethod(rule);
 const base=withoutAutomaticPace(item),assessments=runningAssessments(logs,definitions,library,athleteId),trials=runningTimeTrials(logs,definitions,library,athleteId);
 const recommendation=runningPaceRecommendations({assessments,timeTrials:trials,unit:rule.unit});
 const selected=rule.source==='six_minute'?recommendation.bands[rule.category]:rule.source==='mile'?recommendation.observed.mile:rule.source==='four_hundred'?recommendation.observed.fourHundred:trials.filter(trial=>trial.benchmarkId===rule.benchmarkId).at(-1);
 if(!selected)return {...base,paceRecommendation:{automatic:true,status:'unavailable',reason:`No qualifying ${RUNNING_PACE_SOURCES[rule.source].toLowerCase()} is recorded for this athlete.`}};
 const observedPace=rule.source==='benchmark'?convertDistance(1,rule.unit,'m')/selected.velocityMps:selected.paceSeconds;
 const band=rule.source==='six_minute'?selected:{minPaceSeconds:observedPace,maxPaceSeconds:observedPace,method:selected.method,sourceLogId:selected.logId,sourceDate:selected.date};
 const resolved=applyRunningPace(base,band,rule.unit);
 return {...resolved,paceRecommendation:{...resolved.paceRecommendation,automatic:true,status:'recommended',source:rule.source,category:rule.category}};
}

export function refreshAssignmentRunningPaces(assignment,context,completedLogs=[]){
 const next=structuredClone(assignment);let changed=0;
 for(const week of next.plan||[])for(let index=0;index<(week.sessions||[]).length;index++){
  const session=week.sessions[index];
  if(completedLogs.some(log=>log.assignmentId===next.id&&log.week===week.week&&log.session===index))continue;
  let updated=false;
  session.exercises=session.exercises.map(item=>{
   if(item.paceMethod?.type!=='assessment'||item.paceMethod.locked===true)return item;
   if(item.paceRecommendation?.automatic===true&&item.metrics?.paceSeconds!=null&&item.metrics.paceSeconds!==item.paceRecommendation.selectedPaceSeconds)return item;
   const resolved=resolveAutomaticRunningPace(item,{...context,athleteId:next.athleteId});
   if(stableJSON(resolved)===stableJSON(item))return item;
   updated=true;return resolved;
  });
  if(updated){session.prescriptionRevision=(session.prescriptionRevision||0)+1;changed++;}
 }
 return {assignment:changed?next:assignment,changed};
}

const stableJSON=value=>JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
