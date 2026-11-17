import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createFixture} from '../../shared/ai/fixtures.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function freePort(){const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
for(const kind of ['single workout','six-week hybrid'])test(`390px durable inbox: ${kind} import, reopen, edit, approve and save`,{timeout:180000},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-inbox-ui-')),port=await freePort(),base=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_ENABLED:'false',DRAFT_INBOX_ENABLED:'true',IH_UI_TEST_SERVER:'true'},stdio:['ignore','pipe','pipe']});
  let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
  t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
  for(let i=0;i<300&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
  console.error('Inbox test: server ready; launching browser');
  browser=await chromium.launch({headless:true,timeout:30000,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  console.error('Inbox test: browser launched');
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[],apiOrigins=[],apiPaths=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/api/')){const url=new URL(r.url());apiOrigins.push(url.origin);apiPaths.push(url.pathname);}});
  await page.request.post(base+'/api/demo',{data:{role:'coach'}});
  const before=await(await page.request.get(base+'/api/data')).json();
  let created;
  if(kind==='single workout'){
    const draft=createFixture();draft.schemaVersion=2;draft.program.name='Inbox single workout';draft.program.weeks=1;draft.program.plan=[{week:1,sessions:[{...draft.program.plan[0].sessions[0],blocks:[]}]}];
    const submission=await page.request.post(base+'/api/external-drafts',{data:{draft},headers:{'Idempotency-Key':'mobile-workout-001'}});assert.equal(submission.status(),200,await submission.text());created=await submission.json();
    await page.goto(base+created.reviewPath);
  }else{
    await page.goto(base);await page.getByRole('button',{name:'Paste from ChatGPT',exact:true}).click();
    await page.getByLabel('Versioned workout JSON').waitFor();
    assert.equal(await page.getByRole('button',{name:'Paste from ChatGPT',exact:true}).getAttribute('aria-expanded'),'true');
    const json=await readFile(new URL('../../docs/examples/chatgpt-hybrid-6-week-v1.json',import.meta.url),'utf8');
    await page.getByLabel('Versioned workout JSON').fill(json);await page.getByRole('button',{name:'Check JSON',exact:true}).click();
    await page.getByText(/Structure is valid:.*6 weeks/).waitFor();await page.getByRole('button',{name:'Open in AI Draft Review',exact:true}).click();
  }
  const review=page.locator('.draft-inbox .ai-review');
  await review.getByRole('heading',{name:'AI Draft Review',exact:true}).waitFor();
  const incoming=await(await page.request.get(base+'/api/external-drafts')).json();assert.equal(incoming.length,1);created=incoming[0];
  const editedName=`Edited ${kind}`;await review.getByLabel('Program name',{exact:true}).fill(editedName);
  await review.getByRole('button',{name:'Save draft edits',exact:true}).click();await review.getByText('Draft edits saved',{exact:true}).waitFor();
  await page.goto(base+created.reviewPath);await review.getByRole('heading',{name:'AI Draft Review',exact:true}).waitFor();assert.equal(await review.getByLabel('Program name',{exact:true}).inputValue(),editedName);
  assert.equal(await review.getByRole('button',{name:'Save as new program',exact:true}).isDisabled(),true);
  if(kind==='single workout'){
    const current=await(await page.request.get(base+`/api/external-drafts/${created.id}`)).json();
    const parallel=structuredClone(current.draft);parallel.program.description='Concurrent saved edit';
    assert.equal((await page.request.put(base+`/api/external-drafts/${created.id}`,{data:{revision:current.revision,draft:parallel}})).status(),200);
    await review.getByLabel('Program name',{exact:true}).fill(editedName+' unsaved');
    await review.getByRole('button',{name:'Save draft edits',exact:true}).click();
    await review.getByText(/This draft changed in another review/).waitFor();
    assert.equal(await review.getByLabel('Program name',{exact:true}).inputValue(),editedName+' unsaved','stale rejection preserves entered edits');
    await page.getByRole('button',{name:'Reopen saved draft',exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('input[aria-label="Program description"]')].some(e=>e.value==='Concurrent saved edit'));
  }

  if(await review.getByRole('checkbox',{name:/I reviewed the warnings/}).count())await review.getByRole('checkbox',{name:/I reviewed the warnings/}).check();
  await review.getByRole('button',{name:'Approve this revision',exact:true}).click();await review.getByRole('button',{name:'Save as new program',exact:true}).waitFor();
  // Any edit removes approval; saved draft updates must not silently carry it forward.
  await review.getByLabel('Program description',{exact:true}).fill('Coach reviewed description');
  assert.equal(await review.getByRole('button',{name:'Save as new program',exact:true}).isDisabled(),true);
  if(await review.getByRole('checkbox',{name:/I reviewed the warnings/}).count())await review.getByRole('checkbox',{name:/I reviewed the warnings/}).check();
  await review.getByRole('button',{name:'Approve this revision',exact:true}).click();
  await review.getByRole('button',{name:'Save as new program',exact:true}).click();await review.getByRole('heading',{name:'Saved as a new program',exact:true}).waitFor();
  const after=await(await page.request.get(base+'/api/data')).json(),saved=after.programs.filter(p=>p.name===editedName);assert.equal(saved.length,1);assert.equal(saved[0].weeks,kind==='single workout'?1:6);
  if(kind==='six-week hybrid'){
    assert.equal(saved[0].plan.length,6);
    const sessions=saved[0].plan.flatMap(w=>w.sessions);assert.ok(sessions.some(s=>s.blocks.some(b=>b.superset)));assert.ok(sessions.some(s=>s.exercises.some(e=>e.setBlocks?.length>1)));assert.ok(sessions.some(s=>s.exercises.some(e=>e.intervals)));assert.ok(sessions.some(s=>s.blocks.some(b=>b.type==='Metcon')));
  }
  for(const field of ['assignments','logs','strengthPRs','strengthGoals'])assert.deepEqual(after[field],before[field]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('.draft-inbox > .panel > .row button').evaluateAll(buttons=>buttons.every(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})),true,'inbox navigation fits within the phone viewport');
  await mkdir('output/qa',{recursive:true});await page.screenshot({path:`output/qa/draft-inbox-${kind.replaceAll(' ','-')}.png`,fullPage:true});
  await page.reload();await review.getByRole('heading',{name:'AI Draft Review',exact:true}).waitFor();assert.equal(await review.getByLabel('Program name',{exact:true}).isDisabled(),true,'saved inbox entry is read-only');
  assert.deepEqual(errors,[]);assert.deepEqual([...new Set(apiOrigins)],[base]);
  assert.equal(apiPaths.some(path=>['/api/ai/jobs','/api/ai/program-draft','/api/ai/workout-scan'].includes(path)),false,'JSON import and parsing do not call any AI generation or scanning endpoint');
  await page.request.post(base+'/api/logout');await page.request.post(base+'/api/demo',{data:{role:'athlete'}});await page.reload();
  assert.equal(await page.getByRole('button',{name:'Paste from ChatGPT',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'ChatGPT Drafts',exact:true}).count(),0);
  assert.equal((await page.request.get(base+`/api/external-drafts/${created.id}`)).status(),403);
});
