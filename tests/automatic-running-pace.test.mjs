import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBenchmark} from '../shared/benchmark-attempts.mjs';
import {resolveAutomaticRunningPace,refreshAssignmentRunningPaces,validateRunningPaceMethod} from '../shared/automatic-running-pace.mjs';
import {propagateProgram} from '../shared/program-sync.mjs';
import {runningIntervalFatigue,runningFatigueInsight,comparableRunningIntervalHistory} from '../shared/running-analytics.mjs';

const library=[{id:'run',name:'Outdoor Running',trackingType:'running'}];
const target={exerciseId:'run',trackingType:'running',intervalCount:4,metrics:{},intervals:[{rounds:4,segments:[{label:'Work',metrics:{durationSeconds:360,distanceUnit:'m'}}],recovery:{durationSeconds:270,paceSeconds:600,paceUnit:'mi'},recoveryRule:{preset:'threshold',recoveryPerWork:0.75,workDurationSeconds:360}}],paceMethod:{type:'assessment',source:'six_minute',category:'threshold',unit:'mi'}};
const program={id:'p',weeks:1,sessions:[{name:'Six-minute test',day:1,exercises:[{exerciseId:'run',trackingType:'running',intervalCount:1,metrics:{durationSeconds:360,distanceUnit:'m'}}]}]};
const definition=prepareBenchmark({week:1,session:0,name:'Six-minute test',scoring:{type:'greatest_distance',exerciseId:'run',durationSeconds:360,protocol:'six_minute_max_run'}},program,library,{id:'b',coachId:'c',createdAt:'2030-01-01T00:00:00Z'});
const assessment=(id,athleteId,meters,date='2030-01-01',extra={})=>({id,athleteId,benchmarkId:'b',benchmarkSignature:definition.signature,status:'completed',workoutDate:date,assessmentMaximal:true,exercises:[{exerciseId:'run',sets:[{distance:meters,distanceUnit:'m',durationSeconds:360,completed:true}]}],...extra});
const assignment=(id,athleteId)=>({id,athleteId,programId:'p',plan:[{week:1,sessions:[{name:'Threshold',day:1,exercises:[structuredClone(target)],prescriptionRevision:0},{name:'Completed',day:3,exercises:[structuredClone(target)],prescriptionRevision:0}]}]});

test('assessment pace rules validate supported sources without interchanging training zones and time trials',()=>{
 validateRunningPaceMethod(target.paceMethod);
 assert.throws(()=>validateRunningPaceMethod({...target.paceMethod,source:'mile'}),/time trials support observed pace/);
 validateRunningPaceMethod({type:'assessment',source:'mile',category:'observed',unit:'km'});
 assert.throws(()=>validateRunningPaceMethod({type:'assessment',source:'400m',category:'observed',unit:'mi'}),/valid running assessment/);
 assert.throws(()=>validateRunningPaceMethod({type:'assessment',source:'benchmark',category:'observed',unit:'mi'}),/Choose a running time-trial benchmark/);
});

test('each athlete resolves a different qualifying pace; missing and invalid assessments never invent a target',()=>{
 const logs=[assessment('a1','a',1500),assessment('b1','b',1300),assessment('bad','a',2000,'2030-02-01',{assessmentMaximal:false})];
 const context={logs,definitions:[definition],library};
 const a=resolveAutomaticRunningPace(target,{...context,athleteId:'a'}),b=resolveAutomaticRunningPace(target,{...context,athleteId:'b'}),missing=resolveAutomaticRunningPace(target,{...context,athleteId:'c'});
 assert.ok(a.metrics.paceSeconds<b.metrics.paceSeconds);
 assert.equal(a.paceRecommendation.sourceLogId,'a1');
 assert.equal(a.intervals[0].recovery.durationSeconds,270);
 assert.equal(a.intervals[0].recovery.paceSeconds,600);
 assert.equal(a.intervals[0].recoveryRule.recoveryPerWork,0.75);
 assert.equal(missing.metrics.paceSeconds,undefined);
 assert.equal(missing.paceRecommendation.status,'unavailable');
 const mixed={...target,intervals:[{rounds:2,segments:[{kind:'work',label:'Run',metrics:{durationSeconds:120}},{kind:'recovery',label:'Jog',metrics:{durationSeconds:90,paceSeconds:650,paceUnit:'mi'}}],recovery:{}}]};
 const resolved=resolveAutomaticRunningPace(mixed,{...context,athleteId:'a'});
 assert.ok(resolved.intervals[0].segments[0].metrics.paceSeconds>0);
 assert.equal(resolved.intervals[0].segments[1].metrics.paceSeconds,650,'automatic work pace leaves a separately marked recovery segment unchanged');
});

