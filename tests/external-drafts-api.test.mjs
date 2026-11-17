import {createExternalDraftInbox} from '../server/external-drafts.mjs';
import {chatGPTWorkoutImportEnvelope} from '../shared/chatgpt-workout-import.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../server/store.mjs';
import {createFixture} from '../shared/ai/fixtures.mjs';
import {createReview,approveReview} from '../shared/ai/draft-state.mjs';
import {prepareMetcon} from '../shared/workout-blocks.mjs';

test('external draft table initializes additively in an existing SQLite database',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'iron-heart-existing-db-')),path=join(dir,'existing.sqlite');
  try{
    const original=openStore(path,true);original.put('log',{id:'existing-history',result:'preserved'},'jordan');createExternalDraftInbox({db:original.db,library:()=>original.all('exercise')});original.db.exec('DROP TABLE external_drafts');original.db.close();
    const migrated=openStore(path,true);createExternalDraftInbox({db:migrated.db,library:()=>migrated.all('exercise')});assert.deepEqual(migrated.get('log','existing-history'),{id:'existing-history',result:'preserved'});
    assert.equal(migrated.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='external_drafts'").get().name,'external_drafts');migrated.db.close();
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('isolated structured workout submission persists, stays coach-owned, and requires review before saving',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'iron-heart-external-draft-')),dbPath=join(dir,'test.sqlite'),base='http://127.0.0.1:4291';
  const store=openStore(dbPath,true);store.addUser('other-coach','other@example.test','Other Coach','coach','test-password-123456');store.db.close();
  const serverOptions={env:{...process.env,PORT:'4291',HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:dbPath,AI_ENABLED:'false',DRAFT_INBOX_ENABLED:'true'},stdio:['ignore','pipe','pipe']};
  let child=spawn(process.execPath,['server/index.mjs','--test-server'],serverOptions);
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  t.after(async()=>{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}await rm(dir,{recursive:true,force:true});});
  for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
  const request=async(path,method='GET',body,token,key)=>{const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
  const coach=(await request('demo','POST',{role:'coach',native:true})).data.token;
  const athlete=(await request('demo','POST',{role:'athlete',native:true})).data.token;
  const other=(await request('login','POST',{email:'other@example.test',password:'test-password-123456',native:true})).data.token;
  const draft=createFixture();draft.schemaVersion=2;draft.program.name='ChatGPT Bench and Row';draft.program.weeks=1;draft.program.plan=[{week:1,sessions:[{...draft.program.plan[0].sessions[0],blocks:[]}]}];
  const before=(await request('data','GET',null,coach)).data;
  assert.equal((await request('external-drafts','POST',{draft},null,'workout-001')).status,401);
  assert.equal((await request('external-drafts','POST',{draft},athlete,'workout-001')).status,403);
  assert.equal((await request('external-drafts','GET',null,athlete)).status,403);
  assert.equal((await request('external-drafts','POST',{draft},coach)).status,400);
  assert.equal((await request('external-drafts','POST',{draft:{...draft,schemaVersion:1}},coach,'wrong-schema-001')).status,422);
  const first=await request('external-drafts','POST',{draft},coach,'workout-001');assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.status,'draft');assert.equal(first.data.reviewPath,`/?draft=${first.data.id}`);
  const repeat=await request('external-drafts','POST',{draft},coach,'workout-001');assert.equal(repeat.data.id,first.data.id);assert.equal(repeat.data.duplicate,true);
  assert.equal((await request(`external-drafts/${first.data.id}`)).status,401);
  assert.equal((await request('external-drafts','POST',{draft:{...draft,originalRequest:'Different request'}},coach,'workout-001')).status,409);
  assert.equal((await request('external-drafts','GET',null,coach)).data.length,1);
  assert.equal((await request('external-drafts','GET',null,other)).data.length,0);
  assert.equal((await request(`external-drafts/${first.data.id}`,'GET',null,other)).status,404);
  const reopened=await request(`external-drafts/${first.data.id}`,'GET',null,coach);assert.equal(reopened.status,200);assert.equal(reopened.data.draft.program.name,draft.program.name);
  assert.equal((await request('ai/programs','POST',{review:createReview(reopened.data.draft),requirements:reopened.data.requirements,inbox:{id:first.data.id,revision:reopened.data.revision}},coach)).status,400);
  const review=approveReview(createReview(reopened.data.draft),before.exercises,reopened.data.requirements,{coachId:'coach',warningsReviewed:true});
  const approval=await request('ai/approve','POST',{review,requirements:reopened.data.requirements,inbox:{id:first.data.id,revision:reopened.data.revision}},coach);assert.equal(approval.status,200,JSON.stringify(approval.data));
  const saved=await request('ai/programs','POST',{review,requirements:reopened.data.requirements,inbox:{id:first.data.id,revision:reopened.data.revision},receipt:approval.data.receipt},coach);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.name,draft.program.name);
  const after=(await request('data','GET',null,coach)).data;assert.equal(after.programs.length,before.programs.length+1);assert.deepEqual(after.assignments,before.assignments);assert.deepEqual(after.logs,before.logs);
  assert.equal((await request(`external-drafts/${first.data.id}`,'GET',null,coach)).data.status,'saved');
  const mixed=structuredClone(draft),session=mixed.program.plan[0].sessions[0];mixed.program.name='Strength, cardio and Metcon review';
  session.exercises=[session.exercises[0],{exerciseId:'rowerg',exerciseName:'RowErg',trackingType:'erg',intervalCount:4,restSeconds:90,metrics:{distance:250,distanceUnit:'m',paceSeconds:102},notes:'',progressionInstructions:''}];
  session.blocks=[{id:'strength',name:'Strength',type:'Strength',exerciseIndexes:[0]},{id:'cardio',name:'Intervals',type:'Cardio',exerciseIndexes:[1]},{id:'metcon',name:'Conditioning',type:'Metcon',metcon:prepareMetcon({name:'Pull-up AMRAP',scoreType:'AMRAP',repScheme:[],durationSeconds:720,movements:[{exerciseId:'pullup',reps:5}]},before.exercises)}];
  const mixedSubmission=await request('external-drafts','POST',{draft:mixed},coach,'mixed-workout-001');assert.equal(mixedSubmission.status,200,JSON.stringify(mixedSubmission.data));assert.equal(mixedSubmission.data.validation.counts.error,0);
  const unresolved=structuredClone(draft);unresolved.program.plan[0].sessions[0].exercises[0].exerciseId=null;unresolved.program.plan[0].sessions[0].exercises[0].exerciseName='Unrecognized lift';
  const flagged=await request('external-drafts','POST',{draft:unresolved},coach,'unresolved-001');assert.equal(flagged.status,200);assert.equal(flagged.data.status,'needs_review');
  assert.equal((await request(`external-drafts/${flagged.data.id}`,'GET',null,coach)).data.validation.findings.some(f=>f.code==='UNKNOWN_EXERCISE'),true);
  const malformed=structuredClone(draft);delete malformed.program.plan[0].sessions[0].name;
  const rejected=await request('external-drafts','POST',{draft:malformed},coach,'malformed-001');assert.equal(rejected.status,422);assert.equal(rejected.data.findings.some(f=>f.path==='/program/plan/0/sessions/0/name'),true);

  const six=JSON.parse(await readFile(new URL('../docs/examples/chatgpt-hybrid-6-week-v1.json',import.meta.url),'utf8'));
  const multi=await request('external-drafts','POST',six,coach,'six-week-example-001');assert.equal(multi.status,200,JSON.stringify(multi.data));
  assert.equal(multi.data.validation.counts.error,0,JSON.stringify(multi.data.validation));assert.equal(multi.data.draft.program.plan.length,6);
  const context={id:multi.data.id,revision:multi.data.revision};
  const oldReview=approveReview(createReview(multi.data.draft),before.exercises,{}, {coachId:'coach',warningsReviewed:true});
  const oldApproval=await request('ai/approve','POST',{review:oldReview,requirements:{},inbox:context},coach);assert.equal(oldApproval.status,200);
  const changed=structuredClone(multi.data.draft);changed.program.name='Edited six-week hybrid';
  assert.equal((await request(`external-drafts/${multi.data.id}`,'PUT',{draft:changed,revision:1},athlete)).status,403);
  assert.equal((await request(`external-drafts/${multi.data.id}`,'PUT',{draft:changed,revision:1},other)).status,404);
  const edit=await request(`external-drafts/${multi.data.id}`,'PUT',{draft:changed,revision:1},coach);assert.equal(edit.status,200);assert.equal(edit.data.revision,2);
  assert.equal((await request(`external-drafts/${multi.data.id}`,'PUT',{draft:changed,revision:1},coach)).status,409);
  assert.equal((await request('ai/approve','POST',{review:oldReview,requirements:{},inbox:context},coach)).status,409);
  assert.equal((await request('ai/programs','POST',{review:oldReview,requirements:{},inbox:context,receipt:oldApproval.data.receipt},coach)).status,409);
  const revised=(await request(`external-drafts/${multi.data.id}`,'GET',null,coach)).data;
  const approved=approveReview(createReview(revised.draft),before.exercises,{}, {coachId:'coach',warningsReviewed:true});
  const current={id:multi.data.id,revision:2};
  const unacknowledged=structuredClone(approved);unacknowledged.approval.warningsReviewed=false;
  if(revised.validation.counts.warning)assert.equal((await request('ai/approve','POST',{review:unacknowledged,requirements:{},inbox:current},coach)).status,400,'warnings require acknowledgement');
  assert.equal((await request('ai/programs','POST',{review:approved,requirements:{},inbox:current},coach)).status,400);
  const receipt=(await request('ai/approve','POST',{review:approved,requirements:{},inbox:current},coach)).data.receipt;
  const saveBody={review:approved,requirements:{},inbox:current,receipt};
  const complete=await request('ai/programs','POST',saveBody,coach);assert.equal(complete.status,200,JSON.stringify(complete.data));assert.equal(complete.data.plan.length,6);
  assert.equal((await request('ai/programs','POST',saveBody,coach)).data.id,complete.data.id);
  assert.equal((await request(`external-drafts/${multi.data.id}`,'PUT',{draft:changed,revision:2},coach)).status,409);
  const preserved=(await request('data','GET',null,coach)).data;
  for(const field of ['assignments','logs','strengthPRs','strengthGoals'])assert.deepEqual(preserved[field],before[field],field+' unchanged');
  const incomplete=structuredClone(six);incomplete.draft.program.plan.pop();
  const invalid=await request('external-drafts','POST',incomplete,coach,'incomplete-six-001');assert.equal(invalid.status,200);assert.equal(invalid.data.validation.canApprove,false);
  assert.equal(invalid.data.validation.findings.some(f=>f.code==='INCOMPLETE_WEEK'),true);
  const fakeApproval={...oldReview,draft:invalid.data.draft};
  assert.equal((await request('ai/approve','POST',{review:fakeApproval,requirements:{},inbox:{id:invalid.data.id,revision:1}},coach)).status,400);
  assert.equal((await request('external-drafts','POST',{...six,extra:'x'.repeat(500001)},coach,'too-large-001')).status,413);
  assert.equal((await request('external-drafts','POST',{draft:{...draft,athleteId:'jordan'}},coach,'athlete-target-001')).status,422);
  assert.equal((await request('external-drafts','POST',{draft:{...draft,status:'approved'}},coach,'approved-input-001')).status,422);
  const simultaneous=await Promise.all(Array.from({length:4},()=>request('external-drafts','POST',{draft},coach,'concurrent-key-001')));
  assert.ok(simultaneous.every(r=>r.status===200));assert.equal(new Set(simultaneous.map(r=>r.data.id)).size,1);
  const exited=once(child,'exit');child.kill();await exited;
  output='';child=spawn(process.execPath,['server/index.mjs','--test-server'],serverOptions);child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
  const afterRestart=await request(`external-drafts/${first.data.id}`,'GET',null,coach);assert.equal(afterRestart.status,200);assert.deepEqual(afterRestart.data.draft,reopened.data.draft);
  assert.equal((await request('ai/programs','POST',saveBody,coach)).data.id,complete.data.id,'save retry after restart must not duplicate');
  assert.equal((await request(`external-drafts/${multi.data.id}`,'GET',null,coach)).data.revision,2);
});

