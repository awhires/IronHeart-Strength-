import {AI_DRAFT_SCHEMA, LOAD_MODE, LOAD_UNIT, EFFORT_MODE, SEVERITY, TEMPO_REGEX, inPounds} from './contract.mjs';
import {validMaximum, calculatePercentageLoad} from '../prescriptions.mjs';
const record = x => x!==null&&typeof x==='object'&&!Array.isArray(x);
const number = x => typeof x==='number'&&Number.isFinite(x);
const validDate = x => typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;

// Small validator for exactly the JSON Schema keywords used by this contract.
// No coercion, normalization, inferred exercise IDs, or mutation.
function shape(value,schema,path,add){
  if(schema.anyOf){if(value===null)return;return shape(value,schema.anyOf.find(s=>s.type!=='null'),path,add);}
  if('const' in schema&&value!==schema.const)add('UNSUPPORTED_SCHEMA_VERSION',path,'Unsupported draft schema version.');
  if(schema.enum&&!schema.enum.includes(value))add('INVALID_ENUM',path,'Choose one of the allowed values.');
  if(schema.type){
    const types=Array.isArray(schema.type)?schema.type:[schema.type];
    const matches=t=>t==='null'?value===null:t==='object'?record(value):t==='array'?Array.isArray(value):t==='integer'?Number.isInteger(value):t==='number'?number(value):typeof value===t;
    if(!types.some(matches)){add('INVALID_TYPE',path,`Expected ${types.join(' or ')}.`);return;}
  }
  if(value===null)return;
  if(typeof value==='string'){
    if(schema.minLength&&value.trim().length<schema.minLength)add('REQUIRED_TEXT',path,'Enter a nonempty value.');
    if(schema.maxLength&&value.length>schema.maxLength)add('TEXT_TOO_LONG',path,`Use at most ${schema.maxLength} characters.`);
    if(schema.pattern&&!new RegExp(schema.pattern).test(value))add('INVALID_TEMPO',path,'Use four tempo parts, for example 3-1-X-0.');
    if(schema.format==='date'&&!validDate(value))add('INVALID_REFERENCE_DATE',path,'Use a real calendar date in YYYY-MM-DD format.');
  }
  if(number(value)&&((schema.minimum!==undefined&&value<schema.minimum)||(schema.maximum!==undefined&&value>schema.maximum)||(schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum)))add('OUT_OF_RANGE',path,'Value is outside the supported range.');
  if(Array.isArray(value)){
    if(schema.minItems!==undefined&&value.length<schema.minItems)add('TOO_FEW_ITEMS',path,'Required items are missing.');
    if(schema.maxItems!==undefined&&value.length>schema.maxItems)add('TOO_MANY_ITEMS',path,`Use at most ${schema.maxItems} items.`);
    if(schema.items)value.forEach((v,i)=>shape(v,schema.items,`${path}/${i}`,add));
  }
  if(record(value)&&schema.properties){
    for(const key of schema.required||[])if(!Object.hasOwn(value,key))add('MISSING_FIELD',`${path}/${key}`,'Required contract field is missing; use null for an unknown nullable value.');
    for(const [key,v] of Object.entries(value)){
      if(schema.properties[key])shape(v,schema.properties[key],`${path}/${key}`,add);
      else if(schema.additionalProperties===false)add('UNSUPPORTED_FIELD',`${path}/${key}`,'This field is not part of the v1 draft contract.');
    }
  }
}

export function validReference(e,library){
  const r=e?.reference1RM;
  return validMaximum(r,e?.exerciseId)&&library.some(x=>x.id===r.exerciseId);
}
export function percentageLoad(e,library){
  if(e?.loadMode!==LOAD_MODE.PERCENTAGE||!validReference(e,library)||!Object.values(LOAD_UNIT).includes(e.loadUnit)||!number(e.percent1RM)||e.percent1RM<=0||e.percent1RM>100||!number(e.increment)||e.increment<0.25||e.increment>25)return null;
  return calculatePercentageLoad({percent1RM:e.percent1RM,referenceValue:e.reference1RM.value,referenceUnit:e.reference1RM.unit,outputUnit:e.loadUnit,increment:e.increment})?.rounded??null;
}

export function estimateSessionMinutes(session){
  // Planning estimate: 10 min warm-up + 2 min setup per exercise + work/rest.
  // Unknown tempo assumes 4 sec/rep; explosive concentric assumes 1 sec.
  let seconds=600;
  if(!Array.isArray(session?.exercises))return null;
  for(const e of session.exercises){
    if(!record(e)||!number(e.sets)||!number(e.reps)||!number(e.rest))return null;
    const tempo=typeof e.tempo==='string'&&TEMPO_REGEX.test(e.tempo)?e.tempo.split('-').reduce((n,x)=>n+(x==='X'?1:Number(x)),0):4;
    seconds+=120+e.sets*e.reps*tempo+Math.max(0,e.sets-1)*e.rest;
  }
  return Math.ceil(seconds/60);
}

