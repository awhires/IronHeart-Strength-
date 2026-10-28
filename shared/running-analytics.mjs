import {cardioMetrics} from './cardio-stats.mjs';
import {convertDistance,trackingProfile} from './tracking.mjs';
import {scoredBenchmarkAttempt} from './benchmark-attempts.mjs';

const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export const SIX_MINUTE_TEST_SECONDS=360;
export const SIX_MINUTE_TEST_TOLERANCE_SECONDS=5;
const dateOf=log=>log.workoutDate||log.createdAt?.slice(0,10)||'';
const running=(exerciseId,library)=>['running','treadmill'].includes(trackingProfile(library.find(e=>e.id===exerciseId)));
const workSets=(log,exerciseId)=>log.status==='skipped'?[]:(log.exercises||[]).filter(e=>e.exerciseId===exerciseId&&e.status!=='skipped').flatMap(e=>(e.sets||[]).filter(s=>s.completed!==false));

// A six-minute result is a field-test velocity proxy only. It is never a VO2 measurement.
export function sixMinuteAssessment(log,definition,library){
 if(definition?.scoring?.protocol!=='six_minute_max_run'||definition.scoring.type!=='greatest_distance'||definition.scoring.durationSeconds!==SIX_MINUTE_TEST_SECONDS||!running(definition.scoring.exerciseId,library)||log.athleteId==null||log.benchmarkId!==definition.id)return null;
 // Assessment qualification is based on linked, confirmed actual test data.
 // Benchmark score-signature matching remains in benchmark-history comparisons,
 // but must not reject an otherwise valid actual six-minute field test.
 const entries=(log.exercises||[]).filter(e=>e.exerciseId===definition.scoring.exerciseId&&e.status!=='skipped');
 const rawRows=entries.flatMap(e=>e.sets||[]),rows=workSets(log,definition.scoring.exerciseId).map(s=>cardioMetrics(s,'running'));
 const actualSeconds=rows.every(r=>positive(r.seconds))?rows.reduce((n,r)=>n+r.seconds,0):null;
 const actualMeters=rows.every(r=>positive(r.meters))?rows.reduce((n,r)=>n+r.meters,0):null;
 const maximal=log.assessmentMaximal===true;
 const qualified=log.status==='completed'&&maximal&&rows.length===1&&positive(actualMeters)&&actualSeconds!=null&&Math.abs(actualSeconds-SIX_MINUTE_TEST_SECONDS)<=SIX_MINUTE_TEST_TOLERANCE_SECONDS;
 const reason=qualified?null:log.status!=='completed'?'Workout must be completed.':!maximal?'Maximal effort was not confirmed; this cannot be inferred from the result.':rawRows.some(s=>s.completed===false)?'The running effort is marked incomplete.':entries.length!==1||rawRows.length!==1?'Record one continuous six-minute effort.':!positive(actualMeters)||actualSeconds==null?'Actual distance and elapsed time are required.':Math.abs(actualSeconds-SIX_MINUTE_TEST_SECONDS)>SIX_MINUTE_TEST_TOLERANCE_SECONDS?'Elapsed time must be approximately 6:00.':'Assessment requirements were not met.';
 return {logId:log.id,athleteId:log.athleteId,benchmarkId:definition.id,date:dateOf(log),meters:actualMeters,seconds:actualSeconds,velocityMps:qualified?actualMeters/actualSeconds:null,maximal,qualified,notes:log.notes||'',reason};
}

