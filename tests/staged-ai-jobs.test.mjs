import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createFixture,FIXTURE_REQUIREMENTS} from '../shared/ai/fixtures.mjs';
import {openStore} from '../server/store.mjs';
import {createGenerationJobs} from '../server/ai/generation-jobs.mjs';
import {createReview,approveReview} from '../shared/ai/draft-state.mjs';
import {exercises} from '../server/seed.mjs';

const base=createFixture();
const outline={schemaVersion:1,program:Object.fromEntries(Object.entries(base.program).filter(([key])=>key!=='plan')),trainingDays:base.program.plan[0].sessions.map(s=>({day:s.day,focus:s.name})),weekProgression:base.program.plan.map(w=>({week:w.week,focus:'Strength',progressionInstructions:'Review completed sets and progress within coach guardrails.'})),assumptions:[],questions:[]};
const oneWeek=number=>{const value=structuredClone(base.program.plan[0]);value.week=number;for(const s of value.sessions)s.blocks=[];value.sessions[3].exercises[1]={...value.sessions[3].exercises[1],exerciseId:'row',exerciseName:'Bent-over Barbell Row',loadMode:'athlete_selected'};return value;};
const fixture=()=>({outline,weeks:[1,2,3,4].map(oneWeek)});
const request={request:'Create a four-week strength program with four days each week. Bench twice, squat twice and deadlift once.',requirements:{...FIXTURE_REQUIREMENTS,programWeeks:4}};
const key=n=>`stage-test-${n}`;
test('staged tables are added to an existing SQLite store without altering saved records',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-stage-migration-')),path=join(dir,'existing.sqlite');
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const initial=openStore(path,true),saved={id:'existing-history',athleteId:'jordan',notes:'Preserve this recorded result'};
  initial.put('log',saved,'jordan');
  assert.equal(initial.db.prepare("SELECT name FROM sqlite_master WHERE name='ai_generation_jobs'").get(),undefined);
  initial.db.close();
  const reopened=openStore(path,true),service=createGenerationJobs({db:reopened.db,staged:{status:()=>({available:true})},library:()=>reopened.all('exercise'),athleteFor:()=>null});
  assert.deepEqual(service.list('coach'),[]);
  assert.deepEqual(reopened.get('log',saved.id),saved);
  assert.ok(reopened.db.prepare("SELECT name FROM sqlite_master WHERE name='ai_generation_jobs'").get());
  assert.ok(reopened.db.prepare("SELECT name FROM sqlite_master WHERE name='ai_generation_attempts'").get());
  reopened.db.close();
});
async function freePort(){const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
async function start(port,dbPath,fixturePath,deadlineMs){
  const child=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:dbPath,AI_TEST_FIXTURE:fixturePath,AI_STAGED_CALLS_PER_HOUR:'30',...(deadlineMs?{AI_TEST_DEADLINE_MS:String(deadlineMs)}:{})},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  for(let i=0;i<120&&!output.includes('Iron Heart Strength:')&&child.exitCode===null;i++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.match(output,/Iron Heart Strength:/);
  return child;
}
async function stop(child){if(child?.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}}
async function call(port,token,path,{method='GET',data,idempotencyKey,signal}={}){
  const response=await fetch(`http://127.0.0.1:${port}/api${path}`,{method,signal,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,body:await response.json()};
}
async function login(port,role='coach'){const result=await call(port,null,'/demo',{method:'POST',data:{role,native:true}});assert.equal(result.status,200);return result.body.token;}
async function waitStatus(port,token,id,status){for(let i=0;i<100;i++){const result=await call(port,token,`/ai/jobs/${id}`);if(result.body.status===status)return result.body;await new Promise(resolve=>setTimeout(resolve,30));}assert.fail(`Job did not reach ${status}.`);}

test('staged job API creates, authorizes, advances, and exposes only a fully validated draft',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-stage-api-')),port=await freePort(),dbPath=join(dir,'jobs.sqlite'),fixturePath=join(dir,'fixture.json');
  await writeFile(fixturePath,JSON.stringify({...fixture(),testUsage:{input_tokens:100,output_tokens:50,total_tokens:150},testTiming:{headersMs:8,bodyMs:2,totalMs:10}}));const server=await start(port,dbPath,fixturePath);
  t.after(async()=>{await stop(server);await rm(dir,{recursive:true,force:true});});
  const coach=await login(port),athlete=await login(port,'athlete');
  const otherStore=openStore(dbPath,true);otherStore.addUser('other-coach','other-stage@example.test','Other Coach','coach','synthetic-test-password-1234');otherStore.db.close();
  const otherLogin=await call(port,null,'/login',{method:'POST',data:{email:'other-stage@example.test',password:'synthetic-test-password-1234',native:true}});assert.equal(otherLogin.status,200);const other=otherLogin.body.token;
  const created=await call(port,coach,'/ai/jobs',{method:'POST',data:request,idempotencyKey:key('create')});assert.equal(created.status,200);const id=created.body.id;
  assert.equal(created.body.status,'pending');assert.deepEqual(created.body.completedWeeks,[]);assert.equal(created.body.completeDraft,undefined);
  assert.equal((await call(port,coach,'/ai/jobs')).body[0].id,id);
  assert.equal((await call(port,athlete,'/ai/jobs')).status,403);
  assert.equal((await call(port,other,'/ai/jobs')).body.some(job=>job.id===id),false);
  assert.equal((await call(port,coach,'/ai/jobs',{method:'POST',data:request,idempotencyKey:key('create')})).body.id,id);
  assert.equal((await call(port,coach,'/ai/jobs',{method:'POST',data:{...request,request:request.request+' Extra.'},idempotencyKey:key('create')})).status,409);
  assert.equal((await call(port,athlete,`/ai/jobs/${id}`)).status,403);
  assert.equal((await call(port,other,`/ai/jobs/${id}`)).status,404);
  const outlined=await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('outline')});assert.equal(outlined.status,200);assert.equal(outlined.body.outline.program.weeks,4);
  assert.equal(outlined.body.attempts[0].metadata.usage[0].total_tokens,150);
  assert.equal(outlined.body.attempts[0].metadata.timings[0].headersMs,8);
  assert.equal(JSON.stringify(outlined.body.attempts[0].metadata).includes(request.request),false);
  assert.equal((await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('outline')})).body.attempts.length,1);
  const first=await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('week-1')});assert.equal(first.status,200);assert.deepEqual(first.body.completedWeeks,[1]);assert.equal(first.body.completeDraft,undefined);
  const incomplete={...base,program:{...base.program,plan:base.program.plan.slice(0,1)}};
  assert.throws(()=>approveReview(createReview(incomplete),exercises,request.requirements,{coachId:'coach'}),/Resolve all errors/);
  const approval=await call(port,coach,'/ai/approve',{method:'POST',data:{review:createReview(incomplete),requirements:request.requirements}});assert.equal(approval.status,400);
  for(let number=2;number<=4;number++){const step=await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key(`week-${number}`)});assert.equal(step.status,200);assert.deepEqual(step.body.completedWeeks,Array.from({length:number},(_,i)=>i+1));}
  const complete=(await call(port,coach,`/ai/jobs/${id}`)).body;assert.equal(complete.status,'complete');assert.equal(complete.completeDraft.draft.program.plan.length,4);assert.equal(complete.completeDraft.validation.canApprove,true);
  assert.equal((await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('week-4')})).body.attempts.length,5);
  assert.equal((await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('extra')})).status,409);
});

