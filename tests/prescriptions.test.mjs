import test from 'node:test';
import assert from 'node:assert/strict';
import {exercises} from '../server/seed.mjs';
import {normalizePrescription,validatePrescription,calculatePercentageLoad,suggestedLoad,loadText,prescriptionText,prepareProgram,recordPerformance,normalizeData} from '../shared/prescriptions.mjs';
import {createFixture,FIXTURE_REQUIREMENTS} from '../shared/ai/fixtures.mjs';
import {createReview,approveReview,editReview} from '../shared/ai/draft-state.mjs';
import {createDraftSaveService} from '../shared/ai/save-service.mjs';
import {periodize,recommend,generateBlock,generateWestsideBlock} from '../server/progression.mjs';
const base=()=>normalizePrescription({exerciseId:'bench',sets:3,reps:5,load:185,rpe:8,rest:120,increment:5,notes:''});
const errors=e=>validatePrescription(e,exercises).filter(f=>f.severity==='error');
test('legacy boundary normalization is pure, including fixed zero and pounds',()=>{
  const old={exerciseId:'bench',sets:3,reps:5,load:0,rpe:8,rest:120,increment:5,notes:''},before=structuredClone(old);
  const e=normalizePrescription(old);assert.equal(e.loadMode,'fixed');assert.equal(e.effortMode,'rpe');assert.equal(loadText(e),'0 lb');assert.deepEqual(old,before);
  const data={programs:[{sessions:[{exercises:[old]}]}]},copy=normalizeData(data);assert.equal(copy.programs[0].sessions[0].exercises[0].loadUnit,'lbs');assert.equal(data.programs[0].sessions[0].exercises[0].loadMode,undefined);
});
test('all loading modes validate and format without inferring bodyweight',()=>{
  assert.equal(loadText(base()),'185 lb');
  for(const [mode,expected] of [['bodyweight','Bodyweight'],['athlete_selected','Choose load']]){
    const e={...base(),loadMode:mode,load:null};assert.equal(errors(e).length,0);assert.equal(loadText(e),expected);
    assert.ok(errors({...e,load:25}).length);
  }
  assert.ok(errors({...base(),load:null}).length);
});
test('percentage utility preserves raw and rounded calculations with unit conversion',()=>{
  assert.deepEqual(calculatePercentageLoad({percent1RM:75,referenceValue:225,referenceUnit:'lbs',increment:5}),{raw:168.75,rounded:170,unit:'lbs'});
  assert.equal(calculatePercentageLoad({percent1RM:75,referenceValue:100,referenceUnit:'kg',outputUnit:'lbs',increment:5}).rounded,165);
  assert.equal(calculatePercentageLoad({percent1RM:75,referenceValue:100,referenceUnit:'kg',outputUnit:'kg',increment:2.5}).rounded,75);
  for(const bad of [{referenceValue:null},{referenceUnit:'stone'},{percent1RM:0},{increment:0}])assert.equal(calculatePercentageLoad({percent1RM:75,referenceValue:225,referenceUnit:'lbs',...bad}),null);
});
test('live percentage without usable maximum is a warning, never a fabricated weight',()=>{
  const e={...base(),loadMode:'percentage',load:null,percent1RM:75};
  assert.equal(errors(e).length,0);assert.equal(suggestedLoad(e),null);assert.equal(loadText(e),'75% 1RM · Reference max needed');
  e.reference1RM={exerciseId:'bench',value:225,unit:'lbs',type:'tested',date:'2026-09-20'};
  assert.equal(suggestedLoad(e).rounded,170);assert.equal(loadText(e),'75% 1RM · Suggested: 170 lb');
  for(const change of [{date:'2026-02-30'},{value:0},{exerciseId:'squat'},{type:'guessed'}]){const invalid={...e,reference1RM:{...e.reference1RM,...change}};assert.equal(suggestedLoad(invalid),null);assert.equal(errors(invalid).length,0);}
  assert.ok(errors({...e,load:175}).length);assert.ok(errors({...e,percent1RM:101}).length);
});
test('effort none, RPE and RIR stay distinct and tempo remains optional',()=>{
  for(const e of [base(),{...base(),effortMode:'none',rpe:null},{...base(),effortMode:'rir',rpe:null,rir:2,tempo:'3-1-X-0'}])assert.equal(errors(e).length,0);
  const rir={...base(),effortMode:'rir',rpe:null,rir:2,tempo:'3-1-X-0'};
  assert.match(prescriptionText(rir),/RIR 2.*Tempo: 3-1-X-0/);assert.doesNotMatch(prescriptionText(rir),/RPE/);
  for(const patch of [{effortMode:'rpe',rpe:null},{effortMode:'rir',rpe:null,rir:11},{effortMode:'none'},{tempo:'3-X-0-0'}])assert.ok(errors({...base(),...patch}).length);
});
test('actual performance is independent and snapshots contain the original full prescription',()=>{
  const e={...base(),loadMode:'athlete_selected',load:null,effortMode:'rir',rpe:null,rir:2,tempo:'3-1-X-0',loadUnit:'kg'};
  const entries=[{exerciseId:e.exerciseId,sets:Array.from({length:3},()=>({load:50,loadUnit:'kg',reps:6,rpe:null}))}];
  const logged=recordPerformance(entries,[e]);assert.deepEqual(logged[0].target,e);assert.equal(logged[0].sets[0].load,50);assert.equal(logged[0].sets[0].rpe,null);
  delete entries[0].sets[0].rpe;assert.equal(recordPerformance(entries,[e])[0].sets[0].rpe,null);
  e.rir=3;assert.equal(logged[0].target.rir,2);assert.equal(logged[0].target.load,null);
  assert.throws(()=>recordPerformance(entries,[base()]));
});
test('richer targets are preserved by legacy periodization and held by recommendations',()=>{
  for(const patch of [{loadMode:'percentage',percent1RM:75,load:null},{loadMode:'bodyweight',load:null},{loadMode:'athlete_selected',load:null},{effortMode:'rir',rpe:null,rir:2},{loadUnit:'kg'}]){
    const e={...base(),...patch},p=periodize(e,4);assert.equal(p.load,e.load);assert.equal(p.rpe,e.rpe);assert.equal(p.sets,e.sets);
    const history=[{target:e,readiness:1,sets:[{load:30,reps:5,rpe:10}]}];assert.equal(recommend(e,history).action,'hold');
    const sessions=[{name:'A',day:1,exercises:[e]}];assert.equal(generateBlock(sessions,4)[3].sessions[0].exercises[0].load,e.load);
    assert.equal(generateWestsideBlock(sessions,4)[3].sessions[0].exercises[0].load,e.load);
    assert.throws(()=>generateWestsideBlock(sessions,4,{rules:{'0:0:bench':{mode:'repetition',increase:2}}}),/fixed pounds/);
  }
});
test('approval receipt binds revision, coach, library and expiry; retries do not duplicate',()=>{
  let n=0,time=0;const service=createDraftSaveService(()=>`id-${++n}`,()=>time);
  const review=approveReview(createReview(createFixture()),exercises,FIXTURE_REQUIREMENTS,{coachId:'coach'}),input={review,requirements:FIXTURE_REQUIREMENTS};
  const {receipt}=service.approve(input,exercises,'coach');let writes=0;
  const persist=p=>{writes++;return prepareProgram(p,exercises);};
  assert.throws(()=>service.save({...input,receipt,review:editReview(review,d=>{d.program.name='Changed';})},exercises,'coach',persist));
  assert.throws(()=>service.save({...input,receipt},exercises,'other',persist));
  assert.throws(()=>service.save({...input,receipt},exercises.filter(x=>x.id!=='bench'),'coach',persist));
  assert.throws(()=>service.save({...input,receipt},exercises,'coach',()=>{throw Error('Storage failed');}),/Storage failed/);
  const saved=service.save({...input,receipt},exercises,'coach',persist);assert.equal(saved.id,'id-3');assert.equal(writes,1);
  assert.deepEqual(service.save({...input,receipt},exercises,'coach',persist),saved);assert.equal(writes,1);
  time=31*60000;assert.throws(()=>service.save({...input,receipt},exercises,'coach',persist),/expired/);
});
