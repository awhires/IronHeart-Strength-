import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiProvider} from '../server/ai/gemini.mjs';
import {generationConfig,createGenerationService} from '../server/ai/generation.mjs';
import {createFixture,FIXTURE_REQUIREMENTS} from '../shared/ai/fixtures.mjs';
import {AI_DRAFT_SCHEMA} from '../shared/ai/contract.mjs';
import {exercises} from '../server/seed.mjs';
const secret='gemini-test-key-not-a-real-credential';
const config=generationConfig({AI_ENABLED:'true',AI_PROVIDER:'gemini',GEMINI_API_KEY:secret});
const input={request:'Create a four-week strength program with four training days.',requirements:FIXTURE_REQUIREMENTS};
const envelope=(draft=createFixture())=>({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'Private reasoning must not enter the draft.'},{text:typeof draft==='string'?draft:JSON.stringify(draft)}]}}]});
const reply=value=>new Response(JSON.stringify(value));
const adapter=value=>createGeminiProvider({...config,fetchImpl:async()=>reply(value)});

test('Gemini selection is additive, uses only its key, and preserves OpenAI defaults',()=>{
  const original=generationConfig({OPENAI_API_KEY:'openai-only'});
  assert.equal(original.provider,'openai');assert.equal(original.model,'gpt-4.1-mini');assert.equal(original.apiKey,'openai-only');
  assert.equal(config.model,'gemini-3.6-flash');assert.equal(config.apiKey,secret);
  assert.equal(generationConfig({AI_PROVIDER:'gemini',OPENAI_API_KEY:'wrong-provider'}).apiKey,'');
  assert.equal(generationConfig({AI_PROVIDER:'gemini',GEMINI_MODEL:'custom-model'}).model,'custom-model');
  const status=createGenerationService({config}).status();assert.equal(status.available,true);assert.equal(status.provider,'gemini');assert.ok(!JSON.stringify(status).includes(secret));
  assert.equal(createGenerationService({config:{...config,enabled:false}}).status().available,false);
  assert.equal(createGenerationService({config:{...config,apiKey:''}}).status().available,false);
  assert.equal(createGenerationService({config:{...config,provider:'unknown'}}).status().available,false);
});

test('Gemini requests structured drafts on the server without tools and discards thoughts',async()=>{
  let sent;const before=structuredClone(AI_DRAFT_SCHEMA);
  const p=createGeminiProvider({...config,fetchImpl:async(url,options)=>{sent={url,...options,body:JSON.parse(options.body)};return reply(envelope());}});
  assert.deepEqual(await p.generateProgramDraft(input.request,{exercise_library:[]}),createFixture());
  assert.equal(sent.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
  assert.equal(sent.headers['x-goog-api-key'],secret);assert.ok(!sent.url.includes(secret));assert.ok(!JSON.stringify(sent.body).includes(secret));
  assert.equal(sent.body.tools,undefined);assert.equal(sent.body.generationConfig.candidateCount,1);assert.equal(sent.body.generationConfig.maxOutputTokens,24000);
  assert.equal(sent.body.generationConfig.responseMimeType,'application/json');assert.equal(sent.body.generationConfig.responseJsonSchema.properties.schemaVersion.enum[0],2);
  assert.equal(JSON.parse(sent.body.contents[0].parts[0].text).coach_request,input.request);
  assert.deepEqual(AI_DRAFT_SCHEMA,before);
});

test('Gemini refusals, truncation, empty output, invalid JSON and tool calls fail safely',async()=>{
  for(const [value,code] of [
    [{promptFeedback:{blockReason:'SAFETY'}},'PROVIDER_REFUSAL'],
    [{candidates:[{finishReason:'SAFETY'}]},'PROVIDER_REFUSAL'],
    [{candidates:[{finishReason:'MAX_TOKENS'}]},'INCOMPLETE_OUTPUT'],
    [envelope('not JSON'),'INVALID_OUTPUT'],[envelope(''),'INVALID_OUTPUT'],[envelope(secret),'INVALID_OUTPUT'],
    [{candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'save'}}]}}]},'INVALID_OUTPUT']
  ])await assert.rejects(adapter(value).generateProgramDraft(input.request,{}),e=>e.code===code&&!e.message.includes(secret)&&e.message.includes('No program was changed or saved.'));
  await assert.rejects(createGeminiProvider({...config,fetchImpl:async()=>new Response('broken JSON')}).generateProgramDraft(input.request,{}),e=>e.code==='INVALID_OUTPUT');
});

test('Gemini timeout aborts and failures never expose keys, retry or fall back',async()=>{
  let signal;const timed=createGeminiProvider({...config,timeoutMs:5,fetchImpl:(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
  await assert.rejects(timed.generateProgramDraft(input.request,{}),e=>e.code==='PROVIDER_TIMEOUT');assert.equal(signal.aborted,true);
  for(const [status,code] of [[401,'PROVIDER_AUTH'],[403,'PROVIDER_AUTH'],[429,'PROVIDER_RATE_LIMIT'],[500,'PROVIDER_UNAVAILABLE']]){
    let calls=0;const p=createGeminiProvider({...config,fetchImpl:async()=>{calls++;return new Response(secret,{status});}});
    await assert.rejects(p.generateProgramDraft(input.request,{}),e=>e.code===code&&!e.message.includes(secret));assert.equal(calls,1);
  }
  await assert.rejects(createGeminiProvider({...config,fetchImpl:async()=>{throw Error(secret);}}).generateProgramDraft(input.request,{}),e=>e.code==='PROVIDER_UNAVAILABLE'&&!e.message.includes(secret));
  await assert.rejects(createGeminiProvider({...config,apiKey:''}).generateProgramDraft(input.request,{}),e=>e.code==='NOT_CONFIGURED');
  await assert.rejects(createGeminiProvider({...config,fetchImpl:async()=>new Response('x'.repeat(600001))}).generateProgramDraft(input.request,{}),e=>e.code==='OUTPUT_TOO_LARGE');
});

test('Gemini drafts use existing validation and cannot grant approval or source linkage',async()=>{
  const draft=createFixture();draft.status='approved';draft.sourceProgramId='existing-program';draft.athleteId='invented-athlete';
  const service=createGenerationService({config,provider:adapter(envelope(draft))});
  const output=await service.generateProgramDraft(input,{coachId:'coach',library:exercises});
  assert.equal(output.metadata.provider,'gemini');assert.equal(output.draft.status,'draft');assert.equal(output.draft.sourceProgramId,null);assert.equal(output.draft.athleteId,null);assert.equal(output.validation.counts.error,0);
  const invalid=createFixture();delete invalid.program.plan;
  await assert.rejects(createGenerationService({config,provider:adapter(envelope(invalid))}).generateProgramDraft(input,{coachId:'coach',library:exercises}),e=>e.code==='CONTRACT_MISMATCH');
  const unresolved=createFixture('percentage');unresolved.program.plan[0].sessions[0].exercises[0].reference1RM=null;
  const review=await createGenerationService({config,provider:adapter(envelope(unresolved))}).generateProgramDraft(input,{coachId:'coach',library:exercises});
  assert.equal(review.draft.status,'needs_review');assert.equal(review.validation.canApprove,false);assert.ok(review.validation.findings.some(f=>f.code==='MISSING_REFERENCE_1RM'));
});
