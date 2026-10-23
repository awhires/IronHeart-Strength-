import {AI_DRAFT_SCHEMA_V2} from './conditioning-contract.mjs';
import {PROGRAM_LENGTHS,SEVERITY} from './contract.mjs';
import {validateDraft} from './validate.mjs';

const obj=(properties)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const label={type:'string',minLength:1,maxLength:200};
const notes={type:'string',maxLength:2000};
const requiredNotes={type:'string',minLength:1,maxLength:2000};
export const OUTLINE_FOCUS_MAX_LENGTH=512;
const focus={type:'string',minLength:1,maxLength:OUTLINE_FOCUS_MAX_LENGTH};
export const OUTLINE_SCHEMA=obj({
  schemaVersion:{const:1},
  program:obj({name:label,goal:label,description:notes,weeks:{type:'integer',enum:PROGRAM_LENGTHS},coachNotes:notes,progressionInstructions:requiredNotes}),
  trainingDays:{type:'array',minItems:1,maxItems:7,items:obj({day:{type:'integer',minimum:0,maximum:6},focus})},
  weekProgression:{type:'array',minItems:1,maxItems:12,items:obj({week:{type:'integer',minimum:1,maximum:12},focus,progressionInstructions:requiredNotes})},
  assumptions:{type:'array',items:notes},questions:{type:'array',items:notes}
});
export const WEEK_SCHEMA=AI_DRAFT_SCHEMA_V2.properties.program.properties.plan.items;
// Narrow only already-confirmed counts. The canonical schemas remain available
// for existing saved jobs, and semantic uniqueness/frequency checks stay local.
export function outlineSchemaFor(requirements={}){
  const schema=structuredClone(OUTLINE_SCHEMA);
  if(PROGRAM_LENGTHS.includes(requirements.programWeeks)){
    schema.properties.program.properties.weeks.enum=[requirements.programWeeks];
    schema.properties.weekProgression.minItems=requirements.programWeeks;
    schema.properties.weekProgression.maxItems=requirements.programWeeks;
  }
  if(Number.isInteger(requirements.trainingDaysPerWeek)&&requirements.trainingDaysPerWeek>=1&&requirements.trainingDaysPerWeek<=7){
    schema.properties.trainingDays.minItems=requirements.trainingDaysPerWeek;
    schema.properties.trainingDays.maxItems=requirements.trainingDaysPerWeek;
  }
  return schema;
}
export function weekSchemaFor(outline,week){
  const schema=structuredClone(WEEK_SCHEMA);
  schema.properties.week.enum=[week];
  schema.properties.sessions.minItems=outline.trainingDays.length;
  schema.properties.sessions.maxItems=outline.trainingDays.length;
  schema.properties.sessions.items.properties.day.enum=outline.trainingDays.map(day=>day.day);
  return schema;
}
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const kind=value=>value===undefined?'missing':value===null?'null':Array.isArray(value)?'array':typeof value;
const observed=value=>typeof value==='string'?(value.trim()?'string length '+value.length:'empty string'):typeof value==='number'||typeof value==='boolean'?value:kind(value);

// A complete, unique set of week targets can be ordered without changing any
// target. Never synthesize missing weeks or alter the coach's requirements.
export function normalizeOutline(outline){
  if(!record(outline)||!record(outline.program)||!Array.isArray(outline.weekProgression))return {outline,normalizations:[]};
  const weeks=outline.program.weeks,rows=outline.weekProgression;
  if(!PROGRAM_LENGTHS.includes(weeks)||rows.length!==weeks||rows.some(row=>!record(row)||!Number.isInteger(row.week))||new Set(rows.map(row=>row.week)).size!==weeks||rows.some(row=>row.week<1||row.week>weeks))return {outline,normalizations:[]};
  if(rows.every((row,index)=>row.week===index+1))return {outline,normalizations:[]};
  return {outline:{...outline,weekProgression:[...rows].sort((a,b)=>a.week-b.week)},normalizations:[{path:'/weekProgression',action:'ordered existing unique week targets'}]};
}

