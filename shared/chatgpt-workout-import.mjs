import {normalizeDraftForValidation,validateDraft,validateDraftStructure} from './ai/validate.mjs';
import {trackingProfile} from './tracking.mjs';

export const CHATGPT_IMPORT_FORMAT='iron-heart-strength-workout';
export const CHATGPT_IMPORT_VERSION=1;
export const CHATGPT_IMPORT_MAX_CHARS=500_000;
export const CHATGPT_WORKOUT_PROMPT=`Create an Iron Heart Strength workout program for the request I will give you. Return exactly one JSON object (no Markdown fences or commentary) in this envelope: {"format":"iron-heart-strength-workout","version":1,"draft":{...}}. The draft must use schemaVersion 2, status "draft", athleteId null, and sourceProgramId null. Include every requested week (1–12) and session with name, day (0=Sunday through 6=Saturday), maxDurationMinutes, coachNotes, exercises, and blocks. Program fields: name, goal, description, weeks, coachNotes, progressionInstructions, plan. Draft fields: originalRequest, assumptions, questions, validationFindings (use []), program. Use exact exercise-library names; exerciseId must be null if you do not know the current Iron Heart ID. Do not fabricate athlete results, actual loads, estimated maxes, exercise IDs, assignments, approval, or unsupported fields.

Strength exercise fields: exerciseId, exerciseName, sets, reps, repMode (fixed|max), load, loadMode (fixed|percentage|bodyweight|athlete_selected|previous_performance|none), loadUnit (lbs|kg), loadDelta, percent1RM, referenceExerciseId, referenceExerciseName, reference1RM, referenceLoad, effortMode (none|rpe|rir), rpe, rir, rest, tempo, increment, notes, progressionInstructions. Unknown optional numbers should be null, not zero. Grouped prescriptions use setBlocks with separate supported set prescriptions; parent sets equals the sum of block sets. A non-Metcon block has id, type (Strength|Hypertrophy|Cardio|Accessory|Mobility / Recovery), name, exerciseIndexes (zero-based indexes into that session's exercises), and optional superset, supersetNotes, restSeconds. Each exercise is assigned to exactly one non-Metcon block. A superset requires at least two strength exercises.

Cardio exercise fields: exerciseId, exerciseName, trackingType matching its library profile, metrics, intervalCount, restSeconds, intervals, paceMethod, notes, progressionInstructions. Intervals can use rounds, work, segments, recovery, recoveryAfterFinal, recoveryRule. Work and recovery are distinct; do not count recovery as work. Assessment pace method: {"type":"assessment","source":"six_minute|mile|four_hundred|benchmark","category":"easy|threshold|vo2Intervals|shortIntervals|observed","unit":"mi|km","locked":false}; benchmark source also needs a real benchmarkId. These are suggested targets, never actual results.

A Metcon block has id, type "Metcon", name, and metcon. Metcon fields: name, scoreType (For Time|AMRAP|EMOM|Rounds for Time|Rounds + Reps|Time Cap|Load|Chipper|Intervals), scoreMode, format (standard|chipper|intervals), benchmark (boolean), repScheme, movements, rounds, durationSeconds, intervalSeconds, timeCapSeconds, workSeconds, restSeconds, notes. Every movement needs exerciseId (null if unknown) and exerciseName, with only applicable prescribed targets (sets, reps, distance, distanceUnit, calories, load, loadUnit, minute, notes, scalingOptions). Do not invent a workout result.

Return the complete requested program, preserve all coach instructions and progression intent, and use no keys outside this contract. I will review and edit it in Iron Heart before approval or saving. My programming request follows:`;

const isRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const normalizedName=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const pointerEscape=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
const pointerParts=path=>path.split('/').slice(1).map(part=>part.replaceAll('~1','/').replaceAll('~0','~'));