test('improved, declined, corrected and invalidated assessments update future sessions once; completed and locked sessions remain unchanged',()=>{
 const first=assessment('one','a',1500),improved=assessment('two','a',1600,'2030-02-01'),declined=assessment('three','a',1400,'2030-03-01');
 const context=logs=>({logs,definitions:[definition],library});
 const completed={assignmentId:'a',week:1,session:1,athleteId:'a',status:'completed'};
 let result=refreshAssignmentRunningPaces(assignment('a','a'),context([first]),[completed]);assert.equal(result.changed,1);
 const originalCompleted=result.assignment.plan[0].sessions[1],initial=result.assignment.plan[0].sessions[0].exercises[0].metrics.paceSeconds;
 result=refreshAssignmentRunningPaces(result.assignment,context([first]),[completed]);assert.equal(result.changed,0);
 result=refreshAssignmentRunningPaces(result.assignment,context([first,improved]),[completed]);assert.equal(result.changed,1);const faster=result.assignment.plan[0].sessions[0].exercises[0].metrics.paceSeconds;assert.ok(faster<initial);
 result=refreshAssignmentRunningPaces(result.assignment,context([first,improved,declined]),[completed]);assert.equal(result.changed,1);assert.ok(result.assignment.plan[0].sessions[0].exercises[0].metrics.paceSeconds>faster);
 result=refreshAssignmentRunningPaces(result.assignment,context([first,{...improved,exercises:[{exerciseId:'run',sets:[{distance:1700,distanceUnit:'m',durationSeconds:360,completed:true}]}]},declined]),[completed]);assert.equal(result.changed,0,'correcting an older assessment leaves the latest source unchanged');
 result=refreshAssignmentRunningPaces(result.assignment,context([first,improved,{...declined,assessmentMaximal:false}]),[completed]);assert.equal(result.assignment.plan[0].sessions[0].exercises[0].paceRecommendation.sourceLogId,'two');
 assert.deepEqual(result.assignment.plan[0].sessions[1],originalCompleted);
 const fixed=structuredClone(result.assignment);fixed.plan[0].sessions[0].exercises[0].paceMethod={type:'fixed'};assert.equal(refreshAssignmentRunningPaces(fixed,context([first,improved]),[completed]).changed,0);
 const manual=structuredClone(result.assignment);manual.plan[0].sessions[0].exercises[0].metrics.paceSeconds=500;assert.equal(refreshAssignmentRunningPaces(manual,context([first,improved]),[completed]).changed,0,'a diverged coach pace is not overwritten');
});

test('program propagation ignores derived pace while preserving unrelated athlete-specific and coach updates',()=>{
 const old=assignment('a','a'),newPlan=structuredClone(old.plan);newPlan[0].sessions[0].exercises[0].intervals[0].segments[0].metrics.durationSeconds=420;
 const resolved=refreshAssignmentRunningPaces(old,{logs:[assessment('one','a',1500)],definitions:[definition],library}).assignment;
 const merged=propagateProgram(resolved,old.plan,newPlan,[]);
 assert.equal(merged.summary.conflicts,0);
 assert.equal(merged.assignment.plan[0].sessions[0].exercises[0].intervals[0].segments[0].metrics.durationSeconds,420);
});

test('mile and 400 m sources use observed benchmark pace only, with no unsupported training-zone formula',()=>{
 for(const [source,meters,seconds] of [['mile',1609.344,420],['four_hundred',400,85]]){
  const trialProgram={...program,sessions:[{...program.sessions[0],exercises:[{exerciseId:'run',trackingType:'running',intervalCount:1,metrics:{distance:meters,distanceUnit:'m'}}]}]};
  const trial=prepareBenchmark({week:1,session:0,name:'Time trial',scoring:{type:'fastest_time',exerciseId:'run',distanceMeters:meters}},trialProgram,library,{id:source,coachId:'c',createdAt:'2030-01-01T00:00:00Z'});
  const log={id:`${source}-log`,athleteId:'a',benchmarkId:source,benchmarkSignature:trial.signature,status:'completed',workoutDate:'2030-02-01',exercises:[{exerciseId:'run',sets:[{distance:meters,distanceUnit:'m',durationSeconds:seconds,completed:true}]}]};
  const pace=resolveAutomaticRunningPace({...target,paceMethod:{type:'assessment',source,category:'observed',unit:'km'}},{logs:[log],definitions:[trial],library,athleteId:'a'});
  assert.equal(pace.paceRecommendation.sourceLogId,log.id);
  assert.ok(pace.metrics.paceSeconds>0);
  assert.match(pace.paceRecommendation.method,/Observed|Recorded/);
 }
});

