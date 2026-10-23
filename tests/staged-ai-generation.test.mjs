import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture,FIXTURE_REQUIREMENTS} from '../shared/ai/fixtures.mjs';
import {exercises} from '../server/seed.mjs';
import {generationConfig,validateGenerationInput} from '../server/ai/generation.mjs';
import {createStagedGenerationService} from '../server/ai/staged.mjs';
import {createOpenAIProvider,providerSchema} from '../server/ai/openai.mjs';
import {createGeminiProvider} from '../server/ai/gemini.mjs';
import {normalizeOutline,validateOutline,validateGeneratedWeek,OUTLINE_FOCUS_MAX_LENGTH,OUTLINE_SCHEMA,WEEK_SCHEMA,outlineSchemaFor,weekSchemaFor} from '../shared/ai/staged-contract.mjs';

const base=createFixture();
const input={request:'Create a four-week strength program with four training days each week. Bench twice, squat twice, deadlift once.',requirements:{...FIXTURE_REQUIREMENTS,programWeeks:4}};
const context={coachId:'coach',library:exercises};
const outline={schemaVersion:1,program:Object.fromEntries(Object.entries(base.program).filter(([key])=>key!=='plan')),trainingDays:base.program.plan[0].sessions.map(s=>({day:s.day,focus:s.name})),weekProgression:base.program.plan.map(w=>({week:w.week,focus:'Strength',progressionInstructions:'Review completed work and increase only within coach guardrails.'})),assumptions:[],questions:[]};
const week=(number=1)=>{
  const value=structuredClone(base.program.plan[0]);value.week=number;
  for(const session of value.sessions)session.blocks=[];
  value.sessions[3].exercises[1]={...value.sessions[3].exercises[1],exerciseId:'row',exerciseName:'Bent-over Barbell Row',loadMode:'athlete_selected'};
  return value;
};
const config={...generationConfig({}),enabled:true,apiKey:'test-only',timeoutMs:1000};
const queued=(...outputs)=>{const calls=[];return {calls,provider:{name:'test',model:'test-model',async generateProgramDraft(request,context,task){calls.push({request,context,task});return structuredClone(outputs.shift());}}}};

test('staged outline preserves requested duration, days, and every week progression target',async()=>{
  assert.equal(validateOutline(outline,input.requirements).valid,true);
  const mock=queued(outline),service=createStagedGenerationService({config,provider:mock.provider});
  const result=await service.generateOutline(input,context);
  assert.equal(result.outline.weekProgression.length,4);
  assert.deepEqual(result.requirements,input.requirements);
  assert.deepEqual(mock.calls[0].task.schema,outlineSchemaFor(input.requirements));
  assert.deepEqual(mock.calls[0].task.schema.properties.program.properties.weeks.enum,[4]);
  assert.equal(mock.calls[0].task.schema.properties.trainingDays.minItems,4);
  assert.equal(mock.calls[0].context.confirmed_requirements.exerciseFrequency.bench,2);
  assert.equal(mock.calls[0].context.exercise_library.some(e=>e.exerciseId==='bench'),true);
  const wrong=structuredClone(outline);wrong.program.weeks=6;
  await assert.rejects(createStagedGenerationService({config,provider:queued(wrong).provider}).generateOutline(input,context),e=>e.code==='STAGED_VALIDATION_FAILED');
  const noProgression=structuredClone(outline);noProgression.weekProgression[2].progressionInstructions='';
  assert.equal(validateOutline(noProgression,input.requirements).valid,false);
});

