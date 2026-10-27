import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBenchmark} from '../shared/benchmark-attempts.mjs';
import {benchmarkWorkoutDraft} from '../shared/phase3.mjs';
import {runningAssessments,runningTimeTrials,runningPaceRecommendations,runningIntervalFatigue,applyRunningPace} from '../shared/running-analytics.mjs';
import {convertDistance} from '../shared/tracking.mjs';

const library=[{id:'run',name:'Outdoor Running',trackingType:'running'},{id:'bike',name:'Bike',trackingType:'cycling'}];
const program={id:'p',weeks:1,sessions:[{name:'Six-minute run',day:1,exercises:[{exerciseId:'run',trackingType:'running',intervalCount:1,metrics:{durationSeconds:360,distanceUnit:'m'}}]}]};
const definition=prepareBenchmark({week:1,session:0,name:'Six-minute run',scoring:{type:'greatest_distance',exerciseId:'run',durationSeconds:360,protocol:'six_minute_max_run'}},program,library,{id:'b',coachId:'c',createdAt:'2030-01-01T00:00:00Z'});
const attempt=(id,date,meters,extra={})=>({id,athleteId:'a',benchmarkId:'b',benchmarkSignature:definition.signature,status:'completed',workoutDate:date,assessmentMaximal:true,exercises:[{exerciseId:'run',status:'completed',sets:[{distance:meters,distanceUnit:'m',durationSeconds:360,completed:true}]}],...extra});

test('six-minute benchmark requires one prescribed running effort and athlete maximal confirmation',()=>{
 assert.equal(definition.scoring.protocol,'six_minute_max_run');assert.equal(benchmarkWorkoutDraft(definition,library).assessmentProtocol,'six_minute_max_run');
 assert.throws(()=>prepareBenchmark({week:1,session:0,name:'Bad',scoring:{type:'greatest_distance',exerciseId:'run',durationSeconds:720,protocol:'six_minute_max_run'}},program,library,{id:'x',coachId:'c'}),/360-second/);
 assert.throws(()=>prepareBenchmark({week:1,session:0,name:'Bad',scoring:{type:'greatest_distance',exerciseId:'run',durationSeconds:360,protocol:'six_minute_max_run'}},{...program,sessions:[{...program.sessions[0],exercises:[{exerciseId:'run',trackingType:'running',metrics:{durationSeconds:300}}]}]},library,{id:'x',coachId:'c'}),/Prescribe one six-minute/);
 const rows=runningAssessments([attempt('one','2030-01-01',1500),attempt('two','2030-02-01',1600,{assessmentMaximal:false}),attempt('three','2030-03-01',1550,{status:'partially_completed'}),attempt('other','2030-03-01',2000,{athleteId:'other'})],[definition],library,'a');
 assert.equal(rows.length,3);assert.equal(rows[0].qualified,true);assert.equal(rows[0].velocityMps,1500/360);assert.equal(rows[1].qualified,false);assert.equal(rows[2].qualified,false);
 const approximate=attempt('approx','2030-03-02',1500,{exercises:[{exerciseId:'run',sets:[{distance:1500,distanceUnit:'m',durationSeconds:355,completed:true}]}]});assert.equal(runningAssessments([approximate],[definition],library,'a')[0].qualified,true,'a completed maximal test within five seconds of six minutes qualifies');assert.equal(runningAssessments([approximate],[definition],library,'a')[0].seconds,355);
 const noConfirmation=attempt('unchecked','2030-03-03',1500,{assessmentMaximal:false});assert.equal(runningAssessments([noConfirmation],[definition],library,'a')[0].qualified,false);assert.match(runningAssessments([noConfirmation],[definition],library,'a')[0].reason,/Maximal effort was not confirmed/);
 const unfinished=attempt('unfinished','2030-03-04',1500,{status:'partially_completed'});assert.equal(runningAssessments([unfinished],[definition],library,'a')[0].qualified,false);assert.match(runningAssessments([unfinished],[definition],library,'a')[0].reason,/Workout must be completed/);
 const noDistance=attempt('no-distance','2030-03-05',1500,{exercises:[{exerciseId:'run',sets:[{durationSeconds:360,completed:true}]}]});assert.equal(runningAssessments([noDistance],[definition],library,'a')[0].qualified,false);
 const tooLong=attempt('too-long','2030-03-06',1500,{exercises:[{exerciseId:'run',sets:[{distance:1500,distanceUnit:'m',durationSeconds:354,completed:true}]}]});assert.equal(runningAssessments([tooLong],[definition],library,'a')[0].qualified,false);
 const split=attempt('split','2030-04-01',1500,{exercises:[{exerciseId:'run',sets:[{distance:750,distanceUnit:'m',durationSeconds:180,completed:true},{distance:750,distanceUnit:'m',durationSeconds:180,completed:true}]}]});assert.equal(runningAssessments([split],[definition],library,'a')[0].qualified,false);
 assert.equal(runningAssessments([attempt('one','2030-01-01',1500,{benchmarkSignature:'changed'})],[definition],library,'a')[0].qualified,false);
});

