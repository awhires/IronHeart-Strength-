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

test('Ask Iron Heart exact rep queries only use actual sets with that rep count and cite the source log',()=>{
 const exercises=[...library,{id:'power-clean',name:'Power Clean',trackingType:'strength'},{id:'power-snatch',name:'Power Snatch',trackingType:'strength'}];
 const logs=[
  {id:'clean-single',workoutDate:'2026-10-20',sessionName:'Olympic Day',exercises:[{exerciseId:'power-clean',target:{load:300,reps:3},sets:[{load:200,loadUnit:'lbs',reps:1}]}]},
  {id:'clean-triple',workoutDate:'2026-10-18',sessionName:'Clean Strength',exercises:[{exerciseId:'power-clean',target:{load:300,reps:3},sets:[{load:185,loadUnit:'lbs',reps:3,completed:true}]}]},
  {id:'snatch-triple',workoutDate:'2026-10-19',sessionName:'Snatch Day',exercises:[{exerciseId:'power-snatch',sets:[{load:250,loadUnit:'lbs',reps:3}]}]},
  {id:'edited-log',workoutDate:'2026-10-17',sessionName:'Corrected Clean',exercises:[{exerciseId:'power-clean',sets:[{load:190,loadUnit:'lbs',reps:3,completed:false},{load:180,loadUnit:'lbs',reps:3,completed:true}]}]}
 ];
 const result=analyzeTrainingQuestion({question:'Heaviest 3 reps on power clean',logs,library:exercises,now:new Date('2026-10-22T12:00:00Z')});
 assert.equal(result.evidence[0].exercise,'Power Clean');assert.equal(result.evidence[0].actualLoad,185);assert.equal(result.evidence[0].reps,3);assert.equal(result.evidence[0].date,'2026-10-18');assert.deepEqual(result.evidence[0].source,{type:'workout_log_set',workoutLogId:'clean-triple',exerciseId:'power-clean',setIndex:0});assert.equal(result.evidence[0].estimated1RM,false);assert.match(result.answer,/3-rep Power Clean.*185 lbs for 3 reps on 2026-10-18/);assert.equal(result.deterministic,true);
});

test('Ask AI treats 3RM, three-rep max and best triple as the same exact-rep request',()=>{
 const history=[{id:'clean-single',workoutDate:'2026-10-20',sessionName:'Clean singles',exercises:[{exerciseId:'power-clean',sets:[{load:200,loadUnit:'lbs',reps:1}]}]},{id:'clean-triple',workoutDate:'2026-10-18',sessionName:'Clean triples',exercises:[{exerciseId:'power-clean',sets:[{load:185,loadUnit:'lbs',reps:3}]}]}],exercises=[...library,{id:'power-clean',name:'Power Clean',trackingType:'strength'}];
 for(const question of ['What is my 3 rep max on power clean?','What is my three-rep max on power clean?','What is my 3RM for power clean?','What is my best triple on power clean?']){
  const result=analyzeTrainingQuestion({question,logs:history,library:exercises});assert.equal(result.evidence[0].kind,'actual_set',question);assert.equal(result.evidence[0].reps,3,question);assert.equal(result.evidence[0].actualLoad,185,question);assert.equal(result.evidence[0].date,'2026-10-18',question);
 }
});

test('exact-rep questions state when no matching actual record exists and never fall back to another rep count or PR',()=>{
 const result=analyzeTrainingQuestion({question:'What is my heaviest 3-rep Power Clean?',logs:[{id:'single-only',workoutDate:'2026-10-20',exercises:[{exerciseId:'power-clean',target:{load:250,reps:3},sets:[{load:200,loadUnit:'lbs',reps:1}]}]}],library:[...library,{id:'power-clean',name:'Power Clean',trackingType:'strength'}]});
 assert.equal(result.evidence[0].kind,'insufficient_data');assert.equal(result.evidence[0].requestedRepCount,3);assert.match(result.answer,/could not find a completed Power Clean set with exactly 3 reps/);assert.doesNotMatch(result.answer,/200|1 rep/);assert.equal(result.deterministic,true);
});