test('six- and eight-week mixed outlines retain four distinct days and every progression target',()=>{
  for(const count of [6,8]){
    const mixed=structuredClone(outline);
    mixed.program.weeks=count;
    mixed.trainingDays.forEach(day=>day.focus='Two strength movements followed by one Metcon');
    mixed.weekProgression=Array.from({length:count},(_,index)=>({week:index+1,focus:`Strength and Metcon week ${index+1}`,progressionInstructions:'Progress within coach guardrails.'}));
    const requirements={...input.requirements,programWeeks:count};
    assert.equal(validateOutline(mixed,requirements).valid,true);
    assert.equal(mixed.trainingDays.length,4);
    assert.equal(mixed.weekProgression.length,count);
    const supplied=providerSchema(outlineSchemaFor(requirements));
    assert.deepEqual(supplied.properties.program.properties.weeks.enum,[count]);
    assert.equal(supplied.properties.weekProgression.minItems,count);
    assert.equal(supplied.properties.weekProgression.maxItems,count);
    assert.equal(supplied.properties.trainingDays.minItems,4);
    assert.equal(supplied.properties.trainingDays.maxItems,4);
  }
});

test('real failed focus lengths remain intact and validate under the shared 512-character limit',async()=>{
  const lengths=[218,229,236,279],mixed=structuredClone(outline);
  mixed.program.weeks=6;
  const start='Two strength movements and one Metcon. ';
  mixed.trainingDays.forEach((day,index)=>day.focus=start+'.'.repeat(lengths[index]-start.length));
  mixed.weekProgression=Array.from({length:6},(_,index)=>({week:index+1,focus:'Strength and Metcon',progressionInstructions:'Advance within coach guardrails.'}));
  assert.deepEqual(mixed.trainingDays.map(day=>day.focus.length),lengths);
  assert.equal(OUTLINE_FOCUS_MAX_LENGTH,512);
  assert.equal(OUTLINE_SCHEMA.properties.trainingDays.items.properties.focus.maxLength,OUTLINE_FOCUS_MAX_LENGTH);
  assert.equal(OUTLINE_SCHEMA.properties.weekProgression.items.properties.focus.maxLength,OUTLINE_FOCUS_MAX_LENGTH);
  assert.equal(validateOutline(mixed,{programWeeks:6,trainingDaysPerWeek:4}).valid,true);
  const copy=structuredClone(mixed),service=createStagedGenerationService({config,provider:queued(mixed).provider});
  assert.equal((await service.generateOutline({request:'Create a six-week program with four training days per week.',requirements:{programWeeks:6,trainingDaysPerWeek:4}},context)).outline.trainingDays[3].focus.length,279);
  assert.deepEqual(mixed,copy);
  mixed.trainingDays[0].focus='x'.repeat(OUTLINE_FOCUS_MAX_LENGTH+1);
  mixed.weekProgression[0].focus='x'.repeat(OUTLINE_FOCUS_MAX_LENGTH+1);
  const findings=validateOutline(mixed,{programWeeks:6,trainingDaysPerWeek:4}).findings;
  assert.ok(findings.some(f=>f.path==='/trainingDays/0/focus'&&f.received==='string length 513'));
  assert.ok(findings.some(f=>f.path==='/weekProgression/0/focus'&&f.received==='string length 513'));
});