export function validateDraftStructure(draft){
  const findings=[];shape(draft,AI_DRAFT_SCHEMA,'',(code,path,message)=>findings.push({code,path,message,severity:SEVERITY.ERROR}));return findings;
}
export function validateDraft(draft,library=[],requirements={}){
  const findings=[];
  const add=(code,path,message,severity=SEVERITY.ERROR,suggestedResolution)=>findings.push({code,severity,message,path,...(suggestedResolution?{suggestedResolution}:{})});
  shape(draft,AI_DRAFT_SCHEMA,'',add);
  const p=draft?.program;
  if(record(p)){
    if(requirements.programWeeks!==undefined&&p.weeks!==requirements.programWeeks)add('PROGRAM_LENGTH_MISMATCH','/program/weeks',`Requested ${requirements.programWeeks} weeks; draft has ${p.weeks??'no selected length'}.`,SEVERITY.WARNING);
    if(p.weeks==null)add('MISSING_PROGRAM_LENGTH','/program/weeks','Choose the number of weeks. Four training days does not mean four weeks.');
    if(Array.isArray(p.plan)){
      if(Number.isInteger(p.weeks)&&p.plan.length!==p.weeks)add('INCOMPLETE_WEEK','/program/plan',`Expected ${p.weeks} complete weeks; received ${p.plan.length}.`);
      const weeks=new Set();
      p.plan.forEach((w,wi)=>{
        const wp=`/program/plan/${wi}`;
        if(!record(w))return;
        if(weeks.has(w.week))add('DUPLICATE_WEEK',`${wp}/week`,'Each week number must appear exactly once.');
        weeks.add(w.week);
        if(w.week!==wi+1)add('INCOMPLETE_WEEK',`${wp}/week`,'Weeks must be sequential, starting with Week 1.');
        if(!Array.isArray(w.sessions))return;
        const days=new Set();
        w.sessions.forEach((s,si)=>{
          if(!record(s))return;
          const sp=`${wp}/sessions/${si}`;
          if(!Number.isInteger(s.day)||s.day<0||s.day>6)add('INVALID_DAY',`${sp}/day`,'Choose a weekday from Sunday (0) to Saturday (6).');
          if(days.has(s.day))add('DUPLICATE_SESSION_DAY',`${sp}/day`,'Two sessions use the same weekday. Confirm that this is intentional.',SEVERITY.WARNING);
          days.add(s.day);
          if(!Array.isArray(s.exercises)||!s.exercises.length){add('EMPTY_SESSION',`${sp}/exercises`,'Add at least one exercise.');return;}
          s.exercises.forEach((e,ei)=>{
            if(!record(e))return;
            const ep=`${sp}/exercises/${ei}`,known=library.find(x=>x.id===e.exerciseId);
            if(!known)add('UNKNOWN_EXERCISE',`${ep}/exerciseId`,'Exercise needs library match.',SEVERITY.ERROR,'Select an existing library exercise.');
            else if(e.exerciseName!==known.name)add('EXERCISE_NAME_MISMATCH',`${ep}/exerciseName`,'Exercise name differs from its library ID.',SEVERITY.WARNING,'Confirm the selected library exercise.');
            if(known&&requirements.unavailableEquipment?.some(x=>x.toLowerCase().trim()===known.equipment?.toLowerCase().trim()))add('UNAVAILABLE_EQUIPMENT',`${ep}/exerciseId`,`${known.equipment} was marked unavailable. Choose another exercise.`);
            if(e.loadMode===LOAD_MODE.FIXED&&(!number(e.load)||e.load<=0))add('MISSING_LOAD',`${ep}/load`,'Fixed loading needs a positive prescribed weight; blank is not zero.');
            if(e.loadMode===LOAD_MODE.BODYWEIGHT&&e.load!==null&&e.load!==0)add('CONFLICTING_LOAD_MODE',`${ep}/load`,'Bodyweight cannot have a fixed external load.');
            if(e.loadMode===LOAD_MODE.ATHLETE_SELECTED&&e.load!==null)add('CONFLICTING_LOAD_MODE',`${ep}/load`,'Athlete-selected loading must leave the fixed load unspecified.');
            if(e.loadMode!==LOAD_MODE.PERCENTAGE&&(e.percent1RM!==null||e.reference1RM!==null))add('CONFLICTING_LOAD_MODE',`${ep}/loadMode`,'Percentage and reference maximum require percentage loading.');
            if(e.loadMode===LOAD_MODE.PERCENTAGE){
              if(!number(e.percent1RM)||e.percent1RM<=0||e.percent1RM>100)add('INVALID_PERCENT_1RM',`${ep}/percent1RM`,'Enter a percentage greater than 0 and at most 100.');
              if(e.reference1RM===null)add('MISSING_REFERENCE_1RM',`${ep}/reference1RM`,'A valid reference maximum is required before calculating weight.',SEVERITY.ERROR,'Enter the matching lift, maximum, unit, source type, and date.');
              else if(!validReference(e,library))add('INVALID_REFERENCE_1RM',`${ep}/reference1RM`,'Check the reference exercise, maximum, unit, type, and calendar date.');
              const calculated=percentageLoad(e,library);
              if(calculated!==null&&calculated<=0)add('INVALID_CALCULATED_LOAD',`${ep}/increment`,'This rounding increment produces zero weight. Choose a smaller increment.');
              if(calculated!==null&&inPounds(calculated,e.loadUnit)>1200)add('LOAD_LIMIT',`${ep}/increment`,'The rounded percentage load exceeds the existing 1200 lb application limit.');
              if(e.load!==null&&(calculated===null||Math.abs(e.load-calculated)>0.0001))add('CONFLICTING_LOAD_MODE',`${ep}/load`,'Entered weight does not match the validated percentage calculation. Clear it or correct the prescription.');
            }
            if(number(e.load)&&inPounds(e.load,e.loadUnit)>1200)add('LOAD_LIMIT',`${ep}/load`,'This load exceeds the existing 1200 lb application limit.');
            if(e.effortMode===EFFORT_MODE.RPE&&(!number(e.rpe)||e.rpe<1||e.rpe>10))add('INVALID_RPE',`${ep}/rpe`,'RPE requires a target from 1 to 10.');
            if(e.effortMode===EFFORT_MODE.RIR&&(!number(e.rir)||e.rir<0||e.rir>10))add('INVALID_RIR',`${ep}/rir`,'RIR requires a target from 0 to 10.');
            if((e.effortMode!==EFFORT_MODE.RPE&&e.rpe!==null)||(e.effortMode!==EFFORT_MODE.RIR&&e.rir!==null))add('CONFLICTING_EFFORT_MODE',`${ep}/effortMode`,'Keep only the target selected by the effort mode. No target is required for standard sets/reps.');
            if(e.tempo!==null&&(typeof e.tempo!=='string'||!TEMPO_REGEX.test(e.tempo)))add('INVALID_TEMPO',`${ep}/tempo`,'Tempo must be four parts such as 3-1-X-0; X is allowed only in the concentric position.');
            if(requirements.primaryExerciseIds?.includes(e.exerciseId)&&e.effortMode!==EFFORT_MODE.RPE)add('PRIMARY_LIFT_EFFORT',`${ep}/effortMode`,'The request specifies RPE for this primary lift.',SEVERITY.WARNING);
          });
          const limits=[s.maxDurationMinutes,requirements.maxSessionMinutes].filter(number);
          const estimate=estimateSessionMinutes(s);
          if(limits.length&&estimate!==null&&estimate>Math.min(...limits))add('SESSION_DURATION_ESTIMATE',sp,`Estimated ${estimate} minutes; requested approximately ${Math.min(...limits)} minutes or less.`,SEVERITY.WARNING,'Review volume, rest, warm-up, and transition time.');
        });
        if(Number.isInteger(requirements.trainingDaysPerWeek)&&days.size!==requirements.trainingDaysPerWeek)add('TRAINING_DAYS_MISMATCH',`${wp}/sessions`,`Week ${w.week} has ${days.size} training days; requested ${requirements.trainingDaysPerWeek}.`,SEVERITY.WARNING);
        for(const [exerciseId,target] of Object.entries(requirements.exerciseFrequency||{})){
          // Frequency counts distinct training days, not duplicate rows of the lift.
          const count=new Set(w.sessions.filter(s=>Array.isArray(s?.exercises)&&s.exercises.some(e=>e?.exerciseId===exerciseId)).map(s=>s.day)).size;
          if(count!==target)add('FREQUENCY_MISMATCH',`${wp}/sessions`,`${library.find(e=>e.id===exerciseId)?.name||exerciseId} appears on ${count} day(s) in Week ${w.week}; requested frequency is ${target}.`,SEVERITY.WARNING);
        }
      });
    }
  }
  if(Array.isArray(draft?.questions)&&draft.questions.some(q=>typeof q==='string'&&q.trim()))add('OPEN_QUESTIONS','/questions','Resolve the draft’s open questions before approval.');
  if(Array.isArray(draft?.assumptions)&&draft.assumptions.length)add('REVIEW_ASSUMPTIONS','/assumptions','Review the assumptions used to prepare this draft.',SEVERITY.WARNING);
  const unique=findings.filter((f,i)=>findings.findIndex(g=>g.code===f.code&&g.path===f.path)===i);
  const counts=Object.fromEntries(Object.values(SEVERITY).map(s=>[s,unique.filter(f=>f.severity===s).length]));
  return {findings:unique,counts,canApprove:counts.error===0};
}
