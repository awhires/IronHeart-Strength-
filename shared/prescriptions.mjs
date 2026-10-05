import {prepareBlocks} from './workout-blocks.mjs';
import {trackingProfile,setSummary} from './tracking.mjs';
import {prepareJournalEntry} from './journal-measurements.mjs';
import {LOAD_MODE as L, EFFORT_MODE as E, LOAD_UNIT, REFERENCE_TYPE, TEMPO_REGEX, inPounds, convertWeight, PROGRAM_LENGTHS} from './ai/contract.mjs';
const number = x => typeof x==='number'&&Number.isFinite(x);
const range = (x,a,b) => number(x)&&x>=a&&x<=b;
const text = (x,min=0,max=2000) => typeof x==='string'&&x.trim().length>=min&&x.length<=max;
const object = x => x!==null&&typeof x==='object'&&!Array.isArray(x);
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
export const defaultIncrement=unit=>unit===LOAD_UNIT.KG?2.5:5;
export const newPrescription=id=>normalizePrescription({exerciseId:id,sets:3,reps:8,load:null,loadMode:L.ATHLETE_SELECTED,rest:120,rpe:7,increment:5,notes:''});
export const unitLabel=unit=>unit===LOAD_UNIT.KG?'kg':'lb';

// Read-time copies only. Numeric legacy zero is fixed zero, never inferred bodyweight.
export function normalizePrescription(item){
  const e=structuredClone(item);
  const defaults={loadMode:number(e.load)?L.FIXED:L.ATHLETE_SELECTED,loadUnit:LOAD_UNIT.LBS,load:null,effortMode:number(e.rpe)?E.RPE:number(e.rir)?E.RIR:E.NONE,rpe:null,rir:null,percent1RM:null,reference1RM:null,tempo:null,increment:defaultIncrement(e.loadUnit),notes:'',progressionInstructions:''};
  for(const [key,value] of Object.entries(defaults))if(e[key]===undefined)e[key]=value;
  return e;
}
export function validMaximum(reference,exerciseId){
  return object(reference)&&reference.exerciseId===exerciseId&&range(reference.value,Number.MIN_VALUE,1200)&&Object.values(LOAD_UNIT).includes(reference.unit)&&inPounds(reference.value,reference.unit)<=1200&&Object.values(REFERENCE_TYPE).includes(reference.type)&&validDate(reference.date);
}
// Pure math: raw and rounded values remain separate. Caller validates reference provenance.
export function calculatePercentageLoad({percent1RM,referenceValue,referenceUnit,outputUnit=LOAD_UNIT.LBS,increment=defaultIncrement(outputUnit)}){
  if(!range(percent1RM,1,100)||!range(referenceValue,Number.MIN_VALUE,1200)||!Object.values(LOAD_UNIT).includes(referenceUnit)||!Object.values(LOAD_UNIT).includes(outputUnit)||!range(increment,.25,25)||inPounds(referenceValue,referenceUnit)>1200)return null;
  const raw=convertWeight(referenceValue,referenceUnit,outputUnit)*percent1RM/100;
  const rounded=Number((Math.round(raw/increment)*increment).toFixed(4));
  return {raw,rounded,unit:outputUnit};
}
export function suggestedLoad(item){
  const e=normalizePrescription(item);
  if(e.loadMode!==L.PERCENTAGE||!validMaximum(e.reference1RM,e.exerciseId))return null;
  const result=calculatePercentageLoad({percent1RM:e.percent1RM,referenceValue:e.reference1RM.value,referenceUnit:e.reference1RM.unit,outputUnit:e.loadUnit,increment:e.increment});
  return result&&result.rounded>0&&inPounds(result.rounded,result.unit)<=1200?result:null;
}
export function loadText(item){
  const e=normalizePrescription(item);
  if(e.loadMode===L.BODYWEIGHT)return 'Bodyweight';
  if(e.loadMode===L.ATHLETE_SELECTED)return 'Choose load';
  if(e.loadMode===L.PERCENTAGE){const target=suggestedLoad(e);return `${e.percent1RM}% 1RM · ${target?`Suggested: ${target.rounded} ${unitLabel(e.loadUnit)}`:'Reference max needed'}`;}
  return number(e.load)?`${e.load} ${unitLabel(e.loadUnit)}`:'Load needed';
}
export function prescriptionText(item){
  const e=normalizePrescription(item);
  if(e.trackingType&&e.trackingType!=='strength')return setSummary(e.metrics||{},e.trackingType);
  if(e.setBlocks?.length)return e.setBlocks.map(b=>prescriptionText({...e,...b,sets:b.sets??b.count,setBlocks:undefined})).join(' + ');
  return [`${e.sets} × ${e.reps}`,loadText(e),e.effortMode===E.RPE?`RPE ${e.rpe}`:e.effortMode===E.RIR?`RIR ${e.rir}`:null,e.tempo?`Tempo: ${e.tempo}`:null,`${e.rest}s rest`].filter(Boolean).join(' · ');
}
export function initialActualLoad(item){const e=normalizePrescription(item);return e.loadMode===L.FIXED?e.load:e.loadMode===L.BODYWEIGHT?0:e.loadMode===L.PERCENTAGE?suggestedLoad(e)?.rounded??null:null;}
export function prescribedSets(item){const e=normalizePrescription(item);return e.setBlocks?.length?e.setBlocks.flatMap(b=>Array.from({length:b.sets??b.count},()=>normalizePrescription({...e,...b,sets:1,setBlocks:undefined}))):Array.from({length:e.sets},()=>e);}