test('staged provider schemas communicate omitted text limits and retain structural constraints',()=>{
  const audit=(canonical,projected,path='')=>{
    if(canonical.anyOf){assert.equal(projected.anyOf.length,canonical.anyOf.length,path);canonical.anyOf.forEach((branch,index)=>audit(branch,projected.anyOf[index],`${path}/anyOf/${index}`));return;}
    if(canonical.const!==undefined){assert.deepEqual(projected.enum,[canonical.const],path);return;}
    if(canonical.type!==undefined&&path.endsWith('/rir')){assert.equal(projected.type,'null');return;}
    else if(canonical.type!==undefined)assert.deepEqual(projected.type,canonical.type,path);
    for(const key of ['minimum','maximum','minItems','maxItems','pattern'])if(canonical[key]!==undefined)assert.deepEqual(projected[key],canonical[key],`${path}/${key}`);
    if(canonical.enum&&path.endsWith('/effortMode'))assert.deepEqual(projected.enum,['none','rpe']);
    else if(canonical.enum)assert.deepEqual(projected.enum,canonical.enum,path);
    for(const key of ['minLength','maxLength','exclusiveMinimum'])if(canonical[key]!==undefined)assert.match(projected.description,key==='minLength'&&canonical[key]===1?/non-whitespace/:new RegExp(String(canonical[key])),`${path}/${key}`);
    if(canonical.properties){assert.deepEqual(Object.keys(projected.properties),Object.keys(canonical.properties),path);for(const required of canonical.required||[])assert.ok(projected.required.includes(required),`${path}/${required}`);for(const [key,child] of Object.entries(canonical.properties))audit(child,projected.properties[key],`${path}/${key}`);}
    if(canonical.items)audit(canonical.items,projected.items,`${path}/items`);
  };
  audit(OUTLINE_SCHEMA,providerSchema(OUTLINE_SCHEMA),'outline');
  audit(WEEK_SCHEMA,providerSchema(WEEK_SCHEMA),'week');
  assert.match(providerSchema(OUTLINE_SCHEMA).properties.trainingDays.items.properties.focus.description,/at most 512 characters/);
});

test('outline diagnostics identify exact paths, types, counts and confirmed requirements without returning private prose',async()=>{
  const invalid=structuredClone(outline);
  invalid.program.name='Private athlete name';
  invalid.program.weeks='six';
  invalid.trainingDays[1].day=invalid.trainingDays[0].day;
  invalid.trainingDays[2].focus=42;
  invalid.weekProgression[0].week=2;
  invalid.weekProgression[0].progressionInstructions='';
  delete invalid.weekProgression[1].focus;
  invalid.questions='not an array';
  const findings=validateOutline(invalid,{...input.requirements,programWeeks:6}).findings;
  for(const path of ['/program/weeks','/trainingDays/1/day','/trainingDays/2/focus','/weekProgression/0/week','/weekProgression/0/progressionInstructions','/weekProgression/1/focus','/questions'])assert.ok(findings.some(f=>f.path===path),path);
  assert.ok(findings.some(f=>f.code==='CONFIRMED_WEEKS_MISMATCH'));
  assert.ok(findings.every(f=>f.expected!==undefined&&f.received!==undefined&&typeof f.repairable==='boolean'));
  assert.doesNotMatch(JSON.stringify(findings),/Private athlete name|not an array/);
  const result=createStagedGenerationService({config,provider:queued(invalid).provider}).generateOutline({...input,requirements:{...input.requirements,programWeeks:6}},context);
  await assert.rejects(result,e=>e.code==='STAGED_VALIDATION_FAILED'&&e.diagnostics?.stage==='outline'&&e.diagnostics.findings.some(f=>f.path==='/program/weeks')&&e.metadata?.validationMs>=0);
});

test('only complete unique out-of-order week targets are normalized without a second provider call',async()=>{
  const reversed=structuredClone(outline);reversed.weekProgression.reverse();
  assert.equal(normalizeOutline(reversed).normalizations.length,1);
  assert.equal(validateOutline(reversed,input.requirements).findings.find(f=>f.code==='INCONSISTENT_WEEK').repairable,true);
  const mock=queued(reversed),service=createStagedGenerationService({config,provider:mock.provider});
  const result=await service.generateOutline(input,context);
  assert.deepEqual(result.outline.weekProgression.map(target=>target.week),[1,2,3,4]);
  assert.equal(mock.calls.length,1);
  assert.deepEqual(reversed.weekProgression.map(target=>target.week),[4,3,2,1]);
  const duplicate=structuredClone(reversed);duplicate.weekProgression[0].week=3;
  assert.deepEqual(normalizeOutline(duplicate).normalizations,[]);
  assert.equal(validateOutline(duplicate,input.requirements).valid,false);
});

