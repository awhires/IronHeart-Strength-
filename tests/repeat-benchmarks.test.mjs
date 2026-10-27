import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBenchmark,benchmarkHistory,benchmarkAttemptSignature} from '../shared/benchmark-attempts.mjs';
import {repeatWorkoutDraft,benchmarkWorkoutDraft,repeatWorkoutProgramDraft} from '../shared/phase3.mjs';
import {prepareTrackerWorkout} from '../shared/workout-tracker.mjs';
import {prepareProgram} from '../shared/prescriptions.mjs';

const library=[{id:'bench',name:'Bench Press',trackingType:'strength'},{id:'row',name:'Bent-Over Row',trackingType:'strength'},{id:'run',name:'Outdoor Running',trackingType:'running'},{id:'erg',name:'RowErg',trackingType:'erg'}];
const strengthSession={name:'Strength test',day:1,exercises:[{exerciseId:'bench',sets:5,reps:3,load:150,setBlocks:[{sets:2,reps:3,load:150},{sets:3,reps:3,load:160}]},{exerciseId:'row',sets:4,reps:10,load:90}],blocks:[{id:'superset',type:'Strength',superset:true,supersetNotes:'Alternate lifts',restSeconds:90,exerciseIndexes:[0,1]}]};
const program={id:'program',weeks:1,sessions:[strengthSession]};
const meta={id:'benchmark-1',coachId:'coach',createdAt:'2026-10-01T12:00:00Z'};
const define=(session,scoring,id='benchmark-1')=>prepareBenchmark({programId:'program',week:1,session:0,name:'Test',description:'Recorded results only',scoring},{...program,sessions:[session]},library,{...meta,id});
const log=(definition,id,date,sets,status='completed')=>({id,benchmarkId:definition.id,benchmarkSignature:definition.signature,athleteId:'athlete',workoutDate:date,status,exercises:[{exerciseId:definition.scoring.exerciseId||'bench',sets}],blockResults:[]});

test('repeat drafts preserve grouped prescription and superset layout, not the old actual results',()=>{
 const definition=define(strengthSession,{type:'strength_load',exerciseId:'bench',reps:3});
 const source={id:'old',sessionName:'Strength test',workoutDate:'2026-10-01',exercises:[{exerciseId:'bench',target:definition.session.exercises[0],sets:[{load:190,loadUnit:'lbs',reps:3}]},{exerciseId:'row',target:definition.session.exercises[1],sets:[{load:100,loadUnit:'lbs',reps:10}]}],blocks:definition.session.blocks,blockResults:[]};
 const draft=repeatWorkoutDraft(source,library);assert.equal(draft.repeatOfLogId,'old');assert.notEqual(draft.repeatAttemptId,source.id);assert.equal(draft.exercises[0].setBlocks.length,5);assert.ok(draft.exercises[0].setBlocks.every(b=>b.count===1&&b.completed===false));assert.equal(draft.exercises[0].setBlocks[0].load,150);assert.equal(draft.exercises[0].setBlocks[2].load,160);assert.equal(draft.blocks[0].superset,true);assert.deepEqual(draft.blocks[0].exerciseIndexes,[0,1]);
 const next=benchmarkWorkoutDraft(definition,library);assert.equal(next.benchmarkId,definition.id);assert.equal(next.exercises.length,2);assert.equal(next.blocks[0].superset,true);assert.ok(!next.repeatOfLogId);
 const prepared=prepareTrackerWorkout({sessionName:next.sessionName,workoutDate:'2026-10-02',notes:'',blocks:next.blocks,exercises:next.exercises.map(e=>({exerciseId:e.exerciseId,target:e.target,blocks:e.setBlocks.map(b=>({...b,load:b.load??0,rpe:null}))}))},library);
 assert.equal(prepared.blocks[0].superset,true);assert.equal(prepared.exercises[0].target.setBlocks.length,2);assert.equal(benchmarkAttemptSignature(prepared.exercises,prepared.blocks,definition.scoring),definition.signature);
 source.exercises[0].sets[0].load=999;assert.equal(draft.exercises[0].setBlocks[0].load,150);assert.equal(draft.exercises[0].setBlocks[2].load,160);assert.equal(definition.session.exercises[0].setBlocks[0].load,150);
});

