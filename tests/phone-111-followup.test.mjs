import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDemo} from '../src/local-demo.mjs';
import {newPrescription} from '../shared/prescriptions.mjs';
import {prepareMetcon,prepareMetconScore,metconKey,scoreFields} from '../shared/workout-blocks.mjs';
import {metconStats} from '../shared/metcon-stats.mjs';
import {exercises} from '../server/seed.mjs';
import {missingLibraryExercises} from '../shared/exercise-library.mjs';
import {propagateProgram} from '../shared/program-sync.mjs';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {validateDraft} from '../shared/ai/validate.mjs';

const library=[...exercises,...missingLibraryExercises(exercises)];
const target=(exerciseId,sets,reps)=>({...newPrescription(exerciseId),sets,reps,load:null,loadMode:'athlete_selected',effortMode:'rpe',rpe:7});
const session=(reps=[5,6,12])=>({name:'Phone strength',day:1,exercises:[target('bench',5,reps[0]),target('lat-pulldown',4,reps[1]),target('leg-extension',3,reps[2])]});
const plan=()=>Array.from({length:4},(_,i)=>({week:i+1,sessions:[session()]}));
const store=()=>{const values=new Map();return createLocalDemo({getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)});};

test('template propagation preserves schedule and personalized sessions, with revision for open forms',()=>{
 const oldPlan=plan(),newPlan=structuredClone(oldPlan),assigned={id:'assignment',plan:structuredClone(oldPlan)};
 assigned.plan[1].sessions[0].day=5;assigned.plan[1].sessions[0].cancelled=false;
 assigned.plan[2].sessions[0].exercises[0].reps=9;
 newPlan[0].sessions[0].exercises[0].reps=8;
 newPlan[1].sessions[0].exercises[0].reps=6;
 newPlan[2].sessions[0].exercises[0].reps=7;
 const {assignment:after,summary}=propagateProgram(assigned,oldPlan,newPlan,[{assignmentId:'assignment',week:1,session:0}]);
 assert.deepEqual(summary,{updated:1,completed:1,personalized:1,progression:0});
 assert.equal(after.plan[0].sessions[0].exercises[0].reps,5);
 assert.equal(after.plan[1].sessions[0].exercises[0].reps,6);
 assert.equal(after.plan[1].sessions[0].day,5);
 assert.equal(after.plan[1].sessions[0].cancelled,false);
 assert.equal(after.plan[1].sessions[0].prescriptionRevision,1);
 assert.equal(after.plan[2].sessions[0].exercises[0].reps,9);
});

test('progression-only master edit revises affected future sessions, preserves completed logs and personalized content, and rejects stale saves',async()=>{
 const api=store();await api('demo','POST',{role:'coach'});
 const program=await api('programs','POST',{name:'Rule revision',goal:'Strength',weeks:4,plan:plan(),progressionOptions:{method:'westside',rules:{}}});
 const assigned=await api('assign','POST',{programId:program.id,athleteId:'jordan',startDate:'2026-10-12'});
 await api('demo','POST',{role:'athlete'});
 const completed=await api('log','POST',{assignmentId:assigned.id,week:1,session:0,prescriptionRevision:0,exercises:[['bench',5,5,180,9],['lat-pulldown',4,6,150,8],['leg-extension',3,12,70,8]].map(([exerciseId,count,reps,load,rpe])=>({exerciseId,sets:Array.from({length:count},()=>({reps,load,loadUnit:'lbs',rpe}))})),readiness:4,pain:false,notes:'completed before rule edit'});
 await api('demo','POST',{role:'coach'});
 const personalized=structuredClone(assigned.plan[2].sessions[0].exercises);personalized[0].reps=9;
 await api('assignment','PUT',{id:assigned.id,week:3,session:0,exercises:personalized});
 const changed=structuredClone(program);changed.progressionOptions={method:'westside',rules:{'0:0:bench':{mode:'adaptive',minPercent:5,maxPercent:10}}};
 await api('programs','POST',changed);
 await api('demo','POST',{role:'athlete'});const data=await api('data'),after=data.assignments.find(a=>a.id===assigned.id);
 assert.equal(after.plan[0].sessions[0].prescriptionRevision||0,0);
 assert.equal(after.plan[1].sessions[0].prescriptionRevision,1);
 assert.equal(after.plan[2].sessions[0].prescriptionRevision,2);
 assert.equal(after.plan[2].sessions[0].exercises[0].reps,9);
 assert.equal(data.logs.find(l=>l.id===completed.id).exercises[0].sets[0].load,180);
 await assert.rejects(api('log','POST',{assignmentId:assigned.id,week:2,session:0,prescriptionRevision:0,exercises:after.plan[1].sessions[0].exercises.map(e=>({exerciseId:e.exerciseId,sets:Array.from({length:e.sets},()=>({load:100,loadUnit:'lbs',reps:e.reps,rpe:7}))})),readiness:4,pain:false,notes:''}),/updated this workout/i);
 assert.equal((await api('data')).logs.some(l=>l.assignmentId===assigned.id&&l.week===2),false);
});