test('weekly generation accepts a complete week and carries progression context into the next call',async()=>{
  const first=week(1),second=week(2),mock=queued(first,second),service=createStagedGenerationService({config,provider:mock.provider});
  const one=await service.generateWeek(input,{...context,outline,week:1});
  assert.equal(one.validation.valid,true);
  assert.equal(one.week.sessions.length,4);
  const two=await service.generateWeek(input,{...context,outline,week:2,previousWeeks:[one.week]});
  assert.equal(two.validation.valid,true);
  assert.deepEqual(mock.calls[1].task.schema,weekSchemaFor(outline,2));
  assert.deepEqual(mock.calls[1].task.schema.properties.week.enum,[2]);
  assert.equal(mock.calls[1].task.schema.properties.sessions.minItems,4);
  assert.equal(mock.calls[1].context.requested_week,2);
  assert.deepEqual(mock.calls[1].context.previous_week,one.week);
  assert.equal(mock.calls[1].context.outline.weekProgression[1].week,2);
});

test('four-day mixed weeks retain two strength movements and one separately scored Metcon per session',()=>{
  const mixed=structuredClone(outline);
  mixed.trainingDays.forEach(day=>day.focus='Two strength movements, then one AMRAP Metcon');
  const value=week();
  for(const session of value.sessions)session.blocks=[
    {id:'strength',name:'Strength',type:'Strength',exerciseIndexes:[0,1]},
    {id:'conditioning',name:'Conditioning',type:'Metcon',metcon:{name:'Pull-up AMRAP',scoreType:'AMRAP',scoreMode:'rounds_reps',repScheme:[],movements:[{exerciseId:'pullup',exerciseName:'Pull-up',reps:5}],durationSeconds:720,intervalSeconds:null,timeCapSeconds:null,workSeconds:null,restSeconds:null,rounds:null,notes:''}}
  ];
  const checked=validateGeneratedWeek(value,mixed,exercises,input.requirements);
  assert.equal(checked.valid,true,JSON.stringify(checked.findings));
  assert.equal(value.sessions.length,4);
  assert.ok(value.sessions.every(session=>session.exercises.length===2&&session.blocks.filter(block=>block.type==='Metcon').length===1));
  const missingLift=structuredClone(value);missingLift.sessions[0].exercises[0]={...missingLift.sessions[0].exercises[0],exerciseId:'row',exerciseName:'Bent-over Barbell Row'};
  assert.ok(validateGeneratedWeek(missingLift,mixed,exercises,input.requirements).findings.some(f=>f.code==='FREQUENCY_MISMATCH'));
  const confirmed=validateGenerationInput({request:'Create a six-week program with four training days per week. Each session should contain two strength movements and one Metcon.'},exercises).requirements;
  assert.equal(confirmed.strengthMovementsPerSession,2);assert.equal(confirmed.metconsPerSession,1);
  assert.equal(validateGeneratedWeek(value,mixed,exercises,{...confirmed,programWeeks:4}).valid,true);
  const noMetcon=structuredClone(value);noMetcon.sessions[0].blocks.pop();
  assert.ok(validateGeneratedWeek(noMetcon,mixed,exercises,{...confirmed,programWeeks:4}).findings.some(f=>f.code==='SESSION_METCON_COUNT'&&f.path.endsWith('/sessions/0/blocks')));
  const tooFewLifts=structuredClone(value);tooFewLifts.sessions[0].exercises.pop();tooFewLifts.sessions[0].blocks[0].exerciseIndexes=[0];
  assert.ok(validateGeneratedWeek(tooFewLifts,mixed,exercises,{...confirmed,programWeeks:4}).findings.some(f=>f.code==='SESSION_STRENGTH_COUNT'&&f.path.endsWith('/sessions/0/exercises')));
});