test('another compatible fixed-distance running benchmark can supply its own observed pace',()=>{
 const trialProgram={...program,sessions:[{...program.sessions[0],exercises:[{exerciseId:'run',trackingType:'running',intervalCount:1,metrics:{distance:2000,distanceUnit:'m'}}]}]};
 const trial=prepareBenchmark({week:1,session:0,name:'2 km time trial',scoring:{type:'fastest_time',exerciseId:'run',distanceMeters:2000}},trialProgram,library,{id:'two-km',coachId:'c',createdAt:'2030-01-01T00:00:00Z'});
 const log={id:'two-km-log',athleteId:'a',benchmarkId:trial.id,benchmarkSignature:trial.signature,status:'completed',workoutDate:'2030-02-01',exercises:[{exerciseId:'run',sets:[{distance:2000,distanceUnit:'m',durationSeconds:600,completed:true}]}]};
 const pace=resolveAutomaticRunningPace({...target,paceMethod:{type:'assessment',source:'benchmark',benchmarkId:trial.id,category:'observed',unit:'km'}},{logs:[log],definitions:[trial],library,athleteId:'a'});
 assert.equal(pace.metrics.paceSeconds,300);
 assert.equal(pace.paceRecommendation.sourceLogId,log.id);
});

test('fatigue is early-to-late completed work speed loss with data-grounded explanations',()=>{
 const log=(id,date,meters,recovery=90)=>({id,athleteId:'a',sessionName:'Six by two',workoutDate:date,status:'completed',exercises:[{exerciseId:'run',sets:meters.map(distance=>({completed:true,distance,distanceUnit:'m',durationSeconds:120,recoverySeconds:recovery}))}]});
 const stable=runningIntervalFatigue(log('first','2030-01-01',[400,400,400,400]),'run',library),declining=runningIntervalFatigue(log('second','2030-02-01',[400,390,370,350]),'run',library);
 assert.equal(stable.fatiguePercent,0);
 assert.ok(declining.fatiguePercent>0);
 assert.match(runningFatigueInsight(stable).suggestion,/maintained or improved/);
 assert.match(runningFatigueInsight(declining).statement,/lower/);
 const repeated=comparableRunningIntervalHistory([log('first','2030-01-01',[400,400,400,400]),log('second','2030-02-01',[400,390,370,350])],'run',library,'a');
 assert.equal(repeated[1].previousLogId,'first');assert.ok(repeated[1].fatigueChangePoints>0);assert.match(repeated[1].recoveryComparison,/similar/);
 const unlike=runningIntervalFatigue({...log('mixed','2030-02-02',[400,300]),exercises:[{exerciseId:'run',sets:[{completed:true,distance:400,distanceUnit:'m',durationSeconds:120},{completed:true,distance:300,distanceUnit:'m',durationSeconds:180}]}]},'run',library);
 assert.match(runningFatigueInsight(unlike).statement,/Insufficient comparable/);
 const mixedTarget={intervals:[{rounds:2,segments:[{kind:'work',metrics:{durationSeconds:120}},{kind:'recovery',metrics:{durationSeconds:90}}]}]};
 const mixedLog={id:'mixed-recovery',athleteId:'a',status:'completed',exercises:[{exerciseId:'run',target:mixedTarget,sets:[{completed:true,distance:400,distanceUnit:'m',durationSeconds:120},{completed:true,distance:200,distanceUnit:'m',durationSeconds:90},{completed:true,distance:380,distanceUnit:'m',durationSeconds:120},{completed:true,distance:200,distanceUnit:'m',durationSeconds:90}]}]};
 const workOnly=runningIntervalFatigue(mixedLog,'run',library);assert.equal(workOnly.intervals.length,2);assert.equal(workOnly.totalMeters,780);assert.equal(workOnly.missing,0);
});
