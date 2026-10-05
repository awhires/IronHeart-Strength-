import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {exercises} from '../server/seed.mjs';
import {trackingExercises,setSummary} from '../shared/tracking.mjs';
import {conditioningExercises,singleUnders} from '../shared/conditioning-library.mjs';
import {calculatedCardioMetrics,cardioPrescription} from '../shared/cardio-prescriptions.mjs';
import {prepareSession,recordPerformance,prescriptionText,newPrescription} from '../shared/prescriptions.mjs';
import {prepareMetcon,prepareMetconScore,recordBlockScores,metconKey,scoreFields} from '../shared/workout-blocks.mjs';
import {metconStats} from '../shared/metcon-stats.mjs';
import {cardioStats} from '../shared/cardio-stats.mjs';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {validateDraft,validateDraftStructure} from '../shared/ai/validate.mjs';
import {approveReview,createReview,editReview,isApproved} from '../shared/ai/draft-state.mjs';
import {toIronHeartProgram} from '../shared/ai/convert.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';
import {createWorkoutOutbox} from '../shared/workout-outbox.mjs';
import {openStore} from '../server/store.mjs';
import {workoutReceipts} from '../server/workout-receipts.mjs';
const library=[...exercises,...trackingExercises,...conditioningExercises,singleUnders];
const erg={exerciseId:'rowerg',exerciseName:'RowErg',trackingType:'erg',intervalCount:4,restSeconds:90,metrics:{distance:250,distanceUnit:'m',paceSeconds:102},notes:'Fast and controlled',progressionInstructions:'Coach review next week'};
const annie=()=>prepareMetcon({name:'Annie',scoreType:'For Time',repScheme:[50,40,30,20,10],movements:[{exerciseId:'double-unders',scalingOptions:[{exerciseId:'single-unders',exerciseName:'Single Unders',repScheme:[100,80,60,40,20]}]},{exerciseId:'sit-ups'}],notes:''},library);
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};};
test('RowErg intervals keep distance/pace, log each interval and calculate /500m pace',()=>{
 const session=prepareSession({name:'Speed',exercises:[erg]},library);
 assert.equal(session.exercises[0].intervalCount,4);assert.match(prescriptionText(erg),/4 intervals.*250 m.*1:42 \/ 500 m.*1:30 recovery/);assert.doesNotMatch(prescriptionText(erg),/Choose load|reps/);
 const sets=Array.from({length:4},()=>({distance:250,distanceUnit:'m',durationSeconds:51,rpe:8}));
 const actual=recordPerformance([{exerciseId:'rowerg',sets}],session.exercises,library);
 assert.equal(actual[0].sets.length,4);assert.equal(actual[0].sets[0].paceSeconds,102);assert.equal(actual[0].sets[0].rpe,8);assert.match(setSummary(actual[0].sets[0],'erg'),/0:51.*1:42 \/ 500 m/);
 assert.throws(()=>recordPerformance([{exerciseId:'rowerg',sets:sets.slice(0,3)}],session.exercises,library),/every prescribed interval/);
});
for(const [type,value,expected] of [['erg',{distance:1000,distanceUnit:'m',durationSeconds:208},104],['running',{distance:1,distanceUnit:'mi',durationSeconds:480},480],['swimming',{distance:100,distanceUnit:'yd',durationSeconds:90},90]])test(`${type} continuous effort automatic pace and optional RPE`,()=>{
 assert.equal(calculatedCardioMetrics(value,type).paceSeconds,expected);
 const id=type==='erg'?'rowerg':type==='running'?'outdoor-running':'swimming';
 const actual=recordPerformance([{exerciseId:id,sets:[value]}],[{exerciseId:id,trackingType:type,metrics:value}],library)[0];assert.equal(actual.sets[0].paceSeconds,expected);assert.equal(actual.sets[0].rpe,null);
});
test('cycling calculates average speed and retains power/cadence',()=>{
 const value={distance:10,distanceUnit:'mi',durationSeconds:1800,watts:200,cadence:85,rpe:7};
 const actual=recordPerformance([{exerciseId:'cycling',sets:[value]}],[{exerciseId:'cycling',trackingType:'cycling',metrics:value}],library)[0];assert.equal(actual.sets[0].speedMph,20);assert.equal(actual.sets[0].watts,200);assert.equal(actual.sets[0].cadence,85);
});
test('legacy strength and timed targets retain existing validation; legacy cardio does not invent meters from reps',()=>{
 const strength=newPrescription('bench');strength.load=135;strength.loadMode='fixed';
 assert.equal(recordPerformance([{exerciseId:'bench',sets:Array.from({length:3},()=>({load:135,reps:8,rpe:7}))}],[strength],library)[0].sets[0].reps,8);
 assert.doesNotThrow(()=>prepareSession({exercises:[{exerciseId:'pushup-plank',trackingType:'timed',metrics:{durationSeconds:60}}]},library));
 const legacy=cardioPrescription({exerciseId:'rowerg',sets:6,reps:250,loadMode:'athlete_selected'},library.find(e=>e.id==='rowerg'));assert.deepEqual(legacy.metrics,{});assert.doesNotMatch(prescriptionText(legacy),/Choose load|250 reps/);
});
test('1000m row PB improves; 250m sprint and four sprint intervals remain distinct',()=>{
 const log=(id,sets,target)=>({id,athleteId:'a',workoutDate:`2026-10-0${id}`,exercises:[{exerciseId:'rowerg',sets,target}]});
 const metric=(distance,time)=>({distance,distanceUnit:'m',durationSeconds:time});
 const logs=[log(1,[metric(1000,208)]),log(2,[metric(250,40)]),log(3,Array.from({length:4},()=>metric(250,45)),{restSeconds:90}),log(4,[metric(1000,200)])];
 const s=cardioStats(logs,library.find(e=>e.id==='rowerg'),'a');assert.equal(s.comparable.length,2);assert.equal(s.best.id,4);assert.equal(s.previous.id,1);assert.equal(s.status,'Improving');assert.equal(s.distanceBests.length,3);
});
test('substitutions preserve prescribed snapshot and structured performed scheme',()=>{
 const m=annie(),before=structuredClone(m),performed=m.movements.map(v=>({...v}));performed[0]={exerciseId:'single-unders',exerciseName:'Single Unders',repScheme:[100,80,60,40,20]};
 const result=recordBlockScores([{blockId:'a',score:{rx:'Scaled',timeSeconds:522,performedMovements:performed}}],[{id:'a',type:'Metcon',metcon:m}])[0];
 assert.deepEqual(m,before);assert.equal(result.metcon.movements[0].exerciseId,'double-unders');assert.equal(result.score.performedMovements[0].exerciseId,'single-unders');assert.equal(result.score.performedMovements[0].repScheme[0],100);
 assert.throws(()=>prepareMetconScore({...result.score,rx:'RX'},m),/Scaled or Modified/);
 assert.doesNotThrow(()=>prepareMetconScore({...result.score,rx:'Modified'},m));
});
test('custom substitutions and changed loads/distances/calories validate without library mutation',()=>{
 const m=annie(),count=library.length;
 const performed=m.movements.map(v=>({...v}));performed[0]={exerciseId:null,exerciseName:'Low impact rope steps',reps:100,distance:10,distanceUnit:'m',calories:5,load:10,loadUnit:'lbs'};
 const score=prepareMetconScore({rx:'Modified',timeSeconds:600,performedMovements:performed},m);assert.equal(score.performedMovements[0].load,10);assert.equal(library.length,count);
 assert.throws(()=>prepareMetconScore({...score,performedMovements:[]},m),/one performed/);
});
test('Metcon comparisons separate RX, Scaled, Modified and materially different substitutions',()=>{
 const m=annie(),performed=m.movements.map(v=>({...v}));performed[0]={exerciseId:'single-unders',exerciseName:'Single Unders',reps:100};
 const row=(id,rx,time,actual)=>({id,athleteId:'a',workoutDate:`2026-10-0${id}`,blockResults:[{metcon:m,score:{rx,timeSeconds:time,performedMovements:actual}}]});
 const logs=[row(1,'Scaled',600,performed),row(2,'RX',500),row(3,'Scaled',580,performed),row(4,'Scaled',550,performed.map((v,i)=>i===0?{...v,reps:50}:v))];
 assert.equal(metconStats(logs,'a',metconKey(m),'Scaled').sessions.length,1);assert.equal(metconStats(logs.slice(0,3),'a',metconKey(m),'Scaled').status,'Improving');assert.equal(metconStats(logs,'a',metconKey(m),'RX').sessions.length,1);
});
test('Chipper and interval formats validate with scoring-specific fields',()=>{
 const chip=prepareMetcon({...annie(),scoreType:'Chipper',repScheme:[],timeCapSeconds:900},library);assert.equal(prepareMetconScore({rx:'RX',timeSeconds:600},chip).timeSeconds,600);
 const interval=prepareMetcon({...annie(),scoreType:'Intervals',rounds:5,workSeconds:60,restSeconds:30},library);assert.equal(prepareMetconScore({rx:'RX',completed:true,successfulMinutes:5},interval).successfulMinutes,5);assert.deepEqual(scoreFields('AMRAP'),['rounds','reps']);assert.throws(()=>prepareMetcon({...interval,workSeconds:0},library));
});
function draft(){const d=createFixture();d.schemaVersion=2;d.program.plan.forEach(w=>w.sessions=[{name:'Row plus Annie',day:1,maxDurationMinutes:null,coachNotes:'',exercises:[structuredClone(erg)],blocks:[{id:'c',name:'Speed',type:'Cardio',exerciseIndexes:[0]},{id:'a',name:'Benchmark',type:'Metcon',metcon:annie()}]}]);return d;}
test('AI v2 cardio/Metcon strict validation, explicit approval, conversion and mixed assignment data',()=>{
 const d=draft();assert.deepEqual(validateDraftStructure(d),[]);assert.equal(validateDraft(d,library).canApprove,true);
 const review=approveReview(createReview(d),library,{}, {coachId:'coach',warningsReviewed:true}),p=toIronHeartProgram(review,library);assert.equal(p.plan[0].sessions[0].exercises[0].metrics.distance,250);assert.equal(p.plan[0].sessions[0].exercises[0].sets,undefined);assert.equal(p.plan[0].sessions[0].blocks[1].metcon.repScheme.length,5);
 assert.equal(isApproved(editReview(review,d=>{d.program.plan[0].sessions[0].exercises[0].metrics.distance=500;}),library),false);
 assert.doesNotThrow(()=>prepareSession(p.plan[0].sessions[0],library));
});
test('AI v2 rejects unknown modalities, cardio in strength fields, bad targets and injected fields',()=>{
 for(const mutate of [e=>e.trackingType='strength',e=>e.metrics.distance=-1,e=>e.metrics.secret='x',e=>e.intervalCount=31,e=>e.exerciseId='not-a-library-exercise']){const d=draft();mutate(d.program.plan[0].sessions[0].exercises[0]);assert.equal(validateDraft(d,library).canApprove,false);}
 const d=draft();d.program.plan[0].sessions[0].exercises[0]={...createFixture().program.plan[0].sessions[0].exercises[0],exerciseId:'rowerg',exerciseName:'RowErg'};assert.equal(validateDraft(d,library).canApprove,false);
});
test('AI v2 Metcon-only sessions and legacy v1 both validate; unsupported versions are blocked',()=>{
 const d=draft();d.program.plan.forEach(w=>{w.sessions[0].exercises=[];w.sessions[0].blocks=w.sessions[0].blocks.filter(b=>b.type==='Metcon');});assert.equal(validateDraft(d,library).canApprove,true);assert.equal(validateDraft(createFixture(),library).canApprove,true);d.schemaVersion=3;assert.equal(validateDraft(d,library).canApprove,false);
});
test('AI v2 approved save, assignment and actual interval/Metcon logging preserve structure and snapshots',async()=>{
 const saved=storage(),api=createLocalDemo(saved);await api('demo','POST',{role:'coach'});const data=await api('data'),d=draft();
 const review=approveReview(createReview(d),data.exercises,{}, {coachId:'coach',warningsReviewed:true});const {receipt}=await api('ai/approve','POST',{review,requirements:{}});
 const p=await api('ai/programs','POST',{review,requirements:{},receipt});assert.equal(p.aiProvenance.schemaVersion,2);assert.equal((await api('ai/programs','POST',{review,requirements:{},receipt})).id,p.id);
 const a=await api('assign','POST',{programId:p.id,athleteId:'jordan',startDate:'2026-10-05'});await api('demo','POST',{role:'athlete'});
 const actual=await api('log','POST',{assignmentId:a.id,week:1,session:0,readiness:4,pain:false,notes:'',exercises:[{exerciseId:'rowerg',sets:Array.from({length:4},()=>({distance:250,distanceUnit:'m',durationSeconds:51}))}],blockResults:[{blockId:'a',score:{rx:'RX',timeSeconds:522}}],clientRequestId:crypto.randomUUID()});
 assert.equal(actual.exercises[0].target.intervalCount,4);assert.equal(actual.exercises[0].sets[0].paceSeconds,102);assert.equal(actual.blockResults[0].metcon.movements[0].exerciseName,'Double Unders');assert.equal((await createLocalDemo(saved)('data')).logs[0].id,actual.id);
});
test('phone preview workout retry and reopened history keep one record and preserve prior data',async()=>{
 const saved=storage(),input={sessionName:'Row',exercises:[{exerciseId:'rowerg',sets:[{distance:1000,distanceUnit:'m',durationSeconds:208}]}],clientRequestId:crypto.randomUUID()};
 const api=createLocalDemo(saved);await api('demo','POST',{role:'athlete'});const first=await api('tracker','POST',input);const reopened=createLocalDemo(saved);assert.equal((await reopened('tracker','POST',input)).id,first.id);assert.equal((await reopened('data')).logs.length,1);
 await reopened('delete','POST',{kind:'log',id:first.id});await assert.rejects(()=>reopened('tracker','POST',input),/deleted/);assert.equal((await reopened('data')).logs.length,0);
});
test('workout outbox survives app reload/network failure, scopes accounts and connections, and acknowledges only after success',()=>{
 const saved=storage(),box=createWorkoutOutbox(saved,'https://server'),input={sessionName:'Row',exercises:[]};
 const row=box.enqueue('jordan','tracker',input);assert.equal(box.enqueue('jordan','tracker',input).clientRequestId,row.clientRequestId);
 const reopened=createWorkoutOutbox(saved,'https://server');assert.equal(reopened.list('jordan').length,1);assert.equal(reopened.list('maya').length,0);assert.equal(createWorkoutOutbox(saved,'phone-preview').list('jordan').length,0);
 reopened.remove(row.clientRequestId);assert.equal(box.list('jordan').length,0);
});
test('SQLite save receipts survive backend restart, prevent duplicates and rollback failed writes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ih-receipts-'));let store;
 try{store=openStore(join(dir,'data.sqlite'),true);const body={clientRequestId:crypto.randomUUID(),sessionName:'Row'};const begin=workoutReceipts(store);const saved=begin('jordan','tracker',body).commit(()=>store.put('log',{id:'test-log',athleteId:'jordan',sessionName:'Row'},'jordan'));store.db.close();store=openStore(join(dir,'data.sqlite'),true);const reopened=workoutReceipts(store);assert.deepEqual(reopened('jordan','tracker',body).result,saved);assert.equal(store.all('log').length,1);assert.throws(()=>reopened('jordan','tracker',{...body,sessionName:'Changed'}),/different workout/);
 const failed={clientRequestId:crypto.randomUUID()};assert.throws(()=>reopened('jordan','tracker',failed).commit(()=>{store.put('log',{id:'failed'},'jordan');throw Error('disk failure');}));assert.equal(store.get('log','failed'),null);assert.equal(reopened('jordan','tracker',failed).result,undefined);
 store.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('log',saved.id);assert.throws(()=>reopened('jordan','tracker',body),/deleted/);
 }finally{store?.db.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});}
});
