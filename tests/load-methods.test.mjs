import test from 'node:test';
import assert from 'node:assert/strict';
import {exercises} from '../server/seed.mjs';
import {LOAD_MODE as L} from '../shared/ai/contract.mjs';
import {LOAD_METHOD_OPTIONS,loadModePatch} from '../shared/load-methods.mjs';
import {newPrescription,prepareProgram,validatePrescription,prescriptionText,initialActualLoad} from '../shared/prescriptions.mjs';
import {recommendAthleteLoad} from '../shared/adaptive-prescriptions.mjs';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {validateDraft} from '../shared/ai/validate.mjs';

const library=[...exercises,{id:'loaded-hold',name:'Loaded Hold',trackingType:'loadedTimed'}];
const strength=id=>({...newPrescription(id),sets:3,reps:5,rest:120,effortMode:'none',rpe:null});
const errors=e=>validatePrescription(e,library).filter(f=>f.severity==='error');

test('one shared selector has all six modes and switching removes conflicting mode data',()=>{
  assert.deepEqual(LOAD_METHOD_OPTIONS.map(([key])=>key),Object.values(L));
  const old={...strength('bench'),loadMode:L.PERCENTAGE,percent1RM:75,referenceExerciseId:'squat',referenceExerciseName:'Barbell Back Squat',reference1RM:null,load:null};
  const next={...old,...loadModePatch(old,L.PREVIOUS_PERFORMANCE)};
  assert.equal(next.loadMode,L.PREVIOUS_PERFORMANCE);assert.equal(next.loadDelta,0);
  assert.equal(next.percent1RM,null);assert.equal(next.referenceExerciseId,null);
  assert.equal(next.reference1RM,null);assert.equal(errors(next).length,0);
  assert.equal(old.percent1RM,75,'the stored source is unchanged');
});

test('all six methods save for multiple strength exercises without unnecessary fields',()=>{
  for(const id of ['bench','pullup','squat'])for(const mode of Object.values(L)){
    const item={...strength(id),loadMode:mode,load:null,loadDelta:null,percent1RM:null,reference1RM:null};
    if(mode===L.FIXED)item.load=135;
    if(mode===L.BODYWEIGHT)item.load=25;
    if(mode===L.PERCENTAGE){item.percent1RM=75;item.referenceExerciseId='squat';item.referenceExerciseName='Barbell Back Squat';}
    if(mode===L.PREVIOUS_PERFORMANCE)item.loadDelta=-5;
    assert.deepEqual(errors(item),[],`${id} ${mode}`);
    const saved=prepareProgram({name:'Six methods',goal:'Strength',weeks:1,description:'',sessions:[{name:'Day',day:1,exercises:[item]}]},library).sessions[0].exercises[0];
    assert.equal(saved.loadMode,mode);assert.equal(saved.exerciseId,id);
    if(mode===L.BODYWEIGHT){assert.match(prescriptionText(saved),/Bodyweight \+ 25 lb/);assert.equal(initialActualLoad(saved),25);}
  }
});

test('duration-based loaded strength keeps the same six load methods and measurement fields',()=>{
  for(const mode of Object.values(L)){
    const item={exerciseId:'loaded-hold',trackingType:'loadedTimed',sets:3,rest:60,
      metrics:{durationSeconds:30,load:null,loadUnit:'lbs'},loadMode:mode,loadUnit:'lbs',increment:5,
      loadDelta:null,percent1RM:null,referenceExerciseId:null,referenceExerciseName:null,notes:''};
    if(mode===L.FIXED)item.metrics.load=100;
    if(mode===L.BODYWEIGHT)item.metrics.load=25;
    if(mode===L.PERCENTAGE){item.percent1RM=70;item.referenceExerciseId='squat';item.referenceExerciseName='Barbell Back Squat';}
    if(mode===L.PREVIOUS_PERFORMANCE)item.loadDelta=-5;
    assert.deepEqual(errors(item),[],`loaded hold ${mode}`);
    const saved=prepareProgram({name:'Hold',goal:'Strength',weeks:1,description:'',sessions:[{name:'Day',day:1,exercises:[item]}]},library).sessions[0].exercises[0];
    assert.equal(saved.metrics.durationSeconds,30);assert.equal(saved.loadMode,mode);
  }
});

test('previous performance uses only completed matching actuals, supports regression, and never invents a load',()=>{
  const e={...strength('pullup'),loadMode:L.PREVIOUS_PERFORMANCE,loadDelta:-5,load:null};
  const missing=recommendAthleteLoad(e,{athleteId:'athlete',library,logs:[],today:'2026-10-24'});
  assert.equal(missing.status,'needs_previous_performance');
  const logs=[{id:'log-1',athleteId:'athlete',createdAt:'2026-10-20T12:00:00Z',exercises:[{exerciseId:'pullup',sets:[{load:45,loadUnit:'lbs',reps:5,completed:true},{load:60,loadUnit:'lbs',reps:1,completed:false}]}]}];
  logs.push({id:'skipped',athleteId:'athlete',status:'skipped',createdAt:'2026-10-22T12:00:00Z',exercises:[{exerciseId:'pullup',sets:[{load:100,loadUnit:'lbs',reps:5,completed:true}]}]});
  const result=recommendAthleteLoad(e,{athleteId:'athlete',library,logs,today:'2026-10-24'});
  assert.equal(result.status,'recommended');assert.equal(result.load,40);assert.equal(result.baseline.logId,'log-1');
  const hold={exerciseId:'loaded-hold',trackingType:'loadedTimed',loadMode:L.PREVIOUS_PERFORMANCE,loadDelta:-5,loadUnit:'lbs',increment:5,metrics:{durationSeconds:30,load:null}};
  const holdLog={id:'hold-1',athleteId:'athlete',createdAt:'2026-10-21T12:00:00Z',exercises:[{exerciseId:'loaded-hold',sets:[{load:100,loadUnit:'lbs',durationSeconds:30,completed:true}]}]};
  assert.equal(recommendAthleteLoad(hold,{athleteId:'athlete',library,logs:[holdLog],today:'2026-10-24'}).load,95);
});

test('AI draft validation accepts all six methods and reference-exercise selection',()=>{
  for(const mode of Object.values(L)){
    const draft=createFixture(),e=draft.program.plan[0].sessions[0].exercises[0];
    Object.assign(e,{loadMode:mode,load:null,loadDelta:null,percent1RM:null,reference1RM:null,referenceExerciseId:null,referenceExerciseName:null});
    if(mode===L.FIXED)e.load=185;
    if(mode===L.BODYWEIGHT)e.load=20;
    if(mode===L.PERCENTAGE){e.percent1RM=75;e.referenceExerciseId='squat';e.referenceExerciseName='Barbell Back Squat';}
    if(mode===L.PREVIOUS_PERFORMANCE)e.loadDelta=5;
    const result=validateDraft(draft,library);
    assert.equal(result.counts.error,0,`${mode}: ${result.findings.filter(f=>f.severity==='error').map(f=>f.message).join('; ')}`);
  }
});