export function validateOutline(outline,requirements={}){
  const schema=OUTLINE_SCHEMA.properties,program=schema.program.properties;
  const errors=[];
  const add=(code,path,expected,value,{repairable=false}={})=>errors.push({code,path,expected,received:observed(value),repairable,message:`${path}: expected ${expected}; received ${observed(value)}.`,severity:SEVERITY.ERROR});
  const objectFields=(value,path,fields)=>{
    if(!record(value)){add('INVALID_TYPE',path,'object',value);return false;}
    for(const field of fields)if(!Object.hasOwn(value,field))add('MISSING_FIELD',`${path==='/'?'':path}/${field}`,'required field',undefined);
    for(const key of Object.keys(value))if(!fields.includes(key))add('UNEXPECTED_FIELD',`${path==='/'?'':path}/${key}`,'field absent from outline schema',value[key]);
    return true;
  };
  const stringField=(value,path,rule)=>{if(typeof value!=='string'||value.length>(rule.maxLength??Infinity)||rule.minLength&&value.trim().length<rule.minLength)add('INVALID_FIELD',path,`${rule.minLength?'nonempty ':''}string up to ${rule.maxLength} characters`,value);};
  if(!objectFields(outline,'/',Object.keys(schema)))return {findings:errors,valid:false};
  if(outline.schemaVersion!==schema.schemaVersion.const)add('INVALID_VERSION','/schemaVersion',String(schema.schemaVersion.const),outline.schemaVersion);
  const p=outline?.program;
  if(objectFields(p,'/program',Object.keys(program))){
    for(const key of ['name','goal','description','coachNotes','progressionInstructions'])stringField(p[key],`/program/${key}`,program[key]);
    if(!program.weeks.enum.includes(p.weeks))add('INVALID_DURATION','/program/weeks',`one of ${program.weeks.enum.join(', ')}`,p.weeks);
  }
  if(requirements.programWeeks!==undefined&&p?.weeks!==requirements.programWeeks)add('CONFIRMED_WEEKS_MISMATCH','/program/weeks',`confirmed ${requirements.programWeeks} weeks`,p?.weeks);
  const days=outline?.trainingDays;
  if(!Array.isArray(days))add('INVALID_TYPE','/trainingDays','array of training days',days);
  else{
    if(days.length<schema.trainingDays.minItems||days.length>schema.trainingDays.maxItems)add('INVALID_LENGTH','/trainingDays',`${schema.trainingDays.minItems}–${schema.trainingDays.maxItems} training days`,days.length);
    const seen=new Set();days.forEach((day,index)=>{const path=`/trainingDays/${index}`;if(!objectFields(day,path,Object.keys(schema.trainingDays.items.properties)))return;
      const dayRule=schema.trainingDays.items.properties.day;
      if(!Number.isInteger(day.day)||day.day<dayRule.minimum||day.day>dayRule.maximum)add('INVALID_DAY',`${path}/day`,`integer weekday ${dayRule.minimum}–${dayRule.maximum}`,day.day);
      else if(seen.has(day.day))add('DUPLICATE_DAY',`${path}/day`,'distinct weekday',day.day);else seen.add(day.day);
      stringField(day.focus,`${path}/focus`,schema.trainingDays.items.properties.focus);
    });
    if(requirements.trainingDaysPerWeek!==undefined&&days.length!==requirements.trainingDaysPerWeek)add('CONFIRMED_DAYS_MISMATCH','/trainingDays',`confirmed ${requirements.trainingDaysPerWeek} training days`,days.length);
  }
  const weeks=outline?.weekProgression;
  if(!Array.isArray(weeks))add('INVALID_TYPE','/weekProgression','array of week targets',weeks);
  else{
    if(weeks.length<schema.weekProgression.minItems||weeks.length>schema.weekProgression.maxItems)add('INVALID_LENGTH','/weekProgression',`${schema.weekProgression.minItems}–${schema.weekProgression.maxItems} week targets`,weeks.length);
    if(weeks.length!==p?.weeks)add('WEEK_COUNT_MISMATCH','/weekProgression',`${p?.weeks??'program'} week targets`,weeks.length);
    const reorderable=normalizeOutline(outline).normalizations.length>0;
    weeks.forEach((week,index)=>{const path=`/weekProgression/${index}`;if(!objectFields(week,path,Object.keys(schema.weekProgression.items.properties)))return;
      if(week.week!==index+1)add('INCONSISTENT_WEEK',`${path}/week`,`week ${index+1}`,week.week,{repairable:reorderable});
      stringField(week.focus,`${path}/focus`,schema.weekProgression.items.properties.focus);
      stringField(week.progressionInstructions,`${path}/progressionInstructions`,schema.weekProgression.items.properties.progressionInstructions);
    });
  }
  for(const key of ['assumptions','questions']){
    const values=outline[key],path=`/${key}`;
    if(!Array.isArray(values)){add('INVALID_TYPE',path,'array of strings',values);continue;}
    values.forEach((value,index)=>stringField(value,`${path}/${index}`,schema[key].items));
  }
  return {findings:errors,valid:errors.length===0};
}

