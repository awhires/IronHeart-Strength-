import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDemo} from '../src/local-demo.mjs';
import {exercises as baseExercises} from '../server/seed.mjs';
import {missingTrackingExercises} from '../shared/tracking.mjs';
import {missingConditioningExercises} from '../shared/conditioning-library.mjs';
import {missingSingleUnders} from '../shared/conditioning-library.mjs';
import {missingLibraryExercises} from '../shared/exercise-library.mjs';
import {newPrescription,prepareItems,prepareProgram,prepareSession,recordPerformance} from '../shared/prescriptions.mjs';
import {validateCardioPrescription} from '../shared/cardio-prescriptions.mjs';
import {prepareMetcon,prepareMetconScore} from '../shared/workout-blocks.mjs';
import {recommendAthleteLoad} from '../shared/adaptive-prescriptions.mjs';
import {strengthProgress,athleteStrengthProfile,prepareStrengthPR} from '../shared/strength-progress.mjs';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {validateDraft,validateDraftStructure} from '../shared/ai/validate.mjs';

const values=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
function library(){let out=[...baseExercises];for(const add of [missingLibraryExercises,missingTrackingExercises,missingConditioningExercises,missingSingleUnders])out.push(...add(out));return out;}
const lib=library();
const cardio=(id,trackingType,metrics={})=>({exerciseId:id,trackingType,metrics});
const metcon=raw=>prepareMetcon(raw,lib);
const manual=(weightLb,repMax=1,date='2026-10-18')=>prepareStrengthPR({exerciseId:'bench',repMax,weightLb,date},lib,'jordan','2026-10-18T12:00:00.000Z');
const pctTarget=(exerciseId='bench',percent1RM=70)=>({...newPrescription(exerciseId),sets:3,reps:5,load:null,loadMode:'percentage',percent1RM,reference1RM:null,loadUnit:'lbs',increment:5});

test('strength prescriptions support name-only, set-only, reps-only, fixed-load without reps and explicit Max Reps',()=>{
 const base=newPrescription('bench');
 const cases=[
  {...base,sets:null,reps:null,load:null,rest:null,rpe:null,tempo:null},
  {...base,sets:3,reps:null,load:null},
  {...base,sets:null,reps:8,load:null},
  {...base,sets:3,reps:null,load:185,loadMode:'fixed'},
  {...base,sets:3,reps:null,repMode:'max',load:100,loadMode:'fixed'}
 ];
 for(const target of cases)assert.doesNotThrow(()=>prepareItems([target],lib));
 assert.equal(cases[1].reps,null);assert.equal(cases[1].repMode??'fixed','fixed');assert.equal(cases[4].repMode,'max');
 assert.throws(()=>prepareItems([{...cases[4],reps:5}],lib),/Max Reps/);
});

test('optional strength, cardio and Metcon prescriptions pass create → assign → open → log → complete',async()=>{
 const storage=values(),api=createLocalDemo(storage);await api('demo','POST',{role:'coach'});const data=await api('data');
 const strength={...newPrescription('bench'),exerciseName:'Bench Press',sets:null,reps:null,repMode:'fixed',load:null,loadMode:'athlete_selected',rpe:null,rest:null,tempo:null};
 const run=cardio('outdoor-running','running',{distanceUnit:'km'});
 const row={...cardio('rowerg','erg',{distanceUnit:'m'}),intervalCount:5,intervals:[{rounds:5,segments:[{label:'Work',metrics:{distance:500,distanceUnit:'m'}}],recovery:{}}]};
 const workout=metcon({name:'Uncapped For Time',scoreType:'For Time',repScheme:[21,15,9],movements:[{exerciseId:'pushup-standard',reps:null},{exerciseId:'pullup',reps:null}]});
 const program=await api('programs','POST',{name:'Optional target regression',goal:'Strength',weeks:1,description:'',sessions:[{name:'Open prescriptions',day:1,exercises:[strength,run,row],blocks:[{id:'strength',type:'Strength',exerciseIndexes:[0]},{id:'run',type:'Cardio',exerciseIndexes:[1]},{id:'row',type:'Cardio',exerciseIndexes:[2]},{id:'metcon',type:'Metcon',metcon:workout}]}]});
 const savedProgram=(await api('data')).programs.find(x=>x.id===program.id);assert.equal(savedProgram.sessions[0].exercises[0].reps,null);assert.equal(savedProgram.sessions[0].exercises[1].metrics.distanceUnit,'km');assert.equal(savedProgram.sessions[0].blocks[3].metcon.timeCapSeconds,undefined);
 const assignment=await api('assign','POST',{programId:program.id,athleteId:'jordan',startDate:'2026-10-19'});await api('demo','POST',{role:'athlete',athleteId:'jordan'});
 const opened=(await api('data')).assignments.find(a=>a.id===assignment.id),session=opened.plan[0].sessions[0];assert.equal(session.exercises[0].sets,null);assert.equal(session.exercises[1].metrics.durationSeconds,undefined);assert.equal(session.exercises[2].intervals[0].rounds,5);
 const log=await api('log','POST',{assignmentId:assignment.id,week:1,session:0,readiness:4,pain:false,notes:'Targets intentionally open.',exercises:[{exerciseId:'bench',sets:[{load:135,loadUnit:'lbs',reps:5}]},{exerciseId:'outdoor-running',sets:[{distance:5,distanceUnit:'km',durationSeconds:1800}]},{exerciseId:'rowerg',sets:Array.from({length:5},()=>({distance:500,distanceUnit:'m',durationSeconds:120}))}],blockResults:[{blockId:'metcon',score:{rx:'RX',timeSeconds:500}}]});
 const reopened=(await createLocalDemo(storage)('data')).logs.find(x=>x.id===log.id);assert.equal(reopened.exercises[0].target.reps,null);assert.equal(reopened.exercises[0].sets[0].reps,5);assert.equal(reopened.exercises[1].sets[0].distance,5);assert.equal(reopened.exercises[2].sets.length,5);assert.equal(reopened.blockResults[0].score.timeSeconds,500);assert.equal((await createLocalDemo(storage)('data')).logs.length,1);
});

