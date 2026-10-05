import test from 'node:test';
import assert from 'node:assert/strict';
import {newPrescription,normalizePrescription,calculatePercentageLoad} from '../shared/prescriptions.mjs';
import {periodize,generateBlock,generateWestsideBlock} from '../server/progression.mjs';
import {prepareTrackerWorkout} from '../shared/workout-tracker.mjs';
import {exerciseVolume,exerciseVolumeStats} from '../shared/volume-stats.mjs';
import {exercises} from '../server/seed.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';
const sets=[{reps:5,load:200,rpe:7,loadUnit:'lbs'},{reps:5,load:200,rpe:8,loadUnit:'lbs'}];
const input={sessionName:'Independent strength',workoutDate:'2026-10-03',notes:'Felt good',exercises:[{exerciseId:'bench',sets},{exerciseId:'squat',sets:[{load:100,reps:8,loadUnit:'lbs',rpe:null}]}]};
const log=(id,date,source='tracker',weight=200)=>({id,athleteId:'jordan',sessionName:id,workoutDate:date,createdAt:date+'T12:00:00Z',source,exercises:[{exerciseId:'bench',sets:sets.map(s=>({...s,load:weight}))}]});
test('new pound prescriptions and rounding default to 5, kg remains 2.5, explicit older steps are preserved',()=>{
  assert.equal(newPrescription('bench').increment,5);
  const old={...newPrescription('bench'),increment:2.5};assert.equal(normalizePrescription(old).increment,2.5);assert.equal(old.increment,2.5);
  assert.equal(normalizePrescription({loadUnit:'kg'}).increment,2.5);
  const pct={percent1RM:51,referenceValue:200,referenceUnit:'lbs'};
  assert.equal(calculatePercentageLoad(pct).rounded,100);assert.equal(calculatePercentageLoad({...pct,increment:2.5}).rounded,102.5);
  assert.equal(calculatePercentageLoad({...pct,referenceUnit:'kg',outputUnit:'kg'}).rounded,102.5);
  const base={exerciseId:'bench',load:100,sets:3,reps:5,rpe:7};
  assert.equal(periodize(base,2).load,100);assert.equal(periodize({...base,increment:2.5},2).load,102.5);
  assert.equal(generateBlock([{exercises:[base]}],4)[1].sessions[0].exercises[0].increment,5);
  assert.equal(generateWestsideBlock([{exercises:[base]}],3,{rules:{'0:0:bench':{mode:'speed-bench',referenceMax:203}}})[1].sessions[0].exercises[0].load,100);
  const legacy={...base,increment:2.5};
  assert.equal(generateBlock([{exercises:[legacy]}],4)[1].sessions[0].exercises[0].increment,2.5);
  assert.equal(generateWestsideBlock([{exercises:[legacy]}],3,{rules:{'0:0:bench':{mode:'speed-bench',referenceMax:203}}})[1].sessions[0].exercises[0].load,102.5);
});
test('tracker validates manual sets without fabricated targets and rejects ownership/linkage injection',()=>{
  const out=prepareTrackerWorkout(input,exercises);assert.equal(out.source,'tracker');assert.equal(out.exercises.length,2);assert.equal(out.exercises[0].sets.length,2);assert.equal(out.exercises[0].target,undefined);assert.equal(out.assignmentId,undefined);
  assert.equal(prepareTrackerWorkout({...input,workoutDate:''},exercises,'2026-10-04').workoutDate,'2026-10-04');
  for(const patch of [{athleteId:'maya'},{assignmentId:'x'},{workoutDate:'2026-02-30'},{sessionName:''},{exercises:[]},{exercises:[{exerciseId:'nope',sets}]},{exercises:[{exerciseId:'bench',sets:[{reps:5,load:-1}]}]}])assert.throws(()=>prepareTrackerWorkout({...input,...patch},exercises));
});
test('phone tracker saves without assigned plans, appears in history and survives reopening',async()=>{
  const disk=new Map(),storage={getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)},api=createLocalDemo(storage);
  await api('demo','POST',{role:'athlete'});const key='iron-heart-phone-preview-v1',state=JSON.parse(disk.get(key));state.assignments=[];disk.set(key,JSON.stringify(state));
  const saved=await api('tracker','POST',input);assert.equal(saved.athleteId,'jordan');assert.equal(saved.source,'tracker');assert.equal(saved.exercises[0].sets.length,2);
  const data=await createLocalDemo(storage)('data');assert.equal(data.assignments.length,0);assert.deepEqual(data.logs[0],saved);
  assert.equal(exerciseVolumeStats(data.logs,'bench','jordan',{today:'2026-10-03'}).today,2000);
  await api('demo','POST',{role:'coach'});await assert.rejects(api('tracker','POST',input),/Athlete view/);assert.equal((await api('data')).logs.length,1);
  await api('demo','POST',{role:'athlete'});await api('delete','POST',{kind:'log',id:saved.id});assert.equal((await api('data')).logs.length,0);
});
test('tracker storage failure does not acknowledge success or alter previous history',async()=>{
  const disk=new Map(),storage={getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)},api=createLocalDemo(storage);await api('demo','POST',{role:'athlete'});const before=JSON.stringify([...disk]);
  const fail=createLocalDemo({...storage,setItem:()=>{throw Error('Storage full');}});await assert.rejects(fail('tracker','POST',input),/Storage full/);assert.equal(JSON.stringify([...disk]),before);
});
test('volume sums actual sets and repeated exercise entries within a session',()=>{
  const session=log('a','2026-10-03');assert.equal(exerciseVolume(session,'bench').volume,2000);
  session.exercises.push({exerciseId:'bench',sets:[{reps:3,load:100}]});assert.equal(exerciseVolume(session,'bench').volume,2300);
  session.exercises[0].target={sets:99,reps:99,load:1000};assert.equal(exerciseVolume(session,'bench').volume,2300);
});
test('volume trend combines plan and journal history, isolates athletes and dates, and calculates best/week/change',()=>{
  const logs=[log('new','2026-10-03','tracker',200),log('old','2026-09-28','assigned',100),{...log('other','2026-10-03','tracker',900),athleteId:'maya'},log('yesterday','2026-10-02','assigned',150)];
  const stats=exerciseVolumeStats(logs,'bench','jordan',{today:'2026-10-03'});
  assert.deepEqual(stats.sessions.map(s=>s.id),['old','yesterday','new']);assert.equal(stats.today,2000);assert.equal(stats.previous.volume,1500);assert.equal(stats.best.volume,2000);assert.equal(stats.weekly,4500);assert.ok(Math.abs(stats.changePercent-33.3333333333)<.0001);
  assert.equal(exerciseVolumeStats(logs,'bench','jordan',{today:'2026-10-04'}).today,null);
});
test('volume excludes missing/invalid loads and reps, preserves zero and converts kg without inventing body mass',()=>{
  const session={exercises:[{exerciseId:'bench',sets:[{reps:5,load:null},{reps:5,load:''},{reps:5},{reps:5,load:-10},{reps:5,load:0},{reps:5,load:20,loadUnit:'kg'},{reps:null,load:20}]}]};
  const value=exerciseVolume(session,'bench','kg');assert.equal(value.volume,100);assert.equal(value.validSets,2);assert.equal(value.excludedSets,5);
  assert.ok(Math.abs(exerciseVolume(session,'bench').volume-220.46226218)<.0001);
  assert.equal(exerciseVolume({exercises:[{exerciseId:'bench',sets:[{reps:5,load:null}]}]},'bench').volume,null);
  assert.equal(exerciseVolume({exercises:[]},'bench').volume,null);
  const zero=exerciseVolumeStats([log('zero','2026-10-02','tracker',0),log('next','2026-10-03')],'bench','jordan',{today:'2026-10-03'});assert.equal(zero.changePercent,null);
});
