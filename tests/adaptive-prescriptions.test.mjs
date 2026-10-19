import {workoutDate} from '../shared/volume-stats.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendAthleteLoad,sessionRecommendations} from '../shared/adaptive-prescriptions.mjs';
import {normalizePrescription,prepareProgram,recordPerformance} from '../shared/prescriptions.mjs';
import {generateBlock,supportsCoachProgression,supportsFixedCoachProgression} from '../server/progression.mjs';
import {exercises} from '../server/seed.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';
const rule={version:1,enabled:true,minPercent:5,maxPercent:10};
const target=()=>normalizePrescription({exerciseId:'bench',sets:2,reps:5,rest:120,load:null,loadMode:'percentage',percent1RM:75,rpe:8,adaptiveProgression:rule});
const context={athleteId:'jordan',library:exercises,date:'2026-10-22',today:'2026-10-15'};
const logged=(patch={})=>({id:'baseline',athleteId:'jordan',source:'tracker',workoutDate:'2026-10-08',createdAt:'2026-10-08T18:00:00Z',readiness:3,pain:false,exercises:[{exerciseId:'bench',sets:[{load:200,reps:5,rpe:8,loadUnit:'lbs'}]}],...patch});
test('phone-failure shapes: fixed accessories without RPE, AI selected and percentage loads enable coach controls',()=>{
 for(const id of ['bench','lat-pulldown','leg-extension'])for(const p of [{load:100,rpe:null,effortMode:'none'},{load:null,loadMode:'athlete_selected',rpe:8},{load:null,loadMode:'percentage',percent1RM:75}]){
  const e={exerciseId:id,sets:3,reps:8,rest:90,...p};assert.equal(supportsCoachProgression(e),true);
  if(p.load===100){assert.equal(supportsFixedCoachProgression(e),true);const plan=generateBlock([{exercises:[e]}],4,{method:'westside',rules:{[`0:0:${id}`]:{mode:'repetition',increase:5}}});assert.equal(plan[1].sessions[0].exercises[0].load,105);assert.equal(plan[1].sessions[0].exercises[0].rpe,null);}
 }
 assert.equal(supportsCoachProgression({exerciseId:'plank',load:100}),false);
});
test('coach opt-in retains grouped targets and creates validated additive rules',()=>{
 const e={...target(),sets:3,setBlocks:[{sets:2,reps:5,percent1RM:75},{sets:1,reps:3,percent1RM:80}]};delete e.adaptiveProgression;
 const sessions=[{name:'A',day:1,exercises:[e]}],plan=generateBlock(sessions,4,{method:'westside',rules:{'0:0:bench':{mode:'adaptive',minPercent:5,maxPercent:10}}});
 assert.deepEqual(plan[3].sessions[0].exercises[0].setBlocks,e.setBlocks);assert.equal(plan[0].sessions[0].exercises[0].load,null);assert.equal(e.adaptiveProgression,undefined);
 assert.doesNotThrow(()=>prepareProgram({name:'Adaptive',goal:'Strength',description:'',weeks:4,plan},exercises));
 assert.throws(()=>prepareProgram({name:'Bad',goal:'Strength',weeks:4,sessions:[{name:'A',day:1,exercises:[{...target(),adaptiveProgression:{...rule,maxPercent:50}}]}]},exercises),/0% to 10%/);
});
test('uses actual 1/3/5RM assessment or journal sets without requiring Week 1; NSCA unchanged',()=>{
 for(const reps of [1,3,5]){
  const l=logged();l.exercises[0].sets[0].reps=reps;
  const result=recommendAthleteLoad(target(),{...context,logs:[l]});assert.equal(result.status,'recommended');assert.equal(result.baseline.logId,'baseline');assert.ok(result.load>0);assert.equal(target().load,null);
 }
 const e=target();e.reference1RM={exerciseId:'bench',value:250,unit:'lbs',type:'tested',date:'2026-10-15'};
 const r=recommendAthleteLoad(e,{...context,logs:[]});assert.equal(r.load,195);assert.equal(r.baseline.source,'reference maximum');
});
test('Previous Performance ± follows exact-exercise actuals and athlete overrides, rounds pounds, and reports missing baseline',()=>{
 const prev={exerciseId:'bench',sets:3,reps:10,load:null,loadMode:'previous_performance',loadDelta:-5,loadUnit:'lbs',effortMode:'none',rest:null};
 const week1=logged();week1.exercises[0].sets=[{load:40,reps:8,rpe:null,loadUnit:'lbs'},{load:40,reps:8,rpe:null,loadUnit:'lbs'},{load:40,reps:8,rpe:null,loadUnit:'lbs'}];
 const week2={...logged({id:'week2',workoutDate:'2026-10-15',createdAt:'2026-10-15T18:00:00Z'}),assignmentId:'a',week:2,session:0};week2.exercises[0].sets=Array.from({length:3},()=>({load:30,reps:10,rpe:null,loadUnit:'lbs'}));
 assert.equal(recommendAthleteLoad(prev,{...context,assignmentId:'a',week:2,session:0,logs:[week1]}).load,35);
 const next={...prev,sets:4,reps:6,loadDelta:15};const result=recommendAthleteLoad(next,{...context,assignmentId:'a',week:3,session:0,logs:[week1,week2]});assert.equal(result.status,'recommended');assert.equal(result.load,45);assert.equal(result.baseline.load,30);assert.equal(result.baseline.source,'actual workout performance');
 const odd={...week2,createdAt:'2026-10-16T18:00:00Z'};odd.exercises[0].sets[2].load=148;const rounded=recommendAthleteLoad({...next,loadDelta:0},{...context,logs:[odd]});assert.equal(rounded.load,150);
 assert.equal(recommendAthleteLoad(prev,{...context,logs:[logged({athleteId:'other'}),logged({id:'other-exercise',exercises:[{exerciseId:'squat',sets:[{load:500,reps:5,loadUnit:'lbs'}]}]})]}).status,'needs_previous_performance');
});
test('known low-effort work stays in history but does not establish strength estimates',()=>{
 const l=logged();l.exercises[0].sets[0].rpe=6;
 assert.equal(recommendAthleteLoad(target(),{...context,logs:[l]}).status,'unavailable');
 const e={...target(),loadMode:'athlete_selected',percent1RM:null};assert.equal(recommendAthleteLoad(e,{...context,logs:[l]}).status,'unavailable');
});
test('guards ownership, date, stale history, warmups, unsupported reps, pain and recovery',()=>{
 for(const l of [logged({athleteId:'other'}),logged({workoutDate:'2026-10-30'}),logged({workoutDate:'2025-01-01'}),logged({pain:true}),logged({readiness:1})])assert.notEqual(recommendAthleteLoad(target(),{...context,logs:[l]}).status,'recommended');
 for(const patch of [{warmup:true},{completed:false},{load:-20},{reps:11},{rpe:6}]){const l=logged();Object.assign(l.exercises[0].sets[0],patch);assert.notEqual(recommendAthleteLoad(target(),{...context,logs:[l]}).status,'recommended');}
 assert.equal(recommendAthleteLoad({...target(),adaptiveProgression:undefined},context).status,'needs_baseline');
});
test('new actuals refresh the baseline, one weekly step only, unit conversion and rounding guardrails',()=>{
 const first=logged(),second=logged({id:'second',workoutDate:'2026-10-15'});second.exercises[0].sets[0].load=220;
 const e={...target(),loadMode:'athlete_selected',percent1RM:null};
 assert.equal(recommendAthleteLoad(e,{...context,logs:[first]}).load,210);
 assert.equal(recommendAthleteLoad(e,{...context,logs:[first,second]}).load,230);
 assert.equal(recommendAthleteLoad(e,{...context,date:'2026-12-22',logs:[first,second]}).load,230);
 assert.equal(recommendAthleteLoad(e,{...context,date:'2026-10-15',logs:[first,second]}).load,220);
 const kg={...e,loadUnit:'kg',increment:2.5};const result=recommendAthleteLoad(kg,{...context,logs:[first]});assert.ok(result.load>=95&&result.load<=100);
 const small=logged();small.exercises[0].sets[0].load=10;assert.equal(recommendAthleteLoad(e,{...context,logs:[small]}).load,10);
});
test('actual override records original prescription separately; grouped recommendations stay distinct',()=>{
 const e=target(),a={id:'a',athleteId:'jordan',startDate:'2026-10-19',plan:[{week:1,sessions:[{day:4,exercises:[e]}]}]};
 const before=structuredClone(a),rec=sessionRecommendations(a,1,0,[logged()],exercises,'2026-10-15');assert.equal(rec[0].length,2);
 const actual=recordPerformance([{exerciseId:'bench',sets:[{load:150,reps:5,rpe:8},{load:150,reps:5,rpe:8}]}],[e],exercises);
 assert.equal(actual[0].target.load,null);assert.equal(actual[0].target.percent1RM,75);assert.equal(actual[0].sets[0].load,150);assert.deepEqual(a,before);
});
test('local preview saves adaptive rule, baseline, actual override and receipt snapshot across reload',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let api=createLocalDemo(storage);
 await api('demo','POST',{role:'coach'});
 const e=target();e.reference1RM={exerciseId:'bench',value:250,unit:'lbs',type:'tested',date:workoutDate({createdAt:new Date().toISOString()})};
 const p=await api('programs','POST',{name:'Adaptive persistence',goal:'Strength',weeks:1,description:'',sessions:[{name:'A',day:4,exercises:[e]}]});
 const a=await api('assign','POST',{programId:p.id,athleteId:'jordan',startDate:workoutDate({createdAt:new Date().toISOString()})});
 await api('demo','POST',{role:'athlete'});await api('log','POST',{assignmentId:a.id,week:1,session:0,readiness:3,pain:false,notes:'',exercises:[{exerciseId:'bench',sets:[{load:150,reps:5,rpe:8},{load:155,reps:5,rpe:8}]}]});
 api=createLocalDemo(storage);const data=await api('data'),log=data.logs.find(l=>l.assignmentId===a.id);assert.equal(log.exercises[0].sets[1].load,155);assert.equal(log.exercises[0].target.load,null);assert.equal(log.recommendations[0][0].status,'recommended');assert.equal(data.assignments.find(x=>x.id===a.id).plan[0].sessions[0].exercises[0].load,null);
});

