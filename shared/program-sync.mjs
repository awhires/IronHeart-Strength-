// Assignments keep their identity, schedule, completed work and personalized
// fields. Uncompleted work receives non-conflicting coach changes via a
// three-way merge against the previous master snapshot.
import {resolvedCoachRule} from './adaptive-prescriptions.mjs';
import {extendProgramSchedule} from './program-schedule.mjs';

const comparable=session=>JSON.stringify({...session,day:undefined,cancelled:undefined,prescriptionRevision:undefined});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const completed=(logs,id,week,index)=>logs.some(l=>l.assignmentId===id&&l.week===week&&l.session===index);
const progressionChanged=(session,assignment,index,oldOptions,newOptions)=>session.exercises.some((exercise,exerciseIndex)=>JSON.stringify(resolvedCoachRule(exercise,{...assignment,progressionOptions:oldOptions},index,exerciseIndex))!==JSON.stringify(resolvedCoachRule(exercise,{...assignment,progressionOptions:newOptions},index,exerciseIndex)));

// Match repeated exercise IDs by occurrence, so inserting a different exercise
// does not shift the comparison for every row that follows it.
function exerciseEntries(rows=[]){const counts=new Map();return rows.map((value,index)=>{const id=value.exerciseId||`legacy:${index}`,occurrence=counts.get(id)||0;counts.set(id,occurrence+1);return {key:`${id}#${occurrence}`,value,index};});}
function mergeRecord(current,old,replacement,fieldPrefix,conflicts){const merged={...structuredClone(current)};for(const key of new Set([...Object.keys(old||{}),...Object.keys(current||{}),...Object.keys(replacement||{})])){const was=old?.[key],mine=current?.[key],coach=replacement?.[key];if(same(mine,was)){if(Object.hasOwn(replacement||{},key))merged[key]=structuredClone(coach);else delete merged[key];}else if(!same(coach,was)&&!same(mine,coach))conflicts.push(`${fieldPrefix}.${key}`);}return merged;}
function mergeSession(current,old,replacement,summary,weekNumber){
 const before=exerciseEntries(old.exercises),now=exerciseEntries(current.exercises),after=exerciseEntries(replacement.exercises);
 const oldBy=new Map(before.map(x=>[x.key,x])),currentBy=new Map(now.map(x=>[x.key,x])),newBy=new Map(after.map(x=>[x.key,x]));
 const entries=[],conflicts=[];
 for(const key of new Set([...before.map(x=>x.key),...now.map(x=>x.key),...after.map(x=>x.key)])){
  const was=oldBy.get(key),mine=currentBy.get(key),coach=newBy.get(key);
  if(!was){if(mine)entries.push({value:structuredClone(mine.value),owner:'current',index:mine.index});if(coach&&!mine)entries.push({value:structuredClone(coach.value),owner:'replacement',index:coach.index});continue;}
  const mineChanged=!!mine&&!same(mine.value,was.value),coachChanged=!!coach&&!same(coach.value,was.value);
  if(!coach){if(mine){if(mineChanged){entries.push({value:structuredClone(mine.value),owner:'current',index:mine.index});conflicts.push(`exercise:${key}`);}}continue;}
  if(!mine){if(coachChanged)conflicts.push(key);continue;}
  if(mineChanged){const value=coach?mergeRecord(mine.value,was.value,coach.value,`exercise:${key}`,conflicts):structuredClone(mine.value);entries.push({value,owner:'current',index:mine.index});}
  else entries.push({value:structuredClone(coach.value),owner:'replacement',index:coach.index});
 }
 const exercises=entries.map(x=>x.value),ownerMap=new Map(entries.map((x,index)=>[`${x.owner}:${x.index}`,index]));
 // Rebase block exercise indexes after merged additions/removals. Metadata for
 // personalized exercises comes from the athlete's block; otherwise from coach.
 const blocks=[];for(const entry of entries){const source=entry.owner==='current'?current.blocks:replacement.blocks;const sourceBlock=source?.find(b=>b.exerciseIndexes?.includes(entry.index));if(!sourceBlock)continue;let target=blocks.find(b=>b.id===sourceBlock.id);if(!target){target={...structuredClone(sourceBlock),exerciseIndexes:[]};blocks.push(target);}const mapped=ownerMap.get(`${entry.owner}:${entry.index}`);if(mapped!==undefined&&!target.exerciseIndexes.includes(mapped))target.exerciseIndexes.push(mapped);}
 // Preserve non-exercise blocks (for example Metcons) with field-level conflict
 // handling; their IDs are stable across coach edits.
 const blockMap=values=>new Map((values||[]).filter(b=>b.type==='Metcon'||!b.exerciseIndexes?.length).map(b=>[b.id,b]));
 const oldBlocks=blockMap(old.blocks),currentBlocks=blockMap(current.blocks),newBlocks=blockMap(replacement.blocks);
 for(const id of new Set([...oldBlocks.keys(),...currentBlocks.keys(),...newBlocks.keys()])){const was=oldBlocks.get(id),mine=currentBlocks.get(id),coach=newBlocks.get(id);if(!was){const value=mine||coach;if(value)blocks.push(structuredClone(value));continue;}if(!coach){if(mine&&!same(mine,was)){blocks.push(structuredClone(mine));conflicts.push(`block:${id}`);}continue;}if(!mine){if(!same(coach,was))conflicts.push(`block:${id}`);continue;}if(!same(mine,was)&&!same(coach,was)&&!same(mine,coach)){blocks.push(structuredClone(mine));conflicts.push(`block:${id}`);}else blocks.push(structuredClone(same(mine,was)?coach:mine));}
 const result={...structuredClone(current)};
 const excluded=new Set(['exercises','blocks','day','cancelled','prescriptionRevision']);
 for(const key of new Set([...Object.keys(old),...Object.keys(current),...Object.keys(replacement)])){if(excluded.has(key))continue;const was=old[key],mine=current[key],coach=replacement[key];if(same(mine,was)) {if(Object.hasOwn(replacement,key))result[key]=structuredClone(coach);else delete result[key];}else if(!same(coach,was)&&!same(mine,coach))conflicts.push(key);}
 result.exercises=exercises;if(replacement.blocks!==undefined||current.blocks!==undefined)result.blocks=blocks;
 summary.conflicts+=conflicts.length;summary.conflictDetails.push(...conflicts.map(field=>({week:weekNumber,session:current.name,field})));
 return result;
}

