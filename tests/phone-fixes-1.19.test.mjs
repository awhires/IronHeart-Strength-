import test from 'node:test';
import assert from 'node:assert/strict';
import {cardioStats} from '../shared/cardio-stats.mjs';
import {analyzeTrainingQuestion} from '../shared/phase3.mjs';
import {addCalendarDays,trainingWeekDays,trainingDayStatus} from '../shared/training-calendar.mjs';

const running={id:'outdoor-running',name:'Outdoor Running',trackingType:'running'};
const interval={durationSeconds:125,paceSeconds:425,paceUnit:'mi',completed:true};
const workout={id:'vo2',athleteId:'athlete-one',workoutDate:'2026-10-21',sessionName:'Vo2 max 6x2',source:'tracker',status:'completed',exercises:[{exerciseId:running.id,sets:Array.from({length:6},()=>({...interval})),target:{intervals:[{rounds:6,work:{distance:2,distanceUnit:'mi'}}]},intervals:[{rounds:6,work:{durationSeconds:125,paceSeconds:425},recovery:{durationSeconds:125}}]}]};

test('running totals derive only performed work distance from actual time and pace',()=>{
 const stats=cardioStats([workout],running,'athlete-one');
 assert.equal(stats.sessions.length,1);
 assert.ok(Math.abs(stats.totals.meters/1609.344-6*125/425)<1e-8);
 assert.equal(stats.totals.seconds,750);
 assert.equal(stats.sessions[0].distanceDerived,true);
 assert.equal(cardioStats([workout],running,'another-athlete').sessions.length,0);
 const unmeasured=structuredClone(workout);unmeasured.exercises[0].sets=unmeasured.exercises[0].sets.map(({paceSeconds,...set})=>set);
 assert.equal(cardioStats([unmeasured],running,'athlete-one').totals.meters,0);
 const partial=structuredClone(workout);partial.exercises[0].sets[0].completed=false;
 assert.ok(Math.abs(cardioStats([partial],running,'athlete-one').totals.meters/1609.344-5*125/425)<1e-8);
});

test('Ask AI identifies last and longest actual outdoor runs, not prescribed intervals',()=>{
 const shorter={...structuredClone(workout),id:'older',workoutDate:'2026-10-19',sessionName:'Easy run',exercises:[{exerciseId:running.id,sets:[{distance:1,distanceUnit:'mi',durationSeconds:500}]}]};
 const logs=[shorter,workout],library=[running,{id:'treadmill',name:'Treadmill Run',trackingType:'treadmill'}];
 for(const question of ['Longest run?','Last run workout','Last outdoor run workout?']){
  const result=analyzeTrainingQuestion({question,logs,library,now:new Date('2026-10-24T12:00:00Z')});
  assert.equal(result.evidence[0].source.workoutLogId,'vo2',question);
  assert.match(result.answer,/2026-10-21.*Vo2 max 6x2/,question);
  assert.equal(result.deterministic,true);
 }
 const noMeasurement={...structuredClone(workout),exercises:[{exerciseId:running.id,sets:[{durationSeconds:125}],target:workout.exercises[0].target}]};
 const longest=analyzeTrainingQuestion({question:'Longest run?',logs:[noMeasurement],library});
 assert.equal(longest.evidence[0].kind,'insufficient_data');
 const last=analyzeTrainingQuestion({question:'Last outdoor run workout?',logs:[noMeasurement],library});
 assert.match(last.answer,/2026-10-21.*Vo2 max 6x2/);
 const split=structuredClone(workout);split.exercises=split.exercises[0].sets.map(set=>({exerciseId:running.id,sets:[set]}));
 const splitResult=analyzeTrainingQuestion({question:'Longest run?',logs:[split],library});
 assert.ok(Math.abs(splitResult.evidence[0].meters/1609.344-6*125/425)<0.001);
 assert.deepEqual(splitResult.evidence[0].source.entryIndexes,[0,1,2,3,4,5]);
});

test('seven-day Training calendar retains date-only keys across months, years and DST',()=>{
 assert.deepEqual(trainingWeekDays('2027-01-01'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
 assert.equal(addCalendarDays('2026-10-31',7),'2026-11-07');
 assert.equal(addCalendarDays('2026-03-08',7),'2026-03-15');
 const events=[{key:'2026-10-20'},{key:'2026-10-21',log:{status:'completed'}},{key:'2026-10-22',log:{status:'skipped'}}];
 assert.equal(trainingDayStatus(events,'2026-10-20','2026-10-24'),'missed');
 assert.equal(trainingDayStatus(events,'2026-10-21','2026-10-24'),'completed');
 assert.equal(trainingDayStatus(events,'2026-10-22','2026-10-24'),'skipped');
 assert.equal(trainingDayStatus(events,'2026-10-23','2026-10-24'),'rest');
 assert.equal(trainingDayStatus([{key:'2026-10-27'}],'2026-10-27','2026-10-24'),'scheduled');
 const completedElsewhere=[{key:'2026-10-25',scheduledKey:'2026-10-20',log:{status:'completed'}}];
 assert.equal(trainingDayStatus(completedElsewhere,'2026-10-20','2026-10-24'),'scheduled');
 assert.equal(trainingDayStatus(completedElsewhere,'2026-10-25','2026-10-24'),'completed');
});
