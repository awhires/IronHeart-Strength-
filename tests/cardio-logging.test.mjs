import test from 'node:test';
import assert from 'node:assert/strict';
import {exercises} from '../server/seed.mjs';
import {missingTrackingExercises,convertDistance,setSummary} from '../shared/tracking.mjs';
import {prescribedCardioIntervals,initialCardioActuals,copyPreviousActual,cardioWorkTotals} from '../shared/cardio-logging.mjs';
import {calculatedCardioMetrics,validateCardioPrescription} from '../shared/cardio-prescriptions.mjs';
import {recordPerformance} from '../shared/prescriptions.mjs';
import {reviewScan,SCAN_SCHEMA,SCAN_INSTRUCTIONS} from '../shared/scan-workout.mjs';
import {prepareTrackerWorkout} from '../shared/workout-tracker.mjs';
import {cardioStats} from '../shared/cardio-stats.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';
const library=[...exercises,...missingTrackingExercises(exercises)];
const target={exerciseId:'rowerg',trackingType:'erg',intervalCount:2,restSeconds:90,metrics:{distance:500,distanceUnit:'m',paceSeconds:110,rpe:7}};
test('prescribed cardio metrics prefill editable actual rows while target and reopened saved actuals stay separate',()=>{
 const prescribed=prescribedCardioIntervals(target);assert.equal(prescribed.length,2);assert.equal(prescribed[0].work.durationSeconds,110);assert.equal(prescribed[0].work.rpe,7);assert.equal(prescribed[0].recovery.durationSeconds,90);
 const seeded=initialCardioActuals(target);assert.equal(seeded[0].distance,500);assert.equal(seeded[0].durationSeconds,110);assert.equal(seeded[0].paceSeconds,110);assert.equal(seeded[0].recoverySeconds,90);assert.equal(seeded[0].rpe,undefined);assert.equal(seeded[0].completed,false);assert.equal(seeded[1].recoverySeconds,90,'the prescription includes recovery after the final interval unless explicitly disabled');
 assert.equal(target.metrics.distance,500);assert.equal(target.metrics.rpe,7,'prescription RPE remains on the separate target');
 const actual={sets:[{distance:450,distanceUnit:'m',durationSeconds:100,recoverySeconds:80,completed:true},{distance:500,distanceUnit:'m',durationSeconds:110,completed:true}]};
 const restored=initialCardioActuals(target,actual);assert.deepEqual(restored,actual.sets);restored[0].distance=999;assert.equal(actual.sets[0].distance,450);assert.equal(target.metrics.distance,500);
});
test('six 2:00 running efforts seed actual duration, pace and between-round recovery without marking completion',()=>{
 const running={exerciseId:'outdoor-running',trackingType:'running',intervalCount:6,metrics:{},intervals:[{rounds:6,work:{durationSeconds:120,distanceUnit:'m',paceSeconds:300,paceUnit:'km',rpe:8},recovery:{durationSeconds:60}}]};
 const rows=initialCardioActuals(running);assert.equal(rows.length,6);assert.deepEqual(rows.map(s=>s.durationSeconds),Array(6).fill(120));assert.deepEqual(rows.map(s=>s.recoverySeconds),Array(6).fill(60));assert.ok(rows.every(s=>s.paceSeconds===300&&s.paceUnit==='km'&&s.completed===false&&s.rpe===undefined));
});
test('previous actual copying does not copy completion or recovery or overwrite targets',()=>{
 const out=copyPreviousActual({distance:500,durationSeconds:100,completed:true,recoverySeconds:99},{recoverySeconds:70});assert.equal(out.distance,500);assert.equal(out.completed,false);assert.equal(out.recoverySeconds,70);
});
test('running meters use min/km; independent min/mi and erg min/500m conversions',()=>{
 const km=calculatedCardioMetrics({distance:1000,distanceUnit:'m',durationSeconds:300},'running');assert.equal(km.paceSeconds,300);assert.equal(km.paceUnit,'km');
 const mi=calculatedCardioMetrics({...km,paceUnit:'mi'},'running');assert.equal(mi.paceSeconds,482.8032);assert.match(setSummary(mi,'running'),/8:03 \/ mi/);
 assert.equal(calculatedCardioMetrics({distance:1,distanceUnit:'km',durationSeconds:220},'erg').paceSeconds,110);
 assert.equal(convertDistance(1,'mi','m'),1609.344);assert.equal(convertDistance(500,'m','km'),.5);
 assert.throws(()=>validateCardioPrescription({...target,trackingType:'running',exerciseId:'outdoor-running',metrics:{distance:1000,distanceUnit:'m',paceUnit:'m'}},library));
});
test('actual completion/recovery persist without adding recovery to work totals or stats',()=>{
 const entries=[{exerciseId:'rowerg',sets:[{distance:500,distanceUnit:'m',durationSeconds:110,recoverySeconds:90,completed:true},{distance:500,distanceUnit:'m',durationSeconds:120,recoverySeconds:80,completed:false}]}];
 const saved=recordPerformance(entries,[target],library)[0];assert.equal(saved.sets[0].recoverySeconds,90);assert.equal(saved.sets[1].completed,false);assert.deepEqual(saved.target,target);
 assert.deepEqual(cardioWorkTotals(saved.sets),{durationSeconds:230,meters:1000,recoverySeconds:170});
 const stats=cardioStats([{id:'1',athleteId:'jordan',createdAt:'2026-10-08',exercises:[saved]}],library.find(e=>e.id==='rowerg'),'jordan');assert.equal(stats.totals.seconds,110);assert.equal(stats.totals.meters,500); // Progress counts completed work only.
 assert.throws(()=>recordPerformance([{...entries[0],sets:entries[0].sets.map(s=>({...s,recoverySeconds:-1}))}],[target],library));
});
const scan=exercises=>reviewScan({sessionName:'Scan',notes:'',warnings:[],exercises},library);
test('sequential 2x20 70–80lb expands two actual sets; range stays ambiguous',()=>{
 const e={exerciseName:'BP',notes:'',complex:[],blocks:[{count:2,reps:20,load:null,loadUnit:'lbs',loadSequence:[70,80],loadNotation:'sequential'}]};
 const draft=scan([e]);const log=prepareTrackerWorkout({...draft.workout,workoutDate:'2026-10-08'},library);assert.deepEqual(log.exercises[0].sets.map(s=>s.load),[70,80]);assert.deepEqual(log.exercises[0].sets.map(s=>s.reps),[20,20]);
 const ambiguous=scan([{...e,blocks:[{...e.blocks[0],loadNotation:'range'}]}]);assert.equal(ambiguous.workout.exercises[0].blocks[0].load,null);assert.ok(ambiguous.warnings.some(w=>w.includes('ambiguous')));assert.match(SCAN_INSTRUCTIONS,/ONLY/);
});
test('weighted plank duration and weight import and save structurally',()=>{
 const draft=scan([{exerciseName:'Weighted Plank',notes:'',complex:[],blocks:[{count:2,load:25,loadUnit:'lbs',durationSeconds:45}]}]);const saved=prepareTrackerWorkout({...draft.workout,workoutDate:'2026-10-08'},library);assert.equal(saved.exercises[0].sets[0].durationSeconds,45);assert.equal(saved.exercises[0].sets[0].load,25);assert.equal(saved.exercises[0].sets.length,2);
});
test('scanned cardio prescriptions seed editable actuals and preserve target/recovery separately',()=>{
 const draft=scan([{exerciseName:'RowErg',entryKind:'prescribed',notes:'',complex:[],blocks:[],intervals:[{rounds:2,work:{distance:500,distanceUnit:'m',paceSeconds:110},recovery:{durationSeconds:90}}]}]);const e=draft.workout.exercises[0];assert.equal(e.target.intervalCount,2);assert.equal(e.sets[0].distance,500);assert.equal(e.sets[0].durationSeconds,110);assert.equal(e.sets[0].recoverySeconds,90);assert.equal(e.sets[0].completed,false);assert.equal(prescribedCardioIntervals(e.target)[0].work.durationSeconds,110);
 const saved=prepareTrackerWorkout({sessionName:'Scan',workoutDate:'2026-10-08',exercises:[{...e,blocks:undefined,sets:e.sets.map(s=>({...s,distance:500,durationSeconds:115,completed:true,recoverySeconds:95}))}]},library);assert.equal(saved.exercises[0].target.intervals[0].recovery.durationSeconds,90);assert.equal(saved.exercises[0].sets[0].recoverySeconds,95);
 assert.ok(SCAN_SCHEMA.properties.exercises.items.properties.intervals);assert.throws(()=>scan([{exerciseName:'RowErg',complex:[],blocks:[],intervals:[{rounds:99,work:{distance:500},recovery:{}}]}]));
});
test('device-only saving and reopening retains targets, actuals, recovery and units',async()=>{
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)};const api=createLocalDemo(storage);await api('demo','POST',{role:'athlete'});
 const saved=await api('tracker','POST',{sessionName:'Run',workoutDate:'2026-10-08',exercises:[{exerciseId:'outdoor-running',sets:[{distance:1000,distanceUnit:'m',durationSeconds:300,paceUnit:'mi',completed:true,recoverySeconds:60}]}]});
 const data=await createLocalDemo(storage)('data');const row=data.logs.find(l=>l.id===saved.id);assert.equal(row.exercises[0].sets[0].paceSeconds,482.8032);assert.equal(row.exercises[0].sets[0].paceUnit,'mi');assert.equal(row.exercises[0].sets[0].completed,true);
});

test('meter-distance running target derives seconds from min/km, retaining explicit target pace',()=>{const t={trackingType:'running',intervalCount:1,metrics:{distance:1000,distanceUnit:'m',paceSeconds:300}};assert.equal(prescribedCardioIntervals(t)[0].work.durationSeconds,300);const actual=recordPerformance([{exerciseId:'outdoor-running',sets:[{distance:1000,distanceUnit:'m',durationSeconds:300,paceSeconds:.3}]}],[{exerciseId:'outdoor-running',...t}],library)[0];assert.equal(actual.sets[0].paceSeconds,.3);assert.equal(actual.sets[0].paceUnit,undefined);});
