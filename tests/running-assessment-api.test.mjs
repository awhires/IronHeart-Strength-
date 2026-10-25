import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runningAssessments} from '../shared/running-analytics.mjs';
import {benchmarkWorkoutDraft} from '../shared/phase3.mjs';

test('six-minute assessment survives API save, retry, correction and athlete isolation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-running-assessment-')),port='4294',child=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:port,HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:join(dir,'test.sqlite'),AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
 t.after(async()=>{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}await rm(dir,{recursive:true,force:true});});for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 const req=async(path,method='GET',body,token)=>{const response=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 const coach=(await req('demo','POST',{role:'coach',native:true})).data.token,athlete=(await req('demo','POST',{role:'athlete',native:true})).data.token;
 const library=(await req('data','GET',null,coach)).data.exercises,run=library.find(e=>e.trackingType==='running'&&/outdoor/i.test(e.name))||library.find(e=>e.trackingType==='running');assert.ok(run);
 const saved=await req('programs','POST',{name:'Running assessment',goal:'General performance',weeks:1,description:'',sessions:[{name:'Six-minute run',day:1,exercises:[{exerciseId:run.id,trackingType:'running',intervalCount:1,metrics:{durationSeconds:360,distanceUnit:'m'}}]}]},coach);assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.equal((await req('assign','POST',{programId:saved.data.id,athleteId:'jordan',startDate:'2030-02-04'},coach)).status,200);
 const benchmark=await req('benchmarks','POST',{programId:saved.data.id,week:1,session:0,name:'Six-minute maximal run',scoring:{type:'greatest_distance',exerciseId:run.id,durationSeconds:360,protocol:'six_minute_max_run'}},coach);assert.equal(benchmark.status,200,JSON.stringify(benchmark.data));
 const draft=benchmarkWorkoutDraft(benchmark.data,library);assert.equal(draft.assessmentProtocol,'six_minute_max_run');
 const payload={sessionName:draft.sessionName,workoutDate:'2030-02-05',notes:'Felt steady',benchmarkId:benchmark.data.id,benchmarkAttemptId:draft.benchmarkAttemptId,assessmentMaximal:true,blocks:draft.blocks,exercises:[{exerciseId:run.id,target:draft.exercises[0].target,sets:[{distance:1500,distanceUnit:'m',durationSeconds:360,completed:true}]}]};
 const first=await req('tracker','POST',payload,athlete);assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.assessmentMaximal,true);
 const duplicate=await req('tracker','POST',payload,athlete);assert.equal(duplicate.status,200);assert.equal(duplicate.data.id,first.data.id);
 const data=(await req('data','GET',null,athlete)).data,rows=runningAssessments(data.logs,data.savedBenchmarks,library,'jordan');assert.equal(rows.length,1);assert.equal(rows[0].qualified,true);assert.equal(rows[0].velocityMps,1500/360);
 assert.equal((await req('tracker','POST',{...payload,benchmarkAttemptId:crypto.randomUUID(),assessmentMaximal:'yes'},athlete)).status,400);
 const corrected=await req('log-edit','POST',{id:first.data.id,expectedUpdatedAt:first.data.updatedAt||first.data.createdAt,notes:'Corrected distance',assessmentMaximal:false,exercises:[{exerciseId:run.id,target:draft.exercises[0].target,sets:[{distance:1550,distanceUnit:'m',durationSeconds:360,completed:true}]}],blockResults:[]},athlete);assert.equal(corrected.status,200,JSON.stringify(corrected.data));assert.equal(corrected.data.id,first.data.id);assert.equal(corrected.data.assessmentMaximal,false);assert.equal(corrected.data.editHistory.length,1);
 const after=runningAssessments((await req('data','GET',null,athlete)).data.logs,[benchmark.data],library,'jordan');assert.equal(after.length,1);assert.equal(after[0].qualified,false);assert.equal(runningAssessments([corrected.data],[benchmark.data],library,'another').length,0);
});
