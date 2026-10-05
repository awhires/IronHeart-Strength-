import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createLocalDemo} from '../src/local-demo.mjs';
import {createFixture,FIXTURE_REQUIREMENTS as requirements} from '../shared/ai/fixtures.mjs';
import {createReview,approveReview,editReview} from '../shared/ai/draft-state.mjs';
import {toIronHeartProgram} from '../shared/ai/convert.mjs';

async function exercisePipeline(api){
  const library=(await api('data')).exercises,initial=await api('data'),source=initial.programs[0];
  const first=createFixture('percentage').program.plan[0].sessions[0].exercises[0];
  const items=[first,{...first,loadMode:'percentage',load:null,reference1RM:null},{...first,exerciseId:'pullup',exerciseName:'Pull-up',loadMode:'bodyweight',load:null,percent1RM:null,reference1RM:null,effortMode:'none',rpe:null},{...first,exerciseId:'row',exerciseName:'Bent-over Barbell Row',loadMode:'athlete_selected',load:null,percent1RM:null,reference1RM:null,effortMode:'rir',rpe:null,rir:2,tempo:'3-1-X-0',progressionInstructions:'Review next week.'},{...first,loadMode:'fixed',loadUnit:'kg',load:80,percent1RM:null,reference1RM:null}];
  const plan=Array.from({length:4},(_,i)=>({week:i+1,sessions:[{name:'Mixed targets',day:1,coachNotes:'Session instructions',exercises:structuredClone(items)}]}));
  const manual=await api('programs','POST',{name:'Rich targets',goal:'Build strength',weeks:4,description:'Integration test',coachNotes:'Program instructions',progressionInstructions:'Review each week.',sessions:plan[0].sessions,plan});
  const fetched=(await api('data')).programs.find(p=>p.id===manual.id);assert.deepEqual(fetched.plan,plan);
  const assigned=await api('assign','POST',{programId:manual.id,athleteId:'jordan',startDate:'2026-10-05'});
  assert.deepEqual(assigned.plan,plan);assert.equal(assigned.coachNotes,manual.coachNotes);
  await api('demo','POST',{role:'athlete',native:true});
  await assert.rejects(api('ai/approve','POST',{}));
  const assignedForAthlete=(await api('data')).assignments.find(a=>a.id===assigned.id);assert.deepEqual(assignedForAthlete.plan,plan);
  const payload={assignmentId:assigned.id,week:1,session:0,readiness:4,pain:false,notes:'Actual results',exercises:items.map(e=>({exerciseId:e.exerciseId,sets:Array.from({length:e.sets},()=>({load:e.loadMode==='bodyweight'?0:e.loadUnit==='kg'?70:155,loadUnit:e.loadUnit,reps:4,rpe:e.effortMode==='rpe'?8:null}))}))};
  const log=await api('log','POST',payload);assert.deepEqual(log.exercises.map(e=>e.target),items);assert.equal(log.exercises[0].sets[0].load,155);assert.equal(log.exercises[0].target.load,null);
  await api('demo','POST',{role:'coach',native:true});
  const updated=structuredClone(items);updated[0].percent1RM=70;updated[3].rir=3;
  await api('assignment','PUT',{id:assigned.id,week:1,session:0,exercises:updated});
  const afterEdit=await api('data');assert.deepEqual(afterEdit.logs.find(l=>l.id===log.id).exercises.map(e=>e.target),items);assert.deepEqual(afterEdit.programs.find(p=>p.id===manual.id).plan,plan);
  // A legacy program still saves, assigns and records actual performance.
  const old={exerciseId:'bench',sets:2,reps:5,load:185,rpe:8,rest:120,increment:5,notes:''};
  const legacy=await api('programs','POST',{name:'Legacy',weeks:4,goal:'Strength',description:'',sessions:[{name:'Legacy day',day:1,exercises:[old]}]});
  assert.equal(legacy.sessions[0].exercises[0].loadMode,'fixed');
  const legacyAssignment=await api('assign','POST',{programId:legacy.id,athleteId:'jordan',startDate:'2026-10-05'});
  await api('demo','POST',{role:'athlete',native:true});
  const legacyLog=await api('log','POST',{...payload,assignmentId:legacyAssignment.id,exercises:[{exerciseId:'bench',sets:[{load:185,reps:5,rpe:7},{load:185,reps:5,rpe:8}]}]});
  assert.equal(legacyLog.exercises[0].target.loadMode,'fixed');assert.equal(legacyLog.exercises[0].sets[0].loadUnit,'lbs');
  await api('demo','POST',{role:'coach',native:true});
  const draft=createFixture();draft.sourceProgramId=source.id;
  const unapproved={review:createReview(draft),requirements};await assert.rejects(api('ai/approve','POST',unapproved));await assert.rejects(api('ai/programs','POST',unapproved));
  const review=approveReview(createReview(draft),library,requirements,{coachId:'coach'}),input={review,requirements};
  const {receipt}=await api('ai/approve','POST',input);
  await assert.rejects(api('ai/programs','POST',{...input,receipt,review:editReview(review,d=>{d.program.name='Edited';})}));
  const countBefore=(await api('data')).assignments.length;
  const saved=await api('ai/programs','POST',{...input,receipt});assert.notEqual(saved.id,source.id);assert.equal(saved.aiProvenance.sourceProgramId,source.id);
  assert.equal((await api('data')).assignments.length,countBefore);
  assert.equal((await api('ai/programs','POST',{...input,receipt})).id,saved.id);
  const exactPlan=toIronHeartProgram(review,library,requirements).plan;assert.deepEqual(saved.plan,exactPlan);
  const aiAssignment=await api('assign','POST',{programId:saved.id,athleteId:'jordan',startDate:'2026-10-05'});assert.deepEqual(aiAssignment.plan,exactPlan);
  assert.deepEqual((await api('data')).programs.find(p=>p.id===source.id),source);
  const edited=structuredClone(saved);edited.plan[1].sessions[0].exercises[0].sets=4;
  const resaved=await api('programs','POST',edited);assert.equal(resaved.plan[1].sessions[0].exercises[0].sets,4);assert.deepEqual((await api('data')).assignments.find(a=>a.id===aiAssignment.id).plan,exactPlan);
}

test('phone rich prescription persistence, assignments, history and approved AI save pipeline',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},api=createLocalDemo(storage);
  await api('demo','POST',{role:'coach'});
  const before=storage.getItem('iron-heart-phone-preview-v1');await api('data');assert.equal(storage.getItem('iron-heart-phone-preview-v1'),before);
  await exercisePipeline(api);
  const reopened=await createLocalDemo(storage)('data');assert.ok(reopened.programs.some(p=>p.aiProvenance));
});

test('live SQLite rich prescription persistence, assignments, history and approved AI save pipeline',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'iron-heart-rich-')),dbPath=join(dir,'test.sqlite');
  const child=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4187',DEMO_MODE:'true',DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  t.after(async()=>{if(child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true});});
  for(let i=0;i<100&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.ok(output.includes('Iron Heart Strength:'),output);
  let token='';const api=async(path,method='GET',body)=>{const response=await fetch('http://localhost:4187/api/'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error);if(data.token)token=data.token;return data;};
  await api('demo','POST',{role:'coach',native:true});
  const db=new DatabaseSync(dbPath,{readOnly:true});try{const before=db.prepare("SELECT body FROM records WHERE kind='program' ORDER BY id").all();await api('data');assert.deepEqual(db.prepare("SELECT body FROM records WHERE kind='program' ORDER BY id").all(),before);}finally{db.close();}
  await exercisePipeline(api);
});