test('cardio allows omitted targets and optional interval rounds but rejects explicitly impossible values',()=>{
 const bareRun=cardio('outdoor-running','running',{}),distanceOnly=cardio('outdoor-running','running',{distance:5,distanceUnit:'km'}),timeOnly=cardio('outdoor-running','running',{durationSeconds:1800}),paceOnly=cardio('outdoor-running','running',{paceSeconds:300,paceUnit:'km'}),bareTreadmill=cardio('treadmill','treadmill',{});
 for(const p of [bareRun,distanceOnly,timeOnly,paceOnly,bareTreadmill])assert.doesNotThrow(()=>validateCardioPrescription(p,lib));
 const intervals={...cardio('rowerg','erg',{distanceUnit:'m'}),intervalCount:1,intervals:[{rounds:null,segments:[{label:'Work',metrics:{distance:500,distanceUnit:'m'}}],recovery:{}}]};
 assert.doesNotThrow(()=>prepareSession({name:'Row intervals',day:2,exercises:[intervals]},lib));
 assert.throws(()=>validateCardioPrescription({...bareRun,metrics:{durationSeconds:-1}},lib),/cardio durationSeconds/);
});

test('Speed Bench uses only exact Bench Press evidence and existing automatic rounding',()=>{
 assert.equal(lib.filter(x=>x.name==='Bench Press').length,1);assert.equal(lib.filter(x=>x.name==='Speed Bench').length,1);
 const speed={...newPrescription('speed-bench'),sets:6,reps:3,load:null,loadMode:'athlete_selected',referenceLoad:{exerciseId:'bench',exerciseName:'Bench Press',percent:55}};
 const session=prepareSession({name:'Speed day',day:1,exercises:[speed]},lib),original=session.exercises[0];
 for(const [percent,expected] of [[55,125],[60,135],[65,145]]){const item={...original,referenceLoad:{...original.referenceLoad,percent}};const rec=recommendAthleteLoad(item,{athleteId:'jordan',library:lib,logs:[],manualPRs:[manual(225)],today:'2026-10-18'});assert.equal(rec.status,'recommended');assert.equal(rec.load,expected);}
 const missing=recommendAthleteLoad(original,{athleteId:'jordan',library:lib,logs:[],today:'2026-10-18'});assert.equal(missing.status,'needs_baseline');
 const speedLog={id:'speed',athleteId:'jordan',workoutDate:'2026-10-18',exercises:[{exerciseId:'speed-bench',sets:[{load:145,reps:3,rpe:6}]}]};assert.equal(strengthProgress([speedLog],'bench','jordan',lib).performances.length,0);
 assert.equal(original.load,null);assert.equal(original.loadMode,'athlete_selected');
});