test('mixed week block diagnostics identify the session, block, type and exact invalid field',()=>{
  const mixed=structuredClone(outline);
  mixed.trainingDays.forEach(day=>day.focus='Two strength movements, then one AMRAP Metcon');
  const makeWeek=()=>{const value=week();for(const session of value.sessions)session.blocks=[
    {id:'strength',name:'Strength',type:'Strength',exerciseIndexes:[0,1]},
    {id:'conditioning',name:'Conditioning',type:'Metcon',metcon:{name:'Pull-up AMRAP',scoreType:'AMRAP',scoreMode:'rounds_reps',repScheme:[],movements:[{exerciseId:'pullup',exerciseName:'Pull-up',reps:5}],durationSeconds:720,intervalSeconds:null,timeCapSeconds:null,workSeconds:null,restSeconds:null,rounds:null,notes:''}}
  ];return value;};
  assert.equal(validateGeneratedWeek(makeWeek(),mixed,exercises,input.requirements).valid,true);
  const cases=[
    [value=>value.sessions[0].blocks[0].exerciseIndexes=[0,0],'/sessions/0/blocks/0/exerciseIndexes/1',1,1,'Strength'],
    [value=>value.sessions[1].blocks[1].metcon.scoreMode='completed_minutes','/sessions/1/blocks/1/metcon/scoreMode',2,2,'Metcon'],
    [value=>value.sessions[2].blocks[1].metcon.movements[0].exerciseId='missing-library-id','/sessions/2/blocks/1/metcon/movements/0/exerciseId',3,2,'Metcon'],
    [value=>value.sessions[3].blocks[0].type='Unknown','/sessions/3/blocks/0/type',4,1,'invalid'],
    [value=>value.sessions[0].blocks[1].metcon.movements[0].load=135,'/sessions/0/blocks/1/metcon/movements/0/loadUnit',1,2,'Metcon']
  ];
  for(const [edit,path,sessionNumber,blockNumber,blockType] of cases){const value=makeWeek();edit(value);const result=validateGeneratedWeek(value,mixed,exercises,input.requirements);const finding=result.findings.find(f=>f.code==='INVALID_WORKOUT_BLOCK'&&f.path.endsWith(path));assert.equal(result.valid,false,path);assert.ok(finding,`${path}: ${JSON.stringify(result.findings)}`);assert.equal(finding.sessionNumber,sessionNumber);assert.equal(finding.blockNumber,blockNumber);assert.equal(finding.blockType,blockType);assert.ok(finding.expected);assert.ok(finding.received);assert.equal(finding.repairable,false);}
});

test('provider Metcon movement schema includes sets supported by the workout validator',()=>{
  const movement=WEEK_SCHEMA.properties.sessions.items.properties.blocks.items.anyOf[0].properties.metcon.properties.movements.items;
  assert.deepEqual(movement.properties.sets,{type:['integer','null'],minimum:1,maximum:10000});
  const projected=providerSchema(weekSchemaFor(outline,1));
  const providerMovement=projected.properties.sessions.items.properties.blocks.items.anyOf[0].properties.metcon.properties.movements.items;
  assert.deepEqual(providerMovement.properties.sets,movement.properties.sets);
});

test('failed weekly provider response exposes safe block diagnostics without saving the week',async()=>{
  const value=week();for(const session of value.sessions)session.blocks=[
    {id:'strength',name:'Strength',type:'Strength',exerciseIndexes:[0,1]},
    {id:'conditioning',name:'Conditioning',type:'Metcon',metcon:{name:'Pull-up AMRAP',scoreType:'AMRAP',scoreMode:'rounds_reps',repScheme:[],movements:[{exerciseId:'pullup',exerciseName:'Pull-up',reps:5}],durationSeconds:720,intervalSeconds:null,timeCapSeconds:null,workSeconds:null,restSeconds:null,rounds:null,notes:''}}
  ];value.sessions[0].blocks[1].metcon.scoreMode='completed_minutes';
  const service=createStagedGenerationService({config,provider:queued(value).provider});
  await assert.rejects(service.generateWeek(input,{...context,outline,week:1}),error=>{
    const finding=error.diagnostics?.findings.find(f=>f.path==='/program/plan/0/sessions/0/blocks/1/metcon/scoreMode');
    return error.code==='STAGED_VALIDATION_FAILED'&&error.diagnostics.stage==='week'&&finding?.sessionNumber===1&&finding.blockNumber===2&&finding.blockType==='Metcon'&&finding.expected.includes('AMRAP')&&finding.received==='string length 17'&&finding.repairable===false;
  });
});

