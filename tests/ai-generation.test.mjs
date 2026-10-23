import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIProvider,providerSchema,GenerationError} from '../server/ai/openai.mjs';
import {createGenerationService,generationConfig,validateGenerationInput} from '../server/ai/generation.mjs';
import {createFixture,FIXTURE_REQUIREMENTS} from '../shared/ai/fixtures.mjs';
import {AI_DRAFT_SCHEMA} from '../shared/ai/contract.mjs';
import {exercises} from '../server/seed.mjs';
import {appendGeneration} from '../shared/ai/generation-history.mjs';
import {approveReview,createReview} from '../shared/ai/draft-state.mjs';
const secret='test-only-server-secret-never-client';
const config={...generationConfig({}),enabled:true,apiKey:secret,requestsPerHour:30};
const input={request:'Create a four-week strength program with four training days.',requirements:FIXTURE_REQUIREMENTS};
const context={coachId:'coach',library:exercises};
const provider=output=>({name:'test',model:'test-model',generateProgramDraft:async()=>structuredClone(output)});
const response=draft=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:typeof draft==='string'?draft:JSON.stringify(draft)}]}]}),{status:200});
test('OpenAI adapter requests strict structured output without tools or client credentials',async()=>{
  let request;const p=createOpenAIProvider({...config,fetchImpl:async(url,options)=>{request={url,...options,body:JSON.parse(options.body)};return response(createFixture());}});
  assert.deepEqual(await p.generateProgramDraft(input.request,{exercise_library:[]}),createFixture());
  assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.body.text.format.strict,true);assert.equal(request.body.text.format.type,'json_schema');assert.equal(request.body.store,false);assert.equal(request.body.tools,undefined);
  assert.ok(!JSON.stringify(request.body).includes(secret));assert.equal(request.headers.Authorization,'Bearer '+secret);
  const schema=providerSchema();assert.equal(schema.properties.schemaVersion.enum[0],2);assert.ok(schema.properties.validationFindings.items.required.includes('suggestedResolution'));assert.ok(!AI_DRAFT_SCHEMA.properties.validationFindings.items.required.includes('suggestedResolution'));
});
test('valid generation resets provider approval claims, preserves request and minimizes athlete context',async()=>{
  const draft=createFixture();draft.status='approved';draft.originalRequest='Model rewrite';draft.athleteId='someone';draft.sourceProgramId='overwrite';let received;
  const svc=createGenerationService({config,provider:{...provider(draft),generateProgramDraft:async(request,ctx)=>{received=ctx;return draft;}}});
  const out=await svc.generateProgramDraft({...input,athleteId:'jordan'},{...context,athlete:{id:'jordan',name:'Private name',email:'private@example.test',sport:'Field sport',pain:true}});
  assert.equal(out.draft.originalRequest,input.request);assert.equal(out.draft.status,'draft');assert.equal(out.draft.athleteId,'jordan');assert.equal(out.draft.sourceProgramId,null);assert.equal(out.validation.counts.error,0);
  assert.deepEqual(received.athlete,{sport:'Field sport'});assert.deepEqual(Object.keys(received.exercise_library[0]),['exerciseId','name','region','equipment','movementPattern','trackingType']);
  assert.ok(!JSON.stringify(out).includes(secret));assert.ok(!JSON.stringify(received).includes('private@example'));assert.equal(out.metadata.schemaVersion,1);assert.equal(out.debug,undefined);
});
test('malformed JSON, refusal and incomplete output are sanitized failures',async()=>{
  for(const [raw,code] of [[response('not JSON'),'INVALID_OUTPUT'],[new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'private details'}]}]})),'PROVIDER_REFUSAL'],[new Response(JSON.stringify({status:'incomplete',output:[]})),'INCOMPLETE_OUTPUT']]){
    const p=createOpenAIProvider({...config,fetchImpl:async()=>raw});await assert.rejects(p.generateProgramDraft(input.request,{}),e=>e.code===code&&e.message.includes('No program was changed or saved.'));
  }
});
test('OpenAI timeout, rate limit, auth and network errors never expose provider bodies',async()=>{
  const timed=createOpenAIProvider({...config,timeoutMs:5,fetchImpl:()=>new Promise(()=>{})});await assert.rejects(timed.generateProgramDraft(input.request,{}),e=>e.code==='PROVIDER_TIMEOUT');
  for(const [status,code] of [[401,'PROVIDER_AUTH'],[403,'PROVIDER_AUTH'],[429,'PROVIDER_RATE_LIMIT'],[500,'PROVIDER_UNAVAILABLE']]){
    const p=createOpenAIProvider({...config,fetchImpl:async()=>new Response(secret,{status})});await assert.rejects(p.generateProgramDraft(input.request,{}),e=>e.code===code&&!e.message.includes(secret));
  }
  const p=createOpenAIProvider({...config,fetchImpl:async()=>{throw Error(secret);}});await assert.rejects(p.generateProgramDraft(input.request,{}),e=>e.code==='PROVIDER_UNAVAILABLE'&&!e.message.includes(secret));
});
test('OpenAI transport failures distinguish DNS and TLS from provider HTTP errors without leaking causes',async()=>{
  for(const [causeCode,expected] of [['ENOTFOUND','PROVIDER_CONNECTION'],['UND_ERR_CONNECT_TIMEOUT','PROVIDER_CONNECTION'],['UNABLE_TO_VERIFY_LEAF_SIGNATURE','PROVIDER_TLS']]){
    const failure=new TypeError('fetch failed',{cause:Object.assign(new Error(secret),{code:causeCode})});
    const p=createOpenAIProvider({...config,fetchImpl:async()=>{throw failure;}});
    await assert.rejects(p.generateProgramDraft(input.request,{}),error=>error.code===expected&&!error.message.includes(secret));
  }
});
test('contract mismatches are rejected before the review renderer receives a draft',async()=>{
  const bad=createFixture();delete bad.program.plan;const bad2=createFixture();bad2.program.plan[0].sessions[0].exercises[0].rpe=99;
  for(const output of [null,'prose',{},bad,bad2])await assert.rejects(createGenerationService({config,provider:provider(output)}).generateProgramDraft(input,context),e=>['CONTRACT_MISMATCH','INVALID_OUTPUT'].includes(e.code));
});
test('semantic errors survive as editable findings: unknown exercise and missing reference',async()=>{
  const draft=createFixture('percentage');draft.program.plan[0].sessions[0].exercises[0].reference1RM=null;draft.program.plan[0].sessions[0].exercises[1].exerciseId=null;
  const out=await createGenerationService({config,provider:provider(draft)}).generateProgramDraft(input,context);
  assert.equal(out.draft.status,'needs_review');assert.equal(out.validation.canApprove,false);assert.ok(out.validation.findings.some(f=>f.code==='UNKNOWN_EXERCISE'));assert.ok(out.validation.findings.some(f=>f.code==='MISSING_REFERENCE_1RM'));
  assert.equal(out.draft.program.plan[0].sessions[0].exercises[0].load,null);
});
test('confirmed weeks, frequency and equipment are checked independently',async()=>{
  const out=await createGenerationService({config,provider:provider(createFixture())}).generateProgramDraft({...input,requirements:{programWeeks:6,exerciseFrequency:{bench:1},unavailableEquipment:['Barbell']}},context);
  for(const code of ['PROGRAM_LENGTH_MISMATCH','FREQUENCY_MISMATCH','UNAVAILABLE_EQUIPMENT'])assert.ok(out.validation.findings.some(f=>f.code===code));
});
test('generation input rejects oversized prompts, injected context and invalid athlete access',async()=>{
  for(const bad of [{request:'x'}, {...input,request:'x'.repeat(2001)},{...input,context:{secret:'do not send'}},{...input,requirements:{exerciseFrequency:{fake:2}}},{...input,requirements:{programWeeks:5}}])assert.throws(()=>validateGenerationInput(bad,exercises));
  await assert.rejects(createGenerationService({config,provider:provider(createFixture())}).generateProgramDraft({...input,athleteId:'other'},context),e=>e.status===400);
});
test('generation rate and concurrency limits are enforced without automatic retry',async()=>{
  const svc=createGenerationService({config:{...config,requestsPerHour:1},provider:provider(createFixture())});await svc.generateProgramDraft(input,context);await assert.rejects(svc.generateProgramDraft(input,context),e=>e.code==='GENERATION_RATE_LIMIT');
  let release;const busy=createGenerationService({config,provider:{...provider(null),generateProgramDraft:()=>new Promise(r=>{release=r;})}});const pending=busy.generateProgramDraft(input,context);await assert.rejects(busy.generateProgramDraft(input,context),e=>e.code==='GENERATION_BUSY');release(createFixture());await pending;
});
test('regeneration appends a new draft identity and leaves prior approval intact',async()=>{
  const svc=createGenerationService({config,provider:provider(createFixture())});const first=await svc.generateProgramDraft(input,context),review=approveReview(createReview(first.draft),exercises,FIXTURE_REQUIREMENTS,{coachId:'coach'});
  const history=appendGeneration([],{...first,review}),before=structuredClone(history);const next=appendGeneration(history,await svc.generateProgramDraft(input,context));
  assert.equal(next.length,2);assert.notEqual(next[0].generationId,next[1].generationId);assert.deepEqual(history,before);assert.deepEqual(next[0].review,review);assert.equal(next[1].draft.status,'draft');
});
test('debug mode is development-only and contains structured output, not raw provider internals',async()=>{
  const debugConfig={...config,debug:true};const result=await createGenerationService({config:debugConfig,provider:provider(createFixture())}).generateProgramDraft(input,context);
  assert.deepEqual(Object.keys(result.debug),['coachRequest','structuredResponse','validationFindings','durationMs']);assert.ok(!JSON.stringify(result).includes(secret));
  const prod=await createGenerationService({config:debugConfig,production:true,provider:provider(createFixture())}).generateProgramDraft(input,context);assert.equal(prod.debug,undefined);
  const disabled=createGenerationService({config:generationConfig({})});assert.equal(disabled.status().available,false);await assert.rejects(disabled.generateProgramDraft(input,context),e=>e.code==='NOT_CONFIGURED');
});

