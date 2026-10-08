// Run after pnpm build. PLAYWRIGHT_MODULE may point to a bundled Playwright installation.
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('desktop and mobile: library selector opens, filters and adds; M:SS and mixed blocks save',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-ui-'));
 const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4196',HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:join(dir,'ui.sqlite'),AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let output='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 let browser;
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<100&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 await mkdir('output/qa',{recursive:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await t.test(`${viewport.width}px`,async()=>{
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:4196');await page.getByRole('button',{name:'Coach view',exact:true}).click();await page.getByRole('button',{name:'Create program',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Add from exercise library',exact:true}).click();
   const picker=dialog.getByRole('region',{name:'Exercise library selector'});assert.equal(await picker.isVisible(),true);
   await picker.getByLabel('Category',{exact:true}).selectOption('Cardio');await picker.getByLabel('Search exercises',{exact:true}).fill('RowErg');await picker.getByRole('button',{name:/RowErg/}).click();
   assert.equal(await picker.count(),0);await dialog.getByLabel('Duration (M:SS)',{exact:true}).fill('5:30');await dialog.getByLabel('Pace (M:SS / 500 m)',{exact:true}).fill('1:44');
   await dialog.getByLabel('New block type').selectOption('Metcon');await dialog.getByRole('button',{name:'+ Add workout block',exact:true}).click();await dialog.getByLabel('Workout / benchmark name').fill('Annie test');await dialog.getByLabel('Shared rep scheme (optional)').fill('50-40-30-20-10');await dialog.getByRole('button',{name:'+ Add movement from library'}).click();await dialog.getByLabel('Search exercises',{exact:true}).fill('Bench Press');await dialog.getByRole('region',{name:'Exercise library selector'}).getByRole('button',{name:/Bench Press/}).first().click();
   await page.screenshot({path:`output/qa/mixed-builder-${viewport.width}.png`,fullPage:true});
   await dialog.getByRole('button',{name:'Save program',exact:true}).click();await dialog.waitFor({state:'hidden'});
   const data=await (await page.request.get('http://127.0.0.1:4196/api/data')).json();const p=data.programs.findLast(p=>p.sessions[0]?.blocks?.some(b=>b.type==='Metcon'));
   assert.equal(p.sessions[0].exercises[1].metrics.durationSeconds,330);assert.equal(p.sessions[0].exercises[1].metrics.paceSeconds,104);assert.equal(p.sessions[0].blocks[1].metcon.movements.length,1);assert.deepEqual(errors,[]);
   await context.close();
  });
 }
 await t.test('mobile assigned intervals, whiteboard substitution, failed save retry and reopen history',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.request.post('http://127.0.0.1:4196/api/demo',{data:{role:'coach'}});
  const now=new Date(),day=now.getDay(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const metcon={name:'Annie',scoreType:'For Time',repScheme:[50,40,30,20,10],movements:[{exerciseId:'double-unders'},{exerciseId:'sit-ups'}],notes:''};
  const response=await page.request.post('http://127.0.0.1:4196/api/programs',{data:{name:'Persistence QA',goal:'Conditioning',weeks:4,sessions:[{name:'Persistence Row + Annie',day,exercises:[{exerciseId:'rowerg',trackingType:'erg',intervalCount:4,restSeconds:90,metrics:{distance:250,distanceUnit:'m',paceSeconds:102}}],blocks:[{id:'row',type:'Cardio',exerciseIndexes:[0]},{id:'annie',type:'Metcon',metcon}]}]}});assert.equal(response.status(),200);const program=await response.json();
  const assignment=await page.request.post('http://127.0.0.1:4196/api/assign',{data:{programId:program.id,athleteId:'jordan',startDate:date}});assert.equal(assignment.status(),200);
  await page.request.post('http://127.0.0.1:4196/api/demo',{data:{role:'athlete'}});await page.goto('http://127.0.0.1:4196');
  await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.locator('.calendar-event').filter({hasText:'Persistence Row + Annie'}).click();
  const dialog=page.getByRole('dialog');assert.equal(await dialog.locator('.cardio-interval').count(),4);assert.equal(await dialog.getByText('Actual load (lbs)',{exact:true}).count(),0);
  const first=dialog.locator('.cardio-interval').first();assert.match(await first.locator('.interval-target').innerText(),/0:51.*250 m/);assert.equal(await first.getByLabel('Distance',{exact:true}).inputValue(),'');assert.equal(await first.getByLabel('Duration (M:SS)',{exact:true}).inputValue(),'');
  for(const interval of await dialog.locator('.cardio-interval').all()){await interval.getByLabel('Distance',{exact:true}).fill('250');await interval.getByLabel('Duration (M:SS)',{exact:true}).fill('0:51');assert.equal(await interval.getByLabel('Pace (M:SS / 500 m)',{exact:true}).inputValue(),'1:42');}
  const second=dialog.locator('.cardio-interval').nth(1);await second.getByRole('button',{name:'Copy previous actual results'}).click();assert.equal(await second.getByLabel('Duration (M:SS)',{exact:true}).inputValue(),'0:51');assert.equal(await second.getByRole('checkbox').isChecked(),false);await second.getByRole('checkbox').check();
  await first.locator('summary').click();await first.getByLabel('Actual recovery (M:SS, optional)').fill('1:20');await first.getByRole('button',{name:'Start recovery'}).click();await page.waitForTimeout(1100);assert.notEqual(await first.locator('output').innerText(),'1:30');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await dialog.getByRole('button',{name:/Double Unders.*Scale/}).click();await dialog.getByLabel('Performed movement / custom substitute').fill('Single Unders');await dialog.getByLabel('Performed rep scheme').fill('100-80-60-40-20');await dialog.getByLabel('Completion time (M:SS)').fill('8:42');
  await dialog.getByRole('button',{name:/Single Unders.*Scale/}).click();await dialog.locator('.metcon-whiteboard').scrollIntoViewIfNeeded();await page.screenshot({path:'output/qa/metcon-athlete-mobile.png',fullPage:true});
  await page.route('**/api/log',async route=>{await route.fetch();await route.abort();});await dialog.getByRole('button',{name:'Complete workout',exact:true}).click();await page.getByText(/workout is kept on this device/).waitFor();
  const queue=await page.evaluate(()=>JSON.parse(localStorage.getItem('iron-heart-workout-outbox-v1:same-origin')));assert.equal(queue.length,1);
  await page.unroute('**/api/log');await page.reload();await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'Account & Settings',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByText('Workout saved',{exact:true}).waitFor();
  await page.reload();const data=await (await page.request.get('http://127.0.0.1:4196/api/data')).json(),assigned=await assignment.json(),log=data.logs.find(l=>l.assignmentId===assigned.id);
  assert.equal(data.logs.filter(l=>l.assignmentId===assigned.id).length,1);assert.equal(log.exercises[0].sets[0].paceSeconds,102);assert.equal(log.exercises[0].sets[0].recoverySeconds,80);assert.equal(log.exercises[0].sets[1].completed,true);assert.equal(log.exercises[0].target.metrics.distance,250);assert.equal(log.blockResults[0].metcon.movements[0].exerciseName,'Double Unders');assert.equal(log.blockResults[0].score.performedMovements[0].exerciseName,'Single Unders');assert.equal(log.blockResults[0].score.rx,'Scaled');assert.deepEqual(log.blockResults[0].score.performedMovements[0].repScheme,[100,80,60,40,20]);assert.deepEqual(errors,[]);
  await context.close();
 });
});