test('upper bound needs two distinct successful sessions; grouped percentage rows resolve independently',()=>{
 const e={...target(),loadMode:'athlete_selected',percent1RM:null};const logs=['2026-10-08','2026-10-15'].map((date,i)=>{const l=logged({id:'success-'+i,workoutDate:date,readiness:4});l.exercises[0].target={sets:2,reps:5,load:200,loadUnit:'lbs'};l.exercises[0].sets.push({...l.exercises[0].sets[0]});return l;});
 assert.equal(recommendAthleteLoad(e,{...context,logs}).load,220);
 assert.equal(recommendAthleteLoad(e,{...context,logs:[logs[0],logs[0]]}).load,210);
 logs[1].exercises[0].sets[1].load=190;assert.equal(recommendAthleteLoad(e,{...context,logs}).load,210);
 const grouped={...target(),sets:3,reference1RM:{exerciseId:'bench',value:250,unit:'lbs',type:'tested',date:'2026-10-15'},setBlocks:[{sets:2,reps:5,percent1RM:75},{sets:1,reps:3,percent1RM:85}]};
 const a={id:'g',athleteId:'jordan',startDate:'2026-10-19',plan:[{week:1,sessions:[{day:4,exercises:[grouped]}]}]};assert.deepEqual(sessionRecommendations(a,1,0,[],exercises,'2026-10-15')[0].map(r=>r.load),[195,195,225]);
});
