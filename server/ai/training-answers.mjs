import {GenerationError} from './openai.mjs';

const schema={type:'object',additionalProperties:false,properties:{answer:{type:'string'},evidenceIds:{type:'array',items:{type:'string'}}},required:['answer','evidenceIds']};
const numbers=value=>(String(value).match(/\d+(?:\.\d+)?/g)||[]).map(Number);

export function createTrainingAnswerService({apiKey,model='gpt-4.1-mini',fetchImpl=fetch,timeoutMs=30000,now=()=>Date.now(),requestsPerHour=6}={}){
  const attempts=new Map(),active=new Set();
  return {available:!!apiKey,async answer({userId,question,analysis}){
    if(!apiKey)throw new GenerationError('NOT_CONFIGURED','Ask AI needs the existing server-side OpenAI configuration.',503);
    const at=now(),recent=(attempts.get(userId)||[]).filter(t=>t>at-3600000);if(recent.length>=requestsPerHour)throw new GenerationError('ASK_RATE_LIMIT','Ask AI hourly limit reached. Try again later.',429);
    if(active.has(userId))throw new GenerationError('ASK_BUSY','Your previous question is still being answered.',429);
    if(JSON.stringify(analysis).length>12000)throw new GenerationError('ASK_CONTEXT_TOO_LARGE','The training summary is too large to analyze.',400);
    attempts.set(userId,[...recent,at]);active.add(userId);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,max_output_tokens:180,instructions:'Answer the athlete conversationally in one to three short sentences. Use only numbers, dates, workout names, and claims contained in verified_answer or evidence. Do not estimate, infer, or invent results. Keep actual lifts distinct from estimated 1RM. If evidence is insufficient, say so. Return the verified evidence IDs you used.',input:JSON.stringify({question,verified_answer:analysis.answer,evidence:analysis.evidence}),text:{format:{type:'json_schema',name:'iron_heart_training_answer',strict:true,schema}}})});
      if(!response.ok){await response.body?.cancel();throw new GenerationError(response.status===429?'ASK_RATE_LIMIT':'ASK_UNAVAILABLE',response.status===429?'Ask AI is temporarily rate limited. Try again later.':'Ask AI could not reach its configured provider.',response.status===429?429:502);}
      const raw=await response.text();if(raw.length>20000)throw new GenerationError('ASK_INVALID_OUTPUT','Ask AI returned an invalid response.');let result;try{result=JSON.parse(raw);}catch{throw new GenerationError('ASK_INVALID_OUTPUT','Ask AI returned an invalid response.');}
      if(result.status!=='completed')throw new GenerationError('ASK_INCOMPLETE','Ask AI did not complete this answer.');
      const parts=(result.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]),text=parts.filter(x=>x.type==='output_text').map(x=>x.text).join('');let output;try{output=JSON.parse(text);}catch{throw new GenerationError('ASK_INVALID_OUTPUT','Ask AI returned an invalid response.');}
      const allowed=new Set(analysis.evidence.map(e=>e.id));
      // Rephrasing is allowed, new numeric/statistical claims are not.
      const verifiedNumbers=new Set(numbers(analysis.answer));
      if(typeof output.answer!=='string'||output.answer.length>1000||!Array.isArray(output.evidenceIds)||output.evidenceIds.some(id=>!allowed.has(id))||numbers(output.answer).some(n=>!verifiedNumbers.has(n)))return {...analysis,provider:model,groundingFallback:true};
      return {...analysis,answer:output.answer,evidence:analysis.evidence.filter(e=>output.evidenceIds.includes(e.id)),provider:model};
    }catch(error){if(error instanceof GenerationError)throw error;throw new GenerationError('ASK_UNAVAILABLE','Ask AI is unavailable right now. Your workout history was not changed.');}
    finally{clearTimeout(timer);active.delete(userId);}
  }};
}
