import {AI_DRAFT_SCHEMA,EXERCISE_SCHEMA,SESSION_SCHEMA} from './contract.mjs';
import {CARDIO_TYPES} from '../tracking.mjs';
import {MOVEMENT_TYPES} from '../movement-prescriptions.mjs';
import {SCORE_TYPES,BLOCK_TYPES} from '../workout-blocks.mjs';
import {RUNNING_PACE_SOURCES,RUNNING_PACE_CATEGORIES} from '../running-pace-method.mjs';
import {RUNNING_RECOVERY_PRESETS} from '../running-interval-presets.mjs';
const num=(max=86400)=>({type:['number','null'],minimum:0,maximum:max});
const txt={type:'string',maxLength:2000};
const optionalText={type:['string','null'],maxLength:2000};
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const id={type:['string','null'],maxLength:200};
const distanceUnit={type:['string','null'],enum:[null,'m','km','mi','yd']};
const paceMethod=obj({type:{type:'string',enum:['fixed','assessment']},source:{type:'string',enum:Object.keys(RUNNING_PACE_SOURCES)},category:{type:'string',enum:Object.keys(RUNNING_PACE_CATEGORIES)},unit:{type:'string',enum:['mi','km']},locked:{type:'boolean'},benchmarkId:{type:'string',minLength:1,maxLength:100}},[]);
const CARDIO_METRICS=obj({distance:num(1000000),distanceUnit,paceUnit:{type:['string','null'],enum:[null,'mi','km']},durationSeconds:num(),paceSeconds:num(),speedMph:num(60),watts:num(10000),cadence:num(500),calories:num(100000),incline:num(100),level:num(100),steps:num(1000000),floors:num(10000),rpe:num(10)},[]);
const recoveryRule=obj({preset:{type:'string',enum:[...Object.keys(RUNNING_RECOVERY_PRESETS),'custom']},recoveryPerWork:{type:'number',minimum:0,maximum:10},workDurationSeconds:{type:'number',exclusiveMinimum:0,maximum:86400}},[]);
const intervalBlock=obj({rounds:{type:['integer','null'],minimum:1,maximum:30},work: CARDIO_METRICS,segments:{type:'array',minItems:1,maxItems:10,items:obj({label:{type:'string',maxLength:80},kind:{type:'string',enum:['work','recovery']},metrics:CARDIO_METRICS},['metrics'])},recovery:CARDIO_METRICS,recoveryAfterFinal:{type:'boolean'},recoveryRule},[]);
export const CARDIO_EXERCISE_SCHEMA=obj({exerciseId:id,exerciseName:{type:'string',minLength:1,maxLength:200},trackingType:{type:'string',enum:CARDIO_TYPES},intervalCount:{type:['integer','null'],minimum:1,maximum:300},restSeconds:num(3600),metrics:CARDIO_METRICS,intervals:{type:'array',maxItems:20,items:intervalBlock},paceMethod,notes:optionalText,progressionInstructions:optionalText},['exerciseId','exerciseName','trackingType','metrics']);
export const MOVEMENT_EXERCISE_SCHEMA=obj({exerciseId:id,exerciseName:{type:'string',minLength:1,maxLength:200},trackingType:{type:'string',enum:MOVEMENT_TYPES},sets:{type:['integer','null'],minimum:1,maximum:12},rest:num(600),metrics:obj({durationSeconds:num(),load:num(1200),loadUnit:{type:['string','null'],enum:[null,'lbs','kg']},distance:num(1000000),distanceUnit,rpe:num(10)},[]),loadMode:{type:'string',enum:['fixed','percentage','bodyweight','athlete_selected','previous_performance','none']},loadDelta:{type:['number','null'],minimum:-200,maximum:200},increment:{type:'number',minimum:0.25,maximum:25},percent1RM:num(100),referenceExerciseId:id,referenceExerciseName:optionalText,notes:optionalText,progressionInstructions:optionalText},['exerciseId','exerciseName','trackingType','sets','rest','metrics','loadMode','percent1RM','referenceExerciseId','referenceExerciseName','notes','progressionInstructions']);
export const METCON_MOVEMENT_SCHEMA=obj({exerciseId:id,exerciseName:{type:'string',minLength:1,maxLength:200},sets:{type:['integer','null'],minimum:1,maximum:10000},reps:num(10000),distance:num(1000000),distanceUnit,calories:num(10000),load:num(10000),loadUnit:{type:['string','null'],enum:[null,'lbs','kg']},minute:num(10000),notes:optionalText},['exerciseId','exerciseName']);
const option=structuredClone(METCON_MOVEMENT_SCHEMA);option.properties.repScheme={type:['array','null'],maxItems:100,items:{type:'integer',minimum:1,maximum:10000}};
METCON_MOVEMENT_SCHEMA.properties.scalingOptions={type:['array','null'],maxItems:10,items:option};
export const METCON_SCHEMA=obj({name:{type:'string',minLength:1,maxLength:200},scoreType:{type:'string',enum:SCORE_TYPES},scoreMode:{type:['string','null'],enum:[null,'rounds_reps','total_reps','rounds','completed_minutes','completed_intervals','completion','per_interval']},format:{type:'string',enum:['standard','chipper','intervals']},benchmark:{type:'boolean'},repScheme:{type:'array',maxItems:100,items:{type:'integer',minimum:1,maximum:1000}},movements:{type:'array',minItems:1,maxItems:30,items:METCON_MOVEMENT_SCHEMA},rounds:num(),durationSeconds:num(),intervalSeconds:num(),timeCapSeconds:num(),workSeconds:num(),restSeconds:num(),notes:optionalText},['name','scoreType','movements']);
export const BLOCK_SCHEMA={anyOf:[obj({id:{type:'string',minLength:1,maxLength:200},type:{const:'Metcon'},name:txt,metcon:METCON_SCHEMA}),obj({id:{type:'string',minLength:1,maxLength:200},type:{type:'string',enum:BLOCK_TYPES.filter(t=>t!=='Metcon')},name:txt,exerciseIndexes:{type:'array',minItems:1,maxItems:15,items:{type:'integer',minimum:0,maximum:14}},superset:{type:'boolean'},supersetNotes:txt,restSeconds:num(600)},['id','type','name','exerciseIndexes'])]};
export const AI_DRAFT_SCHEMA_V2=structuredClone(AI_DRAFT_SCHEMA);
AI_DRAFT_SCHEMA_V2.title='Iron Heart AI Workout Draft v2';
AI_DRAFT_SCHEMA_V2.properties.schemaVersion={const:2};
// Additive v2 fields supported by the current prescription and workout models.
// v1 remains unchanged for existing saved drafts.
const setBlockProperties=Object.fromEntries(['sets','reps','repMode','load','loadMode','loadUnit','loadDelta','percent1RM','referenceExerciseId','referenceExerciseName','reference1RM','referenceLoad','effortMode','rpe','rir','rest','tempo','increment','notes','progressionInstructions'].map(key=>[key,EXERCISE_SCHEMA.properties[key]]));
const v2StrengthExerciseSchema=structuredClone(EXERCISE_SCHEMA);
v2StrengthExerciseSchema.properties.setBlocks={type:'array',minItems:1,maxItems:12,items:obj(setBlockProperties,[])};
const session=structuredClone(SESSION_SCHEMA);
session.properties.exercises={type:'array',minItems:0,maxItems:15,items:{anyOf:[v2StrengthExerciseSchema,CARDIO_EXERCISE_SCHEMA,MOVEMENT_EXERCISE_SCHEMA]}};
session.properties.blocks={type:'array',maxItems:20,items:BLOCK_SCHEMA};
session.required.push('blocks');
AI_DRAFT_SCHEMA_V2.properties.program.properties.plan.items.properties.sessions.items=session;
export function conditioningSession(session){
 const out=structuredClone(session);
 if(!out.blocks?.length)delete out.blocks;
 out.exercises=out.exercises.map(e=>e.trackingType?{...e,metrics:Object.fromEntries(Object.entries(e.metrics||{}).filter(([,v])=>v!=null))}:e);
 if(out.blocks)out.blocks=out.blocks.map(b=>b.type==='Metcon'?{...b,metcon:{...b.metcon,repScheme:b.metcon.repScheme||[],notes:b.metcon.notes||''}}:b);
 return out;
}