function syncWeek(week,before,after,assignment,logs,oldOptions,newOptions,summary){
 const count=Math.max(week.sessions.length,after?.sessions.length||0);
 for(let index=0;index<count;index++){
  const current=week.sessions[index],old=before?.sessions[index],replacement=after?.sessions[index];
  if(!current&&replacement){week.sessions[index]={...structuredClone(replacement),prescriptionRevision:(replacement.prescriptionRevision||0)+1};summary.updated++;continue;}
  if(!current||!old)continue;
  if(!replacement){
   if(completed(logs,assignment.id,week.week,index)){summary.completed++;continue;}
   if(comparable(current)!==comparable(old)){summary.personalized++;summary.conflicts++;summary.conflictDetails.push({week:week.week,session:current.name,field:'coach_removed_session'});continue;}
   if(!current.cancelled){week.sessions[index]={...current,cancelled:true,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.updated++;}
   continue;
  }
  const templateChanged=comparable(old)!==comparable(replacement),rulesChanged=progressionChanged(current,assignment,index,oldOptions,newOptions);
  if(!templateChanged&&!rulesChanged)continue;
  if(completed(logs,assignment.id,week.week,index)){summary.completed++;continue;}
  const personalized=comparable(current)!==comparable(old);
  if(personalized)summary.personalized++;
  if(templateChanged){const merged=mergeSession(current,old,replacement,summary,week.week);week.sessions[index]={...merged,day:current.day,cancelled:current.cancelled,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.updated++;}
  else if(rulesChanged){week.sessions[index]={...current,prescriptionRevision:(current.prescriptionRevision||0)+1};summary.progression++;}
 }
}

const metadataFields=['name','goal','weeks','description','modality','level','coachNotes','progressionInstructions','aiProvenance'];
function syncMetadata(assignment,program){if(!program)return;for(const field of metadataFields)if(Object.hasOwn(program,field))assignment[field]=structuredClone(program[field]);}

export function propagateProgram(assignment,oldPlan,newPlan,logs=[],oldOptions=assignment.progressionOptions,newOptions=oldOptions,oldProgram=null,newProgram=null){
 const next=structuredClone(assignment),summary={updated:0,completed:0,personalized:0,progression:0,conflicts:0,conflictDetails:[]};
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