export function validatePrescription(item,library){
  if(!object(item))return [{severity:'error',message:'Invalid exercise prescription.'}];
  if(item.trackingType&&item.trackingType!=='strength'){
    try{const exercise=library.find(x=>x.id===item.exerciseId);if(!exercise||trackingProfile(exercise)!==item.trackingType)throw Error('Choose a matching exercise profile.');prepareJournalEntry({sets:[item.metrics||{}]},exercise,library);return [];}catch(e){return [{severity:'error',message:e.message}];}
  }
  const e=normalizePrescription(item),findings=[];
  const check=(ok,message)=>{if(!ok)findings.push({severity:'error',message});};
  check(library.some(x=>x.id===e.exerciseId),'Choose an existing library exercise.');
  check(Number.isInteger(e.sets)&&range(e.sets,1,12),'Sets must be 1–12.');
  check(Number.isInteger(e.reps)&&range(e.reps,1,50),'Reps must be 1–50.');
  check(range(e.rest,0,600)&&range(e.increment,.25,25),'Check rest and rounding increment.');
  check(Object.values(L).includes(e.loadMode)&&Object.values(LOAD_UNIT).includes(e.loadUnit),'Choose a valid load mode and unit.');
  check(e.load===null||(range(e.load,0,1200)&&inPounds(e.load,e.loadUnit)<=1200),'Load must be null or a valid weight up to 1200 lb equivalent.');
  if(e.loadMode===L.FIXED)check(number(e.load),'Fixed loading requires a weight.');
  if(e.loadMode===L.ATHLETE_SELECTED)check(e.load===null,'Athlete-selected loading leaves weight unspecified.');
  if(e.loadMode===L.BODYWEIGHT)check(e.load===null||e.load===0,'Bodyweight cannot prescribe external weight.');
  if(e.loadMode===L.PERCENTAGE){
    check(range(e.percent1RM,1,100),'Percentage must be 1–100.');
    check(e.reference1RM===null||object(e.reference1RM),'Reference maximum must be an object or null.');
    const target=suggestedLoad(e);
    if(!target)findings.push({severity:'warning',message:'Reference max needed; no suggested weight is available.'});
    check(e.load===null||(target!==null&&Math.abs(e.load-target.rounded)<.0001),'Percentage weight must match its reference calculation, or be null.');
  }else check(e.percent1RM===null&&e.reference1RM===null,'Percentage data requires percentage loading.');
  check(Object.values(E).includes(e.effortMode),'Choose an effort mode.');
  check(e.effortMode===E.RPE?range(e.rpe,1,10):e.rpe===null,'RPE mode requires 1–10; other modes leave RPE empty.');
  check(e.effortMode===E.RIR?range(e.rir,0,10):e.rir===null,'RIR mode requires 0–10; other modes leave RIR empty.');
  check(e.tempo===null||(typeof e.tempo==='string'&&TEMPO_REGEX.test(e.tempo)),'Tempo must use four parts, such as 3-1-X-0.');
  check(text(e.notes)&&text(e.progressionInstructions),'Notes and progression instructions must be text up to 2000 characters.');
  if(e.setBlocks!==undefined){
    check(Array.isArray(e.setBlocks)&&e.setBlocks.length>0&&e.setBlocks.length<=12,'Use 1–12 prescribed set blocks.');
    if(Array.isArray(e.setBlocks)&&e.setBlocks.length<=12){
      check(e.setBlocks.reduce((n,b)=>n+(b?.sets??b?.count??0),0)===e.sets,'Total sets must match the set blocks.');
      for(const b of e.setBlocks){if(!object(b)||b.setBlocks){check(false,'Invalid nested set block.');continue;}findings.push(...validatePrescription({...e,...b,sets:b.sets??b.count,setBlocks:undefined},library));}
    }
  }
  return findings;
}
export function prepareItems(items,library){
  if(!Array.isArray(items)||!items.length||items.length>15)throw Error('Use 1–15 exercises.');
  return items.map(item=>{const issues=validatePrescription(item,library).filter(f=>f.severity==='error');if(issues.length)throw Error(issues.map(f=>f.message).join(' '));return normalizePrescription(item);});
}
export function prepareProgram(input,library){
  const p=structuredClone(input);
  if(!object(p)||!text(p.name,1,200)||!text(p.goal,1,200)||!PROGRAM_LENGTHS.includes(p.weeks)||!text(p.description??''))throw Error('Provide a program name, goal and supported block length.');
  for(const k of ['coachNotes','progressionInstructions'])if(p[k]!==undefined&&!text(p[k]))throw Error('Program notes must be text.');
  const sessions=value=>{
    if(!Array.isArray(value)||value.length<1||value.length>7)throw Error('Use 1–7 sessions per week.');
    return value.map(s=>{if(!object(s)||!text(s.name,1,200)||!Number.isInteger(s.day)||!range(s.day,0,6))throw Error('Each session needs a name and valid weekday.');if(s.coachNotes!==undefined&&!text(s.coachNotes))throw Error('Session notes must be text.');return prepareSession(s,library);});
  };
  if(p.plan!==undefined){
    if(!Array.isArray(p.plan)||p.plan.length!==p.weeks)throw Error('The block must include every week.');
    p.plan=p.plan.map((w,i)=>{if(!object(w)||w.week!==i+1)throw Error('Weeks must be sequential.');return {...w,sessions:sessions(w.sessions)};});
    p.sessions=p.plan[0].sessions;
  }else p.sessions=sessions(p.sessions);
  return p;
}
export function recordPerformance(entries,targets,library=[]){
  if(!Array.isArray(entries)||entries.length!==targets.length)throw Error('Log every exercise.');
  return entries.map((entry,i)=>{
    const target=normalizePrescription(targets[i]);
    if(target.trackingType&&target.trackingType!=='strength'){if(entry.exerciseId!==target.exerciseId)throw Error('Exercise mismatch.');return {...prepareJournalEntry(entry,library.find(e=>e.id===entry.exerciseId)||{id:entry.exerciseId,trackingType:target.trackingType},library),target};}
    if(entry.exerciseId!==target.exerciseId||!Array.isArray(entry.sets)||entry.sets.length!==target.sets)throw Error('Complete every prescribed set.');
    const perSet=prescribedSets(target);
    const sets=entry.sets.map((s,j)=>{
      const setTarget=perSet[j],unit=s.loadUnit??setTarget.loadUnit;
      const actualRpe=s.rpe??null;
      if(!Object.values(LOAD_UNIT).includes(unit)||!range(s.load,0,1200)||inPounds(s.load,unit)>1200||!Number.isInteger(s.reps)||!range(s.reps,0,100)||(actualRpe!==null&&!range(actualRpe,1,10))||(setTarget.effortMode===E.RPE&&actualRpe===null))throw Error('Complete each set with actual weight, reps, and a valid effort value.');
      return {load:s.load,loadUnit:unit,reps:s.reps,rpe:actualRpe};
    });
    return {exerciseId:entry.exerciseId,sets,target};
  });
}
export function normalizeData(data){
  const result=structuredClone(data);
  const sessions=ss=>ss?.forEach(s=>{s.exercises=s.exercises.map(normalizePrescription);});
  result.programs?.forEach(p=>{sessions(p.sessions);p.plan?.forEach(w=>sessions(w.sessions));});
  result.assignments?.forEach(a=>a.plan.forEach(w=>sessions(w.sessions)));
  result.logs?.forEach(l=>l.exercises.forEach(e=>{if(e.target)e.target=normalizePrescription(e.target);}));
  return result;
}

export function prepareSession(s,library){
 const items=s.exercises||[];
 const exercises=items.length?prepareItems(items,library):[];
 const blocks=prepareBlocks(s.blocks,exercises,library);
 if(!exercises.length&&!blocks?.some(b=>b.type==='Metcon'))throw Error('Add an exercise or Metcon.');
 return {...s,exercises,...(blocks?{blocks}:{})};
}