export function runningAssessments(logs,definitions,library,athleteId){
 const byId=new Map((definitions||[]).filter(d=>d.scoring?.protocol==='six_minute_max_run').map(d=>[d.id,d]));
 const owned=(logs||[]).filter(l=>l.athleteId===athleteId),linked=owned.filter(l=>byId.has(l.benchmarkId)).map(l=>sixMinuteAssessment(l,byId.get(l.benchmarkId),library)).filter(Boolean),seen=new Set(linked.map(row=>row.logId));
 // Older assigned-session logs did not carry a benchmark ID or confirmation.
 // Show a conservative diagnostic when the exact saved session and exercise match;
 // never qualify these records or infer maximal effort.
 const unlinked=[];
 for(const log of owned){
  if(seen.has(log.id)||log.benchmarkId||!byId.size)continue;
  const definition=[...byId.values()].find(d=>(log.sessionName||'').trim().toLocaleLowerCase()===(d.session?.name||d.name||'').trim().toLocaleLowerCase()&&(log.exercises||[]).some(e=>e.exerciseId===d.scoring.exerciseId));
  if(!definition)continue;
  const rows=workSets(log,definition.scoring.exerciseId).map(s=>cardioMetrics(s,'running'));
  const meters=rows.length&&rows.every(row=>positive(row.meters))?rows.reduce((sum,row)=>sum+row.meters,0):null;
  const seconds=rows.length&&rows.every(row=>positive(row.seconds))?rows.reduce((sum,row)=>sum+row.seconds,0):null;
  const reason=log.status!=='completed'?'Workout must be completed.':!rows.length||!positive(meters)||seconds==null?'Actual distance and elapsed time are required.':'This saved session was logged without a benchmark link or maximal-effort confirmation; it cannot qualify retroactively.';
  unlinked.push({logId:log.id,athleteId:log.athleteId,benchmarkId:definition.id,date:dateOf(log),meters,seconds,velocityMps:null,maximal:null,qualified:false,notes:log.notes||'',reason});seen.add(log.id);
 }
 return [...linked,...unlinked].sort((a,b)=>a.date.localeCompare(b.date)||a.logId.localeCompare(b.logId));
}

export function runningTimeTrials(logs,definitions,library,athleteId){
 const byId=new Map((definitions||[]).filter(d=>d.scoring?.type==='fastest_time'&&running(d.scoring.exerciseId,library)).map(d=>[d.id,d]));
 return (logs||[]).filter(l=>l.athleteId===athleteId&&byId.has(l.benchmarkId)).map(l=>{const d=byId.get(l.benchmarkId),score=scoredBenchmarkAttempt(l,d);return score?{logId:l.id,date:dateOf(l),meters:d.scoring.distanceMeters,seconds:score.value,velocityMps:d.scoring.distanceMeters/score.value,method:'Recorded fixed-distance time trial',benchmarkId:d.id}:null;}).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
}

// Multipliers are transparent coaching starting bands, not measured physiological zones.
// A short test cannot determine an athlete's lactate threshold or oxygen consumption.
export const SIX_MINUTE_VELOCITY_BANDS=Object.freeze({easy:[0.55,0.7],threshold:[0.75,0.85],vo2Intervals:[0.9,1.05],shortIntervals:[1.05,1.15]});
export function runningPaceRecommendations({assessments=[],timeTrials=[],unit='mi'}={}){
 if(!['mi','km'].includes(unit))throw Error('Running pace unit must be mi or km.');
 const valid=assessments.filter(a=>a.qualified&&positive(a.velocityMps));
 const source=valid.at(-1)||null;
 const paceFor=speed=>convertDistance(1,unit,'m')/speed;
 const bands=source?Object.fromEntries(Object.entries(SIX_MINUTE_VELOCITY_BANDS).map(([key,[low,high]])=>[key,{minPaceSeconds:paceFor(source.velocityMps*high),maxPaceSeconds:paceFor(source.velocityMps*low),method:'Six-minute field-test velocity band (coach starting estimate)',sourceLogId:source.logId,sourceDate:source.date}])):{};
 const trials=timeTrials.filter(t=>positive(t.velocityMps));
 const mile=trials.filter(t=>Math.abs(t.meters-1609.344)/1609.344<=0.005).at(-1)||null;
 const fourHundred=trials.filter(t=>Math.abs(t.meters-400)/400<=0.005).at(-1)||null;
 return {unit,source,bands,observed:{mile:mile?{paceSeconds:paceFor(mile.velocityMps),date:mile.date,logId:mile.logId,method:'Observed mile time-trial pace'}:null,fourHundred:fourHundred?{paceSeconds:paceFor(fourHundred.velocityMps),date:fourHundred.date,logId:fourHundred.logId,method:'Observed 400 m time-trial pace'}:null}};
}

