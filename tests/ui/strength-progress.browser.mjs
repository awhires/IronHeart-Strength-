import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('compact Goals & Progress: estimates, disclosures, goals, calendar and navigation clearance',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-strength-ui-'));
 const server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4214',HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:join(dir,'test.sqlite'),AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<150&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});await mkdir('output/qa/compact-progress',{recursive:true});const base='http://127.0.0.1:4214',measurements=[];
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:360,height:740}])await t.test(`${viewport.width}px estimates, compact goal editing and unobscured content`,async()=>{
  const mobile=viewport.width<900,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.request.post(base+'/api/demo',{data:{role:'athlete'}});const data=await(await page.request.get(base+'/api/data')).json(),exercise=data.exercises.find(e=>e.id==='bench')||data.exercises[0];
  for(const [month,load] of [['01',185],['08',145],['09',165],['10',175]]){
   const saved=await page.request.post(base+'/api/tracker',{data:{sessionName:'Strength source',workoutDate:`2026-${month}-05`,notes:'',exercises:[{exerciseId:exercise.id,sets:[{load,reps:5,rpe:9,loadUnit:'lbs'}]}]}});assert.equal(saved.status(),200);
  }
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00'));await page.goto(base);await page.getByRole('button',{name:'Goals & Progress',exact:true}).last().click();await page.getByLabel('Strength exercise',{exact:true}).selectOption(exercise.id);
  await page.getByRole('heading',{name:'Estimated Max — NSCA Training Load Chart',exact:true}).waitFor();
  assert.equal(await page.locator('.progress-actual').getAttribute('open'),null);assert.equal(await page.locator('.progress-sources').getAttribute('open'),null);assert.equal(await page.locator('.progress-method').getAttribute('open'),null);assert.equal(await page.locator('#progress-goal-editor').count(),0);
  assert.deepEqual(await page.locator('.month-tick').evaluateAll(nodes=>nodes.map(n=>n.dataset.month)),['2026-08','2026-09','2026-10','2026-11','2026-12']);assert.equal(await page.locator('.current-month').getAttribute('data-month'),'2026-10');assert.equal(await page.locator('.strength-data-point').count(),3);
  await page.locator('.progress-actual > summary').click();await page.getByText('No actual 1-rep set recorded.',{exact:false}).waitFor();
  for(const rep of [1,3,5,10]){await page.getByRole('button',{name:rep+'RM',exact:true}).click();assert.equal(await page.getByRole('button',{name:rep+'RM',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.strength-data-point').count(),3);}
  await page.getByRole('button',{name:'5RM',exact:true}).click();await page.getByText('Best recorded 5-rep set: 185 lb × 5',{exact:false}).waitFor();await page.locator('.progress-actual > summary').click();
  assert.deepEqual(await page.locator('.progress-estimate-summary strong').allTextContents(),['175 lb','165 lb','+10 lb']);
  await page.getByRole('button',{name:/^(Set|Edit) Goal$/}).click();await page.getByLabel('5RM goal (lb)',{exact:true}).fill('225');await page.getByRole('button',{name:'Save goal',exact:true}).click();await page.getByText('Goal saved.',{exact:true}).waitFor();assert.equal(await page.locator('#progress-goal-editor').count(),0);assert.match(await page.locator('.progress-goal-summary').innerText(),/225 lb/);
  await page.locator('.toast').waitFor({state:'hidden'});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/qa/compact-progress/progress-${viewport.width}.png`,fullPage:false});
  if(mobile){
   const primary=await page.locator('.progress-primary').boundingBox(),nav=await page.getByRole('navigation',{name:'Athlete navigation'}).boundingBox();assert.ok(primary.height<430,`Main card is ${primary.height}px`);assert.ok(primary.y+primary.height<nav.y,'Main card fits above navigation at page top');
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));const last=await page.locator('.progress-analytics').boundingBox();assert.ok(last.y+last.height<nav.y-8,'Last page control clears fixed navigation');
   assert.equal(await page.locator('.progress-analytics').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
   measurements.push({viewport,primaryCardHeight:primary.height,primaryCardBottom:primary.y+primary.height,navigationTop:nav.y,lastControlBottomAtEnd:last.y+last.height,clearance:nav.y-last.y-last.height});
   await page.getByRole('button',{name:'Edit Goal',exact:true}).click();await page.getByRole('button',{name:'Save goal',exact:true}).scrollIntoViewIfNeeded();const save=await page.getByRole('button',{name:'Save goal',exact:true}).boundingBox();assert.ok(save.y+save.height<nav.y,'Expanded goal save button clears navigation');await page.screenshot({path:`output/qa/compact-progress/goal-editor-${viewport.width}.png`,fullPage:false});await page.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  await page.locator('.progress-sources > summary').click();assert.ok(await page.locator('.progress-sources .history-row').count()>=4);await page.locator('.progress-sources .history-row').last().click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.locator('.progress-sources > summary').click();
  await page.locator('.progress-method > summary').click();await page.getByRole('link',{name:'NSCA chart',exact:true}).waitFor();await page.locator('.progress-method > summary').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.reload();await page.getByRole('button',{name:'Goals & Progress',exact:true}).last().click();await page.getByLabel('Strength exercise',{exact:true}).selectOption(exercise.id);await page.getByRole('button',{name:'5RM',exact:true}).click();await page.getByRole('button',{name:'Edit Goal',exact:true}).click();assert.equal(await page.getByLabel('5RM goal (lb)').inputValue(),'225');await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('.progress-actual > summary').click();await page.getByRole('button',{name:'View actual performance',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.request.post(base+'/api/demo',{data:{role:'coach'}});await page.reload();if(mobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Goals & Progress',exact:true}).click();await page.getByLabel('Athlete',{exact:true}).selectOption('jordan');await page.getByLabel('Strength exercise',{exact:true}).selectOption(exercise.id);await page.getByRole('button',{name:'5RM',exact:true}).click();await page.getByRole('button',{name:'Edit Goal',exact:true}).click();assert.equal(await page.getByLabel('5RM goal (lb)').inputValue(),'225');
  await page.clock.setFixedTime(new Date('2027-01-15T12:00:00'));await page.reload();if(mobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Goals & Progress',exact:true}).click();assert.deepEqual(await page.locator('.month-tick').evaluateAll(nodes=>nodes.map(n=>n.dataset.month)),['2026-11','2026-12','2027-01','2027-02','2027-03']);assert.equal(await page.locator('.current-month').getAttribute('data-month'),'2027-01');assert.deepEqual(errors,[]);await context.close();
 });
 await writeFile('output/qa/compact-progress/viewport-checks.json',JSON.stringify(measurements,null,2));
});
