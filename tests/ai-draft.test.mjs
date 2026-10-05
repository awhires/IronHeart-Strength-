import test from 'node:test';
import assert from 'node:assert/strict';
import {exercises} from '../server/seed.mjs';
import {createFixture,FIXTURE_REQUIREMENTS as requirements} from '../shared/ai/fixtures.mjs';
import {validateDraft,percentageLoad,estimateSessionMinutes} from '../shared/ai/validate.mjs';
import {createReview,editReview,approveReview,isApproved} from '../shared/ai/draft-state.mjs';
import {toIronHeartProgram} from '../shared/ai/convert.mjs';
import {parseOptionalNumber,LOAD_MODE,EFFORT_MODE,LOAD_UNIT,DRAFT_STATUS} from '../shared/ai/contract.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';
const first=d=>d.program.plan[0].sessions[0].exercises[0];
const validate=d=>validateDraft(d,exercises,requirements);
const codes=d=>validate(d).findings.map(f=>f.code);
const approved=d=>approveReview(createReview(d),exercises,requirements,{coachId:'coach',warningsReviewed:true,reviewedAt:'2026-10-02T00:00:00Z'});

test('AI valid draft; schema findings are structured and validation never mutates',()=>{
  const d=createFixture(),before=structuredClone(d),v=validate(d);
  assert.equal(v.canApprove,true);assert.equal(v.counts.error,0);assert.deepEqual(d,before);
  const bad=createFixture('issues'),snapshot=structuredClone(bad);
  const findings=validate(bad).findings;assert.deepEqual(bad,snapshot);
  for(const f of findings)for(const key of ['code','severity','message','path'])assert.equal(typeof f[key],'string');
});
test('AI unknown ID and unresolved name stay in the draft without library creation',()=>{
  const d=createFixture(),library=structuredClone(exercises);first(d).exerciseId=null;first(d).exerciseName='Unknown lift';
  assert.ok(codes(d).includes('UNKNOWN_EXERCISE'));assert.equal(first(d).exerciseName,'Unknown lift');assert.deepEqual(exercises,library);
  first(d).exerciseId='invented-id';assert.ok(codes(d).includes('UNKNOWN_EXERCISE'));
});
test('AI fixed load must be known; blank never becomes zero',()=>{
  const d=createFixture();first(d).loadMode=LOAD_MODE.FIXED;
  assert.ok(codes(d).includes('MISSING_LOAD'));assert.equal(parseOptionalNumber(''),null);assert.equal(parseOptionalNumber('  '),null);assert.equal(parseOptionalNumber('0'),0);
  first(d).load='';assert.equal(validate(d).canApprove,false);
  first(d).load=135;assert.equal(validate(d).canApprove,true);
});
test('AI bodyweight and athlete-selected loads retain null and cannot carry fixed loads',()=>{
  const d=createFixture();first(d).loadMode=LOAD_MODE.BODYWEIGHT;assert.equal(validate(d).canApprove,true);
  assert.equal(first(toIronHeartProgramEnvelope(d)).load,null);
  first(d).load=20;assert.ok(codes(d).includes('CONFLICTING_LOAD_MODE'));
  first(d).loadMode=LOAD_MODE.ATHLETE_SELECTED;assert.ok(codes(d).includes('CONFLICTING_LOAD_MODE'));
  first(d).load=null;assert.equal(validate(d).canApprove,true);
});
function toIronHeartProgramEnvelope(d){return {program:toIronHeartProgram(approved(d),exercises,requirements)};}
test('AI percentage derives weight only from a valid matching reference and rounds to increment',()=>{
  const d=createFixture('percentage'),e=first(d);assert.equal(validate(d).canApprove,true);
  assert.equal(percentageLoad(e,exercises),170);assert.equal(first(d).load,null);
  const output=toIronHeartProgram(approved(d),exercises,requirements);assert.equal(output.plan[0].sessions[0].exercises[0].load,170);assert.equal(e.load,null);
  e.reference1RM={...e.reference1RM,value:100,unit:LOAD_UNIT.KG};assert.equal(percentageLoad(e,exercises),165);
  e.loadUnit=LOAD_UNIT.KG;assert.equal(percentageLoad(e,exercises),75);
});
test('AI missing or invalid reference maximum blocks approval and never invents a load',()=>{
  const d=createFixture('percentage'),e=first(d);e.reference1RM=null;assert.ok(codes(d).includes('MISSING_REFERENCE_1RM'));assert.equal(percentageLoad(e,exercises),null);
  for(const change of [{exerciseId:'squat'},{date:'2026-02-30'},{value:0},{type:'guessed'}]){
    const x=createFixture('percentage');Object.assign(first(x).reference1RM,change);assert.ok(codes(x).includes('INVALID_REFERENCE_1RM'));assert.equal(percentageLoad(first(x),exercises),null);
  }
});
test('AI valid RPE, RIR and no-effort targets retain their separate meanings',()=>{
  const d=createFixture();assert.equal(validate(d).canApprove,true);
  const e=first(d);e.effortMode=EFFORT_MODE.RIR;e.rpe=null;e.rir=2;assert.equal(validate(d).counts.error,0);
  const output=toIronHeartProgram(approved(d),exercises,requirements);assert.equal(output.plan[0].sessions[0].exercises[0].rpe,null);assert.equal(output.plan[0].sessions[0].exercises[0].rir,2);
  e.effortMode=EFFORT_MODE.NONE;e.rir=null;assert.equal(validate(d).counts.error,0);
});
for(const [name,key,mode,value,code] of [['RPE','rpe',EFFORT_MODE.RPE,11,'INVALID_RPE'],['RIR','rir',EFFORT_MODE.RIR,-1,'INVALID_RIR']])test(`AI rejects invalid ${name} and null target`,()=>{
  const d=createFixture(),e=first(d);e.rpe=null;e.rir=null;e.effortMode=mode;e[key]=value;assert.ok(codes(d).includes(code));e[key]=null;assert.ok(codes(d).includes(code));
});
test('AI tempo validation accepts normalized four parts and rejects invalid explosive positions',()=>{
  const d=createFixture(),e=first(d);
  for(const tempo of [null,'3-1-X-0','2-0-2-0']){e.tempo=tempo;assert.ok(!codes(d).includes('INVALID_TEMPO'));}
  for(const tempo of ['3-X-1-0','3-1-x-0','3-1','',123]){e.tempo=tempo;assert.ok(codes(d).includes('INVALID_TEMPO'));}
});
test('AI program length, week order, duplicates, empty sessions and invalid weekdays',()=>{
  let d=createFixture();d.program.weeks=null;assert.ok(codes(d).includes('MISSING_PROGRAM_LENGTH'));
  d=createFixture();d.program.plan.pop();assert.ok(codes(d).includes('INCOMPLETE_WEEK'));
  d=createFixture();d.program.plan[1].week=1;assert.ok(codes(d).includes('DUPLICATE_WEEK'));
  d=createFixture();d.program.plan[0].sessions[0].day=8;assert.ok(codes(d).includes('INVALID_DAY'));
  d=createFixture();d.program.plan[0].sessions[0].exercises=[];assert.ok(codes(d).includes('EMPTY_SESSION'));
  d=createFixture();d.program.plan[0].sessions[1].day=1;assert.ok(codes(d).includes('DUPLICATE_SESSION_DAY'));
});
test('AI intent checking counts distinct days, checks frequency, primary effort and duration estimates',()=>{
  const d=createFixture();d.program.plan[0].sessions[2].exercises[0].exerciseId='row';
  assert.ok(validate(d).findings.some(f=>f.code==='FREQUENCY_MISMATCH'&&f.message.includes('requested frequency is 2')));
  d.program.plan[0].sessions[0].exercises.push(structuredClone(first(d)));
  assert.ok(codes(d).includes('FREQUENCY_MISMATCH'));
  const e=first(d);e.sets=12;e.rest=600;assert.ok(estimateSessionMinutes(d.program.plan[0].sessions[0])>75);assert.ok(codes(d).includes('SESSION_DURATION_ESTIMATE'));
  e.effortMode=EFFORT_MODE.NONE;e.rpe=null;assert.ok(codes(d).includes('PRIMARY_LIFT_EFFORT'));
});
test('AI approval is explicit, warnings require acknowledgement and every edit invalidates it',()=>{
  const d=createFixture();d.assumptions=['Equipment not confirmed'];const r=createReview(d);
  assert.throws(()=>approveReview(r,exercises,requirements,{coachId:'coach'}),/warnings/);
  const a=approved(d);assert.equal(isApproved(a,exercises,requirements),true);
  const changed=editReview(a,x=>{first(x).loadMode=LOAD_MODE.FIXED;first(x).load=135;});assert.equal(changed.approval,null);assert.equal(changed.draft.status,DRAFT_STATUS.DRAFT);assert.equal(changed.revision,a.revision+1);
  assert.throws(()=>toIronHeartProgram(changed,exercises,requirements),/approved/);
  assert.equal(isApproved(a,exercises,{...requirements,maxSessionMinutes:60}),false);
  first(a.draft).reps=6;assert.equal(isApproved(a,exercises,requirements),false);
  const fake=createReview(createFixture());fake.draft.status=DRAFT_STATUS.APPROVED;assert.equal(isApproved(fake,exercises,requirements),false);
});
test('AI conversion preserves additive fields and source provenance, derives one Week 1, never mutates existing program',()=>{
  const d=createFixture();d.sourceProgramId='existing';first(d).tempo='3-1-X-0';d.program.coachNotes='Private test copy';
  const existing={id:'existing',name:'Keep me',sessions:[{name:'Original'}]},snapshot=structuredClone(existing),a=approved(d),before=structuredClone(a);
  const out=toIronHeartProgram(a,exercises,requirements);assert.equal(out.id,undefined);assert.equal(out.aiProvenance.sourceProgramId,'existing');assert.equal(out.sessions,out.plan[0].sessions);
  assert.deepEqual(out.plan,d.program.plan);assert.deepEqual(a,before);out.sessions[0].exercises[0].notes='Output only';assert.deepEqual(existing,snapshot);assert.equal(first(a.draft).notes,'');
});
test('AI explicit plan prevents the existing assignment adapter from applying legacy periodization',async()=>{
  const disk=new Map(),api=createLocalDemo({getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)});
  await api('demo','POST',{role:'coach'});const before=await api('data');
  const d=createFixture();d.sourceProgramId=before.programs[0].id;
  const converted=toIronHeartProgram(approved(d),exercises,requirements);
  // Test-only adapter integration; the review UI has no save or assign API path.
  const p=await api('programs','POST',converted);assert.notEqual(p.id,d.sourceProgramId);
  const a=await api('assign','POST',{programId:p.id,athleteId:'jordan',startDate:'2026-10-05'});
  assert.deepEqual(a.plan,converted.plan);assert.equal(a.plan[3].sessions[0].exercises[0].sets,3);assert.equal(a.plan[3].sessions[0].exercises[0].load,null);
  assert.deepEqual((await api('data')).programs.find(p=>p.id===d.sourceProgramId),before.programs[0]);
});
test('AI malformed objects, stale reported findings, conflicting modes and unsupported data cannot bypass validation',()=>{
  for(const d of [null,[],{},42,{program:{plan:[null,{week:1,sessions:[null,{exercises:[null]},{exercises:{}},{exercises:'bad'}]}]}}])assert.equal(validate(d).canApprove,false);
  const d=createFixture();d.validationFindings=[];first(d).rpe=99;assert.equal(validate(d).canApprove,false);
  first(d).rpe=8;first(d).rir=2;assert.ok(codes(d).includes('CONFLICTING_EFFORT_MODE'));
  first(d).percent1RM=50;assert.ok(codes(d).includes('CONFLICTING_LOAD_MODE'));
  d.program.id='overwrite-me';assert.ok(codes(d).includes('UNSUPPORTED_FIELD'));
});

test('AI invalid percentage inputs block calculation and error drafts cannot be approved',()=>{
  for(const change of [{percent1RM:0},{percent1RM:101},{loadUnit:'stone'},{increment:0.1},{increment:26}]){
    const d=createFixture('percentage');Object.assign(first(d),change);
    assert.equal(percentageLoad(first(d),exercises),null);
    assert.equal(validate(d).canApprove,false);
    assert.throws(()=>approved(d));
  }
  const a=approved(createFixture());
  assert.equal(isApproved(a,exercises.filter(e=>e.id!=='bench'),requirements),false);
  const rounded=createFixture('percentage');Object.assign(first(rounded),{percent1RM:100,increment:22});first(rounded).reference1RM.value=1200;
  assert.ok(codes(rounded).includes('LOAD_LIMIT'));assert.throws(()=>approved(rounded));
});
