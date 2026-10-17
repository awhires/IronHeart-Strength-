// An assignment keeps its schedule and athlete-specific edits. Only unchanged,
// uncompleted template sessions follow later coach edits.
import {resolvedCoachRule} from './adaptive-prescriptions.mjs';

const comparable=session=>JSON.stringify({...session,day:undefined,cancelled:undefined,prescriptionRevision:undefined});
const progressionChanged=(session,assignment,index,oldOptions,newOptions)=>session.exercises.some((exercise,exerciseIndex)=>JSON.stringify(resolvedCoachRule(exercise,{...assignment,progressionOptions:oldOptions},index,exerciseIndex))!==JSON.stringify(resolvedCoachRule(exercise,{...assignment,progressionOptions:newOptions},index,exerciseIndex)));

export function propagateProgram(assignment,oldPlan,newPlan,logs=[],oldOptions=assignment.progressionOptions,newOptions=oldOptions){
 const next=structuredClone(assignment),summary={updated:0,completed:0,personalized:0,progression:0};
 for(const week of next.plan){
  const before=oldPlan.find(w=>w.week===week.week),after=newPlan.find(w=>w.week===week.week);
  if(!before||!after)continue;
  for(let index=0;index<week.sessions.length;index++){
   const current=week.sessions[index],old=before.sessions[index],replacement=after.sessions[index];
   if(!old||!replacement)continue;
   const templateChanged=comparable(old)!==comparable(replacement),rulesChanged=progressionChanged(current,next,index,oldOptions,newOptions);
   if(!templateChanged&&!rulesChanged)continue;
   if(logs.some(l=>l.assignmentId===next.id&&l.week===week.week&&l.session===index)){summary.completed++;continue;}
   const personalized=comparable(current)!==comparable(old);
   if(personalized)summary.personalized++;
   if(templateChanged&&!personalized){week.sessions[index]={...structuredClone(replacement),day:current.day,cancelled:current.cancelled,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.updated++;}
   else if(rulesChanged){week.sessions[index]={...current,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.progression++;}
  }
 }
 return {assignment:next,summary};
}
