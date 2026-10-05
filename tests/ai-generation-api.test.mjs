import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {createLocalDemo} from '../src/local-demo.mjs';

test('authenticated generation endpoint returns unsaved drafts, preserves records and never returns server credentials',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'iron-heart-generation-')),fixture=join(dir,'response.json'),secret='server-only-test-key';
  await writeFile(fixture,JSON.stringify(createFixture()));
  const child=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4189',DEMO_MODE:'true',DB_PATH:join(dir,'test.sqlite'),AI_TEST_FIXTURE:fixture,OPENAI_API_KEY:secret,AI_REQUESTS_PER_HOUR:'30',AI_DEBUG:'true'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  t.after(async()=>{if(child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true});});
  for(let i=0;i<100&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.ok(output.includes('Iron Heart Strength:'),output);
  const api=async(path,method='GET',body,token)=>{const r=await fetch('http://localhost:4189/api/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.ok(!JSON.stringify(data).includes(secret));return {status:r.status,data};};
  const input={request:'Create four weeks of strength training, four days per week.',athleteId:'jordan',requirements:{programWeeks:4,trainingDaysPerWeek:4}};
  assert.equal((await api('ai/program-draft','POST',input)).status,401);
  const coach=(await api('demo','POST',{role:'coach',native:true})).data.token,athlete=(await api('demo','POST',{role:'athlete',native:true})).data.token;
  assert.equal((await api('ai/status','GET',null,athlete)).status,403);assert.equal((await api('ai/program-draft','POST',input,athlete)).status,403);
  assert.equal((await api('ai/status','GET',null,coach)).data.available,true);
  const before=(await api('data','GET',null,coach)).data;
  const first=await api('ai/program-draft','POST',input,coach);assert.equal(first.status,200);assert.equal(first.data.draft.originalRequest,input.request);assert.equal(first.data.draft.status,'draft');assert.ok(first.data.debug);
  const second=await api('ai/program-draft','POST',input,coach);assert.notEqual(first.data.generationId,second.data.generationId);
  assert.deepEqual((await api('data','GET',null,coach)).data,before);
  assert.equal((await api('ai/program-draft','POST',{...input,athleteId:'coach'},coach)).status,400);
  await writeFile(fixture,JSON.stringify({prose:'invalid'}));const failed=await api('ai/program-draft','POST',input,coach);assert.equal(failed.status,502);assert.equal(failed.data.code,'CONTRACT_MISMATCH');assert.match(failed.data.error,/No program was changed or saved/);
  assert.deepEqual((await api('data','GET',null,coach)).data,before);
  assert.ok(!output.includes(secret));
});
test('standalone phone preview clearly disables live generation and keeps existing data unchanged',async()=>{
  const values=new Map(),api=createLocalDemo({getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)});await api('demo','POST',{role:'coach'});
  const before=await api('data');assert.equal((await api('ai/status')).available,false);
  await assert.rejects(api('ai/program-draft','POST',{request:'Build a program'}),/hosted Iron Heart server/);assert.deepEqual(await api('data'),before);
});
