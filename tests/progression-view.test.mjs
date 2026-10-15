import test from 'node:test';
import assert from 'node:assert/strict';
import {planWeeks,planWeek,recommendationTarget} from '../shared/progression-view.mjs';
test('progression view handles legacy missing data without mutating it',()=>{
 for(const assignment of [null,{}, {plan:null},{plan:{}},{plan:[null,{week:1,sessions:null}]}]){
  const snapshot=structuredClone(assignment);assert.ok(Array.isArray(planWeeks(assignment)));assert.equal(recommendationTarget(assignment,1,{session:0,index:0,exerciseId:'bench'}),null);assert.deepEqual(assignment,snapshot);
 }
});
test('recommendations resolve by week identity and reject stale session/exercise indexes',()=>{
 const assignment={plan:[{week:4,sessions:[{name:'Bench',exercises:[{exerciseId:'bench',load:100}]}]}]},before=structuredClone(assignment);
 assert.equal(planWeek(assignment,4),assignment.plan[0]);assert.equal(recommendationTarget(assignment,4,{session:0,index:0,exerciseId:'bench'}).item.load,100);
 for(const row of [null,{session:1,index:0,exerciseId:'bench'},{session:0,index:1,exerciseId:'bench'},{session:0,index:0,exerciseId:'run'}])assert.equal(recommendationTarget(assignment,4,row),null);
 assert.equal(recommendationTarget(assignment,1,{session:0,index:0,exerciseId:'bench'}),null);assert.deepEqual(assignment,before);
});