test('staged job API records provider timeout and permits bounded retry',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-stage-timeout-')),port=await freePort(),dbPath=join(dir,'jobs.sqlite'),fixturePath=join(dir,'fixture.json');
  await writeFile(fixturePath,JSON.stringify({...fixture(),delayStage:'outline',delayMs:500}));const server=await start(port,dbPath,fixturePath,30);
  t.after(async()=>{await stop(server);await rm(dir,{recursive:true,force:true});});
  const coach=await login(port),created=await call(port,coach,'/ai/jobs',{method:'POST',data:request,idempotencyKey:key('timeout-create')}),id=created.body.id;
  const timed=await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('timeout-outline')});assert.equal(timed.status,504);assert.equal(timed.body.code,'PROVIDER_TIMEOUT');
  const failed=(await call(port,coach,`/ai/jobs/${id}`)).body;assert.equal(failed.status,'failed');assert.equal(failed.lastFailure.code,'PROVIDER_TIMEOUT');assert.deepEqual(failed.completedWeeks,[]);
  await writeFile(fixturePath,JSON.stringify(fixture()));
  const retry=await call(port,coach,`/ai/jobs/${id}/retry`,{method:'POST',idempotencyKey:key('timeout-retry')});assert.equal(retry.status,200);assert.equal(retry.body.status,'ready');assert.equal(retry.body.attempts.length,2);
});

test('invalid outline stores field diagnostics without storing provider prose in the failure',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-stage-diagnostics-')),port=await freePort(),dbPath=join(dir,'jobs.sqlite'),fixturePath=join(dir,'fixture.json');
  const bad=structuredClone(fixture());bad.outline.program.progressionInstructions='';bad.outline.trainingDays[0].focus=42;
  await writeFile(fixturePath,JSON.stringify(bad));const server=await start(port,dbPath,fixturePath);
  t.after(async()=>{await stop(server);await rm(dir,{recursive:true,force:true});});
  const coach=await login(port),created=await call(port,coach,'/ai/jobs',{method:'POST',data:request,idempotencyKey:key('diagnostic-create')});
  const failed=await call(port,coach,`/ai/jobs/${created.body.id}/next`,{method:'POST',idempotencyKey:key('diagnostic-outline')});
  assert.equal(failed.status,422);assert.equal(failed.body.code,'STAGED_VALIDATION_FAILED');assert.equal(failed.body.diagnostics.stage,'outline');
  assert.ok(failed.body.diagnostics.findings.some(f=>f.path==='/program/progressionInstructions'&&f.received==='empty string'));
  assert.ok(failed.body.diagnostics.findings.some(f=>f.path==='/trainingDays/0/focus'&&f.received===42));
  const job=(await call(port,coach,`/ai/jobs/${created.body.id}`)).body;
  assert.equal(job.status,'failed');assert.deepEqual(job.completedWeeks,[]);
  assert.deepEqual(job.lastFailure.findings,failed.body.diagnostics.findings);
  assert.equal(job.attempts[0].metadata.validation.stage,'outline');
  assert.equal(JSON.stringify(job.lastFailure).includes(request.request),false);
});

