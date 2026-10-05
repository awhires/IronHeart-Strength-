import {createOpenAIProvider,GenerationError} from './openai.mjs';
import {generationConfig} from './generation.mjs';
import {SCAN_SCHEMA,SCAN_INSTRUCTIONS,reviewScan} from '../../shared/scan-workout.mjs';
export function createScanService({config=generationConfig(),provider,now=()=>Date.now()}={}){
 const adapter=provider||createOpenAIProvider(config),active=new Set(),attempts=new Map();
 return {async scan(input,{userId,library}){
  if(!provider&&(!config.enabled||!config.apiKey||config.provider!=='openai'))throw new GenerationError('SCAN_UNAVAILABLE','Workout scanning requires the server OpenAI provider.',503);
  if(!input||Object.keys(input).some(k=>k!=='image')||typeof input.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.image)||input.image.length>5600000)throw new GenerationError('INVALID_IMAGE','Choose a JPEG, PNG or WebP image under 4 MB.',400);
  const time=now(),recent=(attempts.get(userId)||[]).filter(t=>t>time-3600000);
  if(active.has(userId)||active.size>=2||recent.length>=config.requestsPerHour)throw new GenerationError('SCAN_LIMIT','Scan limit reached. Please try again later.',429);
  for(const [key,list] of attempts)if(!list.some(t=>t>time-3600000))attempts.delete(key);
  active.add(userId);attempts.set(userId,[...recent,time]);
  try{const context={exercise_library:library.slice(0,300).map(({id,name})=>({id,name}))};const result=await adapter.generateProgramDraft('Extract the completed workout. Return a review draft only.',context,{instructions:SCAN_INSTRUCTIONS,schema:SCAN_SCHEMA,image:input.image});if(config.apiKey&&JSON.stringify(result).includes(config.apiKey))throw Error('Invalid response');return reviewScan(result,library);}catch(e){if(e instanceof GenerationError)throw e;throw new GenerationError('SCAN_FAILED','The image could not be read into a workout. Try a clearer photo or enter it manually.');}finally{active.delete(userId);}
 }};
}