test('coach repeats a historical prescription into an unassigned program draft',()=>{
 const definition=define(strengthSession,{type:'strength_load',exerciseId:'bench',reps:3});
 const original={id:'old',sessionName:'Strength test',workoutDate:'2026-10-01',exercises:definition.session.exercises.map(target=>({exerciseId:target.exerciseId,target,sets:[{reps:1,load:999}]})),blocks:definition.session.blocks};
 const draft=repeatWorkoutProgramDraft(original),saved=prepareProgram(draft,library);
 assert.equal(saved.weeks,1);assert.equal(saved.sessions[0].exercises[0].setBlocks[0].load,150);assert.equal(saved.sessions[0].blocks[0].superset,true);
 assert.equal(saved.id,undefined);assert.equal(saved.sessions[0].exercises[0].sets,5);assert.equal(original.exercises[0].sets[0].load,999);
 assert.throws(()=>repeatWorkoutProgramDraft({...original,exercises:[{exerciseId:'bench',sets:[{reps:3,load:200}]}]}),/no complete saved prescription/);
 const legacyMetcon={name:'Repeat AMRAP',scoreType:'AMRAP',durationSeconds:720,repScheme:[],movements:[{exerciseId:'bench',reps:5}],notes:''};
 const metconOnly=repeatWorkoutProgramDraft({id:'old-metcon',sessionName:'Metcon day',workoutDate:'2026-10-02',exercises:[],blockResults:[{blockId:'metcon',metcon:legacyMetcon,score:{rx:'RX',rounds:4,reps:2}}]});
 assert.equal(prepareProgram(metconOnly,library).sessions[0].blocks[0].metcon.name,'Repeat AMRAP');
});

test('repeated cardio intervals and Metcons retain their prescription while clearing previous actuals and scores',()=>{
 const target={exerciseId:'erg',trackingType:'erg',intervalCount:2,metrics:{distance:500,distanceUnit:'m'},restSeconds:60};
 const metcon={name:'12-minute AMRAP',scoreType:'AMRAP',durationSeconds:720,repScheme:[],movements:[{exerciseId:'bench',exerciseName:'Bench Press',reps:5}],notes:''};
 const source={id:'mixed',sessionName:'Conditioning',exercises:[{exerciseId:'erg',target,sets:[{distance:500,distanceUnit:'m',durationSeconds:110,completed:true},{distance:500,distanceUnit:'m',durationSeconds:108,completed:true}]}],blocks:[{id:'cardio',type:'Cardio',exerciseIndexes:[0]},{id:'metcon',type:'Metcon',metcon}],blockResults:[{blockId:'metcon',metcon,score:{rx:'RX',rounds:5,reps:10}}]};
 const draft=repeatWorkoutDraft(source,library);assert.equal(draft.exercises[0].sets.length,2);assert.ok(draft.exercises[0].sets.every(s=>s.completed===false&&s.durationSeconds==null&&s.distance===500));assert.equal(draft.blocks[0].type,'Cardio');assert.equal(draft.blockResults[0].blockId,'metcon');assert.equal(draft.blockResults[0].score.rounds,undefined);assert.equal(source.exercises[0].sets[0].durationSeconds,110);
});

test('an unfinished repeat saves as partial and never ranks as a benchmark result',()=>{
 const definition=define(strengthSession,{type:'strength_load',exerciseId:'bench',reps:3});
 const draft=benchmarkWorkoutDraft(definition,library);
 const workout=prepareTrackerWorkout({sessionName:draft.sessionName,workoutDate:'2026-10-02',notes:'Paused after one set',blocks:draft.blocks,exercises:draft.exercises.map((e,i)=>({exerciseId:e.exerciseId,target:e.target,blocks:e.setBlocks.map((b,j)=>({...b,rpe:null,completed:i===0&&j===0}))}))},library);
 assert.equal(workout.status,'partially_completed');assert.equal(workout.exercises[0].sets.filter(s=>s.completed===true).length,1);
 assert.equal(benchmarkHistory(definition,[{...workout,id:'partial',benchmarkId:definition.id,benchmarkSignature:definition.signature}]).latest,undefined);
});

test('exact-rep strength benchmark ranks completed actual loads and preserves immutable definitions',()=>{
 const definition=define(strengthSession,{type:'strength_load',exerciseId:'bench',reps:3});
 const history=benchmarkHistory(definition,[log(definition,'a','2026-10-01',[{load:200,loadUnit:'lbs',reps:1},{load:175,loadUnit:'lbs',reps:3}]),log(definition,'b','2026-10-08',[{load:185,loadUnit:'lbs',reps:3}]),log(definition,'c','2026-10-15',[{load:200,loadUnit:'lbs',reps:3}], 'partially_completed'),{...log(definition,'d','2026-10-22',[{load:225,loadUnit:'lbs',reps:3}]),benchmarkSignature:'changed-target'}]);
 assert.equal(history.attempts.length,4);assert.equal(history.latest.score.value,185);assert.equal(history.previous.score.value,175);assert.equal(history.best.score.value,185);assert.equal(history.change.absolute,10);assert.equal(history.change.improved,true);assert.ok(Math.abs(history.change.percent-10/175*100)<1e-9);assert.equal(history.attempts[2].score,null);assert.equal(history.attempts[3].score,null);
 const noMatch=benchmarkHistory(definition,[log(definition,'one','2026-10-01',[{load:300,loadUnit:'lbs',reps:1}])]);assert.equal(noMatch.latest,undefined);
 program.sessions[0].exercises[0].reps=1;assert.equal(definition.session.exercises[0].setBlocks[0].reps,3);
});

