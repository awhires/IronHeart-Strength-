// Reuse the existing instructions, schema normalization and error contract.
// Free-tier eligibility belongs to the Google project; this adapter never manages billing.
import {GenerationError,GENERATION_INSTRUCTIONS,providerSchema} from './openai.mjs';

export function createGeminiProvider({apiKey,model='gemini-3.6-flash',timeoutMs=120000,maxOutputTokens=24000,fetchImpl=fetch}){
  return {name:'gemini',model,async generateProgramDraft(request,context){
    if(!apiKey)throw new GenerationError('NOT_CONFIGURED','AI generation is not configured on this server.',503);
    const controller=new AbortController();let timer;
    try{
      const work=(async()=>{
        const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
          method:'POST',signal:controller.signal,
          headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
          body:JSON.stringify({
            systemInstruction:{parts:[{text:GENERATION_INSTRUCTIONS}]},
            contents:[{role:'user',parts:[{text:JSON.stringify({coach_request:request,...context})}]}],
            generationConfig:{candidateCount:1,maxOutputTokens,responseMimeType:'application/json',responseJsonSchema:providerSchema()}
          })
        });
        if(!response.ok){await response.body?.cancel();throw new GenerationError(response.status===429?'PROVIDER_RATE_LIMIT':response.status===401||response.status===403?'PROVIDER_AUTH':'PROVIDER_UNAVAILABLE',response.status===429?'The AI provider is rate limited. Try again later.':response.status===401||response.status===403?'AI provider authentication failed. Check the server API key and model access.':'The AI provider could not generate a draft. Try again later.',response.status===429?429:502);}
        const reader=response.body?.getReader();if(!reader)throw new GenerationError('INVALID_OUTPUT','The AI provider returned an empty response.');
        let bytes=0,raw='';const decoder=new TextDecoder();
        while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>600000){await reader.cancel();throw new GenerationError('OUTPUT_TOO_LARGE','The generated response was too large. Request a smaller block.');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
        let result;try{result=JSON.parse(raw);}catch{throw new GenerationError('INVALID_OUTPUT','The AI provider returned unreadable structured output.');}
        const candidate=result?.candidates?.[0];
        if(result?.promptFeedback?.blockReason||['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII'].includes(candidate?.finishReason))throw new GenerationError('PROVIDER_REFUSAL','The AI provider declined this request. Reword the training request.');
        if(candidate?.finishReason!=='STOP')throw new GenerationError('INCOMPLETE_OUTPUT','AI generation did not finish. Try a shorter request or block.');
        const parts=candidate.content?.parts;
        if(!Array.isArray(parts)||parts.some(part=>part.functionCall))throw new GenerationError('INVALID_OUTPUT','The AI provider returned invalid structured output.');
        const text=parts.filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('');
        if(!text||text.includes(apiKey))throw new GenerationError('INVALID_OUTPUT','The AI provider returned invalid structured output.');
        try{return JSON.parse(text);}catch{throw new GenerationError('INVALID_OUTPUT','The AI provider returned invalid structured output.');}
      })();
      return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new GenerationError('PROVIDER_TIMEOUT','AI generation timed out. Try again or request a smaller block.',504));},timeoutMs);})]);
    }catch(error){if(error instanceof GenerationError)throw error;throw new GenerationError('PROVIDER_UNAVAILABLE','The AI provider is unavailable. Try again later.');}finally{clearTimeout(timer);}
  }};
}