export function applyRunningPace(prescription,band,unit){
 if(!band||!['mi','km'].includes(unit))throw Error('Choose a valid running recommendation.');
 const paceSeconds=Math.round((band.minPaceSeconds+band.maxPaceSeconds)/2);
 const metrics={...prescription.metrics,paceSeconds,paceUnit:unit};
 const intervals=(prescription.intervals||[]).map(block=>block.segments?{...block,segments:block.segments.map(segment=>segment.kind==='recovery'?segment:{...segment,metrics:{...segment.metrics,paceSeconds,paceUnit:unit}})}:{...block,work:{...block.work,paceSeconds,paceUnit:unit}});
 return {...prescription,metrics,...(intervals.length?{intervals}:{}),paceRecommendation:{method:band.method,sourceLogId:band.sourceLogId,sourceDate:band.sourceDate,selectedPaceSeconds:paceSeconds,unit}};
}

export function runningIntervalFatigue(log,exerciseId,library){
 if(!running(exerciseId,library)||log.status==='skipped')return {status:'Insufficient data',intervals:[]};
 const entries=(log.exercises||[]).filter(e=>e.exerciseId===exerciseId&&e.status!=='skipped');
 const all=entries.flatMap(e=>{const kinds=(e.target?.intervals||[]).flatMap(block=>Array.from({length:block.rounds??1},()=>block.segments?.length?block.segments.map(segment=>segment.kind||'work'):['work']).flat());return (e.sets||[]).map((set,index)=>({set,index,kind:kinds[index]||'work',target:e.target})).filter(row=>row.kind!=='recovery');});
 const completed=all.filter(x=>x.set.completed!==false).map(x=>({...x,metrics:cardioMetrics(x.set,'running')}));
 const intervals=completed.filter(x=>positive(x.metrics.meters)&&positive(x.metrics.seconds)).map((x,index)=>({index:index+1,meters:x.metrics.meters,seconds:x.metrics.seconds,speedMps:x.metrics.meters/x.metrics.seconds,recoverySeconds:positive(x.set.recoverySeconds)?x.set.recoverySeconds:null}));
 const missing=all.length-intervals.length;
 if(intervals.length<2)return {status:'Insufficient data',intervals,missing};
 const durations=intervals.map(x=>x.seconds),min=Math.min(...durations),max=Math.max(...durations);
 if(max/min>1.1)return {status:'Non-comparable interval durations',intervals,missing};
 const speeds=intervals.map(x=>x.speedMps),mean=speeds.reduce((a,b)=>a+b,0)/speeds.length;
 const fastest=intervals.reduce((a,b)=>a.speedMps>b.speedMps?a:b),slowest=intervals.reduce((a,b)=>a.speedMps<b.speedMps?a:b);
 const totalMeters=intervals.reduce((n,x)=>n+x.meters,0),totalSeconds=intervals.reduce((n,x)=>n+x.seconds,0);
 const changePercent=(intervals.at(-1).speedMps/intervals[0].speedMps-1)*100;
 const half=Math.floor(intervals.length/2),early=intervals.slice(0,half),late=intervals.slice(-half),speed=rows=>rows.reduce((n,x)=>n+x.meters,0)/rows.reduce((n,x)=>n+x.seconds,0),earlySpeedMps=speed(early),lateSpeedMps=speed(late);
 const fatiguePercent=(earlySpeedMps-lateSpeedMps)/earlySpeedMps*100;
 return {status:missing?'Partial data':'Comparable',intervals,missing,totalMeters,totalSeconds,averageSpeedMps:totalMeters/totalSeconds,fastest,slowest,changePercent,earlySpeedMps,lateSpeedMps,fatiguePercent,intervalsPerHalf:half,variabilityPercent:Math.sqrt(speeds.reduce((n,x)=>n+(x-mean)**2,0)/speeds.length)/mean*100,recoverySeconds:intervals.reduce((n,x)=>n+(x.recoverySeconds||0),0),recordedRecoveries:intervals.filter(x=>x.recoverySeconds!=null).length,trend:changePercent<0?'Slowed':changePercent>0?'Faster':'Unchanged'};
}

