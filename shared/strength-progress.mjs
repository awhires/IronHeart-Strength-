import {convertWeight,REFERENCE_TYPE} from './ai/contract.mjs';
import {workoutDate} from './volume-stats.mjs';
import {trackingProfile} from './tracking.mjs';

export const NSCA_SOURCE='https://www.nsca.com/contentassets/61d813865e264c6e852cadfe247eae52/nsca_training_load_chart.pdf';
export const NSCA_PERCENT=Object.freeze({1:1,2:.95,3:.93,4:.90,5:.87,6:.85,7:.83,8:.80,9:.77,10:.75,12:.70});
export const REP_MAXES=Object.freeze([1,3,5,10]);
export const DEFAULT_METHOD='nsca-chart-v1';
// Versioned method registry permits future formulas without silently changing history.
export const ESTIMATION_METHODS=Object.freeze({[DEFAULT_METHOD]:Object.freeze({label:'NSCA Training Load Chart',source:NSCA_SOURCE,oneRM:(load,reps)=>NSCA_PERCENT[reps]?load/NSCA_PERCENT[reps]:null})});
export function estimateMax(load,reps,repMax=1,method=DEFAULT_METHOD){
  if(!ESTIMATION_METHODS[method])throw Error('Unknown estimation method.');
  if(!REP_MAXES.includes(repMax))throw Error('Choose 1RM, 3RM, 5RM or 10RM.');
  if(!Number.isFinite(load)||load<=0||!Number.isInteger(reps))return null;
  const one=ESTIMATION_METHODS[method].oneRM(load,reps);
  return one===null?null:one*NSCA_PERCENT[repMax];
}
export function strengthProgress(logs,exerciseId,athleteId,library=[],manualPRs=[]){
  const performances=[],monthly=new Map(),actualBests={},evidence=[];
  for(const log of logs||[]){
    if(log.athleteId!==athleteId)continue;
    const date=workoutDate(log);if(!date)continue;
    for(const [exerciseIndex,entry] of (log.exercises||[]).entries()){
      if(entry.exerciseId!==exerciseId||entry.complex?.length||entry.volumeEligible===false||trackingProfile({...library.find(e=>e.id===exerciseId),...entry})!=='strength')continue;
      for(const [setIndex,set] of (Array.isArray(entry.sets)?entry.sets:[]).entries()){
        const unit=set.loadUnit??entry.target?.loadUnit??'lbs';
        if(set.completed===false||set.warmup===true||set.isWarmup===true||set.type==='warmup'||!Number.isFinite(set.load)||set.load<=0||!Number.isInteger(set.reps)||set.reps<1||!['lbs','kg'].includes(unit))continue;
        const loadLb=convertWeight(set.load,unit,'lbs');
        const actual={kind:'actual',logId:log.id,exerciseId,exerciseIndex,setIndex,date,sessionName:log.sessionName,load:set.load,loadUnit:unit,loadLb,reps:set.reps,rpe:set.rpe??null,rir:set.rir??null,assignmentId:log.assignmentId,week:log.week,session:log.session};
        performances.push(actual);
        if(!actualBests[set.reps]||actualBests[set.reps].loadLb<loadLb)actualBests[set.reps]=actual;
        // Chart estimates require supported reps; known easy sets do not imply rep maxima.
        if((set.rpe!=null&&(!Number.isFinite(set.rpe)||set.rpe<8||set.rpe>10))||(set.rir!=null&&(!Number.isFinite(set.rir)||set.rir>2||set.rir<0)))continue;
        if(log.pain||log.readiness<=2||/deload|dynamic effort|speed|technique|recovery/i.test(entry.target?.phase||''))continue;
        const oneRM=estimateMax(loadLb,set.reps);if(oneRM===null)continue;
        const month=date.slice(0,7),point={kind:'estimate',month,method:DEFAULT_METHOD,source:NSCA_SOURCE,estimates:Object.fromEntries(REP_MAXES.map(r=>[r,estimateMax(loadLb,set.reps,r)])),performance:actual,effortKnown:set.rpe!=null||set.rir!=null};
        evidence.push({...point,oneRM});
        const old=monthly.get(month);
        if(!old||oneRM>old.estimates[1]||(oneRM===old.estimates[1]&&date>old.performance.date))monthly.set(month,point);
      }
    }
  }
  const manualRecords=(manualPRs||[]).filter(p=>p.athleteId===athleteId&&p.exerciseId===exerciseId);
  for(const p of manualRecords){if(!REP_MAXES.includes(p.repMax)||!Number.isFinite(p.weightLb)||p.weightLb<=0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(p.date||''))continue;const oneRM=estimateMax(p.weightLb,p.repMax,1);if(!oneRM)continue;const performance={kind:'manual',manualPRId:p.id,source:'athlete-entered manual PR',exerciseId,date:p.date,load:p.weightLb,loadUnit:'lbs',loadLb:p.weightLb,reps:p.repMax,rpe:null,rir:null};const point={kind:'manual',month:p.date.slice(0,7),method:DEFAULT_METHOD,source:'athlete-entered manual PR',estimates:Object.fromEntries(REP_MAXES.map(r=>[r,estimateMax(p.weightLb,p.repMax,r)])),performance,effortKnown:true};evidence.push({...point,oneRM});const old=monthly.get(point.month);if(!old||oneRM>old.estimates[1]||(oneRM===old.estimates[1]&&p.date>old.performance.date))monthly.set(point.month,point);}
  const today=workoutDate({createdAt:new Date().toISOString()});
  const months=new Set(monthly.keys());
  if(activeStrengthEvidence(evidence,today).length)months.add(today.slice(0,7));
  const points=[...months].sort().map(month=>{
    const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
    const best=activeStrengthEvidence(evidence,end<today?end:today)[0];
    return best?{...best,month}:null;
  }).filter(Boolean);
  manualRecords.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return {exerciseId,athleteId,method:DEFAULT_METHOD,monthly:points,current:activeStrengthEvidence(evidence,today)[0]||null,actualBests,performances,evidence,manualRecords};
}
export function strengthAxis(values,goal){
  const valid=values.filter(v=>Number.isFinite(v)&&v>0),highest=Math.max(0,...valid);
  return {min:valid.some(v=>v<10)||(goal>0&&goal<10)?0:10,max:Math.max(110,highest+100,Number.isFinite(goal)?goal+10:0)};
}
export function prepareStrengthGoal(input,library,athleteId,now=new Date().toISOString()){
  if(!input||Object.keys(input).some(k=>!['athleteId','exerciseId','repMax','targetLb'].includes(k)))throw Error('Use an exercise, rep max and goal in pounds.');
  const exercise=library.find(e=>e.id===input.exerciseId);
  if(!exercise||trackingProfile(exercise)!=='strength')throw Error('Choose a strength exercise.');
  if(!REP_MAXES.includes(input.repMax)||!Number.isFinite(input.targetLb)||input.targetLb<=0||input.targetLb>5000)throw Error('Choose a rep max and a goal above 0 and at most 5000 lb.');
  return {id:JSON.stringify([athleteId,exercise.id,input.repMax]),version:1,athleteId,exerciseId:exercise.id,repMax:input.repMax,targetLb:input.targetLb,comparison:'estimated',method:DEFAULT_METHOD,updatedAt:now};
}

