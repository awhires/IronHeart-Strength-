// An assignment keeps its identity, schedule, and athlete-specific edits. Only
// unchanged, uncompleted sessions follow coach edits; new sessions are appended
// without shifting the week/session keys used by workout history.
import {resolvedCoachRule} from './adaptive-prescriptions.mjs';
import {extendProgramSchedule} from './program-schedule.mjs';

const comparable=session=>JSON.stringify({...session,day:undefined,cancelled:undefined,prescriptionRevision:undefined});
const completed=(logs,id,week,index)=>logs.some(l=>l.assignmentId===id&&l.week===week&&l.session===index);
const progressionChanged=(session,assignment,index,oldOptions,newOptions)=>session.exercises.some((exercise,exerciseIndex)=>JSON.stringify(resolvedCoachRule(exercise,{...assignment,progressionOptions:oldOptions},index,exerciseIndex))!==JSON.stringify(resolvedCoachRule(exercise,{...assignment,progressionOptions:newOptions},index,exerciseIndex)));

function syncWeek(week,before,after,assignment,logs,oldOptions,newOptions,summary){
 const count=Math.max(week.sessions.length,after?.sessions.length||0);
 for(let index=0;index<count;index++){
  const current=week.sessions[index],old=before?.sessions[index],replacement=after?.sessions[index];
  if(!current&&replacement){week.sessions[index]={...structuredClone(replacement),prescriptionRevision:(replacement.prescriptionRevision||0)+1};summary.updated++;continue;}
  if(!current||!old)continue;
  if(!replacement){
   if(completed(logs,assignment.id,week.week,index)){summary.completed++;continue;}
   if(comparable(current)!==comparable(old)){summary.personalized++;continue;}
   if(!current.cancelled){week.sessions[index]={...current,cancelled:true,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.updated++;}
   continue;
  }
  const templateChanged=comparable(old)!==comparable(replacement),rulesChanged=progressionChanged(current,assignment,index,oldOptions,newOptions);
  if(!templateChanged&&!rulesChanged)continue;
  if(completed(logs,assignment.id,week.week,index)){summary.completed++;continue;}
  const personalized=comparable(current)!==comparable(old);
  if(personalized)summary.personalized++;
  if(templateChanged&&!personalized){week.sessions[index]={...structuredClone(replacement),day:current.day,cancelled:current.cancelled,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.updated++;}
  else if(rulesChanged){week.sessions[index]={...current,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.progression++;}
 }
}

const metadataFields=['name','goal','weeks','description','modality','level','coachNotes','progressionInstructions','aiProvenance'];
function syncMetadata(assignment,program){if(!program)return;for(const field of metadataFields)if(Object.hasOwn(program,field))assignment[field]=structuredClone(program[field]);}

export function propagateProgram(assignment,oldPlan,newPlan,logs=[],oldOptions=assignment.progressionOptions,newOptions=oldOptions,oldProgram=null,newProgram=null){
 const next=structuredClone(assignment),summary={updated:0,completed:0,personalized:0,progression:0};
 for(const week of next.plan){
  const before=oldPlan.find(w=>w.week===week.week),after=newPlan.find(w=>w.week===week.week);
  if(before&&after)syncWeek(week,before,after,next,logs,oldOptions,newOptions,summary);
 }
 // Append new weeks verbatim so their keys align with the coach template. Keep
 // removed weeks only when they contain completed or athlete-personalized work.
 for(const source of newPlan){
  if(next.plan.some(w=>w.week===source.week))continue;
  const prior=oldPlan.find(w=>w.week===source.week);
  if(prior){
   const kept=structuredClone(prior);syncWeek(kept,prior,source,next,logs,oldOptions,newOptions,summary);
   if(kept.sessions.some((session,index)=>!session.cancelled||completed(logs,next.id,kept.week,index)||comparable(session)!==comparable(prior.sessions[index])))next.plan.push(kept);
  }else{
   const added=structuredClone(source);for(const session of added.sessions)session.prescriptionRevision=(session.prescriptionRevision||0)+1;
   next.plan.push(added);summary.updated+=added.sessions.length;
  }
 }
 for(const week of next.plan){
  if(newPlan.some(w=>w.week===week.week))continue;
  const before=oldPlan.find(w=>w.week===week.week);if(!before)continue;
  for(let index=0;index<week.sessions.length;index++){
   const current=week.sessions[index],old=before.sessions[index];if(!old||completed(logs,next.id,week.week,index))continue;
   if(comparable(current)===comparable(old)&&!current.cancelled){week.sessions[index]={...current,cancelled:true,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.updated++;}
  }
 }
 next.plan.sort((a,b)=>a.week-b.week);
 // Trim a shortened template only where it cannot erase a result or personal work.
 next.plan=next.plan.filter(week=>{
  if(newPlan.some(w=>w.week===week.week))return true;
  const old=oldPlan.find(w=>w.week===week.week);
  return week.sessions.some((session,index)=>completed(logs,next.id,week.week,index)||!session.cancelled||old&&comparable(session)!==comparable(old.sessions[index]));
 });
 if(oldProgram&&newProgram){syncMetadata(next,newProgram);next.progressionOptions=structuredClone(newOptions);}
 next.weeks=newProgram?.weeks??Math.max(next.weeks||0,...newPlan.map(w=>w.week));
 const scheduled=extendProgramSchedule(next,oldPlan);
 return {assignment:scheduled,summary};
}
