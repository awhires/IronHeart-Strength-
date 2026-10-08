import {calculatedCardioMetrics} from './cardio-prescriptions.mjs';
import {convertDistance} from './tracking.mjs';
export function prescribedCardioIntervals(target){
 const blocks=target.intervals?.length?target.intervals:[{rounds:target.intervalCount||1,work:target.metrics||{},recovery:{durationSeconds:target.restSeconds??target.rest??0}}];
 return blocks.flatMap(b=>Array.from({length:b.rounds},()=>{
  const work=structuredClone(b.work),recovery=structuredClone(b.recovery||{});
  if(target.trackingType==='running')work.paceUnit=work.paceUnit||(['mi','km'].includes(work.distanceUnit)?work.distanceUnit:'km');
  if(!(work.durationSeconds>0)&&work.distance>0&&work.paceSeconds>0){
   const base=target.trackingType==='erg'?500:target.trackingType==='swimming'?(work.distanceUnit==='yd'?91.44:100):convertDistance(1,work.paceUnit||work.distanceUnit||'mi','m');
   work.durationSeconds=convertDistance(work.distance,work.distanceUnit||'m','m')/base*work.paceSeconds;
  }
  return {work,recovery};
 }));
}
export function initialCardioActuals(target,existing){
 if(existing?.sets)return structuredClone(existing.sets);
 return prescribedCardioIntervals(target).map(({work})=>({distanceUnit:work.distanceUnit||(['erg','swimming'].includes(target.trackingType)?'m':'mi'),...(work.paceUnit?{paceUnit:work.paceUnit}:{}),completed:false}));
}
export function copyPreviousActual(previous,current){
 const {completed,recoverySeconds,blockIndex,...actual}=previous;
 return {...structuredClone(actual),completed:false,...(current.recoverySeconds!=null?{recoverySeconds:current.recoverySeconds}:{})};
}
export function cardioWorkTotals(sets){return {durationSeconds:sets.reduce((n,s)=>n+(s.durationSeconds||0),0),meters:sets.reduce((n,s)=>n+(s.distance>0?convertDistance(s.distance,s.distanceUnit||'mi','m'):0),0),recoverySeconds:sets.reduce((n,s)=>n+(s.recoverySeconds||0),0)};}