export function prepareStrengthPR(input,library,athleteId,now=new Date().toISOString()){
 const allowed=['id','athleteId','exerciseId','repMax','weightLb','date','notes'];
 if(!input||Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Use an exercise, rep max, weight and optional date or notes.');
 if(input.athleteId&&input.athleteId!==athleteId)throw Error('Access denied.');
 const exercise=library.find(e=>e.id===input.exerciseId);
 if(!exercise||trackingProfile(exercise)!=='strength')throw Error('Choose a strength exercise.');
 if(!REP_MAXES.includes(input.repMax)||!Number.isFinite(input.weightLb)||input.weightLb<=0||input.weightLb>1200)throw Error('Choose a 1RM, 3RM, 5RM or 10RM weight above 0 and at most 1200 lb.');
 const date=input.date||now.slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>now.slice(0,10))throw Error('Choose a valid performance date no later than today.');
 if(typeof(input.notes??'')!=='string'||(input.notes??'').length>2000)throw Error('Notes must be 2000 characters or fewer.');
 return {id:typeof input.id==='string'&&input.id?input.id:crypto.randomUUID(),version:1,athleteId,exerciseId:exercise.id,repMax:input.repMax,weightLb:input.weightLb,date,notes:input.notes||'',source:'athlete_manual',enteredAt:input.enteredAt||now,updatedAt:now};
}

export const STRENGTH_WINDOW_DAYS=56;
const utcDay=date=>Date.parse(date+'T00:00:00Z');
export function activeStrengthEvidence(evidence,asOf){
 return evidence.filter(e=>{const age=utcDay(asOf)-utcDay(e.performance.date);return age>=0&&age<=STRENGTH_WINDOW_DAYS*86400000;}).sort((a,b)=>b.oneRM-a.oneRM||b.performance.date.localeCompare(a.performance.date)||a.performance.setIndex-b.performance.setIndex);
}
export function athleteStrengthProfile(logs,exerciseId,athleteId,library=[],asOf=workoutDate({createdAt:new Date().toISOString()}),referenceMaxima=[],manualPRs=[]){
 const history=strengthProgress(logs,exerciseId,athleteId,library,manualPRs),manualMaxima=history.manualRecords.map(r=>{const oneRM=estimateMax(r.weightLb,r.repMax,1);if(!oneRM)return null;const performance={kind:'manual',source:'athlete-entered manual PR',manualPRId:r.id,exerciseId:r.exerciseId,date:r.date,load:r.weightLb,loadUnit:'lbs',loadLb:r.weightLb,reps:r.repMax,rpe:null,rir:null};return {kind:'manual',source:'athlete-entered manual PR',method:DEFAULT_METHOD,date:r.date,oneRM,performance,manualPR:r};}).filter(e=>e&&e.date<=asOf).sort((a,b)=>b.oneRM-a.oneRM||b.date.localeCompare(a.date));
 const activeEvidence=activeStrengthEvidence(history.evidence,asOf),best=activeEvidence[0]||null;
 const references=referenceMaxima.filter(r=>r&&r.exerciseId===exerciseId&&Object.values(REFERENCE_TYPE).includes(r.type)&&['lbs','kg'].includes(r.unit)&&Number.isFinite(r.value)&&r.value>0&&convertWeight(r.value,r.unit,'lbs')<=1200&&/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')&&utcDay(r.date)<=utcDay(asOf)&&utcDay(asOf)-utcDay(r.date)<=56*86400000).map(r=>({...r,oneRM:convertWeight(r.value,r.unit,'lbs')})).sort((a,b)=>b.oneRM-a.oneRM);
 const historicalManualBaseline=best?null:manualMaxima[0]||null;
 return {version:1,exerciseId,athleteId,asOf,windowDays:STRENGTH_WINDOW_DAYS,history:history.performances,activeEvidence,currentEstimate:best||historicalManualBaseline,estimated1RM:(best||historicalManualBaseline)?.oneRM??null,
 referenceMaxima:references,manualMaxima,manualBaseline:manualMaxima[0]||null,historicalManualBaseline,actualTestedMax:references.find(r=>r.type==='tested')||null,coachReferenceMax:references.find(r=>r.type==='coach_entered')||null};
}
