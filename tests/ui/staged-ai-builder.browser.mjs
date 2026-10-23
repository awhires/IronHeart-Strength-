import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createFixture} from '../../shared/ai/fixtures.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=createFixture();
function fixture(weeks,{invalidWeek=0}={}){
  const outline={schemaVersion:1,program:{...base.program,weeks,plan:undefined},trainingDays:base.program.plan[0].sessions.map(s=>({day:s.day,focus:s.name})),weekProgression:Array.from({length:weeks},(_,i)=>({week:i+1,focus:'Strength',progressionInstructions:'Review actual sets and progress within coach limits.'})),assumptions:[],questions:[]};
  delete outline.program.plan;
  const plan=Array.from({length:weeks},(_,i)=>{const value=structuredClone(base.program.plan[0]);value.week=i+1;for(const session of value.sessions)session.blocks=[];value.sessions[3].exercises[1]={...value.sessions[3].exercises[1],exerciseId:'row',exerciseName:'Bent-over Barbell Row',loadMode:'athlete_selected'};if(i+1===invalidWeek)value.sessions.pop();return value;});
  return {outline,weeks:plan};
}
async function freePort(){const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
async function openBuilder(page){await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('button',{name:'AI Program Builder',exact:true}).click();await page.getByRole('heading',{name:'AI Program Builder'}).waitFor();}

test('coach staged builder completes six weeks, resumes and retries Week 4 of eight, then opens editable review',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ih-staged-ui-')),port=await freePort(),fixturePath=join(dir,'fixture.json');
  await writeFile(fixturePath,JSON.stringify(fixture(6)));
  const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:join(dir,'test.sqlite'),AI_TEST_FIXTURE:fixturePath,AI_STAGED_CALLS_PER_HOUR:'30'},stdio:['ignore','pipe','pipe']});
  let output='';server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
  for(let i=0;i<120&&!output.includes('Iron Heart Strength:')&&server.exitCode===null;i++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.match(output,/Iron Heart Strength:/);
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  t.after(async()=>{await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}await rm(dir,{recursive:true,force:true});});
  const context=await browser.newContext({viewport:{width:390,height:850}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const origin=`http://127.0.0.1:${port}`;
  await page.request.post(`${origin}/api/demo`,{data:{role:'coach'}});
  await page.goto(origin);await openBuilder(page);
  await page.getByLabel('Your coaching request').fill('Create a six-week strength program with four training days per week. Bench twice, squat twice and deadlift once.');
  await page.locator('details').filter({hasText:'Confirmed requirements'}).locator('summary').click();
  await page.getByLabel('Confirmed weeks').selectOption('6');
  await page.getByLabel('Days per week').fill('4');
  await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='Generate Program');button.click();button.click();});
  await page.getByRole('heading',{name:'AI Draft Review'}).waitFor({timeout:30000});
  let jobs=await(await page.request.get(`${origin}/api/ai/jobs`)).json();
  const six=await(await page.request.get(`${origin}/api/ai/jobs/${jobs[0].id}`)).json();
  assert.equal(jobs.length,1);assert.equal(six.status,'complete');assert.deepEqual(six.completedWeeks,[1,2,3,4,5,6]);assert.equal(six.attempts.length,7);
  assert.equal(six.completeDraft.draft.program.plan.length,6);
  await openBuilder(page);
  await writeFile(fixturePath,JSON.stringify(fixture(8,{invalidWeek:4})));
  await page.getByLabel('Your coaching request').fill('Create an eight-week strength program with four training days per week. Bench twice, squat twice and deadlift once.');
  await page.getByLabel('Confirmed weeks').selectOption('8');
  await page.getByRole('button',{name:'Generate Program'}).click();
  await page.getByRole('button',{name:'Retry failed Week 4'}).waitFor({timeout:30000});
  jobs=await(await page.request.get(`${origin}/api/ai/jobs`)).json();
  const id=jobs[0].id,failedJob=await(await page.request.get(`${origin}/api/ai/jobs/${id}`)).json(),firstThree=structuredClone(failedJob.validatedWeeks);
  assert.deepEqual(failedJob.completedWeeks,[1,2,3]);assert.equal(failedJob.completeDraft,undefined);
  await page.reload();await openBuilder(page);
  await page.getByRole('button',{name:'Retry failed Week 4'}).waitFor();
  assert.match(await page.getByLabel('Your coaching request').inputValue(),/eight-week/);
  await writeFile(fixturePath,JSON.stringify(fixture(8)));
  await page.getByRole('button',{name:'Retry failed Week 4'}).click();
  try{await page.getByRole('heading',{name:'AI Draft Review'}).waitFor({timeout:30000});}
  catch(error){const state=await(await page.request.get(`${origin}/api/ai/jobs/${id}`)).json();throw new Error(`Review did not open: ${error.message}; job=${state.status}, next=${state.nextWeek}, failure=${JSON.stringify(state.lastFailure)}, alerts=${JSON.stringify(await page.getByRole('alert').allTextContents())}`);}
  jobs=await(await page.request.get(`${origin}/api/ai/jobs`)).json();
  const finished=await(await page.request.get(`${origin}/api/ai/jobs/${id}`)).json();
  assert.equal(finished.status,'complete');assert.deepEqual(finished.validatedWeeks.slice(0,3),firstThree);
  assert.deepEqual(finished.completedWeeks,[1,2,3,4,5,6,7,8]);
  assert.equal(finished.attempts.filter(attempt=>attempt.week===4).length,2);
  assert.equal(finished.completeDraft.draft.program.plan.length,8);
  await page.getByRole('textbox',{name:'Program name'}).last().fill('Coach reviewed eight-week strength');
  const warnings=page.getByText('I reviewed the warnings and accept these draft choices.');
  if(await warnings.count())await warnings.last().click();
  await page.getByRole('button',{name:'Approve this revision'}).last().click();
  await page.getByRole('button',{name:/Revision .* approved/}).waitFor();
  await openBuilder(page);
  await writeFile(fixturePath,JSON.stringify({...fixture(6),delayStage:'outline',delayMs:5000}));
  await page.getByLabel('Your coaching request').fill('Create another six-week strength program with four training days per week for this cancellation test.');
  await page.locator('details').filter({hasText:'Confirmed requirements'}).locator('summary').click();
  await page.getByLabel('Confirmed weeks').selectOption('6');
  await page.getByRole('button',{name:'Generate Program'}).click();
  await page.getByRole('button',{name:'Cancel Generation'}).waitFor();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Cancel Generation'}).click();
  for(let i=0;i<40;i++){jobs=await(await page.request.get(`${origin}/api/ai/jobs`)).json();if(jobs[0]?.status==='cancelled')break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(jobs[0].status,'cancelled');assert.deepEqual(jobs[0].completedWeeks,[]);
  await writeFile(fixturePath,JSON.stringify({...fixture(6),delayStage:'week:2',delayMs:5000}));
  await page.getByLabel('Your coaching request').fill('Create a six-week strength program with four training days per week; resume after phone navigation.');
  await page.getByRole('button',{name:'Generate Program'}).click();
  let interruptedId;
  for(let i=0;i<200;i++){jobs=await(await page.request.get(`${origin}/api/ai/jobs`)).json();if(jobs[0]?.status==='running'&&jobs[0]?.completedWeeks.includes(1)){interruptedId=jobs[0].id;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  assert.ok(interruptedId,`Job did not reach interrupted stage: ${JSON.stringify(jobs.slice(0,2))}; alerts=${JSON.stringify(await page.getByRole('alert').allTextContents())}`);
  await page.reload();await openBuilder(page);
  await page.getByRole('button',{name:'Resume Generation'}).waitFor({timeout:12000});
  await writeFile(fixturePath,JSON.stringify(fixture(6)));
  await page.getByRole('button',{name:'Resume Generation'}).click();
  await page.getByRole('heading',{name:'AI Draft Review'}).waitFor({timeout:30000});
  const resumed=await(await page.request.get(`${origin}/api/ai/jobs/${interruptedId}`)).json();
  assert.equal(resumed.status,'complete');assert.deepEqual(resumed.completedWeeks,[1,2,3,4,5,6]);
  assert.equal(resumed.attempts.filter(attempt=>attempt.week===1).length,1);
  assert.deepEqual(errors,[]);
  await context.close();
});