// Reuse the full v2 exercise, cardio, movement and Metcon validator on a
// one-week validation copy. The copy is never eligible for approval or saving.
export function validateGeneratedWeek(week,outline,library,requirements={}){
  const errors=[];
  const add=(path,message)=>errors.push({code:'INVALID_WEEK',path,message,severity:SEVERITY.ERROR});
  if(!validateOutline(outline,requirements).valid)return {findings:[{code:'INVALID_OUTLINE',path:'/',message:'Validate the outline before generating weeks.',severity:SEVERITY.ERROR}],valid:false};
  const expected=week?.week;
  if(!Number.isInteger(expected)||expected<1||expected>outline.program.weeks)add('/week','Week number is outside the outline.');
  if(!record(week)||Object.keys(week).some(k=>!['week','sessions'].includes(k)))add('/','Week must contain only its number and sessions.');
  const plannedDays=outline.trainingDays.map(d=>d.day).sort((a,b)=>a-b);
  const actualDays=Array.isArray(week?.sessions)?week.sessions.map(s=>s?.day).sort((a,b)=>a-b):[];
  if(JSON.stringify(actualDays)!==JSON.stringify(plannedDays))add('/sessions','Week sessions must use every outlined training day exactly once.');
  if(errors.length)return {findings:errors,valid:false};
  const draft={schemaVersion:2,status:'draft',athleteId:null,sourceProgramId:null,originalRequest:'Staged validation only',assumptions:[],questions:[],validationFindings:[],program:{...outline.program,weeks:1,plan:[{...structuredClone(week),week:1}]}};
  const checked=validateDraft(draft,library,{...requirements,programWeeks:1});
  const requiredCodes=new Set(['TRAINING_DAYS_MISMATCH','FREQUENCY_MISMATCH','UNAVAILABLE_EQUIPMENT','PRIMARY_LIFT_EFFORT']);
  const valueAt=path=>path.split('/').slice(1).reduce((value,key)=>value?.[key],draft);
  const schemaExpectation={MISSING_FIELD:'required contract field',INVALID_TYPE:'value with the schema-required type',INVALID_ENUM:'allowed enum value',OUT_OF_RANGE:'value within the schema range',TOO_FEW_ITEMS:'required array items',TOO_MANY_ITEMS:'array within the schema limit',UNSUPPORTED_FIELD:'field absent from the schema'};
  const findings=checked.findings.map(f=>({...f,severity:requiredCodes.has(f.code)?SEVERITY.ERROR:f.severity,path:f.path.replace('/program/plan/0',`/program/plan/${expected-1}`),expected:f.expected||schemaExpectation[f.code],received:f.received??(schemaExpectation[f.code]?observed(valueAt(f.path)):undefined)}));
  for(const [index,session] of week.sessions.entries()){
    const path=`/program/plan/${expected-1}/sessions/${index}`;
    const strength=(Array.isArray(session?.exercises)?session.exercises:[]).filter(exercise=>exercise&&(!exercise.trackingType||exercise.trackingType==='strength')).length;
    const metcons=(Array.isArray(session?.blocks)?session.blocks:[]).filter(block=>block?.type==='Metcon').length;
    if(requirements.strengthMovementsPerSession!==undefined&&strength!==requirements.strengthMovementsPerSession)findings.push({code:'SESSION_STRENGTH_COUNT',path:`${path}/exercises`,expected:`${requirements.strengthMovementsPerSession} strength movements`,received:strength,repairable:false,severity:SEVERITY.ERROR,message:'The session does not contain the requested number of strength movements.'});
    if(requirements.metconsPerSession!==undefined&&metcons!==requirements.metconsPerSession)findings.push({code:'SESSION_METCON_COUNT',path:`${path}/blocks`,expected:`${requirements.metconsPerSession} Metcon blocks`,received:metcons,repairable:false,severity:SEVERITY.ERROR,message:'The session does not contain the requested number of Metcons.'});
  }
  return {findings,valid:!findings.some(f=>f.severity===SEVERITY.ERROR)};
}
