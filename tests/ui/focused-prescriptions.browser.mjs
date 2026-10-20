import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('focused calendar, progression and hold browser regressions',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ih-focused-')),base='http://127.0.0.1:4219',server=spawn(process.execPath,['server/index.mjs','--test-server'],{env:{...process.env,PORT:'4219',HOST:'127.0.0.1',DB_PATH:join(dir,'test.sqlite'),DEMO_MODE:'true',AI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});let output='',browser;
 server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 t.after(async()=>{await browser?.close();if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<200&&!output.includes('Iron Heart Strength:');i++)await new Promise(r=>setTimeout(r,50));assert.match(output,/Iron Heart Strength:/);
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 const setup=async(role,width=390,now=new Date('2026-10-15T12:00:00'))=>{const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();page.setDefaultTimeout(12000);await page.request.post(base+'/api/demo',{data:{role}});await page.clock.setFixedTime(now);return {context,page};};
 const navigate=async(page,name)=>{if(name==='Calendar'){await page.getByRole('navigation',{name:'Athlete navigation'}).getByRole('button',{name:'Training',exact:true}).click();await page.locator('.training-page').getByRole('button',{name:'Calendar',exact:true}).click();}else{await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();}}; await t.test('compact athlete calendar includes actual journal date, scheduled identity and opens history',async()=>{
  const {context,page}=await setup('athlete',360),data=await(await page.request.get(base+'/api/data')).json(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  data.assignments=[{id:'calendar-a',athleteId:'jordan',name:'Schedule',startDate:'2026-10-12',weeks:1,plan:[{week:1,sessions:[{name:'Linked session',day:1,exercises:[]},{name:'Scheduled only',day:5,exercises:[]}]}]}];
  data.logs=[{id:'linked',assignmentId:'calendar-a',athleteId:'jordan',week:1,session:0,sessionName:'Linked session',createdAt:'2026-10-14T12:00:00Z',workoutDate:'2026-10-14',exercises:[]},{id:'journal',athleteId:'jordan',sessionName:'Unscheduled workout',source:'tracker',workoutDate:'2026-10-15',createdAt:'2026-10-15T12:00:00Z',exercises:[]}];
  await page.route('**/api/data',r=>r.fulfill({json:data}));await page.goto(base);await navigate(page,'Calendar');
  assert.equal(await page.locator('.calendar-event').count(),3);assert.equal(await page.locator('.calendar-event.completed').count(),2);
  const linked=page.locator('.calendar-event').filter({hasText:'Linked session'});assert.match(await linked.locator('xpath=../../..').innerText(),/Wednesday/);assert.match(await linked.innerText(),/Scheduled 2026-10-12/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.ok((await page.locator('.athlete-calendar').boundingBox()).height<750);
  await page.locator('.athlete-calendar').screenshot({path:'output/qa/focused-athlete-calendar.png'});
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));const day=await page.locator('.calendar-day').last().boundingBox(),nav=await page.getByRole('navigation',{name:'Athlete navigation'}).boundingBox();assert.ok(day.y+day.height<=nav.y);
  await page.locator('.calendar-event').filter({hasText:'Unscheduled workout'}).click();await page.getByRole('dialog').getByRole('heading',{name:'Unscheduled workout'}).waitFor();assert.deepEqual(errors,[]);await context.close();
 });
 await t.test('coach grouped progression and timed prescription editor persist without flattening',async()=>{
  const {context,page}=await setup('coach');
  const raw={name:'Grouped coach regression',goal:'Strength',weeks:4,description:'',sessions:[{name:'Focused session',day:1,exercises:[{exerciseId:'bench',trackingType:'strength',sets:3,reps:5,load:200,rpe:8,rest:120,setBlocks:[{sets:2,reps:5,load:200,rpe:8},{sets:1,reps:3,load:220,rpe:8}]},{exerciseId:'plank',trackingType:'timed',sets:3,metrics:{durationSeconds:30},rest:60}]}]};
  const response=await page.request.post(base+'/api/programs',{data:raw});assert.equal(response.status(),200);const p=await response.json();await page.goto(base);await navigate(page,'Programs');
  const card=page.locator('.program-card').filter({hasText:raw.name});await card.getByRole('button',{name:/Edit/}).click();
  await page.getByRole('button',{name:/Generate following weeks/}).click();const method=page.getByLabel('Method for Bench Press session 1 exercise 1',{exact:true});assert.equal(await method.isEnabled(),true);await method.selectOption('repetition');await page.getByLabel('Coach-selected weekly increase (%)',{exact:true}).fill('5');
  await page.getByRole('button',{name:'Preview Weeks 2–4',exact:true}).click();await page.getByRole('button',{name:'Apply generated weeks',exact:true}).click();
  assert.equal(await page.getByLabel('Exercise 2 Duration (M:SS)',{exact:true}).inputValue(),'0:30');await page.getByLabel('Exercise 2 Duration (M:SS)',{exact:true}).fill('0:45');await page.getByLabel('Exercise 2 Duration (M:SS)',{exact:true}).blur();
  await page.getByRole('dialog').getByRole('button',{name:/Save program/}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
  const saved=(await(await page.request.get(base+'/api/data')).json()).programs.find(x=>x.id===p.id);assert.deepEqual(saved.plan[1].sessions[0].exercises[0].setBlocks.map(b=>b.load),[210,230]);assert.equal(saved.plan[1].sessions[0].exercises[1].metrics.durationSeconds,45);await context.close();
 });
 await t.test('assigned holds log duration as three actual sets and reopen history',async()=>{
  const now=new Date(),start=new Date(now);start.setDate(start.getDate()-((start.getDay()+6)%7));const startDate=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
  const {context,page}=await setup('coach',390,now);const p=await(await page.request.post(base+'/api/programs',{data:{name:'Assigned holds',goal:'Core',description:'',weeks:4,sessions:[{name:'Timed test',day:now.getDay(),exercises:[{exerciseId:'plank',trackingType:'timed',sets:3,rest:60,metrics:{durationSeconds:30}}]}]}})).json();
  const a=await(await page.request.post(base+'/api/assign',{data:{programId:p.id,athleteId:'jordan',startDate}})).json();await page.request.post(base+'/api/demo',{data:{role:'athlete'}});await page.goto(base);await navigate(page,'Calendar');await page.locator('.calendar-event').filter({hasText:'Timed test'}).click();
  const dialog=page.getByRole('dialog');assert.equal(await dialog.getByRole('spinbutton',{name:/Reps/}).count(),0);for(let i=1;i<=3;i++)await dialog.getByLabel(`Set ${i} Duration (M:SS)`,{exact:true}).fill(i===2?'0:35':'0:30');await dialog.getByRole('button',{name:'Complete workout',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.reload();await navigate(page,'Calendar');await page.locator('.calendar-event').filter({hasText:'Timed test'}).click();assert.match(await dialog.innerText(),/Set 2: 0:35/);
  const log=(await(await page.request.get(base+'/api/data')).json()).logs.find(l=>l.assignmentId===a.id);assert.deepEqual(log.exercises[0].sets.map(s=>s.durationSeconds),[30,35,30]);assert.equal(log.exercises[0].trackingType,'timed');await context.close();
 });
});