test('staged job API retries only the failed week, survives disconnect and restart, and honors explicit cancel',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-stage-recovery-')),port=await freePort(),dbPath=join(dir,'jobs.sqlite'),fixturePath=join(dir,'fixture.json');
  const bad=fixture();bad.weeks[1].sessions.pop();await writeFile(fixturePath,JSON.stringify(bad));let server=await start(port,dbPath,fixturePath);
  t.after(async()=>{await stop(server);await rm(dir,{recursive:true,force:true});});
  const coach=await login(port),created=await call(port,coach,'/ai/jobs',{method:'POST',data:request,idempotencyKey:key('recover-create')}),id=created.body.id;
  assert.equal((await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('recover-outline')})).status,200);
  const first=await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('recover-week1')});assert.equal(first.status,200);
  const failed=await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('recover-week2')});assert.equal(failed.status,422);
  let state=(await call(port,coach,`/ai/jobs/${id}`)).body;assert.equal(state.status,'failed');assert.equal(state.lastFailure.code,'STAGED_VALIDATION_FAILED');assert.deepEqual(state.completedWeeks,[1]);
  assert.equal((await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('wrong-action')})).status,409);
  await writeFile(fixturePath,JSON.stringify(fixture()));
  const retried=await call(port,coach,`/ai/jobs/${id}/retry`,{method:'POST',idempotencyKey:key('retry-week2')});assert.equal(retried.status,200);assert.deepEqual(retried.body.completedWeeks,[1,2]);assert.deepEqual(retried.body.validatedWeeks[0],first.body.validatedWeeks[0]);
  await writeFile(fixturePath,JSON.stringify({...fixture(),delayStage:'week:3',delayMs:2000}));
  const disconnected=new AbortController();const pending=call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('disconnect-week3'),signal:disconnected.signal}).catch(e=>e);
  await waitStatus(port,coach,id,'running');
  const duplicate=await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('disconnect-week3')});assert.equal(duplicate.status,200);assert.equal(duplicate.body.attempts.length,5);
  assert.equal((await call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('overlap-week3')})).status,429);
  disconnected.abort();await pending;
  state=await waitStatus(port,coach,id,'interrupted');assert.deepEqual(state.completedWeeks,[1,2]);assert.equal(state.lastFailure.code,'CLIENT_DISCONNECTED');
  await writeFile(fixturePath,JSON.stringify(fixture()));
  const resumed=await call(port,coach,`/ai/jobs/${id}/resume`,{method:'POST',idempotencyKey:key('resume-week3')});assert.equal(resumed.status,200);assert.deepEqual(resumed.body.completedWeeks,[1,2,3]);
  await writeFile(fixturePath,JSON.stringify({...fixture(),delayStage:'week:4',delayMs:3000}));
  const crashed=call(port,coach,`/ai/jobs/${id}/next`,{method:'POST',idempotencyKey:key('crash-week4')}).catch(e=>e);
  await waitStatus(port,coach,id,'running');await stop(server);await crashed;
  await writeFile(fixturePath,JSON.stringify(fixture()));server=await start(port,dbPath,fixturePath);
  state=(await call(port,coach,`/ai/jobs/${id}`)).body;assert.equal(state.status,'interrupted');assert.deepEqual(state.completedWeeks,[1,2,3]);assert.equal(state.attempts.at(-1).reason,'SERVER_RESTART');
  const finished=await call(port,coach,`/ai/jobs/${id}/resume`,{method:'POST',idempotencyKey:key('resume-week4')});assert.equal(finished.status,200);assert.equal(finished.body.status,'complete');assert.deepEqual(finished.body.completedWeeks,[1,2,3,4]);
  const cancelJob=await call(port,coach,'/ai/jobs',{method:'POST',data:request,idempotencyKey:key('cancel-create')});assert.equal(cancelJob.status,200);
  await writeFile(fixturePath,JSON.stringify({...fixture(),delayStage:'outline',delayMs:2000}));
  const cancelPending=call(port,coach,`/ai/jobs/${cancelJob.body.id}/next`,{method:'POST',idempotencyKey:key('cancel-outline')}).catch(e=>e);
  await waitStatus(port,coach,cancelJob.body.id,'running');
  const canceled=await call(port,coach,`/ai/jobs/${cancelJob.body.id}/cancel`,{method:'POST'});assert.equal(canceled.status,200);assert.equal(canceled.body.status,'cancelled');await cancelPending;
  assert.equal((await call(port,coach,`/ai/jobs/${cancelJob.body.id}/resume`,{method:'POST',idempotencyKey:key('cancel-resume')})).status,409);
});
