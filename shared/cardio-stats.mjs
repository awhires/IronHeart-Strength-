import {convertDistance,trackingProfile} from './tracking.mjs';
import {workoutDate} from './volume-stats.mjs';
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export const comparableDistance=(a,b)=>positive(a)&&positive(b)&&Math.abs(a-b)<=Math.max(.1,Math.min(a,b)*.005);
export function cardioMetrics(s,type){
 const unit=s.distanceUnit||'mi';
 let meters=null;try{if(positive(s.distance))meters=convertDistance(s.distance,unit,'m');}catch{}
 const seconds=positive(s.durationSeconds)?s.durationSeconds:null;
 const paceBase=type==='erg'?500:type==='swimming'?(unit==='yd'?91.44:100):unit==='km'?1000:unit==='m'?1:unit==='yd'?.9144:1609.344;
 const speed=meters&&seconds?meters/seconds:positive(s.speedMph)?s.speedMph*.44704:positive(s.paceSeconds)?paceBase/s.paceSeconds:null;
 return {meters,seconds,speed,paceSeconds:speed?paceBase/speed:null,paceBase,watts:positive(s.watts)?s.watts:null,cadence:positive(s.cadence)?s.cadence:null,calories:positive(s.calories)?s.calories:null,steps:positive(s.steps)?s.steps:null,floors:positive(s.floors)?s.floors:null};
}
const change=(n,b)=>positive(b)?(n-b)/b*100:null;
export function cardioStats(logs,exercise,athleteId){
 const type=trackingProfile(exercise),sessions=[];
 for(const l of logs){if(l.athleteId!==athleteId)continue;
  const entries=(l.exercises||[]).filter(e=>e.exerciseId===exercise.id);if(!entries.length)continue;
  const sets=entries.flatMap(e=>e.sets||[]),metrics=sets.map(s=>cardioMetrics(s,type));
  const sum=k=>metrics.some(m=>m[k]!=null)?metrics.reduce((n,m)=>n+(m[k]||0),0):null;
  const mean=k=>{const ms=metrics.map((m,i)=>({v:m[k],w:m.seconds||1})).filter(m=>m.v!=null);return ms.length?ms.reduce((n,m)=>n+m.v*m.w,0)/ms.reduce((n,m)=>n+m.w,0):null;};
  const meters=sum('meters'),seconds=sum('seconds'),complete=metrics.every(m=>m.meters&&m.seconds);
  // Incomplete totals never produce a fabricated pace. Explicit speed/pace remains usable.
  const speed=complete?meters/seconds:metrics.every(m=>m.speed!=null)?mean('speed'):null;
  const context=JSON.stringify([sets.map(s=>[s.incline??null,s.level??null]),entries.map(e=>[e.intervals||[],e.target?.restSeconds||0])]);
  sessions.push({id:l.id,name:l.sessionName,date:workoutDate(l),createdAt:l.createdAt,meters,seconds,speed,watts:mean('watts'),cadence:mean('cadence'),calories:sum('calories'),stepRate:seconds&&sum('steps')?sum('steps')/seconds*60:null,floorRate:seconds&&sum('floors')?sum('floors')/seconds*60:null,context,complete});
 }
 sessions.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id).localeCompare(String(b.id)));
 const latest=sessions.at(-1)||null;
 // Select a repeated distance first, or a repeated duration. Context includes incline/intervals.
 const comparable=latest?sessions.filter(s=>s.context===latest.context&&((latest.meters&&latest.complete)?s.complete&&comparableDistance(s.meters,latest.meters):latest.seconds?Math.abs((s.seconds||0)-latest.seconds)<=1:false)):[];
 const metric=latest?.complete?'speed':latest?.speed?'speed':latest?.watts?'watts':latest?.stepRate?'stepRate':latest?.floorRate?'floorRate':latest?.calories?'calories':null;
 const valid=comparable.filter(s=>metric&&positive(s[metric]));
 const current=valid.at(-1),previous=valid.at(-2)??null,baseline=valid[0];
 const delta=current&&previous?change(current[metric],previous[metric]):null;
 const baselineChange=current&&valid.length>1?change(current[metric],baseline[metric]):null;
 const best=valid.reduce((a,s)=>!a||s[metric]>a[metric]?s:a,null);
 const totals={meters:sessions.reduce((n,s)=>n+(s.meters||0),0),seconds:sessions.reduce((n,s)=>n+(s.seconds||0),0)};
 const buckets=length=>Object.values(valid.reduce((out,s)=>{const key=length==='month'?s.date?.slice(0,7):(()=>{const d=new Date(s.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);})();if(!key)return out;const b=out[key]??={date:key,total:0,count:0};b.total+=s[metric];b.count++;return out;},{})).map(b=>({...b,value:b.total/b.count}));
 const distanceBests=[];for(const s of sessions.filter(s=>s.complete)){const b=distanceBests.find(b=>b.context===s.context&&comparableDistance(b.meters,s.meters));if(!b)distanceBests.push({...s});else if(s.seconds<b.seconds)Object.assign(b,s);}
 const fixedDurationBests=[];for(const s of sessions.filter(s=>s.complete)){const b=fixedDurationBests.find(b=>b.context===s.context&&Math.abs(b.seconds-s.seconds)<=1);if(!b)fixedDurationBests.push({...s});else if(s.meters>b.meters)Object.assign(b,s);}
 return {type,sessions,latest,previous,best,metric,comparable:valid,totals,average:valid.length?valid.reduce((n,s)=>n+s[metric],0)/valid.length:null,changePercent:delta,baselineChange,status:baselineChange==null?'Not enough comparable data':baselineChange>1?'Improving':baselineChange< -1?'Declining':'Maintaining',weeks:buckets('week'),months:buckets('month'),distanceBests,fixedDurationBests};
}