test('manual PR create/edit/delete stays athlete-owned, visible, distinct from logs and feeds profile evidence',async()=>{
 const storage=values(),api=createLocalDemo(storage);await api('demo','POST',{role:'athlete',athleteId:'jordan'});const before=(await api('data')).logs;
 const created=await api('strength-pr','POST',{exerciseId:'bench',repMax:5,weightLb:185,date:'2026-10-17',notes:'Training max'});let data=await createLocalDemo(storage)('data');assert.equal(data.strengthPRs.length,1);assert.equal(data.strengthPRs[0].source,'athlete_manual');assert.equal(data.logs.length,before.length);
 const profile=athleteStrengthProfile(data.logs,'bench','jordan',data.exercises,'2026-10-18',[],data.strengthPRs);assert.ok(Math.abs(profile.estimated1RM-185/.87)<.001);assert.equal(profile.currentEstimate.kind,'manual');
 const stats=strengthProgress(data.logs,'bench','jordan',data.exercises,data.strengthPRs);assert.equal(stats.manualRecords[0].id,created.id);assert.equal(stats.performances.length,before.reduce((n,l)=>n+l.exercises.filter(e=>e.exerciseId==='bench').length,0));
 await api('strength-pr','POST',{id:created.id,exerciseId:'bench',repMax:1,weightLb:225,date:'2026-10-18',notes:'Updated'});data=await createLocalDemo(storage)('data');assert.equal(data.strengthPRs.length,1);assert.equal(data.strengthPRs[0].repMax,1);assert.equal(athleteStrengthProfile(data.logs,'bench','jordan',data.exercises,'2026-10-18',[],data.strengthPRs).estimated1RM,225);
 await assert.rejects(api('strength-pr','POST',{id:created.id,exerciseId:'bench',repMax:1,weightLb:250,athleteId:'maya'}),/Access denied/);
 await api('delete','POST',{kind:'strengthPR',id:created.id});data=await createLocalDemo(storage)('data');assert.deepEqual(data.strengthPRs,[]);assert.deepEqual(data.logs,before);
});

test('manual baselines personalize Week 1, keep lower newer reports from downgrading strength, and use logged history without PRs',()=>{
 const m225=manual(225),mLower=manual(205,1,'2026-10-18'),m185=manual(185),bench=pctTarget();
 const athleteLoad=(manualPRs,logs=[])=>recommendAthleteLoad(bench,{athleteId:'jordan',library:lib,manualPRs,logs,today:'2026-10-18'});
 assert.equal(athleteLoad([m225]).load,160);assert.equal(athleteLoad([m185]).load,130);
 assert.equal(athleteLoad([m225,mLower]).baseline.oneRM,225);
 const history={id:'prior',athleteId:'jordan',workoutDate:'2026-10-12',exercises:[{exerciseId:'bench',sets:[{load:185,loadUnit:'lbs',reps:5,rpe:8}]}]};assert.equal(athleteLoad([],[history]).status,'recommended');
 assert.equal(athleteLoad([]).status,'needs_baseline');
 const actual={...history,id:'week-one',workoutDate:'2026-10-18',exercises:[{exerciseId:'bench',sets:[{load:135,loadUnit:'lbs',reps:5,rpe:8}]}]};assert.equal(athleteLoad([],[actual]).load,110);
 assert.equal(bench.percent1RM,70);assert.equal(bench.load,null);assert.equal(bench.loadMode,'percentage');
});

test('AI accepts intentionally unspecified strength/cardio/Metcon fields and exact Speed Bench choices',()=>{
 const draft=createFixture();draft.schemaVersion=2;
 for(const week of draft.program.plan)for(const s of week.sessions)s.blocks=s.exercises.map((_,i)=>({id:`strength-${i}`,type:'Strength',name:'',exerciseIndexes:[i]}));
 const s=draft.program.plan[0].sessions[0];s.exercises=[{...newPrescription('bench'),exerciseName:'Bench Press',sets:null,reps:null,repMode:'fixed',load:null,loadMode:'athlete_selected',rpe:null,rest:null,tempo:null}];s.blocks=[{id:'strength',type:'Strength',name:'',exerciseIndexes:[0]}];
 for(const key of ['sets','reps','load','rpe','rest','tempo'])delete s.exercises[0][key];
 const speed={...newPrescription('speed-bench'),exerciseName:'Speed Bench',sets:6,reps:3,load:null,loadMode:'athlete_selected',referenceLoad:{exerciseId:'bench',exerciseName:'Bench Press',percent:60}};s.exercises.push(speed);s.blocks.push({id:'speed',type:'Strength',name:'',exerciseIndexes:[1]});
 const cardio= {exerciseId:'outdoor-running',exerciseName:'Outdoor Running',trackingType:'running',metrics:{}};s.exercises.push(cardio);s.blocks.push({id:'cardio',type:'Cardio',name:'',exerciseIndexes:[2]});
 const met={name:'No-cap test',scoreType:'For Time',movements:[{exerciseId:'pullup',exerciseName:'Pull-up'}]};s.blocks.push({id:'metcon',type:'Metcon',name:'',metcon:met});
 assert.deepEqual(validateDraftStructure(draft),[]);const report=validateDraft(draft,lib);assert.equal(report.counts.error,0,JSON.stringify(report.findings));
 const invalid=structuredClone(draft);invalid.program.plan[0].sessions[0].exercises[1].referenceLoad.percent=57;assert.ok(validateDraft(invalid,lib).findings.some(f=>f.code==='INVALID_SPEED_BENCH_REFERENCE'));
});
