import {normalizePrescription,prescribedSets,validMaximum} from './prescriptions.mjs';
import {validateAdaptiveRule} from './adaptive-rules.mjs';
import {estimateMax,NSCA_PERCENT} from './strength-progress.mjs';
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
 const cutoff=Math.min(dateNumber(today),dateNumber(date||today));
 const recent=logs.filter(l=>l.athleteId===athleteId&&!(assignmentId&&l.assignmentId===assignmentId&&l.week===week&&l.session===session)&&Number.isFinite(dateNumber(workoutDate(l)))&&dateNumber(workoutDate(l))<=cutoff&&cutoff-dateNumber(workoutDate(l))<=90*DAY)
  .flatMap(l=>(l.exercises||[]).filter(x=>x.exerciseId===e.exerciseId&&!x.complex?.length&&x.volumeEligible!==false).map(entry=>({log:l,entry,date:workoutDate(l)})))
  .sort((a,b)=>b.date.localeCompare(a.date)||(b.log.createdAt||'').localeCompare(a.log.createdAt||''));
 if(recent[0]?.log.pain||recent[0]?.log.readiness<=2||recent[0]?.entry.sets?.some(s=>s.rpe>=9.5))return unavailable('Recent pain, low readiness or near-maximal effort: coach review before recommending a load.');
 const candidates=[];
 if(validMaximum(e.reference1RM,e.exerciseId)&&dateNumber(e.reference1RM.date)<=cutoff&&cutoff-dateNumber(e.reference1RM.date)<=90*DAY)candidates.push({date:e.reference1RM.date,oneRM:convertWeight(e.reference1RM.value,e.reference1RM.unit,'lbs'),kind:e.reference1RM.type,source:'reference maximum'});
 for(const {log,entry,date:performed} of recent){
  if(log.pain||log.readiness<=2)continue;
  for(const [setIndex,s] of (entry.sets||[]).entries()){
   const unit=s.loadUnit??entry.target?.loadUnit??'lbs';
   if(s.completed===false||s.warmup||s.isWarmup||s.type==='warmup'||!Number.isFinite(s.load)||s.load<=0||!Number.isInteger(s.reps)||s.reps<1||!['lbs','kg'].includes(unit)||s.rpe!=null&&(!Number.isFinite(s.rpe)||s.rpe<1||s.rpe>10))continue;
   const load=convertWeight(s.load,unit,'lbs');if(load>1200)continue;
   const maxEligible=(s.reps===1||s.rpe>=8||s.rir!=null&&s.rir>=0&&s.rir<=2)&&!(s.rpe!=null&&s.rpe<8)&&!(s.rir!=null&&s.rir>2);
   candidates.push({date:performed,load,reps:s.reps,oneRM:maxEligible?estimateMax(load,s.reps):null,kind:s.reps===1?'actual 1RM':'logged set',source:'workout history',logId:log.id,setIndex});
  }
 }
 candidates.sort((a,b)=>b.date.localeCompare(a.date));
 const baseline=candidates.find(c=>e.loadMode==='percentage'?c.oneRM!=null:c.reps===e.reps||c.oneRM!=null&&NSCA_PERCENT[e.reps]);
 if(!baseline)return unavailable('Log a recent comparable set or enter a dated reference maximum; Week 1 is not required.');
 const rawLb=e.loadMode==='percentage'?baseline.oneRM*e.percent1RM/100:baseline.reps===e.reps?baseline.load:baseline.oneRM*NSCA_PERCENT[e.reps]*.9;
 if(!Number.isFinite(rawLb)||rawLb<=0)return unavailable('A valid load baseline is needed.');
 const base=convertWeight(rawLb,'lbs',e.loadUnit),increment=e.increment;
 const comparable=recent.filter((v,i,all)=>all.findIndex(x=>x.log.id===v.log.id)===i);
 const successful=comparable.length>=2&&comparable.slice(0,2).every(({log,entry})=>!log.pain&&log.readiness>=4&&entry.target?.reps===e.reps&&entry.sets?.length>=entry.target.sets&&entry.sets.every(s=>s.completed!==false&&!s.warmup&&!s.isWarmup&&s.reps>=e.reps&&Number.isFinite(s.rpe)&&s.rpe>=1&&s.rpe<=8&&['lbs','kg'].includes(s.loadUnit??entry.target.loadUnit??'lbs')&&convertWeight(s.load,s.loadUnit??entry.target.loadUnit??'lbs',e.loadUnit)>=base));
 // At most one unperformed weekly increase. Never compound hypothetical sessions.
 const nextWeek=Number.isFinite(dateNumber(date))&&dateNumber(date)-dateNumber(baseline.date)>=7*DAY;
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
 return target.exercises.map(e=>e.adaptiveProgression?prescribedSets(e).map(t=>recommendAthleteLoad(t,{athleteId:assignment.athleteId,assignmentId:assignment.id,week,session,date,logs,library,today})):[]);
}
