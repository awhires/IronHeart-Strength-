import {normalizePrescription,prescribedSets,validMaximum} from './prescriptions.mjs';
import {validateAdaptiveRule} from './adaptive-rules.mjs';
import {athleteStrengthProfile,NSCA_PERCENT} from './strength-progress.mjs';
import {convertWeight} from './ai/contract.mjs';
import {trackingProfile} from './tracking.mjs';
import {workoutDate} from './volume-stats.mjs';
import {scheduledDate} from './program-schedule.mjs';
const DAY=86400000;
const dateNumber=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?Date.parse(d+'T00:00:00Z'):NaN;
// Pure projection: never writes to a program, assignment, baseline or log.
export function recommendAthleteLoad(item,{athleteId,logs=[],library=[],assignmentId,week,session,date,today=workoutDate({createdAt:new Date().toISOString()})}={}){
 const e=normalizePrescription(item),rule=e.adaptiveProgression;
 if(!rule)return null;
 try{validateAdaptiveRule(rule);}catch{return {status:'review',reason:'Coach progression rule needs review.'};}
 const unavailable=reason=>({status:'unavailable',reason,version:1});
 if(/Deload|Dynamic effort|Max effort/i.test(e.phase||''))return unavailable('Protect the coach-directed recovery, speed or max-effort prescription.');
 if(trackingProfile({...library.find(x=>x.id===e.exerciseId),id:e.exerciseId,trackingType:e.trackingType})!=='strength'||!['fixed','percentage','athlete_selected'].includes(e.loadMode))return unavailable('This target needs coach-directed loading.');
 const cutoff=dateNumber(today);
 const recent=logs.filter(l=>l.athleteId===athleteId&&!(assignmentId&&l.assignmentId===assignmentId&&l.week===week&&l.session===session)&&Number.isFinite(dateNumber(workoutDate(l)))&&dateNumber(workoutDate(l))<=cutoff&&cutoff-dateNumber(workoutDate(l))<=56*DAY)
  .flatMap(l=>(l.exercises||[]).filter(x=>x.exerciseId===e.exerciseId&&!x.complex?.length&&x.volumeEligible!==false).map(entry=>({log:l,entry,date:workoutDate(l)})))
  .sort((a,b)=>b.date.localeCompare(a.date)||(b.log.createdAt||'').localeCompare(a.log.createdAt||''));
 if(recent[0]?.log.pain||recent[0]?.log.readiness<=2)return unavailable('Recent pain or low readiness: coach review before recommending a load.');
 const candidates=[];
 if(validMaximum(e.reference1RM,e.exerciseId)&&dateNumber(e.reference1RM.date)<=cutoff&&cutoff-dateNumber(e.reference1RM.date)<=56*DAY)candidates.push({date:e.reference1RM.date,oneRM:convertWeight(e.reference1RM.value,e.reference1RM.unit,'lbs'),kind:e.reference1RM.type,source:'reference maximum'});
 const profile=athleteStrengthProfile(recent.map(x=>x.log).filter((l,i,all)=>all.findIndex(x=>x.id===l.id)===i),e.exerciseId,athleteId,library,new Date(cutoff).toISOString().slice(0,10),validMaximum(e.reference1RM,e.exerciseId)?[e.reference1RM]:[]);
 for(const evidence of profile.activeEvidence){const p=evidence.performance;candidates.push({date:p.date,load:p.loadLb,reps:p.reps,oneRM:evidence.oneRM,kind:'estimated from logged performance',source:'workout history',logId:p.logId,setIndex:p.setIndex,assignmentId:p.assignmentId,week:p.week});}
 candidates.sort((a,b)=>b.oneRM-a.oneRM||b.date.localeCompare(a.date));
 if(e.repMode==='max')return unavailable('Max-rep target: keep the coach load and record actual reps; no fixed rep target to translate.');
 const baseline=candidates.find(c=>e.loadMode==='percentage'?c.oneRM!=null:NSCA_PERCENT[e.reps]&&c.oneRM!=null);
 if(!baseline)return unavailable('Log a recent comparable set or enter a dated reference maximum; Week 1 is not required.');
 const rawLb=e.loadMode==='percentage'?baseline.oneRM*e.percent1RM/100:baseline.reps===e.reps?baseline.load:baseline.oneRM*NSCA_PERCENT[e.reps]*.9;
 if(!Number.isFinite(rawLb)||rawLb<=0)return unavailable('A valid load baseline is needed.');
 const base=convertWeight(rawLb,'lbs',e.loadUnit),increment=e.increment;
 const comparable=recent.filter((v,i,all)=>all.findIndex(x=>x.log.id===v.log.id)===i);
 const successful=comparable.length>=2&&comparable.slice(0,2).every(({log,entry})=>!log.pain&&log.readiness>=4&&entry.target?.reps===e.reps&&entry.sets?.length>=entry.target.sets&&entry.sets.every(s=>s.completed!==false&&!s.warmup&&!s.isWarmup&&s.reps>=e.reps&&Number.isFinite(s.rpe)&&s.rpe>=1&&s.rpe<=8&&['lbs','kg'].includes(s.loadUnit??entry.target.loadUnit??'lbs')&&convertWeight(s.load,s.loadUnit??entry.target.loadUnit??'lbs',e.loadUnit)>=base));
 // At most one unperformed weekly increase. Never compound hypothetical sessions.
 const nextWeek=(assignmentId&&baseline.assignmentId===assignmentId&&Number.isInteger(baseline.week)&&week>baseline.week)||(Number.isFinite(dateNumber(date))&&dateNumber(date)-dateNumber(baseline.date)>=7*DAY);
 const percent=nextWeek?(successful?rule.maxPercent:rule.minPercent):0;
 const ceiling=base*(1+(nextWeek?rule.maxPercent:0)/100),desired=base*(1+percent/100);
 let load=Number((Math.floor((desired+1e-8)/increment)*increment).toFixed(4));
 if(load<=0||convertWeight(load,e.loadUnit,'lbs')>1200)return unavailable('Coach review needed: the available increment or load is outside supported limits.');
 const belowMinimum=nextWeek&&load<base*(1+rule.minPercent/100)-1e-8;
 // If rounding cannot honor the minimum, hold rather than secretly exceed the maximum.
 if(belowMinimum){const up=Math.ceil(base*(1+rule.minPercent/100)/increment)*increment;if(up<=ceiling+1e-8)load=Number(up.toFixed(4));else load=Number((Math.floor(base/increment)*increment).toFixed(4));}
 return {version:1,status:'recommended',load,loadUnit:e.loadUnit,baseline,rule:{...rule},increasePercent:Number(((load/base-1)*100).toFixed(3)),reason:nextWeek?'One weekly step within the coach range; rounding may hold the load.':'Baseline load; no additional increase within the same week.',method:e.loadMode==='percentage'?'percentage of baseline maximum':baseline.reps===e.reps?'comparable actual reps':'90% of NSCA rep-max estimate'};
}
export function sessionRecommendations(assignment,week,session,logs,library,today){
 const target=assignment.plan.find(w=>w.week===week)?.sessions[session];if(!target)return [];
 const date=scheduledDate(assignment,week,session);
 return target.exercises.map((e,ei)=>{
 const rule=resolvedCoachRule(e,assignment,session,ei);
 return rule?prescribedSets(e).map(t=>recommendAthleteLoad({...t,adaptiveProgression:rule},{athleteId:assignment.athleteId,assignmentId:assignment.id,week,session,date,logs,library,today})):[];
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
 return {...data,assignments:(data.assignments||[]).map(a=>({...a,recommendations:Object.fromEntries(a.plan.flatMap(w=>w.sessions.map((s,si)=>[`${w.week}:${si}`,sessionRecommendations(a,w.week,si,data.logs||[],data.exercises||[],today)])))}))};
}