test('strength history filters exact reps and date ranges before ranking and includes only saved actual records',()=>{
 const logs=[{id:'bench-early',workoutDate:'2026-10-10',sessionName:'Bench A',exercises:[{exerciseId:'bench',sets:[{load:225,loadUnit:'lbs',reps:3}]}]},{id:'bench-week',workoutDate:'2026-10-15',sessionName:'Bench B',exercises:[{exerciseId:'bench',target:{load:275,reps:5},sets:[{load:205,loadUnit:'lbs',reps:5},{load:215,loadUnit:'lbs',reps:3}]}]},{id:'bench-outside',workoutDate:'2026-10-20',sessionName:'Bench C',exercises:[{exerciseId:'bench',sets:[{load:300,loadUnit:'lbs',reps:3}]}]}];
 const result=analyzeTrainingQuestion({question:'What weight and reps did I bench last week?',logs,library,now:new Date('2026-10-22T15:00:00Z'),timeZone:'America/Chicago'});
 assert.equal(result.evidence[0].id,'exercise-last-week');assert.deepEqual(result.evidence[0].records.map(x=>[x.actualLoad,x.reps,x.date]),[[205,5,'2026-10-15'],[215,3,'2026-10-15']]);assert.ok(result.evidence[0].records.every(x=>x.source.type==='workout_log_set'));
 const corrected=analyzeTrainingQuestion({question:'Heaviest 3 reps on Bench Press',logs:[{id:'edited-workout',workoutDate:'2026-10-15',exercises:[{exerciseId:'bench',sets:[{load:178,loadUnit:'lbs',reps:3,rpe:8}]}]}],library});assert.equal(corrected.evidence[0].actualLoad,178);assert.equal(corrected.evidence[0].source.workoutLogId,'edited-workout');
 const best=analyzeTrainingQuestion({question:'Best 10-rep Back Squat',logs:[{id:'squat-10',workoutDate:'2026-10-11',exercises:[{exerciseId:'squat',sets:[{load:155,loadUnit:'lbs',reps:10},{load:200,loadUnit:'lbs',reps:5}]}]}],library});assert.equal(best.evidence[0].actualLoad,155);assert.equal(best.evidence[0].reps,10);
});

test('running queries require exact normalized distance and apply inclusive explicit and relative date windows',()=>{
 const run=(id,date,miles,seconds)=>({id,workoutDate:date,sessionName:id,exercises:[{exerciseId:'run',sets:[{distance:miles,distanceUnit:'mi',durationSeconds:seconds}]}]});
 const logs=[run('three-mile', '2026-10-02',3,1800),run('nearby-distance','2026-10-03',3.02,1200),run('outside-range','2026-10-08',3,1740),run('mile-first','2026-10-13',1,440),run('three-mile-last-week','2026-10-15',3,1900),run('mile-latest','2026-10-16',1,420)];
 const fastest=analyzeTrainingQuestion({question:'Fastest recorded 3-mile run between 2026-10-01 and 2026-10-05',logs,library,now:new Date('2026-10-22T12:00:00Z')});assert.equal(fastest.evidence[0].id,'fastest-run');assert.equal(fastest.evidence[0].id,'fastest-run');assert.equal(fastest.evidence[0].date,'2026-10-02');assert.equal(fastest.evidence[0].meters,4828);assert.equal(fastest.evidence[0].source.workoutLogId,'three-mile');assert.match(fastest.answer,/over 3 miles on 2026-10-02/);
 const changed=analyzeTrainingQuestion({question:'How has my mile time changed?',logs,library,now:new Date('2026-10-22T12:00:00Z')});assert.equal(changed.evidence[0].id,'running-trend');assert.equal(changed.evidence[0].first.source.workoutLogId,'mile-first');assert.equal(changed.evidence[0].latest.source.workoutLogId,'mile-latest');assert.match(changed.answer,/7:20.*7:00.*20 seconds faster/);
 const lastWeek=analyzeTrainingQuestion({question:'Fastest 3-mile run last week',logs,library,now:new Date('2026-10-22T12:00:00Z')});assert.equal(lastWeek.evidence[0].source.workoutLogId,'three-mile-last-week');assert.equal(lastWeek.evidence[0].date,'2026-10-15');
 const absent=analyzeTrainingQuestion({question:'Fastest 5-mile run on 2026-10-16',logs,library,now:new Date('2026-10-22T12:00:00Z')});assert.equal(absent.evidence[0].kind,'insufficient_data');assert.match(absent.answer,/exactly 5 miles on 2026-10-16/);
});

test('Ask AI response service rejects unsupported numeric claims and falls back to verified analysis',async()=>{
 const analysis={answer:'Your actual Bench Press was 185 lb for 3 reps on 2026-10-20.',evidence:[{id:'best-actual-load',load:185}]};let body;
 const service=createTrainingAnswerService({apiKey:'synthetic-test',model:'test-model',fetchImpl:async(_,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'Your actual bench was 225 lb for 3 reps.',evidenceIds:['best-actual-load']})}]}]}));}});
 const out=await service.answer({userId:'athlete',question:'What is my bench?',analysis});assert.equal(body.store,false);assert.equal(body.tools,undefined);assert.equal(out.groundingFallback,true);assert.equal(out.answer,analysis.answer);
});

test('exact workout-history answers bypass generative rewriting so factual numbers cannot be changed',async()=>{
 let calls=0;const service=createTrainingAnswerService({fetchImpl:async()=>{calls++;throw Error('must not call provider for a verified record answer');}});
 const analysis={answer:'Your heaviest recorded 3-rep Power Clean set was 185 lbs for 3 reps.',evidence:[],deterministic:true};const result=await service.answer({userId:'athlete',question:'Heaviest 3 reps Power Clean',analysis});assert.equal(calls,0);assert.equal(result.answer,analysis.answer);assert.equal(result.provider,'verified-workout-history');
});
