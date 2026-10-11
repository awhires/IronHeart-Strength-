import {convertWeight} from './ai/contract.mjs';
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
export function strengthProgress(logs,exerciseId,athleteId,library=[]){
  const performances=[],monthly=new Map(),actualBests={};
  for(const log of logs||[]){
    if(log.athleteId!==athleteId)continue;
    const date=workoutDate(log);if(!date)continue;
    for(const [exerciseIndex,entry] of (log.exercises||[]).entries()){
      if(entry.exerciseId!==exerciseId||entry.complex?.length||entry.volumeEligible===false||trackingProfile({...library.find(e=>e.id===exerciseId),...entry})!=='strength')continue;
      for(const [setIndex,set] of (Array.isArray(entry.sets)?entry.sets:[]).entries()){
        const unit=set.loadUnit??entry.target?.loadUnit??'lbs';
        if(set.completed===false||set.warmup===true||set.isWarmup===true||set.type==='warmup'||!Number.isFinite(set.load)||set.load<=0||!Number.isInteger(set.reps)||set.reps<1||!['lbs','kg'].includes(unit))continue;
        const loadLb=convertWeight(set.load,unit,'lbs');
        const actual={kind:'actual',logId:log.id,exerciseId,exerciseIndex,setIndex,date,sessionName:log.sessionName,load:set.load,loadUnit:unit,loadLb,reps:set.reps,rpe:set.rpe??null,rir:set.rir??null};
        performances.push(actual);
        if(!actualBests[set.reps]||actualBests[set.reps].loadLb<loadLb)actualBests[set.reps]=actual;
        // Chart estimates require supported reps; known easy sets do not imply rep maxima.
        if((set.rpe!=null&&(!Number.isFinite(set.rpe)||set.rpe<8||set.rpe>10))||(set.rir!=null&&(!Number.isFinite(set.rir)||set.rir>2||set.rir<0)))continue;
        const oneRM=estimateMax(loadLb,set.reps);if(oneRM===null)continue;
        const month=date.slice(0,7),point={kind:'estimate',month,method:DEFAULT_METHOD,source:NSCA_SOURCE,estimates:Object.fromEntries(REP_MAXES.map(r=>[r,estimateMax(loadLb,set.reps,r)])),performance:actual,effortKnown:set.rpe!=null||set.rir!=null};
        const old=monthly.get(month);
        if(!old||oneRM>old.estimates[1]||(oneRM===old.estimates[1]&&date>old.performance.date))monthly.set(month,point);
      }
    }
  }
  return {exerciseId,athleteId,method:DEFAULT_METHOD,monthly:[...monthly.values()].sort((a,b)=>a.month.localeCompare(b.month)),actualBests,performances};
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
