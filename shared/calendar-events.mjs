import {workoutDate} from './volume-stats.mjs';
const identity=(athlete,assignment,week,session)=>JSON.stringify([athlete,assignment,week,session]);
// Combine by session identity, never by name. Copies only; history remains authoritative.
export function calendarEvents(scheduled,logs,athleteId='all'){
 const visible=logs.filter(l=>athleteId==='all'||l.athleteId===athleteId),used=new Set();
 const events=scheduled.filter(e=>athleteId==='all'||e.a.athleteId===athleteId).map(e=>{
  const linked=visible.filter(l=>l.assignmentId&&identity(l.athleteId,l.assignmentId,l.week,l.session)===identity(e.a.athleteId,e.a.id,e.w,e.si));
  linked.forEach(l=>used.add(l.id));
  const log=linked.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  return {...e,id:identity(e.a.athleteId,e.a.id,e.w,e.si),scheduledKey:e.key,key:log?workoutDate(log)||e.key:e.key,log};
 });
 for(const log of visible)if(!used.has(log.id)&&workoutDate(log))events.push({id:`log:${log.id}`,key:workoutDate(log),log,s:{name:log.sessionName,exercises:log.exercises||[]}});
 return events.sort((a,b)=>a.key.localeCompare(b.key)||a.id.localeCompare(b.id));
}
