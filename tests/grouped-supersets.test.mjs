import test from 'node:test';
import assert from 'node:assert/strict';
import {exercises} from '../server/seed.mjs';
import {LOAD_MODE as L} from '../shared/ai/contract.mjs';
import {newPrescription,prepareProgram,prepareSession,prescribedSets,recordPerformance,validatePrescription,prescriptionText} from '../shared/prescriptions.mjs';
import {sessionRecommendations} from '../shared/adaptive-prescriptions.mjs';
import {propagateProgram} from '../shared/program-sync.mjs';

const bench=()=>({...newPrescription('bench'),sets:2,reps:5,loadMode:L.FIXED,load:185,rpe:null,effortMode:'none',setBlocks:[
  {sets:1,reps:1,loadMode:L.FIXED,load:210,loadUnit:'lbs',effortMode:'none',rpe:null},
  {sets:1,reps:3,loadMode:L.FIXED,load:160,loadUnit:'lbs',effortMode:'none',rpe:null}
]});
const row=()=>({...newPrescription('row'),sets:2,reps:10,loadMode:L.FIXED,load:95,rpe:null,effortMode:'none'});
const session=()=>({name:'Upper',day:1,exercises:[bench(),row()],blocks:[{id:'superset-a',type:'Strength',name:'A',exerciseIndexes:[0,1],superset:true,supersetNotes:'Alternate A1 and A2.',restSeconds:90}]});

test('two prescribed set blocks retain separate targets and actual results under one exercise',()=>{
  const saved=prepareSession(session(),exercises);
  assert.equal(saved.exercises.length,2);assert.equal(saved.exercises[0].setBlocks.length,2);
  assert.deepEqual(prescribedSets(saved.exercises[0]).map(s=>[s.reps,s.load]),[[1,210],[3,160]]);
  const logged=recordPerformance([{exerciseId:'bench',sets:[{load:205,loadUnit:'lbs',reps:1,rpe:8},{load:165,loadUnit:'lbs',reps:3,rpe:7}]},{exerciseId:'row',sets:[{load:95,loadUnit:'lbs',reps:10},{load:100,loadUnit:'lbs',reps:10}]}],saved.exercises,exercises);
  assert.deepEqual(logged[0].sets.map(s=>s.load),[205,165]);assert.deepEqual(logged[0].target.setBlocks,saved.exercises[0].setBlocks);
  assert.equal(logged[1].target.exerciseId,'row');assert.equal(logged[1].sets[1].load,100);
});

test('all six load methods work independently across blocks of the same strength exercise',()=>{
  const modes=[L.FIXED,L.PERCENTAGE,L.BODYWEIGHT,L.ATHLETE_SELECTED,L.PREVIOUS_PERFORMANCE,L.NONE];
  const blocks=modes.map((mode,i)=>({sets:1,reps:5,loadMode:mode,load:mode===L.FIXED?150:mode===L.BODYWEIGHT?20:null,loadDelta:mode===L.PREVIOUS_PERFORMANCE?-5:null,percent1RM:mode===L.PERCENTAGE?75:null,referenceExerciseId:mode===L.PERCENTAGE?'bench':null,referenceExerciseName:mode===L.PERCENTAGE?'Bench Press':null,reference1RM:null,loadUnit:'lbs',increment:5,effortMode:'none',rpe:null}));
  const item={...newPrescription('bench'),...blocks[0],sets:6,setBlocks:blocks};
  assert.deepEqual(validatePrescription(item,exercises).filter(x=>x.severity==='error'),[]);
  const saved=prepareSession({name:'All methods',day:1,exercises:[item]},exercises).exercises[0];
  assert.deepEqual(prescribedSets(saved).map(s=>s.loadMode),modes);
  assert.match(prescriptionText(saved),/Previous performance/);
  const assignment={id:'a',athleteId:'athlete',startDate:'2026-10-19',plan:[{week:1,sessions:[{name:'All methods',day:1,exercises:[saved]}]}]};
  const recommendations=sessionRecommendations(assignment,1,0,[],exercises,'2026-10-24')[0];
  assert.equal(recommendations.length,6);assert.equal(recommendations[1].status,'needs_baseline');assert.equal(recommendations[4].status,'needs_previous_performance');
});

test('superset is an ordered layout reference, not a merged prescription; legacy sessions remain valid',()=>{
  const saved=prepareSession(session(),exercises);
  assert.deepEqual(saved.blocks[0].exerciseIndexes,[0,1]);assert.equal(saved.blocks[0].superset,true);assert.equal(saved.blocks[0].restSeconds,90);
  assert.equal(saved.exercises[0].setBlocks.length,2);assert.equal(saved.exercises[1].reps,10);
  assert.throws(()=>prepareSession({...session(),blocks:[{id:'bad',type:'Strength',exerciseIndexes:[0],superset:true}]},exercises),/superset needs at least two/);
  assert.equal(prepareSession({name:'Legacy',day:1,exercises:[row()]},exercises).blocks,undefined);
});

test('future superset and grouped changes sync while completed history and assignment ID stay fixed',()=>{
  const old=prepareProgram({name:'Grouped',goal:'Strength',weeks:2,description:'',sessions:[session()]},exercises);
  const oldPlan=[1,2].map(week=>({week,sessions:structuredClone(old.sessions)}));
  const newPlan=structuredClone(oldPlan);newPlan[0].sessions[0].exercises[0].setBlocks[0].load=225;
  newPlan[1].sessions[0].exercises[0].setBlocks[1].load=170;
  newPlan[1].sessions[0].blocks[0].supersetNotes='Alternate; pause between rounds.';
  const assignment={id:'same-assignment',athleteId:'athlete',weeks:2,plan:structuredClone(oldPlan)};
  const completedLog={id:'saved-history',assignmentId:assignment.id,week:1,session:0,exercises:[{exerciseId:'bench',sets:[{load:205,reps:1}]}]};
  const {assignment:updated}=propagateProgram(assignment,oldPlan,newPlan,[completedLog]);
  assert.equal(updated.id,assignment.id);assert.equal(updated.plan[0].sessions[0].exercises[0].setBlocks[0].load,210);
  assert.equal(updated.plan[1].sessions[0].exercises[0].setBlocks[1].load,170);
  assert.equal(updated.plan[1].sessions[0].blocks[0].supersetNotes,'Alternate; pause between rounds.');
  assert.equal(updated.plan[1].sessions[0].prescriptionRevision,1);
  assert.equal(completedLog.exercises[0].sets[0].load,205);
});
