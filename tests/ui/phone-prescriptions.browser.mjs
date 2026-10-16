import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFixture} from '../../shared/ai/fixtures.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('physical-phone state regressions: progression, adaptive actuals and AI review',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-phone-')),fixture=join(dir,'ai.json'),base='http://127.0.0.1:4220';await writeFile(fixture,JSON.stringify(createFixture()));
 const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4220',HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_TEST_FIXTURE:fixture,AI_REQUESTS_PER_HOUR:'30'},stdio:['ignore','pipe','pipe']});let output='',browser;
 server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<200&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 const setup=async()=>{const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(12000);await page.request.post(base+'/api/demo',{data:{role:'coach'}});return {context,page};};
 const navigate=async(page,name)=>{await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();};
 await t.test('no-RPE bench and accessories, grouped loads and AI percentage/selected targets open usable controls',async()=>{
  const {context,page}=await setup();const data=(await(await page.request.get(base+'/api/data')).json());const lat=data.exercises.find(e=>e.name==='Lat Pulldown').id;
  const raw={name:'Phone failure shapes',goal:'Strength',weeks:4,description:'',sessions:[{name:'Phone test',day:4,exercises:[{exerciseId:'bench',sets:2,reps:5,load:100,rpe:null,effortMode:'none',rest:90,setBlocks:[{sets:1,reps:5,load:100},{sets:1,reps:3,load:110}]},{exerciseId:lat,sets:3,reps:8,load:null,loadMode:'athlete_selected',rpe:null,effortMode:'none',rest:90},{exerciseId:'leg-extension',sets:3,reps:8,load:null,loadMode:'percentage',percent1RM:70,rpe:8,rest:90}]}]};
  const res=await page.request.post(base+'/api/programs',{data:raw});assert.equal(res.status(),200);const p=await res.json();await page.goto(base);await navigate(page,'Programs');await page.locator('.program-card').filter({hasText:raw.name}).getByRole('button',{name:/Edit/}).click();await page.getByRole('button',{name:/Generate following weeks/}).click();
  for(const [i,name] of ['Barbell Bench Press','Lat Pulldown','Leg Extension'].entries()){const select=page.getByLabel(`Method for ${name} session 1 exercise ${i+1}`,{exact:true});assert.equal(await select.isEnabled(),true);await select.selectOption(i===0?'repetition':'adaptive');}
  await page.getByLabel('Coach-selected weekly increase (%)',{exact:true}).fill('5');await page.getByRole('button',{name:'Preview Weeks 2–4',exact:true}).click();await page.getByRole('button',{name:'Apply generated weeks',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Save program/}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
  const saved=(await(await page.request.get(base+'/api/data')).json()).programs.find(x=>x.id===p.id);assert.deepEqual(saved.plan[1].sessions[0].exercises[0].setBlocks.map(b=>b.load),[105,115]);assert.equal(saved.plan[1].sessions[0].exercises[1].adaptiveProgression.maxPercent,10);assert.equal(saved.plan[1].sessions[0].exercises[2].load,null);await context.close();
 });
 await t.test('athlete recommendation pre-fills actual weight, manual override persists without rewriting percentage',async()=>{
  const {context,page}=await setup();const now=new Date(),date=now.toISOString().slice(0,10),day=now.getDay();
  const e={exerciseId:'bench',sets:2,reps:5,rest:120,load:null,loadMode:'percentage',percent1RM:75,rpe:8,reference1RM:{exerciseId:'bench',value:250,unit:'lbs',type:'tested',date},adaptiveProgression:{version:1,enabled:true,minPercent:5,maxPercent:10}};
  const p=await(await page.request.post(base+'/api/programs',{data:{name:'Adaptive phone test',goal:'Strength',weeks:1,description:'',sessions:[{name:'Adaptive athlete session',day,exercises:[e]}]}})).json();const a=await(await page.request.post(base+'/api/assign',{data:{programId:p.id,athleteId:'jordan',startDate:date}})).json();assert.ok(a.id);
  await page.request.post(base+'/api/demo',{data:{role:'athlete'}});await page.goto(base);await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.getByLabel('Current program',{exact:true}).selectOption(a.id);await page.locator('.training-session').filter({hasText:'Adaptive athlete session'}).getByRole('button').first().click();
  const dialog=page.getByRole('dialog');await dialog.getByText('Athlete recommendation',{exact:true}).waitFor();assert.equal(await page.getByLabel('Barbell Bench Press row 1 Load',{exact:true}).inputValue(),'185');await page.getByLabel('Barbell Bench Press row 1 Load',{exact:true}).fill('175');await page.getByLabel('Barbell Bench Press row 1 Reps',{exact:true}).fill('5');await page.getByLabel('Barbell Bench Press row 1 RPE (optional)',{exact:true}).fill('8');await dialog.getByRole('button',{name:'Complete workout',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.reload();
  const saved=(await(await page.request.get(base+'/api/data')).json()),log=saved.logs.find(l=>l.assignmentId===a.id);assert.equal(log.exercises[0].sets[0].load,175);assert.equal(log.exercises[0].target.percent1RM,75);assert.equal(log.exercises[0].target.load,null);assert.equal(log.recommendations[0][0].load,185);assert.equal(saved.assignments.find(x=>x.id===a.id).plan[0].sessions[0].exercises[0].load,null);await context.close();
 });
 const generate=async(page)=>{await page.goto(base);await navigate(page,'AI Program Builder');await page.getByLabel('Your coaching request',{exact:true}).fill('Create a six-week Jiu-Jitsu strength program.');await page.getByRole('button',{name:'Generate Draft',exact:true}).click();await page.getByRole('heading',{name:'AI Draft Review',exact:true}).waitFor();};
 await t.test('six-week request returning only Week 1 shows actionable error and cannot be approved',async()=>{
  const {context,page}=await setup(),draft=createFixture();draft.program.weeks=6;draft.program.plan=draft.program.plan.slice(0,1);draft.program.plan[0].sessions[0].exercises[0].exerciseId=null;await writeFile(fixture,JSON.stringify(draft));await generate(page);
  assert.match(await page.locator('.ai-review:visible').innerText(),/Received 1 of 6 requested weeks/);assert.match(await page.locator('.ai-review:visible').innerText(),/Expected 6 complete weeks; received 1/);assert.equal(await page.getByRole('button',{name:'Approve this revision',exact:true}).isEnabled(),false);assert.match(await page.locator('.ai-review:visible').innerText(),/needs a library match/);await context.close();
 });
 await t.test('missing max and open questions require explicit acknowledgement, then real API approval and save work',async()=>{
  const {context,page}=await setup(),draft=createFixture('percentage');draft.program.weeks=6;draft.program.plan=Array.from({length:6},(_,i)=>({...structuredClone(draft.program.plan[0]),week:i+1}));for(const w of draft.program.plan)w.sessions[0].exercises[0].reference1RM=null;draft.questions=['Which reference maximum should be used?'];await writeFile(fixture,JSON.stringify(draft));await generate(page);
  const approve=page.getByRole('button',{name:'Approve this revision',exact:true});assert.equal(await approve.isEnabled(),false);await page.getByLabel('I reviewed the warnings and accept these draft choices.',{exact:true}).check();assert.equal(await approve.isEnabled(),true);await approve.click();await page.getByRole('button',{name:'Save as new program',exact:true}).click();await page.getByRole('button',{name:'Program saved',exact:true}).waitFor();const saved=(await(await page.request.get(base+'/api/data')).json()).programs.find(p=>p.aiProvenance?.acceptedWarningCodes?.includes('OPEN_QUESTIONS'));assert.ok(saved);assert.equal(saved.plan.length,6);assert.equal(saved.plan[0].sessions[0].exercises[0].load,null);await context.close();
 });
});
