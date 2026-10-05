import {test} from 'node:test';
import assert from 'node:assert/strict';
import {periodize,recommend} from '../server/progression.mjs';
const p={sets:3,reps:8,load:60,increment:2.5,rpe:7};
const success=()=>({target:p,sets:Array.from({length:3},()=>({reps:8,load:60,rpe:7})),readiness:4,pain:false});
test('periodization schedules recovery every fourth week',()=>{for(const week of [4,8,12]){const r=periodize(p,week,12);assert.equal(r.phase,'Deload');assert.equal(r.sets,2);assert.equal(r.rpe,6);}assert.ok(periodize(p,3).load>periodize(p,1).load);});
test('bodyweight stays zero through all phases',()=>{for(let w=1;w<=12;w++)assert.equal(periodize({...p,load:0},w,12).load,0);});
test('requires two complete comparable successful sessions',()=>{assert.equal(recommend(p,[]).action,'hold');assert.equal(recommend(p,[success()]).action,'hold');assert.equal(recommend(p,[success(),success()]).load,62.5);const missed=success();missed.sets.pop();assert.equal(recommend(p,[success(),missed]).action,'hold');});
test('missed reps or excessive effort prevent progression',()=>{const missed=success();missed.sets[1].reps=6;assert.equal(recommend(p,[success(),missed]).action,'hold');missed.sets[1].reps=8;missed.sets[1].rpe=8;assert.equal(recommend(p,[success(),missed]).action,'hold');});
test('pain requires coach review; low readiness gives a bounded reduction',()=>{const low=success();low.pain=true;assert.equal(recommend(p,[low]).action,'review');low.pain=false;low.readiness=1;assert.equal(recommend(p,[low]).load,55);assert.equal(recommend({...p,load:55},[low]).action,'hold');});
test('deload cannot become a loading recommendation',()=>{assert.equal(recommend({...p,phase:'Deload'},[success(),success()]).action,'hold');});
test('generic progression does not override a dynamic wave or coach-set max effort',()=>{
  for(const phase of ['Dynamic effort · Wave 1','Max effort · coach set'])assert.equal(recommend({...p,phase},[success(),success()]).action,'hold');
});
test('large weight increments and mixed baseline loads are held',()=>{assert.equal(recommend({...p,increment:10},[success(),success()]).action,'hold');const other=success();other.target={...p,load:50};assert.equal(recommend(p,[other,success()]).action,'hold');});