test('generation timing reports controlled provider time without recording prompts or athlete details',async()=>{
 let clock=1000;const events=[];const svc=createGenerationService({config,now:()=>clock,logger:e=>events.push(e),provider:{...provider(null),generateProgramDraft:async()=>{clock+=250;return createFixture();}}});
 const result=await svc.generateProgramDraft(input,context);assert.equal(result.metadata.timings.providerMs,250);assert.equal(result.metadata.timings.validationMs,0);assert.ok(result.metadata.sizes.contextBytes>0);assert.ok(result.metadata.sizes.outputBytes>0);assert.equal(result.metadata.completionAttempts,1);assert.equal(JSON.stringify(events).includes(input.request),false);assert.equal(JSON.stringify(events).includes('exercise_library'),false);
});

test('provider timeout records timings and aborts the stalled request',async()=>{let signal,timing;const p=createOpenAIProvider({...config,timeoutMs:10,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise(()=>{});}});await assert.rejects(p.generateProgramDraft(input.request,{}, {onTiming:t=>timing=t}),e=>e.code==='PROVIDER_TIMEOUT');assert.equal(signal.aborted,true);assert.equal(timing.headersMs,null);assert.ok(timing.totalMs>=0);});

test('natural weekly frequency is independently checked without confusing it with block length',()=>{const a=validateGenerationInput({request:'Build a six-week hybrid program. Four training days each week.'},exercises);assert.equal(a.requirements.programWeeks,6);assert.equal(a.requirements.trainingDaysPerWeek,4);const b=validateGenerationInput({request:'Have 2 strength movements and 1 Metcon per session, 4 days a week.'},exercises);assert.equal(b.requirements.programWeeks,undefined);assert.equal(b.requirements.trainingDaysPerWeek,4);const c=validateGenerationInput({request:'Train four days per week.',requirements:{trainingDaysPerWeek:3}},exercises);assert.equal(c.requirements.trainingDaysPerWeek,3);});

