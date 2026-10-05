import {convertWeight} from './ai/contract.mjs';
import {localDateString,validWorkoutDate} from './workout-tracker.mjs';
const number=x=>typeof x==='number'&&Number.isFinite(x);
export function workoutDate(log){
  if(validWorkoutDate(log.workoutDate))return log.workoutDate;
  const date=new Date(log.createdAt);return Number.isFinite(date.getTime())?localDateString(date):null;
}
// Volume is recorded external load × actual reps, not prescribed sets or body mass.
export function exerciseVolume(log,exerciseId,unit='lbs'){
  if(!['lbs','kg'].includes(unit))throw Error('Choose lbs or kg.');
  let volume=0,validSets=0,excludedSets=0;
  for(const exercise of log.exercises||[])if(exercise.exerciseId===exerciseId){
    if((exercise.trackingType&&exercise.trackingType!=='strength')||exercise.volumeEligible===false){excludedSets+=(exercise.sets||[]).length;continue;}
    for(const set of exercise.sets||[]){
      const from=set.loadUnit??exercise.target?.loadUnit??'lbs'; // Legacy logs are pounds.
      if(!number(set.load)||set.load<0||!Number.isInteger(set.reps)||set.reps<0||!['lbs','kg'].includes(from)){excludedSets++;continue;}
      volume+=convertWeight(set.load,from,unit)*set.reps;validSets++;
    }
  }
  return {volume:validSets?volume:null,validSets,excludedSets};
}
export function exerciseVolumeStats(logs,exerciseId,athleteId,{unit='lbs',today=localDateString()}={}){
  const sessions=logs.filter(l=>l.athleteId===athleteId&&l.exercises?.some(e=>e.exerciseId===exerciseId)).map(l=>({id:l.id,name:l.sessionName,date:workoutDate(l),createdAt:l.createdAt,source:l.source==='tracker'?'tracker':'assigned',...exerciseVolume(l,exerciseId,unit)})).filter(s=>s.date).sort((a,b)=>a.date.localeCompare(b.date)||String(a.createdAt).localeCompare(String(b.createdAt))||a.id.localeCompare(b.id));
  const latest=sessions.at(-1)??null,previous=sessions.at(-2)??null;
  const valid=sessions.filter(s=>s.volume!==null),best=valid.reduce((a,s)=>!a||s.volume>a.volume?s:a,null);
  const sum=ss=>{const values=ss.filter(s=>s.volume!==null);return values.length?values.reduce((total,s)=>total+s.volume,0):null;};
  const start=new Date(today+'T12:00:00');start.setDate(start.getDate()-((start.getDay()+6)%7));const weekStart=localDateString(start);
  return {unit,sessions,latest,previous,best,today:sum(sessions.filter(s=>s.date===today)),weekly:sum(sessions.filter(s=>s.date>=weekStart&&s.date<=today)),changePercent:latest?.volume!=null&&previous?.volume>0?(latest.volume-previous.volume)/previous.volume*100:null};
}