function mapTargets(draft,library){
  const matched=[],unresolved=[];
  const visit=(target,path,typeHint=null)=>{
    if(!isRecord(target)||typeof target.exerciseName!=='string')return;
    const byId=library.find(item=>item.id===target.exerciseId);
    if(byId&&normalizedName(byId.name)===normalizedName(target.exerciseName))return;
    const expectedType=target.trackingType||typeHint;
    const candidates=library.filter(item=>(!expectedType||trackingProfile(item)===expectedType)&&normalizedName(item.name)===normalizedName(target.exerciseName));
    if(candidates.length===1){
      const originalName=target.exerciseName;
      const choice=candidates[0];target.exerciseId=choice.id;target.exerciseName=choice.name;
      matched.push({path,from:originalName===choice.name?null:originalName,to:choice.name,exerciseId:choice.id});
      return;
    }
    target.exerciseId=null;
    unresolved.push({path,exerciseName:target.exerciseName,type:expectedType||null,candidates:candidates.length?candidates:library.filter(item=>!expectedType||trackingProfile(item)===expectedType).map(item=>({id:item.id,name:item.name}))});
  };
  for(const [wi,week] of (draft.program?.plan||[]).entries())for(const [si,session] of (week.sessions||[]).entries()){
    for(const [ei,exercise] of (session.exercises||[]).entries()){
      const path=`/program/plan/${wi}/sessions/${si}/exercises/${ei}`;
      visit(exercise,path);
    }
    for(const [bi,block] of (session.blocks||[]).entries())if(block.type==='Metcon'){
      for(const [mi,movement] of (block.metcon?.movements||[]).entries()){
        const path=`/program/plan/${wi}/sessions/${si}/blocks/${bi}/metcon/movements/${mi}`;
        visit(movement,path);
        for(const [oi,option] of (movement.scalingOptions||[]).entries())visit(option,`${path}/scalingOptions/${oi}`);
      }
    }
  }
  return {matched,unresolved};
}

export function applyWorkoutImportMappings(draft,mappings,library=[]){
  const next=structuredClone(draft);
  for(const [path,exerciseId] of Object.entries(mappings||{})){
    const target=pointerParts(path).reduce((value,key)=>value?.[key],next);
    if(!isRecord(target)||typeof target.exerciseName!=='string')throw new Error(`Invalid exercise mapping path: ${path}`);
    if(!exerciseId)continue;
    const selected=library.find(item=>item.id===exerciseId);
    if(!selected)throw new Error(`Exercise mapping is not in the current library: ${path}`);
    target.exerciseId=exerciseId;
    target.exerciseName=selected.name;
  }
  return next;
}

export function parseChatGPTWorkoutImport(text,library=[]){
  if(typeof text!=='string'||!text.trim())throw new Error('Paste the versioned JSON workout export first.');
  if(text.length>CHATGPT_IMPORT_MAX_CHARS)throw new Error(`The import is too large. Keep it under ${CHATGPT_IMPORT_MAX_CHARS.toLocaleString()} characters.`);
  let envelope;
  try{envelope=JSON.parse(text);}catch(error){throw new Error(`Invalid JSON: ${error.message}`);}
  if(!isRecord(envelope))throw new Error('The import must be a JSON object.');
  const extra=Object.keys(envelope).filter(key=>!['format','version','draft'].includes(key));
  if(extra.length)throw new Error(`Unsupported import field(s): ${extra.join(', ')}.`);
  if(envelope.format!==CHATGPT_IMPORT_FORMAT)throw new Error(`Unsupported import format. Expected "${CHATGPT_IMPORT_FORMAT}".`);
  if(envelope.version!==CHATGPT_IMPORT_VERSION)throw new Error(`Unsupported import version ${String(envelope.version)}. This app supports version ${CHATGPT_IMPORT_VERSION}.`);
  if(!isRecord(envelope.draft))throw new Error('The import is missing its draft object.');
  if(envelope.draft.schemaVersion!==2)throw new Error('The embedded draft must use Iron Heart workout schemaVersion 2.');
  if(envelope.draft.status!=='draft')throw new Error('Imports must have status "draft". Approved or published data cannot be imported.');
  if(envelope.draft.athleteId!=null||envelope.draft.sourceProgramId!=null)throw new Error('Imports cannot target an athlete or overwrite a source program.');

  const draft=normalizeDraftForValidation(envelope.draft);
  const structure=validateDraftStructure(draft);
  if(structure.length){
    const first=structure[0];
    const details=structure.slice(0,8).map(f=>`${f.path||'/'}: ${f.message}`).join('\n');
    const error=new Error(`The workout does not match the version 2 draft structure (${structure.length} issue${structure.length===1?'':'s'}):\n${details}`);
    error.code='IMPORT_STRUCTURE_INVALID';error.findings=structure;throw error;
  }
  const mappings=mapTargets(draft,library);
  const validation=validateDraft(draft,library,{});
  return {draft,validation,matched:mappings.matched,unresolved:mappings.unresolved,format:CHATGPT_IMPORT_FORMAT,version:CHATGPT_IMPORT_VERSION};
}

export function validateMappedWorkoutImport(draft,library=[]){
  return validateDraft(normalizeDraftForValidation(draft),library,{});
}

export function chatGPTWorkoutImportEnvelope(draft){
  if(!isRecord(draft)||draft.schemaVersion!==2||draft.status!=='draft'||draft.athleteId!=null||draft.sourceProgramId!=null)throw new Error('Only an unassigned schema v2 draft can be exported for import.');
  return {format:CHATGPT_IMPORT_FORMAT,version:CHATGPT_IMPORT_VERSION,draft:structuredClone(draft)};
}
