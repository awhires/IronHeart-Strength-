import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTrainingQuestion,benchmarkDefinitions,completedProgram,repeatProgramInstance,repeatWorkoutDraft} from '../shared/phase3.mjs';
import {createTrainingAnswerService} from '../server/ai/training-answers.mjs';

const library=[{id:'bench',name:'Bench Press',region:'Upper body',trackingType:'strength'},{id:'squat',name:'Back Squat',region:'Lower body',trackingType:'strength'},{id:'run',name:'Outdoor Running',region:'Cardio',trackingType:'running'}];
const session=(name='A')=>({name,day:1,exercises:[{exerciseId:'bench',sets:3,reps:5}],blocks:[]});
const assignment={id:'a1',athleteId:'athlete',programId:'p1',name:'Strength',startDate:'2026-01-05',weeks:1,repeatable:true,plan:[{week:1,sessions:[session()]}]};
const logs=[{id:'log1',athleteId:'athlete',assignmentId:'a1',week:1,session:0,status:'completed',workoutDate:'2026-10-06',sessionName:'Bench',exercises:[{exerciseId:'bench',target:{exerciseId:'bench',sets:2,reps:5,load:150},sets:[{load:160,loadUnit:'lbs',reps:5,rpe:8},{load:165,loadUnit:'lbs',reps:3,rpe:9}]}],blockResults:[]},{id:'skip',athleteId:'athlete',status:'skipped',workoutDate:'2026-10-05',sessionName:'Skipped',exercises:[{exerciseId:'squat',status:'skipped'}]}];

test('program attempts require a finished attempt and preserve the source while resetting new prescription revisions',()=>{
 assert.equal(completedProgram(assignment,logs),true);const next=repeatProgramInstance(assignment,{id:'a2',startDate:'2026-11-02'},logs);assert.equal(next.id,'a2');assert.equal(next.repeatOfAssignmentId,'a1');assert.equal(next.instanceNumber,2);assert.equal(next.plan[0].sessions[0].prescriptionRevision,0);next.plan[0].sessions[0].exercises[0].load=999;assert.equal(assignment.plan[0].sessions[0].exercises[0].load,undefined);
 assert.throws(()=>repeatProgramInstance(assignment,{id:'x',startDate:'2026-11-02'},[]),/Finish or skip/);assert.throws(()=>repeatProgramInstance({...assignment,repeatable:false},{id:'x',startDate:'2026-11-02'},logs),/coach/);
});

test('repeating a workout keeps its prescriptions and original link while creating a fresh editable attempt',()=>{
 const draft=repeatWorkoutDraft(logs[0],library);assert.equal(draft.repeatOfLogId,'log1');assert.equal(draft.sessionName,'Bench');assert.equal(draft.exercises[0].target.sets,2);assert.equal(draft.exercises[0].sets[0].load,160);assert.equal(draft.blockResults.length,0);assert.notEqual(draft.workoutDate,logs[0].workoutDate);assert.equal(repeatWorkoutDraft(logs[1],library).exercises.length,0);
});

test('benchmark catalog uses only coach-designated programs and MetCons',()=>{
 const metcon={name:'12-min AMRAP',scoreType:'AMRAP',benchmark:true,movements:[{exerciseId:'squat'}]},program={id:'p',name:'Test',weeks:1,benchmarkType:'assessment',plan:[{week:1,sessions:[{...session(),blocks:[{id:'m',type:'Metcon',metcon}]}]}]};
 const assignment={...program,id:'a',programId:'p',athleteId:'athlete'};const rows=benchmarkDefinitions([program],[assignment]);assert.equal(rows.length,4);assert.deepEqual(rows.map(x=>x.category).sort(),['assessment','assessment','benchmark','benchmark']);assert.ok(rows.filter(x=>x.source==='assignment').every(x=>x.assignmentId==='a'&&x.programId==='p'));assert.equal(benchmarkDefinitions([],[]).length,0);
});

test('Ask AI uses actual sets, local calendar dates, comparable run distance, and honest missing-data answers',()=>{
 const actual={...logs[0],id:'actual',workoutDate:'2026-10-20',exercises:[{exerciseId:'bench',sets:[{load:185,loadUnit:'lbs',reps:3,rpe:9}]}]};
 let r=analyzeTrainingQuestion({question:'What is my heaviest bench press?',logs:[...logs,actual],library,timeZone:'America/Chicago',now:new Date('2026-10-22T15:00:00Z')});assert.equal(r.evidence[0].id,'best-actual-load');assert.equal(r.evidence[0].actualLoad,185);assert.equal(r.evidence[0].estimated1RM,false);assert.match(r.answer,/185 lbs for 3 reps.*2026-10-20/);
 const runLogs=[{id:'r1',athleteId:'athlete',workoutDate:'2026-10-01',sessionName:'Run A',exercises:[{exerciseId:'run',sets:[{distance:3,distanceUnit:'mi',durationSeconds:1800}]}]},{id:'r2',athleteId:'athlete',workoutDate:'2026-10-02',sessionName:'Run B',exercises:[{exerciseId:'run',sets:[{distance:1,distanceUnit:'mi',durationSeconds:400}]}]}];r=analyzeTrainingQuestion({question:'What is my fastest 3-mile run?',logs:runLogs,library,timeZone:'UTC',now:new Date('2026-10-22T00:00:00Z')});assert.equal(r.evidence[0].id,'fastest-run');assert.equal(r.evidence[0].id==='fastest-run'&&r.evidence[0].meters,4828);
 r=analyzeTrainingQuestion({question:'What is my heaviest bench press?',logs:[],library});assert.match(r.answer,/could not find a matching completed result/);
 const benchmark=analyzeTrainingQuestion({question:'What was my latest benchmark?',logs:[{id:'b1',workoutDate:'2026-10-21',sessionName:'Fran',blockResults:[{metcon:{name:'Fran',benchmark:true},score:{rx:'RX',timeSeconds:420}}]}],library});assert.equal(benchmark.evidence[0].id,'latest-benchmark');assert.match(benchmark.answer,/7:00/);
 const recent=analyzeTrainingQuestion({question:'What was my most recent squat workout?',logs:[{id:'s1',workoutDate:'2026-10-10',sessionName:'Lower A',exercises:[{exerciseId:'squat',sets:[{load:155,loadUnit:'lbs',reps:5}]}]},{id:'s2',workoutDate:'2026-10-20',sessionName:'Lower B',exercises:[{exerciseId:'squat',sets:[{load:165,loadUnit:'lbs',reps:3},{load:175,loadUnit:'lbs',reps:1}]}]}],library});assert.equal(recent.evidence[0].id,'latest-exercise-workout');assert.match(recent.answer,/2026-10-20 \(Lower B\): 165 lbs × 3 reps; 175 lbs × 1 reps/);
});

test('Ask AI response service rejects unsupported numeric claims and falls back to verified analysis',async()=>{
 const analysis={answer:'Your actual Bench Press was 185 lb for 3 reps on 2026-10-20.',evidence:[{id:'best-actual-load',load:185}]};let body;
 const service=createTrainingAnswerService({apiKey:'synthetic-test',model:'test-model',fetchImpl:async(_,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'Your actual bench was 225 lb for 3 reps.',evidenceIds:['best-actual-load']})}]}]}));}});
 const out=await service.answer({userId:'athlete',question:'What is my bench?',analysis});assert.equal(body.store,false);assert.equal(body.tools,undefined);assert.equal(out.groundingFallback,true);assert.equal(out.answer,analysis.answer);
});