export function runningFatigueInsight(analysis){
 if(!analysis||!['Comparable','Partial data'].includes(analysis.status)||!Number.isFinite(analysis.fatiguePercent))return {statement:'Insufficient comparable completed work intervals for a pace interpretation.',suggestion:'Record actual time and distance or pace for at least two similar work intervals.'};
 const amount=Math.abs(analysis.fatiguePercent).toFixed(1),partial=analysis.missing?` ${analysis.missing} incomplete or unmeasured intervals were excluded.`:'';
 if(analysis.fatiguePercent>0)return {statement:`Average running speed in the last ${analysis.intervalsPerHalf} intervals was ${amount}% lower than in the first ${analysis.intervalsPerHalf}.${partial}`,suggestion:'Review the starting pace and actual recovery before changing the next prescription. A repeated pattern can inform repeat-interval endurance work.'};
 return {statement:`Average running speed in the last ${analysis.intervalsPerHalf} intervals was ${analysis.fatiguePercent<0?`${amount}% higher`:'the same'} as in the first ${analysis.intervalsPerHalf}.${partial}`,suggestion:'Pace was maintained or improved in this session. Keep the current prescription or review progression alongside other recent results.'};
}

export function comparableRunningIntervalHistory(logs,exerciseId,library,athleteId){
 const rows=(logs||[]).filter(log=>log.athleteId===athleteId).map(log=>({log,analysis:runningIntervalFatigue(log,exerciseId,library)})).filter(row=>row.analysis.status==='Comparable').sort((a,b)=>dateOf(a.log).localeCompare(dateOf(b.log))||String(a.log.id).localeCompare(String(b.log.id)));
 return rows.map((row,index)=>{
  const previous=rows.slice(0,index).reverse().find(candidate=>{
   if(row.log.benchmarkId||candidate.log.benchmarkId){if(!row.log.benchmarkId||row.log.benchmarkId!==candidate.log.benchmarkId||row.log.benchmarkSignature!==candidate.log.benchmarkSignature)return false;}
   else if((row.log.sessionName||'').trim().toLowerCase()!==(candidate.log.sessionName||'').trim().toLowerCase())return false;
   const a=row.analysis.intervals,b=candidate.analysis.intervals;
   return a.length===b.length&&a.every((interval,i)=>Math.max(interval.seconds,b[i].seconds)/Math.min(interval.seconds,b[i].seconds)<=1.1);
  });
  const recoveryComparable=previous&&row.analysis.recordedRecoveries>=row.analysis.intervals.length-1&&previous.analysis.recordedRecoveries>=previous.analysis.intervals.length-1&&Math.abs(row.analysis.recoverySeconds-previous.analysis.recoverySeconds)<=Math.max(row.analysis.recoverySeconds,previous.analysis.recoverySeconds)*0.1;
  return {...row,previousLogId:previous?.log.id||null,averageSpeedChangePercent:previous?(row.analysis.averageSpeedMps/previous.analysis.averageSpeedMps-1)*100:null,variabilityChangePoints:previous?row.analysis.variabilityPercent-previous.analysis.variabilityPercent:null,fatigueChangePoints:previous?row.analysis.fatiguePercent-previous.analysis.fatiguePercent:null,recoveryComparison:!previous?null:recoveryComparable?'Recorded recovery durations are similar.':'Recovery duration was different or not fully recorded; interpret the pace change with caution.'};
 });
}
