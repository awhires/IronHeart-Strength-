import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarEvents} from '../shared/calendar-events.mjs';
import {movementPrescription} from '../shared/movement-prescriptions.mjs';
import {trackingProfile,setSummary} from '../shared/tracking.mjs';
import {prescriptionText,recordPerformance,normalizeData,prepareSession} from '../shared/prescriptions.mjs';
import {generateBlock,supportsLoadProgression,supportsCoachProgression,recommend} from '../server/progression.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';
const scheduled=[{a:{id:'a',athleteId:'one'},w:1,si:0,key:'2026-12-31',s:{name:'Strength',exercises:[]}}];
test('calendar merges by athlete and session, uses actual date, retains independent same-name workouts',()=>{
 const logs=[{id:'1',athleteId:'one',assignmentId:'a',week:1,session:0,workoutDate:'2027-01-01'}, {id:'2',athleteId:'one',source:'tracker',sessionName:'Strength',workoutDate:'2027-01-01'}, {id:'3',athleteId:'other',assignmentId:'a',week:1,session:0,workoutDate:'2027-01-01'}];
 const snapshot=structuredClone({scheduled,logs}),events=calendarEvents(scheduled,logs,'one');
 assert.equal(events.length,2);assert.ok(events.every(e=>e.key==='2027-01-01'));assert.equal(events[0].scheduledKey,'2026-12-31');assert.deepEqual({scheduled,logs},snapshot);
});
test('calendar preserves unscheduled/orphan history, missing dates and deleted-log redo',()=>{
 assert.equal(calendarEvents(scheduled,[],'one')[0].log,undefined);
 const events=calendarEvents([], [{id:'orphan',athleteId:'one',assignmentId:'deleted',createdAt:'2026-10-15T12:00:00Z'},{id:'bad',athleteId:'one',createdAt:'invalid'}],'one');
 assert.equal(events.length,1);assert.equal(events[0].log.id,'orphan');assert.match(events[0].key,/2026-10-15/);
});
const strength={exerciseId:'bench',sets:3,reps:5,load:200,rpe:8,rest:120,trackingType:'strength'};
test('explicit strength metadata and grouped rows support coach progression across sources',()=>{
 assert.equal(supportsLoadProgression(strength),true);
 const grouped={...strength,setBlocks:[{sets:2,reps:5,load:200,rpe:8},{sets:1,reps:3,load:220,rpe:8}]},input=[{name:'Imported / manual / AI',exercises:[grouped]}];
 assert.equal(supportsCoachProgression(grouped),true);assert.equal(supportsLoadProgression(grouped),false);
 const plan=generateBlock(input,4,{method:'westside',roundTo:1,rules:{'0:0:bench':{mode:'repetition',increase:5}}});
 assert.deepEqual(plan[0].sessions,input);assert.deepEqual(plan[1].sessions[0].exercises[0].setBlocks.map(b=>b.load),[210,231]);assert.deepEqual(plan[1].sessions[0].exercises[0].setBlocks.map(b=>b.reps),[5,3]);
 assert.deepEqual(input[0].exercises[0],grouped);assert.equal(recommend(grouped,[]).action,'hold');
 assert.throws(()=>generateBlock(input,4,{method:'westside',rules:{'0:0:bench':{mode:'speed-bench',referenceMax:300}}}),/single prescription/);
});
test('unsupported progression modes and mixed grouped targets remain held',()=>{
 for(const item of [{...strength,loadMode:'percentage'},{...strength,loadMode:'athlete_selected'},{...strength,exerciseId:'plank'},{...strength,trackingType:'erg'},{...strength,setBlocks:[{sets:3,loadMode:'bodyweight'}]}])assert.equal(supportsCoachProgression(item),false);
});
test('static holds use time; dynamic plank movements and legitimate reps are not converted',()=>{
 for(const name of ['Forearm Plank','Side Plank','Wall Sit','Dead Hang','Hollow Body Hold'])assert.equal(trackingProfile({name,trackingType:'strength'}),'timed');
 for(const name of ['Weighted Plank','Back Rack Barbell Hold'])assert.equal(trackingProfile({name,trackingType:'strength'}),'loadedTimed');
 for(const name of ['Plank Shoulder Taps','Plank Up Downs','Side Bend','Hanging Leg Raise'])assert.equal(trackingProfile({name}),'strength');
});
test('legacy plank breaths are preserved and never guessed as duration',()=>{
 const old={exerciseId:'plank',sets:3,reps:8,load:0,rpe:7,rest:60},copy=structuredClone(old),adapted=movementPrescription(old);
 assert.equal(adapted.metrics.durationSeconds,undefined);assert.equal(adapted.reps,8);assert.deepEqual(old,copy);assert.match(prescriptionText(old),/Duration not specified.*legacy 8/);assert.match(setSummary({reps:8},'timed'),/legacy reps\/breaths/);
 const data={programs:[{sessions:[{exercises:[old]}]}]};assert.equal(normalizeData(data).programs[0].sessions[0].exercises[0].trackingType,undefined);
 const saved=recordPerformance([{exerciseId:'plank',sets:Array.from({length:3},()=>({durationSeconds:30}))}],[old],[{id:'plank',name:'Forearm Plank'}])[0];assert.equal(saved.sets.length,3);assert.equal(saved.sets[0].durationSeconds,30);assert.equal(saved.target.reps,8);
 // Older clients may still submit breath-count records; keep their semantics unchanged.
 assert.equal(recordPerformance([{exerciseId:'plank',sets:Array.from({length:3},()=>({reps:8,load:0,rpe:7}))}],[old],[{id:'plank',name:'Forearm Plank'}])[0].sets[0].reps,8);
});
test('timed prescriptions validate sets and actual durations without cardio interval rules',()=>{
 const library=[{id:'plank',name:'Forearm Plank'}],target={exerciseId:'plank',trackingType:'timed',sets:3,metrics:{durationSeconds:30},rest:60};
 assert.match(prescriptionText(target),/3 sets.*0:30/);assert.doesNotThrow(()=>prepareSession({name:'Hold',day:1,exercises:[target]},library));
 assert.throws(()=>prepareSession({name:'Hold',day:1,exercises:[{...target,sets:0}]},library),/Sets/);
 assert.throws(()=>recordPerformance([{exerciseId:'plank',sets:[{durationSeconds:30}]}],[target],library),/every prescribed/);
 assert.throws(()=>recordPerformance([{exerciseId:'plank',sets:[{durationSeconds:0},{durationSeconds:30},{durationSeconds:30}]}],[target],library),/positive duration/);
});
test('timed program and actual history survive save/reopen through existing phone persistence',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},api=createLocalDemo(storage);
 await api('demo','POST',{role:'coach'});
 const p=await api('programs','POST',{name:'Timed holds',goal:'Core',weeks:4,description:'',sessions:[{name:'Hold day',day:1,exercises:[{exerciseId:'plank',trackingType:'timed',sets:3,rest:60,metrics:{durationSeconds:30}}]}]});
 const a=await api('assign','POST',{programId:p.id,athleteId:'jordan',startDate:'2026-10-12'});await api('demo','POST',{role:'athlete'});
 const log=await api('log','POST',{assignmentId:a.id,week:1,session:0,readiness:3,pain:false,notes:'',exercises:[{exerciseId:'plank',sets:[{durationSeconds:30},{durationSeconds:35},{durationSeconds:30}]}]});
 const reopened=await createLocalDemo(storage)('data'),saved=reopened.logs.find(l=>l.id===log.id).exercises[0];assert.deepEqual(saved.sets.map(s=>s.durationSeconds),[30,35,30]);assert.equal(saved.target.metrics.durationSeconds,30);assert.equal(saved.trackingType,'timed');
});