test('inbox is off by default and production opt-in still requires a coach session',async t=>{
  for(const {production,enabled,port} of [{production:false,enabled:false,port:'4292'},{production:true,enabled:true,port:'4293'}]){
    const dir=await mkdtemp(join(tmpdir(),'ih-inbox-disabled-')),dbPath=join(dir,'test.sqlite'),base=`http://127.0.0.1:${port}`;
    // A dedicated non-demo account avoids ever using a production database.
    const env={...process.env,PORT:port,HOST:'127.0.0.1',DB_PATH:dbPath,DEMO_MODE:'false',AI_ENABLED:'false',COACH_EMAIL:'local-coach@example.test',COACH_PASSWORD:'isolated-test-password-1234',DRAFT_INBOX_ENABLED:enabled?'true':'false'};
    const child=spawn(process.execPath,['server/index.mjs',production?'--production':'--test-server'],{env,stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
    try{
      for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
      const auth=await(await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:env.COACH_EMAIL,password:env.COACH_PASSWORD,native:true})})).json();
      const headers={Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'};
      assert.equal((await(await fetch(base+'/api/data',{headers})).json()).draftInboxEnabled,enabled);
      assert.equal((await fetch(base+'/api/external-drafts',{headers})).status,enabled?200:404);
      if(enabled){
        assert.equal((await fetch(base+'/api/external-drafts')).status,401,'production inbox must not be public');
        const invited=await(await fetch(base+'/api/athletes',{method:'POST',headers,body:JSON.stringify({name:'Inbox Test Athlete',email:'inbox-athlete@example.test',sport:'Strength training'})})).json();
        const athlete=await(await fetch(base+'/api/redeem',{method:'POST',headers,body:JSON.stringify({code:invited.code,password:'isolated-athlete-password-123',native:true})})).json();
        const athleteHeaders={Authorization:`Bearer ${athlete.token}`};
        assert.equal((await(await fetch(base+'/api/data',{headers:athleteHeaders})).json()).draftInboxEnabled,false);
        assert.equal((await fetch(base+'/api/external-drafts',{headers:athleteHeaders})).status,403,'athletes cannot access coach drafts');
      }
    }finally{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}await rm(dir,{recursive:true,force:true});}
  }
});

test('old inbox schema upgrades without altering existing drafts or workout history',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-inbox-migrate-')),path=join(dir,'test.sqlite');
  const store=openStore(path,true);
  try{
    const draft=createFixture();store.put('log',{id:'preserved-log',sets:[{load:185,reps:5}]},'jordan');
    store.db.exec('CREATE TABLE external_drafts(id TEXT PRIMARY KEY,coach_id TEXT NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,draft_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(coach_id,request_key))');
    store.db.prepare('INSERT INTO external_drafts VALUES(?,?,?,?,?,?,?)').run('old-draft','coach','old-request','original-hash',JSON.stringify(draft),'draft','2026-10-01T00:00:00Z');
    const inbox=createExternalDraftInbox({db:store.db,library:()=>store.all('exercise')});
    assert.deepEqual(inbox.get('coach','old-draft').draft,draft);assert.equal(inbox.get('coach','old-draft').revision,1);
    assert.deepEqual(store.get('log','preserved-log'),{id:'preserved-log',sets:[{load:185,reps:5}]});
    assert.throws(()=>inbox.list('jordan'),/Coach access/);
  }finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});