test('phone Week 1 actuals reach Week 2 assignment payload and coach edits preserve completed history',async()=>{
 const api=store();await api('demo','POST',{role:'coach'});
 const program=await api('programs','POST',{name:'Phone progression',goal:'Strength',weeks:4,plan:plan(),progressionOptions:{method:'westside',rules:Object.fromEntries(['bench','lat-pulldown','leg-extension'].map((id,i)=>[`0:${i}:${id}`,{mode:'adaptive',minPercent:5,maxPercent:10}]))}});
 const assigned=await api('assign','POST',{programId:program.id,athleteId:'jordan',startDate:'2026-10-12'});
 await api('demo','POST',{role:'athlete'});
 const completed=await api('log','POST',{assignmentId:assigned.id,week:1,session:0,exercises:[['bench',5,5,180,9],['lat-pulldown',4,6,150,8],['leg-extension',3,12,70,7]].map(([exerciseId,count,reps,load,rpe])=>({exerciseId,sets:Array.from({length:count},()=>({reps,load,loadUnit:'lbs',rpe}))})),readiness:4,pain:false,notes:''});
 const athleteData=await api('data');const payload=athleteData.assignments.find(a=>a.id===assigned.id),rec=payload.recommendations['2:0'];
 assert.equal(payload.plan[1].sessions[0].exercises[0].loadMode,'athlete_selected');
 assert.equal(rec[0][0].status,'recommended');assert.ok(rec[0][0].load>=180);
 assert.equal(rec[1][0].status,'recommended');assert.ok(rec[1][0].load>=150);
 assert.equal(rec[2][0].status,'unavailable');assert.match(rec[2][0].reason,/qualifying performance/i);
 await api('demo','POST',{role:'coach'});
 const changed=structuredClone(program);changed.plan[0].sessions[0]=session([8,6,12]);changed.plan[1].sessions[0]=session([6,8,12]);
 await api('programs','POST',changed);
 await api('demo','POST',{role:'athlete'});
 const updated=await api('data'),after=updated.assignments.find(a=>a.id===assigned.id),history=updated.logs.find(l=>l.id===completed.id);
 assert.equal(after.plan[0].sessions[0].exercises[0].reps,5);
 assert.equal(after.plan[1].sessions[0].exercises[0].reps,6);
 assert.equal(after.plan[1].sessions[0].exercises[1].reps,8);
 assert.equal(history.exercises[0].sets[0].load,180);
 assert.equal(history.exercises[0].target.reps,5);
 assert.equal(after.recommendations['2:0'][0][0].status,'recommended');
 assert.notEqual(after.recommendations['2:0'][0][0].load,rec[0][0].load);
 await assert.rejects(api('log','POST',{assignmentId:assigned.id,week:2,session:0,prescriptionRevision:0,exercises:[],readiness:4,pain:false,notes:''}),/updated this workout/i);
});

test('AMRAP assessment modes and EMOM interval modes store structured scores and compare compatible results',()=>{
 const movement={exerciseId:'bench',reps:10,load:20,loadUnit:'lbs'};
 const base={name:'Wall Ball Assessment',scoreType:'AMRAP',durationSeconds:120,repScheme:[],movements:[movement],notes:''};
 for(const [scoreMode,input,key] of [['rounds_reps',{rounds:7,reps:12},'rounds'],['total_reps',{totalReps:147},'totalReps'],['rounds',{rounds:8},'rounds']]){
  const metcon=prepareMetcon({...base,scoreMode},library),score=prepareMetconScore({rx:'RX',...input},metcon);
  assert.equal(score[key],input[key]);assert.equal(score.scoreMode,scoreMode);
  assert.throws(()=>prepareMetconScore({rx:'RX'},metcon));
  assert.notEqual(metconKey(metcon),metconKey(prepareMetcon({...base,scoreMode:scoreMode==='rounds'?'total_reps':'rounds'},library)));
 }
 const emomBase={...base,name:'EMOM Assessment',scoreType:'EMOM',durationSeconds:720,intervalSeconds:60,movements:[{exerciseId:'bench',reps:10,minute:1}]};
 for(const [scoreMode,input,key] of [['completed_intervals',{successfulIntervals:10},'successfulIntervals'],['total_reps',{totalReps:110},'totalReps'],['completion',{completed:true},'completed'],['per_interval',{intervalResults:Array.from({length:12},(_,i)=>({completed:i<10,reps:10}))},'intervalResults']]){
  const metcon=prepareMetcon({...emomBase,scoreMode},library),score=prepareMetconScore({rx:'RX',...input},metcon);
  assert.deepEqual(score[key],input[key]);assert.throws(()=>prepareMetconScore({rx:'RX'},metcon));
 }
 assert.deepEqual(scoreFields('AMRAP',null,'total_reps'),['totalReps']);
 assert.deepEqual(scoreFields('EMOM',null,'completed_intervals'),['successfulIntervals','load']);
 const metcon=prepareMetcon({...base,scoreMode:'total_reps'},library),logs=[120,147].map((totalReps,i)=>({id:String(i),athleteId:'jordan',workoutDate:`2026-10-0${i+1}`,blockResults:[{metcon,score:{rx:'RX',totalReps}}]}));
 assert.equal(metconStats(logs,'jordan',metconKey(metcon)).improvement,27);
});

test('AI v2 draft accepts score-specific AMRAP and EMOM without irrelevant generic fields',()=>{
 const draft=createFixture();draft.schemaVersion=2;
 const amrap={name:'Wall Ball Assessment',scoreType:'AMRAP',scoreMode:'total_reps',durationSeconds:120,repScheme:[],movements:[{exerciseId:'bench',exerciseName:'Bench Press',reps:10}],notes:''};
 const emom={name:'EMOM Assessment',scoreType:'EMOM',scoreMode:'completed_intervals',durationSeconds:600,intervalSeconds:60,repScheme:[],movements:[{exerciseId:'bench',exerciseName:'Bench Press',reps:10,minute:1}],notes:''};
 for(const week of draft.program.plan)for(const session of week.sessions){session.exercises=[];session.blocks=[{id:'a',type:'Metcon',name:'Assessment',metcon:amrap},{id:'e',type:'Metcon',name:'Assessment',metcon:emom}];}
 const review=validateDraft(draft,library);assert.equal(review.canApprove,true,JSON.stringify(review.findings.filter(f=>f.severity==='error')));
});