test('missing sessions, wrong week, and invalid prescriptions never become validated weeks',async()=>{
  const incomplete=week();incomplete.sessions.pop();
  assert.equal(validateGeneratedWeek(incomplete,outline,exercises,input.requirements).valid,false);
  const invalid=week();invalid.sessions[0].exercises[0].exerciseId='invented-id';
  assert.equal(validateGeneratedWeek(invalid,outline,exercises,input.requirements).valid,false);
  assert.ok(validateGeneratedWeek(invalid,outline,exercises,input.requirements).findings.some(f=>f.code==='UNKNOWN_EXERCISE'));
  const wrongFrequency=week();wrongFrequency.sessions[2].exercises[0].exerciseId='row';wrongFrequency.sessions[2].exercises[0].exerciseName='Bent-over Barbell Row';
  assert.ok(validateGeneratedWeek(wrongFrequency,outline,exercises,input.requirements).findings.some(f=>f.code==='FREQUENCY_MISMATCH'&&f.severity==='error'));
  for(const response of [incomplete,invalid,week(2)])await assert.rejects(createStagedGenerationService({config,provider:queued(response).provider}).generateWeek(input,{...context,outline,week:1}),e=>e.code==='STAGED_VALIDATION_FAILED');
});

test('both provider adapters accept the smaller outline and week schemas',async()=>{
  let openaiBody,geminiBody,openaiWeekBody,geminiOutlineBody;
  const openai=createOpenAIProvider({...config,fetchImpl:async(_,options)=>{openaiBody=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(outline)}]}]}));}});
  assert.deepEqual(await openai.generateProgramDraft(input.request,{}, {schema:OUTLINE_SCHEMA}),outline);
  assert.equal(openaiBody.text.format.schema.properties.trainingDays.type,'array');
  assert.match(openaiBody.text.format.schema.properties.trainingDays.items.properties.focus.description,/at most 512 characters/);
  const gemini=createGeminiProvider({...config,fetchImpl:async(_,options)=>{geminiBody=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(week())}]}}]}));}});
  assert.deepEqual(await gemini.generateProgramDraft(input.request,{}, {schema:WEEK_SCHEMA}),week());
  assert.equal(geminiBody.generationConfig.responseJsonSchema.properties.sessions.type,'array');
  assert.match(geminiBody.generationConfig.responseJsonSchema.properties.sessions.items.properties.name.description,/at most 200 characters/);
  const openaiWeek=createOpenAIProvider({...config,fetchImpl:async(_,options)=>{openaiWeekBody=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(week())}]}]}));}});
  assert.deepEqual(await openaiWeek.generateProgramDraft(input.request,{}, {schema:WEEK_SCHEMA}),week());
  assert.equal(openaiWeekBody.text.format.schema.properties.sessions.maxItems,WEEK_SCHEMA.properties.sessions.maxItems);
  const geminiOutline=createGeminiProvider({...config,fetchImpl:async(_,options)=>{geminiOutlineBody=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(outline)}]}}]}));}});
  assert.deepEqual(await geminiOutline.generateProgramDraft(input.request,{}, {schema:OUTLINE_SCHEMA}),outline);
  assert.match(geminiOutlineBody.generationConfig.responseJsonSchema.properties.trainingDays.items.properties.focus.description,/at most 512 characters/);
});

