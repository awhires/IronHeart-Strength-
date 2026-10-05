import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateBlock} from '../server/progression.mjs';
const base=[{name:'Speed lower',day:1,exercises:[{exerciseId:'squat',load:100,sets:10,reps:2,rpe:7,increment:2.5,rest:60,notes:'Brace.'}]}];
const options={method:'westside',roundTo:2.5,rules:{'0:0:squat':{mode:'speed-squat',referenceMax:200}}};
test('Westside-inspired squat wave preserves week one and repeats, without compounding maxima',()=>{
  const original=structuredClone(base),plan=generateBlock(base,6,options);
  assert.deepEqual(plan[0].sessions,base);assert.deepEqual(base,original);
  assert.deepEqual(plan.map(w=>w.sessions[0].exercises[0].load),[100,110,120,100,110,120]);
  assert.deepEqual(plan.map(w=>w.sessions[0].exercises[0].sets),[10,8,6,10,8,6]);
  assert.ok(plan.slice(1).every(w=>w.sessions[0].day===1&&w.sessions[0].exercises[0].reps===2));
  plan[1].sessions[0].exercises[0].load=105;assert.equal(plan[2].sessions[0].exercises[0].load,120);
});
test('bench uses its own bar-weight wave and nine triples',()=>{
  const plan=generateBlock(base,6,{...options,rules:{'0:0:squat':{mode:'speed-bench',referenceMax:200}}});
  assert.deepEqual(plan.slice(1).map(w=>w.sessions[0].exercises[0].load),[100,110,90,100,110]);
  assert.ok(plan.slice(1).every(w=>w.sessions[0].exercises[0].sets===9&&w.sessions[0].exercises[0].reps===3));
});
test('max-effort loads stay coach-set; missing or invalid reference maxima are rejected',()=>{
  assert.throws(()=>generateBlock(base,6,{...options,rules:{'0:0:squat':{mode:'speed-squat',referenceMax:0}}}));
  const plan=generateBlock(base,6,{...options,rules:{'0:0:squat':{mode:'max'}}});
  assert.ok(plan.every(w=>w.sessions[0].exercises[0].load===100));
});
test('repetition-effort custom increase respects bodyweight, and unmatched rules do not move to another exercise',()=>{
  const body=structuredClone(base);body[0].exercises[0].load=0;
  const plan=generateBlock(body,6,{...options,rules:{'0:0:squat':{mode:'repetition',increase:2.5}}});
  assert.ok(plan.every(w=>w.sessions[0].exercises[0].load===0));
  const changed=structuredClone(base);changed[0].exercises[0].exerciseId='bench';
  assert.equal(generateBlock(changed,6,options)[1].sessions[0].exercises[0].load,100);
});
