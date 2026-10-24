import {normalizePrescription,prescribedSets,validMaximum} from './prescriptions.mjs';
import {validateAdaptiveRule} from './adaptive-rules.mjs';
import {athleteStrengthProfile,NSCA_PERCENT} from './strength-progress.mjs';
import {convertWeight,roundAutomaticLoad,LOAD_MODE,LOAD_UNIT} from './ai/contract.mjs';
import {trackingProfile} from './tracking.mjs';
import {workoutDate} from './volume-stats.mjs';
import {scheduledDate} from './program-schedule.mjs';
const DAY=86400000;
const dateNumber=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?Date.parse(d+'T00:00:00Z'):NaN;
// Pure projection: never writes to a program, assignment, baseline or log.
export function recommendAthleteLoad(item,{athleteId,logs=[],library=[],manualPRs=[],assignmentId,week,session,date,today=workoutDate({createdAt:new Date().toISOString()})}={}){
 const e=normalizePrescription(item),rule=e.adaptiveProgression;
 if(!rule&&e.loadMode!==LOAD_MODE.PREVIOUS_PERFORMANCE&&!e.referenceLoad&&e.loadMode!==LOAD_MODE.PERCENTAGE)return null;
 const unavailable=reason=>({version:1,status:'unavailable',reason});
 if(e.referenceLoad){
  const ref=e.referenceLoad;
  if(library.find(x=>x.id===ref.exerciseId)?.name!=='Bench Press'||![55,60,65].includes(ref.percent))return {version:1,status:'review',reason:'Choose the Bench Press library exercise and 55%, 60% or 65%.'};
  const profile=athleteStrengthProfile(logs,ref.exerciseId,athleteId,library,today,[],manualPRs),baseline=profile.currentEstimate;
  if(!baseline)return {version:1,status:'needs_baseline',reason:'Bench Press baseline needed. Enter actual Speed Bench load; no weight was invented.'};
  const load=roundAutomaticLoad(convertWeight(baseline.oneRM*ref.percent/100,'lbs',e.loadUnit),e.loadUnit,e.increment);
  if(!Number.isFinite(load)||load<=0||convertWeight(load,e.loadUnit,LOAD_UNIT.LBS)>1200)return unavailable('Bench Press reference resolves outside supported load limits.');
  return {version:1,status:'recommended',load,loadUnit:e.loadUnit,baseline:{date:baseline.date,source:baseline.source||'strength profile',exerciseId:ref.exerciseId,kind:baseline.kind,manualPRId:baseline.performance?.manualPRId||null,oneRM:baseline.oneRM},reason:`${ref.percent}% of Bench Press 1RM (${baseline.source||'strength profile'}); rounded with the existing ${e.loadUnit==='lbs'?'5 lb':'kg'} load step.`,method:'Speed Bench percentage of Bench Press 1RM'};
 }
 if(e.loadMode===LOAD_MODE.PREVIOUS_PERFORMANCE){
  if(!['strength','loadedTimed','carry'].includes(trackingProfile({...library.find(x=>x.id===e.exerciseId),id:e.exerciseId,trackingType:e.trackingType})))return unavailable('Previous-performance loading is only available for weighted strength exercises.');
  const scheduled=dateNumber(date),cutoff=Number.isFinite(scheduled)?scheduled:dateNumber(today);
  const matches=(logs||[]).filter(l=>l.athleteId===athleteId&&l.status!=='skipped'&&!(assignmentId&&l.assignmentId===assignmentId&&l.week===week&&l.session===session)&&Number.isFinite(dateNumber(workoutDate(l)))&&dateNumber(workoutDate(l))<=cutoff)
   .flatMap(l=>(l.exercises||[]).flatMap((entry,exerciseIndex)=>entry.exerciseId===e.exerciseId&&entry.status!=='skipped'&&!entry.complex?.length&&entry.volumeEligible!==false?(entry.sets||[]).filter(s=>s.completed!==false&&!s.warmup&&!s.isWarmup&&s.type!=='warmup'&&Number.isFinite(s.load)&&s.load>0&&['lbs','kg'].includes(s.loadUnit??entry.target?.loadUnit??LOAD_UNIT.LBS)).map((set,setIndex)=>({log:l,entry,set,exerciseIndex,setIndex,date:workoutDate(l)})):[]))
   .sort((a,b)=>b.date.localeCompare(a.date)||(b.log.createdAt||'').localeCompare(a.log.createdAt||'')||b.exerciseIndex-a.exerciseIndex||b.setIndex-a.setIndex);
  const previous=matches[0];
  if(!previous)return {version:1,status:'needs_previous_performance',reason:'Choose load — no previous performance available for this exact exercise.'};
  const actualUnit=previous.set.loadUnit??previous.entry.target?.loadUnit??LOAD_UNIT.LBS;
  const prior=convertWeight(previous.set.load,actualUnit,e.loadUnit);
  const raw=prior+e.loadDelta;
  const load=roundAutomaticLoad(raw,e.loadUnit,e.increment);
  if(!Number.isFinite(load)||load<=0||convertWeight(load,e.loadUnit,LOAD_UNIT.LBS)>1200)return unavailable('Coach review needed: the previous performance change resolves outside supported load limits.');
  return {version:1,status:'recommended',load,loadUnit:e.loadUnit,baseline:{load:previous.set.load,loadUnit:actualUnit,date:previous.date,source:'actual workout performance',logId:previous.log.id,assignmentId:previous.log.assignmentId??null,week:previous.log.week??null,session:previous.log.session??null,exerciseId:e.exerciseId,exerciseIndex:previous.exerciseIndex,setIndex:previous.setIndex},delta:e.loadDelta,reason:`Previous actual performance ${previous.set.load} ${actualUnit} ${e.loadDelta<0?'−':'+'} ${Math.abs(e.loadDelta)} ${e.loadUnit}; automatic load rounded to ${e.loadUnit==='lbs'?'5 lb':'the existing kg increment'}.`,method:'previous actual exercise performance'};
 }
 if(e.loadMode===LOAD_MODE.PERCENTAGE&&!rule){
  const referenceExerciseId=e.referenceExerciseId||e.exerciseId;
  if(!library.some(x=>x.id===referenceExerciseId&&trackingProfile(x)==='strength'))return unavailable('Choose a valid strength reference exercise before calculating a percentage load.');
  const asOf=new Date(dateNumber(today)).toISOString().slice(0,10),profile=athleteStrengthProfile(logs.filter(l=>l.athleteId===athleteId),referenceExerciseId,athleteId,library,asOf,validMaximum(e.reference1RM,referenceExerciseId)?[e.reference1RM]:[],manualPRs);
  const selected=profile.currentEstimate||profile.referenceMaxima[0]&&{oneRM:profile.referenceMaxima[0].oneRM,date:profile.referenceMaxima[0].date,source:'coach reference maximum',kind:profile.referenceMaxima[0].type};
  if(!selected)return {version:1,status:'needs_baseline',reason:'Target weight unavailable — no strength baseline yet. Choose your actual load when you train.'};
  const load=roundAutomaticLoad(convertWeight(selected.oneRM*e.percent1RM/100,'lbs',e.loadUnit),e.loadUnit,e.increment);
  if(!Number.isFinite(load)||load<=0||convertWeight(load,e.loadUnit,LOAD_UNIT.LBS)>1200)return unavailable('The available strength baseline resolves outside supported load limits.');
  return {version:1,status:'recommended',load,loadUnit:e.loadUnit,baseline:{date:selected.date,source:selected.source||'strength profile',exerciseId:referenceExerciseId,kind:selected.kind,manualPRId:selected.performance?.manualPRId||null,oneRM:selected.oneRM},reason:`${e.percent1RM}% of ${e.referenceExerciseName||library.find(x=>x.id===referenceExerciseId)?.name||'the athlete strength baseline'} (${selected.source||'strength profile'}); rounded with the existing ${e.loadUnit==='lbs'?'5 lb':'kg'} load step.`,method:'percentage of athlete strength baseline'};
 }
 if(!rule)return null;
 try{validateAdaptiveRule(rule);}catch{return {status:'review',reason:'Coach progression rule needs review.'};}
 if(/Deload|Dynamic effort|Max effort/i.test(e.phase||''))return unavailable('Protect the coach-directed recovery, speed or max-effort prescription.');
 if(trackingProfile({...library.find(x=>x.id===e.exerciseId),id:e.exerciseId,trackingType:e.trackingType})!=='strength'||!['fixed','percentage','athlete_selected'].includes(e.loadMode))return unavailable('This target needs coach-directed loading.');
 const cutoff=dateNumber(today);
 const recent=logs.filter(l=>l.athleteId===athleteId&&!(assignmentId&&l.assignmentId===assignmentId&&l.week===week&&l.session===session)&&Number.isFinite(dateNumber(workoutDate(l)))&&dateNumber(workoutDate(l))<=cutoff&&cutoff-dateNumber(workoutDate(l))<=56*DAY)
  .flatMap(l=>(l.exercises||[]).filter(x=>x.exerciseId===e.exerciseId&&!x.complex?.length&&x.volumeEligible!==false).map(entry=>({log:l,entry,date:workoutDate(l)})))
  .sort((a,b)=>b.date.localeCompare(a.date)||(b.log.createdAt||'').localeCompare(a.log.createdAt||''));
 if(recent[0]?.log.pain||recent[0]?.log.readiness<=2)return unavailable('Recent pain or low readiness: coach review before recommending a load.');
 const candidates=[];
 if(validMaximum(e.reference1RM,e.exerciseId)&&dateNumber(e.reference1RM.date)<=cutoff&&cutoff-dateNumber(e.reference1RM.date)<=56*DAY)candidates.push({date:e.reference1RM.date,oneRM:convertWeight(e.reference1RM.value,e.reference1RM.unit,'lbs'),kind:e.reference1RM.type,source:'reference maximum'});
 const profile=athleteStrengthProfile(logs.filter(l=>l.athleteId===athleteId),e.exerciseId,athleteId,library,new Date(cutoff).toISOString().slice(0,10),validMaximum(e.reference1RM,e.exerciseId)?[e.reference1RM]:[],manualPRs);
 for(const evidence of [...profile.activeEvidence,...(profile.historicalManualBaseline?[profile.historicalManualBaseline]:[])]){const p=evidence.performance;candidates.push({date:p.date,load:p.loadLb,reps:p.reps,oneRM:evidence.oneRM,kind:evidence.kind==='manual'?'manual PR':'estimated from logged performance',source:evidence.source||'workout history',logId:p.logId,setIndex:p.setIndex,assignmentId:p.assignmentId,week:p.week,manualPRId:p.manualPRId});}
 candidates.sort((a,b)=>b.oneRM-a.oneRM||b.date.localeCompare(a.date));
 if(e.repMode==='max')return unavailable('Max-rep target: keep the coach load and record actual reps; no fixed rep target to translate.');
 const baseline=candidates.find(c=>e.loadMode==='percentage'?c.oneRM!=null:NSCA_PERCENT[e.reps]&&c.oneRM!=null);
 if(!baseline)return unavailable(recent.length?'Not enough qualifying performance data (for example, recent RPE 8–10 sets).':'Needs baseline data: log a comparable set or enter a dated reference maximum.');
 const rawLb=e.loadMode==='percentage'?baseline.oneRM*e.percent1RM/100:baseline.reps===e.reps?baseline.load:baseline.oneRM*NSCA_PERCENT[e.reps]*.9;
 if(!Number.isFinite(rawLb)||rawLb<=0)return unavailable('A valid load baseline is needed.');
 const base=convertWeight(rawLb,'lbs',e.loadUnit),increment=e.increment;
 const comparable=recent.filter((v,i,all)=>all.findIndex(x=>x.log.id===v.log.id)===i);
 const successful=comparable.length>=2&&comparable.slice(0,2).every(({log,entry})=>!log.pain&&log.readiness>=4&&entry.target?.reps===e.reps&&entry.sets?.length>=entry.target.sets&&entry.sets.every(s=>s.completed!==false&&!s.warmup&&!s.isWarmup&&s.reps>=e.reps&&Number.isFinite(s.rpe)&&s.rpe>=1&&s.rpe<=8&&['lbs','kg'].includes(s.loadUnit??entry.target.loadUnit??'lbs')&&convertWeight(s.load,s.loadUnit??entry.target.loadUnit??'lbs',e.loadUnit)>=base));
 // At most one unperformed weekly increase. Never compound hypothetical sessions.
 const nextWeek=(assignmentId&&baseline.assignmentId===assignmentId&&Number.isInteger(baseline.week)&&week>baseline.week)||(Number.isFinite(dateNumber(date))&&dateNumber(date)-dateNumber(baseline.date)>=7*DAY);
 const percent=nextWeek?(successful?rule.maxPercent:rule.minPercent):0;
 const ceiling=base*(1+(nextWeek?rule.maxPercent:0)/100),desired=base*(1+percent/100);
 let load=roundAutomaticLoad(desired,e.loadUnit,increment);
 if(load<=0||convertWeight(load,e.loadUnit,'lbs')>1200)return unavailable('Coach review needed: the available increment or load is outside supported limits.');
 const belowMinimum=nextWeek&&load<base*(1+rule.minPercent/100)-1e-8;
 // If rounding cannot honor the minimum, hold rather than secretly exceed the maximum.
 if(belowMinimum){const up=roundAutomaticLoad(base*(1+rule.minPercent/100),e.loadUnit,increment);if(up<=ceiling+1e-8)load=up;else load=roundAutomaticLoad(base,e.loadUnit,increment);}
 return {version:1,status:'recommended',load,loadUnit:e.loadUnit,baseline,rule:{...rule},increasePercent:Number(((load/base-1)*100).toFixed(3)),reason:nextWeek?'One weekly step within the coach range; rounding may hold the load.':'Baseline load; no additional increase within the same week.',method:e.loadMode==='percentage'?'percentage of baseline maximum':baseline.reps===e.reps?'comparable actual reps':'90% of NSCA rep-max estimate'};
}
export function sessionRecommendations(assignment,week,session,logs,library,today,manualPRs=[]){
 const target=assignment.plan.find(w=>w.week===week)?.sessions[session];if(!target)return [];
 const date=scheduledDate(assignment,week,session);
 return target.exercises.map((e,ei)=>{
 const rule=resolvedCoachRule(e,assignment,session,ei);
 const modes=e.loadMode===LOAD_MODE.PREVIOUS_PERFORMANCE;
 return rule||modes||e.referenceLoad||e.loadMode===LOAD_MODE.PERCENTAGE?(prescribedSets(e).length?prescribedSets(e):[e]).map(t=>recommendAthleteLoad({...t,...(rule?{adaptiveProgression:rule}:{})},{athleteId:assignment.athleteId,assignmentId:assignment.id,week,session,date,logs,library,manualPRs,today})):[];
 });
}
// Existing explicit coach rules remain authoritative; never infer a rule from prose.
export function resolvedCoachRule(e,assignment,session,index){
 const options=assignment.progressionOptions,rule=options?.rules?.[`${session}:${index}:${e.exerciseId}`];
 if(rule){
  if(rule.mode==='adaptive')return {version:1,enabled:true,minPercent:rule.minPercent,maxPercent:rule.maxPercent};
  if(rule.mode==='repetition')return {version:1,enabled:true,minPercent:rule.increase,maxPercent:rule.increase};
  return null;
 }
 if(e.adaptiveProgression)return e.adaptiveProgression;
 if(options&&options.method!=='westside'&&Number.isFinite(options.percent))return {version:1,enabled:true,minPercent:options.percent,maxPercent:options.percent};
 return null;
}
export function withAthleteRecommendations(data,today){
 return {...data,assignments:(data.assignments||[]).map(a=>({...a,recommendations:Object.fromEntries(a.plan.flatMap(w=>w.sessions.map((s,si)=>[`${w.week}:${si}`,sessionRecommendations(a,w.week,si,data.logs||[],data.exercises||[],today,data.strengthPRs||[])])))}))};
}
