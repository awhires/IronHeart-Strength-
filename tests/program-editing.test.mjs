import test from 'node:test';
import assert from 'node:assert/strict';
import {appendProgramWeek} from '../shared/program-editing.mjs';

test('Add a week copies the previous week and keeps all earlier prescriptions',()=>{
 const source={name:'Strength block',weeks:4,sessions:[{name:'Week one',day:1,exercises:[{exerciseId:'bench',sets:3,reps:5,load:135}]}],plan:[
  {week:1,sessions:[{name:'Week one',day:1,exercises:[{exerciseId:'bench',sets:3,reps:5,load:135}]}]},
  {week:2,sessions:[{name:'Week two',day:1,exercises:[{exerciseId:'bench',sets:3,reps:5,load:140}]}]},
  {week:3,sessions:[{name:'Week three',day:1,exercises:[{exerciseId:'bench',sets:3,reps:5,load:145}]}]},
  {week:4,sessions:[{name:'Week four',day:1,exercises:[{exerciseId:'bench',sets:3,reps:5,load:150}]}]}
 ]};
 const result=appendProgramWeek(source);
 assert.equal(result.weeks,5);assert.deepEqual(result.plan.map(w=>w.week),[1,2,3,4,5]);
 assert.equal(result.plan[4].sessions[0].exercises[0].load,150);
 result.plan[4].sessions[0].exercises[0].load=155;
 assert.equal(result.plan[3].sessions[0].exercises[0].load,150);
 assert.equal(source.weeks,4);assert.equal(source.plan.length,4);
});

test('Add a week expands a legacy template and enforces the twelve-week cap',()=>{
 const source={name:'Legacy template',weeks:4,sessions:[{name:'Workout A',day:1,exercises:[{exerciseId:'bench',sets:3,reps:5,load:135}]}]};
 const result=appendProgramWeek(source);
 assert.deepEqual(result.plan.map(w=>w.week),[1,2,3,4,5]);
 assert.equal(result.plan[4].sessions[0].name,'Workout A');
 assert.throws(()=>appendProgramWeek({...source,weeks:12}),/twelve weeks/);
});
