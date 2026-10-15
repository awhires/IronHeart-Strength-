import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('runtime recovery mobile regressions',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-runtime-')),server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4218',HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});let output='',browser;
 server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<200&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});const base='http://127.0.0.1:4218';
 await t.test('switching program never renders stale recommendations',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.request.post(base+'/api/demo',{data:{role:'coach'}});const data=await(await page.request.get(base+'/api/data')).json();
  const strength={exerciseId:'bench',sets:3,reps:5,load:185,rpe:8,rest:120},session={name:'Legacy strength',day:1,exercises:[strength]};
  data.assignments=[{id:'legacy',athleteId:'jordan',name:'Legacy strength',weeks:1,startDate:'2026-10-01',plan:[{week:1,sessions:[session,{...session,name:'Second session'}]}]},{id:'running',athleteId:'jordan',name:'Running',weeks:1,startDate:'2026-10-01',plan:[{week:1,sessions:[{name:'Run',day:1,exercises:[{exerciseId:'running',trackingType:'running',intervalCount:1,metrics:{distance:1,distanceUnit:'mi'},intervals:[]}]}]}]}];
  for(const [id,item] of Object.entries({rowerg:{exerciseId:'rowerg',trackingType:'erg',intervalCount:2,metrics:{},intervals:[{rounds:1,segments:[{label:'Easy',metrics:{durationSeconds:40}},{label:'Hard',metrics:{durationSeconds:20}}],recovery:{durationSeconds:120}}]},oldCardio:{exerciseId:'rowerg',sets:3,reps:5,load:0},grouped:{...strength,setBlocks:[{sets:2,reps:5,load:185},{sets:1,reps:3,load:195}]}}))data.assignments.push({id,athleteId:'jordan',name:id,weeks:1,startDate:'2026-10-01',plan:[{week:1,sessions:[{name:id,day:1,exercises:[item]}]}]});
  data.assignments.push({id:'empty',athleteId:'jordan',name:'Legacy empty week',weeks:1,startDate:'2026-10-01',plan:[{week:1,sessions:[]}]},{id:'missingPlan',athleteId:'jordan',name:'Legacy missing plan',weeks:1,startDate:'2026-10-01'});
  await page.route('**/api/data',r=>r.fulfill({json:data}));
  await page.route('**/api/recommendations?*',async r=>{const id=new URL(r.request().url()).searchParams.get('id');if(id==='running')await new Promise(resolve=>setTimeout(resolve,250));await r.fulfill({json:id==='legacy'?[{session:1,index:0,exerciseId:'bench',action:'hold',current:185,load:185,reason:'Legacy recommendation'}]:[]});});
  await page.goto(base);await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Progression',exact:true}).click();await page.getByText('Legacy recommendation',{exact:true}).waitFor();await page.getByLabel('Choose athlete program').selectOption('running');await page.waitForTimeout(500);
  for(const id of ['rowerg','oldCardio','grouped','empty','missingPlan','legacy','running','legacy']){await page.getByLabel('Choose athlete program').selectOption(id);await page.waitForTimeout(40);}
  await page.waitForTimeout(400);assert.equal(await page.getByText('Legacy recommendation',{exact:true}).count(),1);
  assert.deepEqual(errors,[]);assert.equal(await page.getByRole('heading',{name:'Progression & periodization'}).count(),1);assert.equal(await page.getByRole('alert').count(),0);await context.close();
 });
 await t.test('repeat rounds supports intermediate editing',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.request.post(base+'/api/demo',{data:{role:'athlete'}});await page.goto(base);
  await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Log',exact:true}).click();await page.getByRole('button',{name:'+ Add Exercise',exact:true}).click();await page.getByRole('region',{name:'Exercise library selector'}).getByRole('button',{name:/Outdoor Running/}).click();
  await page.locator('.exercise-log-details > summary').click();await page.getByRole('button',{name:'Build repeated intervals',exact:true}).click();await page.getByText('Edit prescribed interval structure',{exact:true}).click();
  const input=page.getByLabel('Repeat rounds',{exact:true});
  await page.getByLabel('Workout name',{exact:true}).fill('Runtime intervals saved');
  const editor=page.locator('.structure-editor');
  await editor.getByLabel('Duration (M:SS)',{exact:true}).fill('0:40');await editor.getByRole('button',{name:'+ Add segment',exact:true}).click();await editor.getByLabel('Duration (M:SS)',{exact:true}).nth(1).fill('0:20');
  await editor.getByLabel('Segment 1 label / effort').fill('Easy');await editor.getByLabel('Segment 2 label / effort').fill('Hard');
  for(const value of ['5','1','10','','5','8','3','12','2']){
   await input.fill(value);if(value===''){assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(el=>el.checkValidity()),false);assert.deepEqual(errors,[]);continue;}
   await input.blur();assert.equal(await input.inputValue(),value);assert.equal(await page.locator('.round-detail').count(),Number(value));assert.equal(await editor.locator('.segment-editor').count(),2);
  }
  for(const value of ['31','-1','1.5','999999']){await input.fill(value);await input.blur();assert.equal(await input.evaluate(el=>el.checkValidity()),false);assert.equal(await page.locator('.round-detail').count(),2);assert.deepEqual(errors,[]);}
  await input.fill('1');await input.blur();await input.focus();await input.press('End');await input.pressSequentially('0');assert.equal(await input.inputValue(),'10');assert.equal(await page.locator('.round-detail').count(),1);await input.blur();assert.equal(await page.locator('.round-detail').count(),10);
  await input.fill('2');await input.blur();
  const duration=editor.getByLabel('Duration (M:SS)',{exact:true}).first();await duration.fill('');await duration.pressSequentially('1:20');assert.equal(await duration.inputValue(),'1:20');await duration.blur();
  const pace=editor.getByLabel('Pace (M:SS / mi)',{exact:true}).first();await pace.fill('');await pace.pressSequentially('8:30');assert.equal(await pace.inputValue(),'8:30');await pace.blur();
  for(const label of ['Distance','RPE (optional)']){const field=editor.getByLabel(label,{exact:true}).first();await field.fill('');await field.fill(label==='Distance'?'0.1':'7.5');await field.blur();}
  const recovery=editor.getByLabel('Recovery between rounds (M:SS)');await recovery.fill('');await recovery.pressSequentially('0:30');await recovery.blur();
  await page.locator('.actual-rounds > summary').click();for(const round of await page.locator('.round-detail').all()){await round.locator(':scope > summary').click();for(const interval of await round.locator('.cardio-interval').all())await interval.getByLabel('Duration (M:SS)',{exact:true}).fill('0:40');}
  await input.focus();await input.blur();assert.equal(await page.locator('.cardio-interval').first().getByLabel('Duration (M:SS)',{exact:true}).inputValue(),'0:40');
  await page.getByRole('button',{name:'Save journal workout',exact:true}).click();await page.getByText('Journal workout saved',{exact:true}).waitFor();await page.reload();
  const saved=(await(await page.request.get(base+'/api/data')).json()).logs.find(l=>l.sessionName==='Runtime intervals saved');assert.ok(saved);assert.equal(saved.exercises[0].sets.length,4);assert.equal(saved.exercises[0].target.intervals[0].rounds,2);assert.deepEqual(saved.exercises[0].target.intervals[0].segments.map(s=>s.label),['Easy','Hard']);assert.equal(saved.exercises[0].target.intervals[0].segments[0].metrics.durationSeconds,80);assert.equal(saved.exercises[0].target.intervals[0].recovery.durationSeconds,30);
  assert.deepEqual(errors,[]);await context.close();
 });
 await t.test('shared numeric controls allow blanks and multi-digit strength/cardio edits',async()=>{
  const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.request.post(base+'/api/demo',{data:{role:'athlete'}});await page.goto(base);await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Log',exact:true}).click();
  for(const name of ['Barbell Bench Press','Treadmill','RowErg']){
   await page.getByRole('button',{name:'+ Add Exercise',exact:true}).click();await page.getByLabel('Search exercises',{exact:true}).fill(name);await page.locator('.journal-result').filter({has:page.getByText(name,{exact:true})}).first().click();const entry=page.locator('.journal-exercise').last();await entry.locator('.exercise-log-details > summary').click();
   if(name==='Barbell Bench Press'){for(const [label,value] of [['Sets','12'],['Reps','10'],['Load','185.5'],['RPE (optional)','7.5']]){const field=entry.getByRole('spinbutton',{name:new RegExp(label.replace(/[()]/g,'\\$&')+'$')});await field.fill('');assert.equal(await field.inputValue(),'');await field.pressSequentially(value);assert.equal(await field.inputValue(),value);await field.blur();}assert.match(await entry.locator('.grouped-sets').innerText(),/12 total sets/);}
   else {await entry.locator('.cardio-extra > summary').click();for(const field of await entry.getByRole('spinbutton').all()){const min=Number(await field.getAttribute('min')||0),max=Number(await field.getAttribute('max')||100);const value=String(Math.min(max,Math.max(min,5)));await field.fill('');assert.equal(await field.inputValue(),'');await field.pressSequentially(value);await field.blur();assert.equal(await field.inputValue(),value);}}
  }
  assert.deepEqual(errors,[]);assert.equal(await page.getByRole('heading',{name:'This screen couldn’t open'}).count(),0);await context.close();
 });
 await t.test('unexpected render failure offers a safe home recovery',async()=>{
  const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage();await page.request.post(base+'/api/demo',{data:{role:'coach'}});const data=await(await page.request.get(base+'/api/data')).json();let broken=true;
  await page.route('**/api/data',r=>r.fulfill({json:broken?{...data,assignments:{invalid:true}}:data}));await page.goto(base);await page.getByRole('heading',{name:'This screen couldn’t open'}).waitFor();broken=false;await page.getByRole('button',{name:'Return to Home',exact:true}).click();await page.getByRole('button',{name:'Open navigation',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'This screen couldn’t open'}).count(),0);assert.equal((await(await page.request.get(base+'/api/data')).json()).logs.length,data.logs.length);await context.close();
 });
});
