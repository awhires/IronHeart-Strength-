// Provider- and storage-independent contract. No persistence or network access.
export const SCHEMA_VERSION = 1;
export const LOAD_MODE = Object.freeze({ FIXED:'fixed', PERCENTAGE:'percentage', BODYWEIGHT:'bodyweight', ATHLETE_SELECTED:'athlete_selected' });
export const EFFORT_MODE = Object.freeze({ NONE:'none', RPE:'rpe', RIR:'rir' });
export const LOAD_UNIT = Object.freeze({ LBS:'lbs', KG:'kg' });
export const DRAFT_STATUS = Object.freeze({ DRAFT:'draft', NEEDS_REVIEW:'needs_review', APPROVED:'approved' });
export const REFERENCE_TYPE = Object.freeze({ TESTED:'tested', ESTIMATED:'estimated', COACH_ENTERED:'coach_entered' });
export const SEVERITY = Object.freeze({ ERROR:'error', WARNING:'warning', INFO:'info' });
export const PROGRAM_LENGTHS = Object.freeze([3,4,6,8,9,12]);
export const DAYS = Object.freeze(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']);
export const TEMPO_DESCRIPTION = 'Eccentric - bottom pause - concentric - top pause. X means intentionally explosive concentric action.';
export const TEMPO_PATTERN = '^\\d{1,2}-\\d{1,2}-(?:\\d{1,2}|X)-\\d{1,2}$';
export const TEMPO_REGEX = new RegExp(TEMPO_PATTERN);
export const EXERCISE_FIELDS = Object.freeze(['exerciseId','exerciseName','sets','reps','load','loadMode','loadUnit','percent1RM','reference1RM','effortMode','rpe','rir','rest','tempo','increment','notes','progressionInstructions']);

const text = {type:'string',maxLength:2000};
const nullableNumber = (minimum,maximum) => ({type:['number','null'],minimum,maximum});
const enumOf = values => ({type:'string',enum:Object.values(values)});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const nullableId = {type:['string','null'],minLength:1,maxLength:200};
export const REFERENCE_SCHEMA = object({exerciseId:{type:'string',minLength:1},value:{type:'number',exclusiveMinimum:0,maximum:1200},unit:enumOf(LOAD_UNIT),type:enumOf(REFERENCE_TYPE),date:{type:'string',format:'date'}});
export const EXERCISE_SCHEMA = object({
  exerciseId:nullableId,exerciseName:{type:'string',minLength:1,maxLength:200},
  sets:{type:'integer',minimum:1,maximum:12},reps:{type:'integer',minimum:1,maximum:50},
  load:nullableNumber(0,1200),loadMode:enumOf(LOAD_MODE),loadUnit:enumOf(LOAD_UNIT),
  percent1RM:nullableNumber(1,100),reference1RM:{anyOf:[{type:'null'},REFERENCE_SCHEMA]},
  effortMode:enumOf(EFFORT_MODE),rpe:nullableNumber(1,10),rir:nullableNumber(0,10),
  rest:{type:'number',minimum:0,maximum:600},tempo:{type:['string','null'],pattern:TEMPO_PATTERN},
  increment:{type:'number',minimum:0.25,maximum:25},notes:text,progressionInstructions:text
});
export const SESSION_SCHEMA = object({name:{type:'string',minLength:1,maxLength:200},day:{type:'integer',minimum:0,maximum:6},maxDurationMinutes:nullableNumber(1,240),coachNotes:text,exercises:{type:'array',minItems:1,maxItems:15,items:EXERCISE_SCHEMA}});
export const FINDING_SCHEMA = {...object({code:{type:'string'},severity:enumOf(SEVERITY),message:{type:'string'},path:{type:'string'},suggestedResolution:{type:'string'}}),required:['code','severity','message','path']};
export const AI_DRAFT_SCHEMA = {
  $schema:'https://json-schema.org/draft/2020-12/schema',title:'Iron Heart AI Workout Draft v1',
  ...object({schemaVersion:{const:SCHEMA_VERSION},status:enumOf(DRAFT_STATUS),athleteId:nullableId,sourceProgramId:nullableId,originalRequest:text,
    assumptions:{type:'array',items:text},questions:{type:'array',items:text},validationFindings:{type:'array',items:FINDING_SCHEMA},
    program:object({name:{type:'string',minLength:1,maxLength:200},goal:{type:'string',minLength:1,maxLength:200},description:text,weeks:{type:['integer','null'],enum:[null,...PROGRAM_LENGTHS]},coachNotes:text,progressionInstructions:text,
      plan:{type:'array',minItems:1,maxItems:12,items:object({week:{type:'integer',minimum:1,maximum:12},sessions:{type:'array',minItems:1,maxItems:7,items:SESSION_SCHEMA}})}})
  })
};

// Input controls preserve blank as null, never Number('') === 0.
export const parseOptionalNumber = value => value.trim()==='' ? null : Number(value);
export const inPounds = (value,unit) => unit===LOAD_UNIT.KG ? value*2.2046226218 : value;
export const convertWeight = (value,from,to) => from===to ? value : to===LOAD_UNIT.LBS ? inPounds(value,from) : value/2.2046226218;