test('weekly contract rejects missing fields, wrong types, bounds and invalid Metcon scores',()=>{
  const mixed=week();for(const session of mixed.sessions)session.blocks=[{id:'strength',name:'Strength',type:'Strength',exerciseIndexes:[0,1]},{id:'conditioning',name:'Conditioning',type:'Metcon',metcon:{name:'Pull-up AMRAP',scoreType:'AMRAP',scoreMode:'rounds_reps',repScheme:[],movements:[{exerciseId:'pullup',exerciseName:'Pull-up',reps:5}],durationSeconds:720,intervalSeconds:null,timeCapSeconds:null,workSeconds:null,restSeconds:null,rounds:null,notes:''}}];
  const cases=[
    [value=>delete value.sessions[0].blocks,'/sessions/0/blocks'],
    [value=>value.sessions[0].exercises[0].sets=13,'/sessions/0/exercises/0/sets'],
    [value=>value.sessions[0].blocks[1].metcon.scoreType='Not a score','/sessions/0/blocks'],
    [value=>value.sessions[0].blocks[1].metcon.movements=[],'/sessions/0/blocks'],
    [value=>delete value.sessions[0].exercises[0].exerciseId,'/sessions/0/exercises/0/exerciseId'],
    [value=>delete value.sessions[0].blocks[1].metcon.scoreType,'/sessions/0/blocks/1/metcon/scoreType'],
    [value=>value.sessions[0].name='x'.repeat(201),'/sessions/0/name'],
    [value=>value.sessions[0].day=99,'/sessions'],
    [value=>value.sessions.push(structuredClone(value.sessions[0])),'/sessions']
  ];
  for(const [edit,path] of cases){const value=structuredClone(mixed);edit(value);const checked=validateGeneratedWeek(value,outline,exercises,input.requirements);assert.equal(checked.valid,false,path);assert.ok(checked.findings.some(f=>f.path.includes(path)),`${path}: ${JSON.stringify(checked.findings)}`);}
  const missing=structuredClone(mixed);delete missing.sessions[0].exercises[0].exerciseId;
  const field=validateGeneratedWeek(missing,outline,exercises,input.requirements).findings.find(f=>f.code==='MISSING_FIELD'&&f.path.endsWith('/exercises/0/exerciseId'));
  assert.equal(field.expected,'required contract field');assert.equal(field.received,'missing');
});

test('week generation requires all preceding weeks to be complete and does not mutate them',async()=>{
  const first=week(1),snapshot=structuredClone(first),mock=queued(week(3));
  const service=createStagedGenerationService({config,provider:mock.provider});
  await assert.rejects(service.generateWeek(input,{...context,outline,week:3,previousWeeks:[first]}),e=>e.code==='STAGED_VALIDATION_FAILED');
  assert.equal(mock.calls.length,0);
  const prior=week(2);prior.sessions[0].exercises[0].sets=99;
  await assert.rejects(service.generateWeek(input,{...context,outline,week:3,previousWeeks:[first,prior]}),e=>e.code==='STAGED_VALIDATION_FAILED');
  assert.deepEqual(first,snapshot);
});

test('staged provider call retains the server deadline and client cancellation',async()=>{
  let providerSignal;
  const provider={name:'test',model:'test-model',generateProgramDraft:async(_,__,task)=>{providerSignal=task.signal;return new Promise(()=>{});}};
  const service=createStagedGenerationService({config,provider,deadlineMs:15});
  await assert.rejects(service.generateOutline(input,context),e=>e.code==='PROVIDER_TIMEOUT');
  assert.equal(providerSignal.aborted,true);
  const controller=new AbortController(),next=createStagedGenerationService({config,provider});
  const pending=next.generateOutline(input,{...context,signal:controller.signal});controller.abort();
  await assert.rejects(pending,e=>e.code==='CLIENT_CANCELED');
});

test('staged generation respects the existing server-side AI enable switch',async()=>{
  const disabled=createStagedGenerationService({config:generationConfig({})});
  assert.equal(disabled.status().available,false);
  await assert.rejects(disabled.generateOutline(input,context),e=>e.code==='NOT_CONFIGURED');
});
