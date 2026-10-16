import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {approveReview,createReview,isApproved,editReview} from '../shared/ai/draft-state.mjs';
import {createDraftSaveService} from '../shared/ai/save-service.mjs';
import {validateDraft} from '../shared/ai/validate.mjs';
import {createGenerationService,generationConfig,validateGenerationInput} from '../server/ai/generation.mjs';
import {createOpenAIProvider} from '../server/ai/openai.mjs';
import {exercises} from '../server/seed.mjs';
const ctx={coachId:'coach',library:exercises},config={...generationConfig({}),requestsPerHour:30};
test('phone review: open programming questions and absent maximum can be acknowledged and saved, not corrupt data',()=>{
 const draft=createFixture('percentage');draft.program.plan[0].sessions[0].exercises[0].reference1RM=null;draft.questions=['Which assessment maximum should be used?'];
 const review=createReview(draft);assert.equal(validateDraft(draft,exercises).canApprove,true);
 assert.throws(()=>approveReview(review,exercises,{}, {coachId:'coach'}),/acknowledge/);
 const approved=approveReview(review,exercises,{}, {coachId:'coach',warningsReviewed:true});assert.equal(isApproved(approved,exercises),true);
 const save=createDraftSaveService(()=>crypto.randomUUID()),input={review:approved};const {receipt}=save.approve(input,exercises,'coach');const p=save.save({...input,receipt},exercises,'coach',p=>p);assert.equal(p.sessions[0].exercises[0].load,null);assert.ok(p.aiProvenance.acceptedWarningCodes.includes('OPEN_QUESTIONS'));
 const forged=structuredClone(approved);forged.approval.warningsReviewed=false;assert.equal(isApproved(forged,exercises),false);
 for(const corrupt of [d=>d.program.plan.pop(),d=>d.program.plan[0].sessions[0].exercises[0].sets=-2,d=>d.program.plan[0].sessions[0].exercises[0].exerciseId=null]){const bad=editReview(approved,corrupt);assert.throws(()=>approveReview(bad,exercises,{}, {coachId:'coach',warningsReviewed:true}));}
});
test('six-week review only Week 1: bounded completion repair preserves three unmatched movements across all weeks',async()=>{
 const incomplete=createFixture();incomplete.program.weeks=6;incomplete.program.plan=incomplete.program.plan.slice(0,1);for(const e of incomplete.program.plan[0].sessions[0].exercises.slice(0,3)){e.exerciseId=null;e.exerciseName='Unmatched '+e.exerciseName;}
 const complete=structuredClone(incomplete);complete.program.plan=Array.from({length:6},(_,i)=>({...structuredClone(incomplete.program.plan[0]),week:i+1}));let calls=0;
 const svc=createGenerationService({config,logger:()=>{},provider:{name:'test',model:'test',generateProgramDraft:async()=>structuredClone(++calls===1?incomplete:complete)}});
 const out=await svc.generateProgramDraft({request:'Create a six-week Jiu-Jitsu program.'},ctx);assert.equal(calls,2);assert.equal(out.draft.program.plan.length,6);assert.equal(out.requirements.programWeeks,6);assert.ok(out.validation.findings.some(f=>f.code==='UNKNOWN_EXERCISE'&&f.message.includes('Week 6')));assert.ok(!out.validation.findings.some(f=>f.code==='INCOMPLETE_WEEK'));
});
test('failed completion remains reviewable with explicit missing-week error; never saves Week 1 as six weeks',async()=>{
 const draft=createFixture();draft.program.weeks=6;draft.program.plan=draft.program.plan.slice(0,1);let calls=0;
 const out=await createGenerationService({config,logger:()=>{},provider:{name:'test',model:'test',generateProgramDraft:async()=>{calls++;return draft;}}}).generateProgramDraft({request:'Create a 6-week Jiu-Jitsu program.'},ctx);
 assert.equal(calls,2);assert.equal(out.validation.canApprove,false);assert.match(out.validation.findings.find(f=>f.code==='INCOMPLETE_WEEK').message,/received 1.*Regenerate/);
 assert.equal(validateGenerationInput({request:'Create four training days each week.'},exercises).requirements.programWeeks,undefined);
 assert.equal(validateGenerationInput({request:'Create a single-week strength plan.'},exercises).requirements.programWeeks,1);
});
test('Sol uses strict Responses schema, low reasoning, safe usage telemetry; incomplete token output is actionable',async()=>{
 let body,usage;const p=createOpenAIProvider({apiKey:'synthetic-not-a-key',model:'gpt-6.1-sol',fetchImpl:async(_,opts)=>{body=JSON.parse(opts.body);return new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:100,output_tokens:200,total_tokens:300,secret:'never-log'},output:[]}));}});
 await assert.rejects(p.generateProgramDraft('Six weeks',{}, {onUsage:u=>usage=u}),e=>e.code==='INCOMPLETE_OUTPUT'&&/token limit/.test(e.message));assert.deepEqual(body.reasoning,{effort:'low'});assert.equal(body.text.format.strict,true);assert.deepEqual(usage,{input_tokens:100,output_tokens:200,total_tokens:300});
 const events=[],svc=createGenerationService({config,logger:e=>events.push(e),provider:{name:'test',model:'test',generateProgramDraft:async()=>{throw Error('private-key-body');}}});await assert.rejects(svc.generateProgramDraft({request:'Private coaching request'},ctx));assert.equal(events[0].status,'failed');assert.ok(!JSON.stringify(events).includes('private-key-body'));assert.ok(!JSON.stringify(events).includes('Private coaching request'));
});

test('strict v2 erg schema permits null running-only paceUnit; wrong modality units remain blocked',async()=>{
 const {AI_DRAFT_SCHEMA_V2,conditioningSession}=await import('../shared/ai/conditioning-contract.mjs');
 const {validateDraftStructure}=await import('../shared/ai/validate.mjs');
 const {missingTrackingExercises}=await import('../shared/tracking.mjs');
 const library=[...exercises,...missingTrackingExercises(exercises)],draft=createFixture();draft.schemaVersion=2;
 for(const w of draft.program.plan)for(const s of w.sessions)s.blocks=[];
 const erg={exerciseId:'rowerg',exerciseName:'RowErg',trackingType:'erg',intervalCount:6,restSeconds:90,metrics:{distance:250,distanceUnit:'m',paceSeconds:102,paceUnit:null},notes:'',progressionInstructions:''};draft.program.plan[0].sessions[0].exercises=[erg];
 assert.deepEqual(validateDraftStructure(draft),[]);assert.equal(validateDraft(draft,library).counts.error,0);assert.equal(conditioningSession(draft.program.plan[0].sessions[0]).exercises[0].metrics.paceUnit,undefined);
 erg.metrics.paceUnit='km';assert.ok(validateDraft(draft,library).findings.some(f=>f.code==='INVALID_CARDIO_PRESCRIPTION'));
});

test('program model override leaves legacy scanner configuration intact',()=>{
 const c=generationConfig({AI_ENABLED:'true',AI_PROVIDER:'openai',OPENAI_API_KEY:'synthetic',OPENAI_MODEL:'gpt-4.1-mini',OPENAI_PROGRAM_MODEL:'gpt-6.1-sol',AI_TIMEOUT_MS:'180000'});
 assert.equal(c.model,'gpt-4.1-mini');assert.equal(createGenerationService({config:c,logger:()=>{}}).status().model,'gpt-6.1-sol');assert.equal(c.timeoutMs,180000);
 assert.equal(generationConfig({OPENAI_MODEL:'legacy'}).model,'legacy');
});
