import {validateProgrammingOptions,methodologyContext} from '../../shared/ai/programming-options.mjs';
import {trackingProfile} from '../../shared/tracking.mjs';
import {randomUUID} from 'node:crypto';
import {createOpenAIProvider,GenerationError} from './openai.mjs';
import {createGeminiProvider} from './gemini.mjs';
import {validateDraft,validateDraftStructure} from '../../shared/ai/validate.mjs';
import {SCHEMA_VERSION,DRAFT_STATUS,PROGRAM_LENGTHS} from '../../shared/ai/contract.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const reject=message=>{throw new GenerationError('INVALID_REQUEST',message,400);};
const bound=(value,fallback,min,max)=>{const n=Number(value??fallback);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;};
export function generationConfig(env=process.env){const gemini=env.AI_PROVIDER==='gemini';return {enabled:env.AI_ENABLED==='true',provider:env.AI_PROVIDER||'openai',apiKey:(gemini?env.GEMINI_API_KEY:env.OPENAI_API_KEY)||'',model:gemini?(env.GEMINI_MODEL||'gemini-3.6-flash'):(env.OPENAI_MODEL||'gpt-4.1-mini'),timeoutMs:bound(env.AI_TIMEOUT_MS,120000,1000,180000),maxOutputTokens:bound(env.AI_MAX_OUTPUT_TOKENS,24000,1000,32768),requestsPerHour:bound(env.AI_REQUESTS_PER_HOUR,6,1,30),debug:env.AI_DEBUG==='true'};}
export function validateGenerationInput(input,library){
  if(!object(input)||Object.keys(input).some(k=>!['request','athleteId','requirements','programming'].includes(k)))reject('Use request, optional athleteId, and optional confirmed requirements.');
  if(typeof input.request!=='string'||input.request.trim().length<10||input.request.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.request))reject('Enter a training request between 10 and 2000 characters.');
  if(input.athleteId!=null&&(typeof input.athleteId!=='string'||!input.athleteId||input.athleteId.length>200))reject('Choose a valid athlete.');
  const requirements=structuredClone(input.requirements||{});
  if(!object(requirements)||Object.keys(requirements).some(k=>!['programWeeks','trainingDaysPerWeek','maxSessionMinutes','exerciseFrequency','primaryExerciseIds','unavailableEquipment'].includes(k)))reject('Unsupported confirmed requirement.');
  if(requirements.programWeeks!==undefined&&!PROGRAM_LENGTHS.includes(requirements.programWeeks))reject('Choose a supported number of weeks.');
  for(const [k,min,max] of [['trainingDaysPerWeek',1,7],['maxSessionMinutes',1,240]])if(requirements[k]!==undefined&&(!Number.isInteger(requirements[k])||requirements[k]<min||requirements[k]>max))reject(`Invalid ${k}.`);
  if(requirements.exerciseFrequency!==undefined){if(!object(requirements.exerciseFrequency)||Object.keys(requirements.exerciseFrequency).length>30)reject('Invalid exercise frequencies.');for(const [id,value] of Object.entries(requirements.exerciseFrequency))if(!library.some(e=>e.id===id)||!Number.isInteger(value)||value<0||value>7)reject('Frequencies need a library exercise and 0–7 days.');}
  if(requirements.primaryExerciseIds!==undefined&&(!Array.isArray(requirements.primaryExerciseIds)||requirements.primaryExerciseIds.length>30||requirements.primaryExerciseIds.some(id=>!library.some(e=>e.id===id))))reject('Choose valid library IDs for RPE checks.');
  if(requirements.unavailableEquipment!==undefined&&(!Array.isArray(requirements.unavailableEquipment)||requirements.unavailableEquipment.length>20||requirements.unavailableEquipment.some(x=>typeof x!=='string'||!x.trim()||x.length>80)))reject('List unavailable equipment using short names.');
  let programming;try{programming=validateProgrammingOptions(input.programming);}catch(e){reject(e.message);}return {request:input.request,athleteId:input.athleteId??null,requirements,...(programming?{programming}:{})};
}
// No storage/write APIs are accepted by this service. Context is an explicit allowlist.
export function createGenerationService({config=generationConfig(),provider,production=false,now=()=>Date.now(),newId=randomUUID}={}){
  const adapter=provider||(config.provider==='gemini'?createGeminiProvider(config):createOpenAIProvider(config)),attempts=new Map(),active=new Set();
  const available=!!provider||(config.enabled&&['openai','gemini'].includes(config.provider)&&!!config.apiKey);
  return {
    status(){return {available,provider:adapter.name,model:adapter.model,debug:config.debug&&!production,reason:available?null:'Live generation requires server-side AI provider configuration.'};},
    async generateProgramDraft(input,{coachId,library,athlete=null}){
      if(!available)throw new GenerationError('NOT_CONFIGURED','Live AI generation is not configured. Add the server environment settings.',503);
      const value=validateGenerationInput(input,library);
      if(value.athleteId&&(!athlete||athlete.id!==value.athleteId))reject('The selected athlete is unavailable.');
      if(library.length>300)reject('The exercise library is too large for direct AI context. Narrow it before generation.');
      if(active.has(coachId)||active.size>=2)throw new GenerationError('GENERATION_BUSY','A generation is already running. Wait for it to finish.',429);
      const time=now();for(const [key,list] of attempts){const recent=list.filter(t=>t>time-3600000);if(recent.length)attempts.set(key,recent);else attempts.delete(key);}
      const recent=attempts.get(coachId)||[];
      if(recent.length>=config.requestsPerHour)throw new GenerationError('GENERATION_RATE_LIMIT','Your hourly generation limit has been reached. Try again later.',429);
      attempts.set(coachId,[...recent,time]);active.add(coachId);
      try{
        const context={exercise_library:library.map(e=>({exerciseId:e.id,name:e.name,region:e.region,equipment:e.equipment,movementPattern:e.pattern,trackingType:trackingProfile(e)})),confirmed_requirements:value.requirements,athlete:athlete?{sport:athlete.sport}:null};
        if(value.programming)context.iron_heart_methodology=methodologyContext(value.programming);
        if(JSON.stringify(context).length>60000)reject('Exercise context is too large. Reduce the library size.');
        let output;try{output=await adapter.generateProgramDraft(value.request,context);}catch(e){if(e instanceof GenerationError)throw e;throw new GenerationError('PROVIDER_UNAVAILABLE','AI generation failed. Try again later.');}
        if(!object(output)||Buffer.byteLength(JSON.stringify(output))>80000)throw new GenerationError('INVALID_OUTPUT','AI returned an invalid or oversized draft. Request a smaller block.');
        if(validateDraftStructure(output).length)throw new GenerationError('CONTRACT_MISMATCH','AI returned a draft that does not match the workout contract. Try again with a clearer or smaller request.');
        // Provider status, claimed validation, linkage, and rewritten prompt cannot grant authority.
        const draft={...structuredClone(output),status:DRAFT_STATUS.DRAFT,athleteId:value.athleteId,sourceProgramId:null,originalRequest:value.request,validationFindings:[]};
        const validation=validateDraft(draft,library,value.requirements);
        draft.validationFindings=validation.findings;draft.status=validation.findings.length?DRAFT_STATUS.NEEDS_REVIEW:DRAFT_STATUS.DRAFT;
        const metadata={provider:adapter.name,model:adapter.model,generatedAt:new Date(now()).toISOString(),schemaVersion:draft.schemaVersion,durationMs:Math.max(0,now()-time)};
        return {generationId:newId(),draft,requirements:value.requirements,...(value.programming?{programming:value.programming}:{}),validation,metadata,...(config.debug&&!production?{debug:{coachRequest:value.request,structuredResponse:structuredClone(draft),validationFindings:validation.findings,durationMs:metadata.durationMs}}:{})};
      }finally{active.delete(coachId);}
    }
  };
}