test('shared deadline cancels provider work and releases the coach slot for retry',async()=>{let aborted=false,calls=0;const events=[];const svc=createGenerationService({config,deadlineMs:20,logger:e=>events.push(e),provider:{name:'controlled',model:'fixture',generateProgramDraft:async(req,ctx,task)=>{calls++;if(calls===1){task.signal.addEventListener('abort',()=>aborted=true,{once:true});return new Promise(()=>{});}return createFixture();}}});await assert.rejects(svc.generateProgramDraft(input,context),e=>e.code==='PROVIDER_TIMEOUT');assert.equal(aborted,true);assert.equal(events.at(-1).code,'PROVIDER_TIMEOUT');assert.equal(events.at(-1).timings.providerCalls.length,1);assert.equal(events.at(-1).timings.providerCalls[0].headersMs,null);const next=await svc.generateProgramDraft(input,context);assert.equal(next.draft.program.plan.length,4);assert.equal(calls,2);});
test('client cancellation aborts generation and does not turn normal completion into cancellation',async()=>{let started,release;const ready=new Promise(r=>started=r),signal=new AbortController(),events=[];const svc=createGenerationService({config,deadlineMs:1000,logger:e=>events.push(e),provider:{name:'controlled',model:'fixture',generateProgramDraft:async()=>{started();return new Promise(r=>release=r);}}});const pending=svc.generateProgramDraft(input,{...context,signal:signal.signal});await ready;signal.abort(new GenerationError('CLIENT_CANCELED','Client closed.',499));await assert.rejects(pending,e=>e.code==='CLIENT_CANCELED');release(createFixture());assert.equal(events.at(-1).code,'CLIENT_CANCELED');const healthy=await createGenerationService({config,deadlineMs:1000,provider:provider(createFixture())}).generateProgramDraft(input,context);assert.equal(healthy.metadata.completionAttempts,1);});
test('repair is skipped when too little time remains and incomplete weeks stay unapprovable',async()=>{const draft=createFixture();draft.program.plan=draft.program.plan.slice(0,1);const events=[];const svc=createGenerationService({config,deadlineMs:1000,logger:e=>events.push(e),provider:provider(draft)});const result=await svc.generateProgramDraft(input,context);assert.equal(result.metadata.completionAttempts,1);assert.equal(result.metadata.repairErrorCode,'PROVIDER_TIMEOUT');assert.ok(result.validation.counts.error>0);});

test('OpenAI provider cancels its request when client disconnects',async()=>{const controller=new AbortController();let providerSignal;const adapter=createOpenAIProvider({...config,fetchImpl:async(url,options)=>{providerSignal=options.signal;return new Promise(()=>{});}});const pending=adapter.generateProgramDraft(input.request,{}, {signal:controller.signal});controller.abort();await assert.rejects(pending,e=>e.code==='CLIENT_CANCELED');assert.equal(providerSignal.aborted,true);});
