import {intervalSegments,validateIntervalShape} from './cardio-structure.mjs';
import {convertDistance} from './tracking.mjs';
export function prescribedCardioIntervals(target){
 const blocks=target.intervals?.length?target.intervals:[{rounds:target.intervalCount||1,work:target.metrics||{},recovery:{durationSeconds:target.restSeconds??target.rest??0}}];
 validateIntervalShape(blocks);
 return blocks.flatMap((b,blockIndex)=>Array.from({length:b.rounds},(_,roundIndex)=>intervalSegments(b).map((segment,segmentIndex)=>{
  const work=structuredClone(segment.metrics),recovery=structuredClone(b.segments?(segmentIndex===b.segments.length-1&&roundIndex<b.rounds-1?b.recovery||{}:{}):b.recovery||{});
  if(target.trackingType==='running')work.paceUnit=work.paceUnit||(['mi','km'].includes(work.distanceUnit)?work.distanceUnit:'km');
  if(!(work.durationSeconds>0)&&work.distance>0&&work.paceSeconds>0){
   const base=target.trackingType==='erg'?500:target.trackingType==='swimming'?(work.distanceUnit==='yd'?91.44:100):convertDistance(1,work.paceUnit||work.distanceUnit||'mi','m');
   work.durationSeconds=convertDistance(work.distance,work.distanceUnit||'m','m')/base*work.paceSeconds;
  }
  return {work,recovery,...(b.segments?{blockIndex,roundIndex,segmentIndex,label:segment.label}: {})};
 })).flat());
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