test('cardio benchmarks compare only matching fixed distances or durations with the right improvement direction',()=>{
 const cardio={name:'2k row',day:1,exercises:[{exerciseId:'erg',trackingType:'erg',metrics:{distance:2000,distanceUnit:'m'}}]};
 const timed=define(cardio,{type:'fastest_time',exerciseId:'erg',distanceMeters:2000},'timed');
 const a=log(timed,'a','2026-10-01',[{distance:2000,distanceUnit:'m',durationSeconds:500}]);const b=log(timed,'b','2026-10-08',[{distance:2,distanceUnit:'km',durationSeconds:480}]);const wrong=log(timed,'c','2026-10-15',[{distance:1000,distanceUnit:'m',durationSeconds:220}]);const h=benchmarkHistory(timed,[a,b,wrong]);assert.equal(h.best.logId,'b');assert.equal(h.change.absolute,-20);assert.equal(h.change.label,'-20 seconds');assert.equal(h.change.improved,true);assert.equal(h.attempts[2].score,null);
 const interval=log(timed,'interval','2026-10-22',Array.from({length:4},()=>({distance:500,distanceUnit:'m',durationSeconds:115,recoverySeconds:60})));const intervalHistory=benchmarkHistory(timed,[a,interval]);assert.equal(intervalHistory.best.logId,'interval');assert.equal(intervalHistory.latest.score.value,460,'work intervals combine to 2k; recovery is excluded');
 const distance=define({name:'12-minute run',day:1,exercises:[{exerciseId:'run',trackingType:'running',metrics:{durationSeconds:720}}]},{type:'greatest_distance',exerciseId:'run',durationSeconds:720},'distance');const d=benchmarkHistory(distance,[log(distance,'r1','2026-10-01',[{distance:1.5,distanceUnit:'mi',durationSeconds:720}]),log(distance,'r2','2026-10-08',[{distance:2.5,distanceUnit:'km',durationSeconds:720}]),log(distance,'wrong','2026-10-15',[{distance:3,distanceUnit:'km',durationSeconds:600}])]);assert.equal(d.best.logId,'r2');assert.equal(d.change.improved,true);assert.equal(d.attempts[2].score,null);
});

test('Metcon benchmarks keep score type, structure, and RX division separate',()=>{
 const metcon={name:'12-minute AMRAP',scoreType:'AMRAP',durationSeconds:720,repScheme:[],movements:[{exerciseId:'bench',reps:5}],notes:''};
 const session={name:'Metcon test',day:1,exercises:[],blocks:[{id:'amrap',type:'Metcon',metcon}]};const definition=define(session,{type:'metcon',blockId:'amrap'},'amrap');
 const attempt=(id,date,rounds,reps,rx='RX')=>({id,athleteId:'athlete',benchmarkId:definition.id,benchmarkSignature:definition.signature,workoutDate:date,status:'completed',exercises:[],blockResults:[{blockId:'amrap',metcon:definition.session.blocks[0].metcon,score:{rounds,reps,rx,notes:''}}]});
 const h=benchmarkHistory(definition,[attempt('a','2026-10-01',4,10),attempt('scaled','2026-10-04',10,0,'Scaled'),attempt('b','2026-10-08',5,2)]);assert.equal(h.latest.logId,'b');assert.equal(h.best.logId,'b');assert.equal(h.change.improved,true);assert.equal(h.change.label,'More rounds/reps');assert.equal(h.change.percent,null);assert.match(h.attempts[1].score.division,/^Scaled:/);
 const changed=attempt('changed','2026-10-15',7,0);changed.blockResults[0].metcon.movements[0].reps=10;assert.equal(benchmarkHistory(definition,[changed]).latest,undefined);
});

test('a repeated Metcon keeps its own score and can be saved unfinished without a false result',()=>{
 const metcon={name:'12-minute AMRAP',scoreType:'AMRAP',durationSeconds:720,repScheme:[],movements:[{exerciseId:'bench',reps:5}],notes:''};
 const definition=define({name:'Metcon day',day:1,exercises:[],blocks:[{id:'amrap',type:'Metcon',metcon}]},{type:'metcon',blockId:'amrap'},'metcon-repeat');
 const draft=benchmarkWorkoutDraft(definition,library),entry=draft.blockResults[0];
 const completed=prepareTrackerWorkout({sessionName:draft.sessionName,workoutDate:'2026-10-08',notes:'',exercises:[],blocks:draft.blocks,blockResults:[{...entry,score:{rx:'RX',rounds:5,reps:12,notes:''}}]},library);
 const unfinished=prepareTrackerWorkout({sessionName:draft.sessionName,workoutDate:'2026-10-15',notes:'Stopped early',exercises:[],blocks:draft.blocks,blockResults:[{...entry,status:'skipped'}]},library);
 assert.equal(completed.status,'completed');assert.equal(unfinished.status,'partially_completed');
 const history=benchmarkHistory(definition,[{...completed,id:'done',benchmarkId:definition.id,benchmarkSignature:definition.signature},{...unfinished,id:'unfinished',benchmarkId:definition.id,benchmarkSignature:definition.signature}]);
 assert.equal(history.latest.logId,'done');assert.equal(history.attempts[1].score,null);
});