test('pace recommendations use only qualifying evidence and preserve separate observed trial methods',()=>{
 const assessments=runningAssessments([attempt('one','2030-01-01',1500),attempt('two','2030-02-01',1600,{assessmentMaximal:false})],[definition],library,'a');
 const mi=runningPaceRecommendations({assessments,unit:'mi'}),km=runningPaceRecommendations({assessments,unit:'km'});
 assert.equal(mi.source.date,'2030-01-01');assert.ok(mi.bands.easy.maxPaceSeconds>mi.bands.vo2Intervals.maxPaceSeconds);assert.ok(Math.abs(mi.bands.vo2Intervals.minPaceSeconds/km.bands.vo2Intervals.minPaceSeconds-1.609344)<1e-6);
 const target={exerciseId:'run',trackingType:'running',metrics:{distanceUnit:'mi',paceSeconds:500},intervals:[{rounds:2,work:{durationSeconds:120},recovery:{durationSeconds:60}}]};
 const selected=applyRunningPace(target,mi.bands.vo2Intervals,'mi');assert.equal(selected.metrics.paceUnit,'mi');assert.equal(selected.intervals[0].work.paceSeconds,selected.metrics.paceSeconds);assert.equal(selected.paceRecommendation.sourceDate,'2030-01-01');assert.equal(target.metrics.paceSeconds,500);
 assert.equal(Object.keys(runningPaceRecommendations({unit:'km'}).bands).length,0);
 const mileDefinition=prepareBenchmark({week:1,session:0,name:'Mile',scoring:{type:'fastest_time',exerciseId:'run',distanceMeters:1609.344}},{...program,sessions:[{...program.sessions[0],exercises:[{exerciseId:'run',trackingType:'running',metrics:{distance:1,distanceUnit:'mi'}}]}]},library,{id:'mile',coachId:'c',createdAt:'2030-01-01T00:00:00Z'});
 const trial=attempt('mile-log','2030-04-01',1609.344,{benchmarkId:'mile',benchmarkSignature:mileDefinition.signature,exercises:[{exerciseId:'run',sets:[{distance:1,distanceUnit:'mi',durationSeconds:420,completed:true}]}]});
 const trials=runningTimeTrials([trial],[mileDefinition],library,'a');assert.equal(trials.length,1);const observed=runningPaceRecommendations({timeTrials:trials,unit:'mi'});assert.equal(observed.observed.mile.paceSeconds,420);assert.equal(Object.keys(observed.bands).length,0);
});

test('interval fatigue uses actual completed work, excluding recovery and incomplete or incomparable intervals',()=>{
 const log={id:'interval',athleteId:'a',status:'completed',exercises:[{exerciseId:'run',target:{intervals:[{rounds:3,work:{durationSeconds:120,paceSeconds:420},recovery:{durationSeconds:60}}]},sets:[{durationSeconds:120,paceSeconds:420,paceUnit:'mi',recoverySeconds:60,completed:true},{durationSeconds:120,paceSeconds:440,paceUnit:'mi',recoverySeconds:60,completed:true},{durationSeconds:120,paceSeconds:470,paceUnit:'mi',completed:false}]}]};
 const result=runningIntervalFatigue(log,'run',library);assert.equal(result.status,'Partial data');assert.equal(result.intervals.length,2);assert.equal(result.missing,1);assert.equal(result.recoverySeconds,120);assert.ok(result.changePercent<0);assert.ok(result.totalMeters>0);assert.ok(result.totalMeters<convertDistance(1,'mi','m'));assert.equal(result.trend,'Slowed');
 assert.equal(runningIntervalFatigue({...log,exercises:[{...log.exercises[0],sets:[{completed:true,durationSeconds:120}]}]},'run',library).status,'Insufficient data');
 assert.equal(runningIntervalFatigue({...log,exercises:[{...log.exercises[0],sets:[{distance:400,distanceUnit:'m',durationSeconds:120,completed:true},{distance:400,distanceUnit:'m',durationSeconds:180,completed:true}]}]},'run',library).status,'Non-comparable interval durations');
 assert.equal(runningIntervalFatigue(log,'bike',library).status,'Insufficient data');
});
