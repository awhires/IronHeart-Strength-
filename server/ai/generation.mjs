import {validateProgrammingOptions,methodologyContext} from '../../shared/ai/programming-options.mjs';
import {trackingProfile} from '../../shared/tracking.mjs';
import {randomUUID} from 'node:crypto';
import {createOpenAIProvider,GenerationError,GENERATION_INSTRUCTIONS} from './openai.mjs';
import {createGeminiProvider} from './gemini.mjs';
import {validateDraft,validateDraftStructure} from '../../shared/ai/validate.mjs';
import {SCHEMA_VERSION,DRAFT_STATUS,PROGRAM_LENGTHS} from '../../shared/ai/contract.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const reject=message=>{throw new GenerationError('INVALID_REQUEST',message,400);};
const bound=(value,fallback,min,max)=>{const n=Number(value??fallback);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;};
export function generationConfig(env=process.env){const gemini=env.AI_PROVIDER==='gemini';return {enabled:env.AI_ENABLED==='true',programModel:env.OPENAI_PROGRAM_MODEL||'',provider:env.AI_PROVIDER||'openai',apiKey:(gemini?env.GEMINI_API_KEY:env.OPENAI_API_KEY)||'',model:gemini?(env.GEMINI_MODEL||'gemini-3.6-flash'):(env.OPENAI_MODEL||'gpt-4.1-mini'),timeoutMs:bound(env.AI_TIMEOUT_MS,120000,1000,180000),maxOutputTokens:bound(env.AI_MAX_OUTPUT_TOKENS,24000,1000,32768),requestsPerHour:bound(env.AI_REQUESTS_PER_HOUR,6,1,30),stagedCallsPerHour:bound(env.AI_STAGED_CALLS_PER_HOUR,12,1,30),debug:env.AI_DEBUG==='true'};}
export function validateGenerationInput(input,library){
  if(!object(input)||Object.keys(input).some(k=>!['request','athleteId','requirements','programming'].includes(k)))reject('Use request, optional athleteId, and optional confirmed requirements.');
  if(typeof input.request!=='string'||input.request.trim().length<10||input.request.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.request))reject('Enter a training request between 10 and 2000 characters.');
  if(input.athleteId!=null&&(typeof input.athleteId!=='string'||!input.athleteId||input.athleteId.length>200))reject('Choose a valid athlete.');
  const requirements=structuredClone(input.requirements||{});
  // Infer explicit week length and weekly frequency independently.
  const length=input.request.match(/\b(1|3|4|6|8|9|12|one|single|three|four|six|eight|nine|twelve)[ -]+weeks?\b/i);
  if(requirements.programWeeks===undefined&&length)requirements.programWeeks=({one:1,single:1,three:3,four:4,six:6,eight:8,nine:9,twelve:12})[length[1].toLowerCase()]||Number(length[1]);
  const frequency=input.request.match(/\b([1-7]|one|two|three|four|five|six|seven)[ -]+(?:training[ -]+)?days?\s+(?:per|a|each)\s+week\b/i);
  if(requirements.trainingDaysPerWeek===undefined&&frequency)requirements.trainingDaysPerWeek=({one:1,two:2,three:3,four:4,five:5,six:6,seven:7})[frequency[1].toLowerCase()]||Number(frequency[1]);
  const composition=input.request.match(/\b(?:each|every)\s+session\b[^.]{0,100}\b(one|two|three|four|[1-4])\s+strength\s+(?:movements?|exercises?)\b[^.]{0,60}\b(one|two|three|four|[1-4])\s+Metcons?\b/i);
  if(composition){const count=value=>({one:1,two:2,three:3,four:4})[value.toLowerCase()]||Number(value);requirements.strengthMovementsPerSession??=count(composition[1]);requirements.metconsPerSession??=count(composition[2]);}
  if(!object(requirements)||Object.keys(requirements).some(k=>!['programWeeks','trainingDaysPerWeek','maxSessionMinutes','exerciseFrequency','primaryExerciseIds','unavailableEquipment','strengthMovementsPerSession','metconsPerSession'].includes(k)))reject('Unsupported confirmed requirement.');
  if(requirements.programWeeks!==undefined&&!PROGRAM_LENGTHS.includes(requirements.programWeeks))reject('Choose a supported number of weeks.');
  for(const [k,min,max] of [['trainingDaysPerWeek',1,7],['maxSessionMinutes',1,240]])if(requirements[k]!==undefined&&(!Number.isInteger(requirements[k])||requirements[k]<min||requirements[k]>max))reject(`Invalid ${k}.`);
  for(const [k,max] of [['strengthMovementsPerSession',15],['metconsPerSession',5]])if(requirements[k]!==undefined&&(!Number.isInteger(requirements[k])||requirements[k]<1||requirements[k]>max))reject(`Invalid ${k}.`);
  if(requirements.exerciseFrequency!==undefined){if(!object(requirements.exerciseFrequency)||Object.keys(requirements.exerciseFrequency).length>30)reject('Invalid exercise frequencies.');for(const [id,value] of Object.entries(requirements.exerciseFrequency))if(!library.some(e=>e.id===id)||!Number.isInteger(value)||value<0||value>7)reject('Frequencies need a library exercise and 0–7 days.');}
  if(requirements.primaryExerciseIds!==undefined&&(!Array.isArray(requirements.primaryExerciseIds)||requirements.primaryExerciseIds.length>30||requirements.primaryExerciseIds.some(id=>!library.some(e=>e.id===id))))reject('Choose valid library IDs for RPE checks.');
  if(requirements.unavailableEquipment!==undefined&&(!Array.isArray(requirements.unavailableEquipment)||requirements.unavailableEquipment.length>20||requirements.unavailableEquipment.some(x=>typeof x!=='string'||!x.trim()||x.length>80)))reject('List unavailable equipment using short names.');
  let programming;try{programming=validateProgrammingOptions(input.programming);}catch(e){reject(e.message);}return {request:input.request,athleteId:input.athleteId??null,requirements,...(programming?{programming}:{})};
}
// No storage/write APIs are accepted by this service. Context is an explicit allowlist.
export function createGenerationService({config=generationConfig(),provider,production=false,now=()=>Date.now(),newId=randomUUID,logger=event=>console.info(JSON.stringify(event)),deadlineMs=170000}={}){
  const adapter=provider||(config.provider==='gemini'?createGeminiProvider(config):createOpenAIProvider({...config,model:config.programModel||config.model})),attempts=new Map(),active=new Set();
  const available=!!provider||(config.enabled&&['openai','gemini'].includes(config.provider)&&!!config.apiKey);
  return {
    status(){return {available,provider:adapter.name,model:adapter.model,debug:config.debug&&!production,reason:available?null:'Live generation requires server-side AI provider configuration.'};},
    async generateProgramDraft(input,{coachId,library,athlete=null,signal=null}){
      if(!available)throw new GenerationError('NOT_CONFIGURED','Live AI generation is not configured. Add the server environment settings.',503);
      const value=validateGenerationInput(input,library);
      if(value.athleteId&&(!athlete||athlete.id!==value.athleteId))reject('The selected athlete is unavailable.');
      if(library.length>300)reject('The exercise library is too large for direct AI context. Narrow it before generation.');
      if(active.has(coachId)||active.size>=2)throw new GenerationError('GENERATION_BUSY','A generation is already running. Wait for it to finish.',429);
      const time=now();for(const [key,list] of attempts){const recent=list.filter(t=>t>time-3600000);if(recent.length)attempts.set(key,recent);else attempts.delete(key);}
      const recent=attempts.get(coachId)||[];
      if(recent.length>=config.requestsPerHour)throw new GenerationError('GENERATION_RATE_LIMIT','Your hourly generation limit has been reached. Try again later.',429);
      active.add(coachId);
      let usage=[],completionAttempts=0,repairErrorCode;
      const deadline=Date.now()+deadlineMs,controller=new AbortController();
      const cancel=()=>controller.abort(signal?.reason instanceof Error?signal.reason:new GenerationError('CLIENT_CANCELED','Generation canceled because the connection closed.',499));
      if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
      const deadlineTimer=setTimeout(()=>controller.abort(new GenerationError('PROVIDER_TIMEOUT','AI generation reached its server deadline. Try a smaller block.',504)),Math.max(1,deadlineMs));
      const remaining=()=>Math.max(0,deadline-Date.now());
      const ensureTime=(minimum=1)=>{if(controller.signal.aborted)throw controller.signal.reason;if(remaining()<minimum)throw new GenerationError('PROVIDER_TIMEOUT','AI generation reached its server deadline. Try a smaller block.',504);};
      const timings={contextMs:0,providerMs:0,validationMs:0,providerCalls:[]},sizes={contextBytes:0,outputBytes:0};
      const measuredGenerate=async(request,context,task)=>{ensureTime();const start=now();let onAbort,reported=false;const report=value=>{if(!reported){reported=true;task.onTiming?.(value);}};try{return await Promise.race([adapter.generateProgramDraft(request,context,{...task,onTiming:report,signal:controller.signal,timeoutMs:Math.min(config.timeoutMs,remaining())}),new Promise((_,reject)=>{onAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',onAbort,{once:true});})]);}finally{controller.signal.removeEventListener('abort',onAbort);if(controller.signal.aborted&&!reported)report({headersMs:null,bodyMs:null,totalMs:Math.max(0,now()-start)});timings.providerMs+=Math.max(0,now()-start);}};
      const audit=(status,code)=>{try{logger({event:'ai_program_generation',provider:adapter.name,model:adapter.model,status,...(code?{code}:{}),durationMs:Math.max(0,now()-time),completionAttempts,usage,timings,sizes});}catch{}};
      try{
        ensureTime();const contextStart=now();
        const context={exercise_library:library.map(e=>({exerciseId:e.id,name:e.name,region:e.region,equipment:e.equipment,movementPattern:e.pattern,trackingType:trackingProfile(e)})),confirmed_requirements:value.requirements,athlete:athlete?{sport:athlete.sport}:null};
        if(value.programming)context.iron_heart_methodology=methodologyContext(value.programming);
        sizes.contextBytes=Buffer.byteLength(JSON.stringify(context));timings.contextMs=Math.max(0,now()-contextStart);
        if(JSON.stringify(context).length>60000)reject('Exercise context is too large. Reduce the library size.');
        let output;try{ensureTime();attempts.set(coachId,[...recent,time]);completionAttempts++;output=await measuredGenerate(value.request,context,{onTiming:t=>timings.providerCalls.push(t),onUsage:u=>usage.push(u)});}catch(e){if(e instanceof GenerationError)throw e;throw new GenerationError('PROVIDER_UNAVAILABLE','AI generation failed. Try again later.');}
        sizes.outputBytes=Buffer.byteLength(JSON.stringify(output)??'');
        if(!object(output)||sizes.outputBytes>80000)throw new GenerationError('INVALID_OUTPUT','AI returned an invalid or oversized draft. Request a smaller block.');
        if(validateDraftStructure(output).length)throw new GenerationError('CONTRACT_MISMATCH','AI returned a draft that does not match the workout contract. Try again with a clearer or smaller request.');
        const expected=value.requirements.programWeeks||output.program.weeks;
        if(expected&&output.program.plan.length<expected){
          // One bounded repair attempt, preserving the first reviewable draft on failure.
          try{ensureTime(30000);completionAttempts++;const repair=await measuredGenerate(value.request,{...context,confirmed_requirements:{...value.requirements,programWeeks:expected}},{instructions:GENERATION_INSTRUCTIONS+' The previous response omitted weeks. Return ALL '+expected+' sequential weeks, even when exercises have unresolved IDs. Keep notes concise.',onTiming:t=>timings.providerCalls.push(t),onUsage:u=>usage.push(u)});
            if(object(repair)&&Buffer.byteLength(JSON.stringify(repair))<=80000&&!validateDraftStructure(repair).length&&repair.program.weeks===expected&&repair.program.plan.length===expected)output=repair;
          }catch(e){repairErrorCode=e instanceof GenerationError?e.code:'PROVIDER_UNAVAILABLE';}
        }
        ensureTime();const hasRir=v=>v&&typeof v==='object'&&(v.effortMode==='rir'||v.rir!=null||Object.values(v).some(x=>x&&typeof x==='object'&&hasRir(x)));
        if(hasRir(output))throw new GenerationError('UNSUPPORTED_EFFORT','New AI prescriptions must use RPE or standard sets/reps.');
        // Provider status, claimed validation, linkage, and rewritten prompt cannot grant authority.
        const draft={...structuredClone(output),status:DRAFT_STATUS.DRAFT,athleteId:value.athleteId,sourceProgramId:null,originalRequest:value.request,validationFindings:[]};
        const validationStart=now();
        const validation=validateDraft(draft,library,value.requirements);
        timings.validationMs=Math.max(0,now()-validationStart);
        ensureTime();draft.validationFindings=validation.findings;draft.status=validation.findings.length?DRAFT_STATUS.NEEDS_REVIEW:DRAFT_STATUS.DRAFT;
        const metadata={provider:adapter.name,model:adapter.model,generatedAt:new Date(now()).toISOString(),schemaVersion:draft.schemaVersion,durationMs:Math.max(0,now()-time),completionAttempts,usage,timings,sizes,...(repairErrorCode?{repairErrorCode}:{})};
        audit('completed');
        return {generationId:newId(),draft,requirements:value.requirements,...(value.programming?{programming:value.programming}:{}),validation,metadata,...(config.debug&&!production?{debug:{coachRequest:value.request,structuredResponse:structuredClone(draft),validationFindings:validation.findings,durationMs:metadata.durationMs}}:{})};
      }catch(error){audit('failed',error instanceof GenerationError?error.code:'PROVIDER_UNAVAILABLE');throw error;}finally{clearTimeout(deadlineTimer);signal?.removeEventListener('abort',cancel);active.delete(coachId);}
    }
  };
}
